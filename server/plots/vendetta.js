// A crime lord has a vendetta against a crew member. Their people hunt you
// near the lord's system: arriving next door to it risks an ambush at
// the docks, and losing one means the crew member is taken. Pay the lord a
// fortune (which also frees them), or, after a while, hear that someone
// nearby knows the truth: they send you for the evidence, an easier fight
// away, and showing it to the lord ends the vendetta, frees your crew member,
// and the lord, embarrassed, owes them: a contact there.
import { addContact } from '../crew.js';
import { newPerson } from '../people.js';
import { PLAYER } from '../player.js';
import { addMood } from '../morale.js';
import { pick, near, hops } from './util.js';

const ZONE = 1; // hops from the lord's system their people watch
const AMBUSH = 0.35; // chance, arriving in the zone
const RUMOR_AFTER = 12; // cycles before word of the informant gets around

const thugs = (n) => Array.from({ length: n }, () => ({ preset: 'thug' }));

export const vendetta = {
  tags: ['drama'],

  config(world, params) {
    const { universe } = world;
    const start = Number(params.systemId);
    const d = hops(universe, start, 3);
    const lordAt = pick(near(universe, start, 3).filter((id) => d.get(id) >= 2)) ?? pick(near(universe, start, 3));
    const zone = near(universe, lordAt, ZONE);
    const informantAt = pick(zone.filter((id) => id !== start)) ?? pick(zone);
    const evidenceAt =
      pick(near(universe, informantAt, 3).filter((id) => id !== lordAt && !zone.includes(id))) ??
      pick(near(universe, informantAt, 3).filter((id) => id !== lordAt));
    const person = () => newPerson(world.people).id; // its people (see people.js), by id
    return {
      crew: params.crew,
      start, lordAt, informantAt, evidenceAt,
      lord: person(),
      informant: person(),
      price: 5000 + 500 * Math.floor(Math.random() * 7),
      rumorAt: world.cycle + RUMOR_AFTER,
      ambushes: 0,
      captive: null, // the crew member, while the lord has them
      evidence: false
    };
  },

  steps: {
    start(p) {
      const c = p.config;
      const member = p.crew();
      member.traits = member.traits.filter((t) => t.kind !== 'drama-seed');
      member.traits.push({ kind: 'drama', plot: 'vendetta', revealed: true, label: 'Vendetta', value: `${p.name(c.lord)} wants them` });
      p.steps.hunted();
      p.scene('confession');
    },
    // The standing state: hunted near the lord, who'll take payment on their world.
    hunted(p) {
      const c = p.config;
      const at = p.planetRef(c.lordAt);
      p.stage(
        'hunted',
        c.captive
          ? `${p.ref(c.lord)} has ${p.personRef()}. Pay ${c.price.toLocaleString()} cr on ${at} to get them back, or clear their name.`
          : `${p.ref(c.lord)} has a vendetta against ${p.personRef()}; their people watch the systems around ${at}. Pay ${c.price.toLocaleString()} cr there to end it, or clear ${p.personRef()}'s name.`,
        c.lordAt
      );
      p.steps.listenAll();
    },
    // What it always listens for, whatever stage: arrivals (ambushes), the
    // lord's world, its fights, and (until it's heard) the rumor's time.
    listenAll(p) {
      const c = p.config;
      // Where an ambush could be waiting, for the map (none once they have them).
      p.q.danger = c.captive
        ? null
        : { planets: near(p.world.universe, c.lordAt, ZONE), text: `${p.ref(c.lord)}'s people watch this system for ${p.personRef()}. Arriving here risks an ambush at the docks.` };
      if (!c.captive) p.listen(`/players/${PLAYER}/hop/:from/:to`, 'arrive');
      p.onArrive(c.lordAt, 'meetLord');
      p.engage(c.lordAt, `See ${p.name(c.lord)}.`, 'meetLord');
      if (c.lockbox && !c.evidence) p.engage(c.evidenceAt, 'Go for the lockbox.', 'evidence');
      p.listen('/fights/:fight/won', 'fightWon');
      p.listen('/fights/:fight/lost', 'fightLost');
      if (!c.heard) p.listen(`/cycles/${Math.max(c.rumorAt, p.world.cycle + 1)}/start`, 'rumor');
    },
    // Arriving in the lord's zone: maybe an ambush, waiting at the docks.
    arrive(p, { to }) {
      const c = p.config;
      // (Not on the lord's own world: they're waiting for you there anyway.)
      const d = hops(p.world.universe, c.lordAt, ZONE).get(Number(to));
      if (!d || c.captive || Math.random() >= AMBUSH) return;
      c.ambushes++;
      p.fight(`ambush${c.ambushes}`, {
        foes: thugs(2 + (Math.random() < 0.4 ? 1 : 0)).map((f) => ({ ...f, title: `${p.name(c.lord)}'s thug` })),
        vars: { lord: p.ref(c.lord), crew: p.personRef(), first: p.crew().name.split(' ')[0] },
        prepared: { enemy: 0.6 }, // waiting for you
        start: "{{lord}}'s people are waiting at the docks. {{They}} want {{crew}}.",
        ready: 'Nobody touches {{first}}.',
        won: "{{lord}}'s thugs scatter. There'll be more.",
        lost: '{{They}} drag {{crew}} away.'
      });
    },
    fightWon(p, { fight }) {
      if (fight === `fight_${p.q.id}_evidence`) {
        p.config.evidence = true;
        p.end('complete', `${p.q.id}_evidence`);
        p.steps.present();
      }
    },
    fightLost(p, { fight }) {
      const c = p.config;
      // Losing an ambush: the lord has them now.
      if (fight.startsWith(`fight_${p.q.id}_ambush`) && !c.captive) {
        const i = p.world.crew.findIndex((m) => m.id === c.crewId);
        if (i >= 0) c.captive = p.world.crew.splice(i, 1)[0];
        // Whatever post they held, the captain takes it over.
        const posts = p.world.ship.officers ?? {};
        for (const k of Object.keys(posts)) if (posts[k] === c.captive?.id) posts[k] = 'captain';
        p.steps.hunted();
        if (c.evidence) p.steps.present();
      }
      // Losing for the evidence: it's still there, try again.
    },
    meetLord(p) {
      p.scene('lord');
    },
    // Time passes, and someone talks.
    rumor(p) {
      const c = p.config;
      c.heard = true;
      const there = p.planetRef(c.informantAt);
      const text = `They say ${p.ref(c.informant)} on ${there} knows the truth about ${p.personRef()} and ${p.ref(c.lord)}.`;
      p.world.hear(text);
      const teller = pick(p.world.crew.filter((m) => m.id !== p.crew()?.id)) ?? p.crew();
      p.world.deferred.push({ kind: 'notice', says: `Captain, I heard something: ${text}`, reply: "Then let's find them.", crew: teller?.id });
      const sub = p.quest('informant', `Find ${p.ref(c.informant)} on ${there}: they know the truth about ${p.personRef()}.`, c.informantAt);
      sub.subscriptions.push({ pattern: `/players/${PLAYER}/arrive/${c.informantAt}`, actions: [{ type: 'step', quest: p.q.id, step: 'meetInformant' }] });
      p.steps.hunted();
    },
    meetInformant(p) {
      const c = p.config;
      p.end('complete', `${p.q.id}_informant`);
      c.lockbox = true; // known about; a way back to it from now on (see listenAll)
      p.engage(c.evidenceAt, 'Go for the lockbox.', 'evidence');
      const there = p.planetRef(c.evidenceAt);
      const sub = p.quest('evidence', `Take the evidence about ${p.personRef()} from the lockbox on ${there}.`, c.evidenceAt);
      sub.subscriptions.push({ pattern: `/players/${PLAYER}/arrive/${c.evidenceAt}`, actions: [{ type: 'step', quest: p.q.id, step: 'evidence' }] });
      p.scene('informant');
    },
    // The evidence, under guard: an easier fight.
    evidence(p) {
      const c = p.config;
      p.fight('evidence', {
        foes: thugs(2).map((f) => ({ ...f, title: 'Guard' })),
        start: 'Two guards stand between you and the lockbox.',
        ready: 'Take them.',
        vars: { crew: p.personRef() },
        prepared: { enemy: 0.5 }, // guarding it
        won: 'The lockbox is yours, and in it, proof {{crew}} was framed.',
        lost: 'The guards drive you off. The lockbox is still there.'
      });
    },
    // With the evidence: take it to the lord.
    present(p) {
      const c = p.config;
      p.stage('present', `Show ${p.ref(c.lord)} on ${p.planetRef(c.lordAt)} the proof that ${p.personRef()} was framed.`, c.lordAt);
      p.steps.listenAll();
    },
    pay(p) {
      const c = p.config;
      p.world.ship.credits -= c.price;
      p.event(`−${c.price.toLocaleString()} cr. Balance ${p.world.ship.credits.toLocaleString()} cr.`);
      p.steps.release();
      p.scene('paid');
    },
    cleared(p) {
      const c = p.config;
      p.steps.release();
      // The lord, wrong and owing: a contact for the one they hunted.
      const member = p.crew();
      member.traits.push({ kind: 'cleared', plot: 'vendetta', revealed: true, label: 'Name cleared', value: `${p.name(c.lord)} owes them` });
      addMood(member, { label: 'Name cleared', amount: 15, ends: 'Lasting' });
      addContact(member, p.person(c.lord), c.lordAt, { cycle: p.world.cycle });
      p.scene('cleared');
    },
    // Back to the crew if taken; the vendetta's over (no more ambushes, even
    // ones already waiting).
    release(p) {
      const c = p.config;
      const ambush = (e) => e.fightId?.startsWith(`fight_${p.q.id}_ambush`);
      if (p.visit) p.visit.stack = p.visit.stack.filter((e) => !ambush(e));
      p.world.deferred.splice(0, Infinity, ...p.world.deferred.filter((e) => !ambush(e)));
      if (c.captive) {
        p.world.crew.push(c.captive);
        p.event(`${p.personRef()} is back aboard.`);
        c.captive = null;
      }
      p.q.danger = null;
      const member = p.crew();
      member.traits = member.traits.filter((t) => t.kind !== 'drama');
      member.traits.push({ kind: 'drama-done', plot: 'vendetta', revealed: false });
    },
    done(p) {
      p.end('complete');
    }
  },

  scenes: {
    confession: (p) => {
      const c = p.config;
      const at = p.planetRef(c.lordAt);
      return {
        lines: [
          [p.crew(), `Captain, I should have told you sooner. ${p.ref(c.lord)} on ${at} thinks I robbed them. I didn't. They've put a price on my head.`],
          [p.crew(), `Their people watch every system around ${at}. If they catch us, they'll take me.`]
        ],
        options: [{ label: "We'll deal with it." }]
      };
    },
    lord: (p) => {
      const c = p.config;
      const lines = c.captive
        ? [[c.lord, `Come for ${p.personRef()}? ${c.price.toLocaleString()} cr and you can have them back.`]]
        : [[c.lord, `You've got some nerve, harboring ${p.personRef()}. ${c.price.toLocaleString()} cr and I forget the whole thing.`]];
      return {
        lines,
        options: [
          ...(c.evidence ? [{ label: `Show ${p.name(c.lord)} the evidence.`, step: 'cleared' }] : []),
          { label: 'Pay them off.', note: `${c.price.toLocaleString()} cr`, when: p.world.ship.credits >= c.price, step: 'pay' },
          { label: 'Not today.' }
        ]
      };
    },
    paid: (p) => ({
      lines: [[p.config.lord, `Pleasure. Consider the matter closed.`]],
      options: [{ label: "Let's go.", step: 'done' }]
    }),
    informant: (p) => {
      const c = p.config;
      return {
        lines: [
          [c.informant, `${p.personRef()} didn't rob anyone. I saw who did, and I kept the proof. It's in a lockbox on ${p.planetRef(c.evidenceAt)}.`],
          [c.informant, `Guarded, mind. Get it, and ${p.ref(c.lord)} will have to listen.`]
        ],
        options: [{ label: "We'll get it." }]
      };
    },
    cleared: (p) => {
      const c = p.config;
      return {
        lines: [
          [c.lord, `…This is real. I was wrong about ${p.personRef()}.`],
          [c.lord, `I don't say this often: I owe you. ${p.personRef()}, if you ever need something on this world, come to me.`],
          [p.crew(), `Thank you, Captain. I won't forget it.`]
        ],
        options: [{ label: "Let's go.", step: 'done' }]
      };
    }
  }
};
