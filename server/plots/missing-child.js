// A crew member's missing child. It starts where you dock: the last place
// the child was seen. Shore leave there turns up three leads; one leads to a
// crime lord who knows where the child went, and wants paying, serving or
// beating. Then the child's captor wants a ransom. Bring them home and the
// child stays on as the crew member's contact, and the crew member is Loyal.
import { addContact } from '../crew.js';
import { newPerson } from '../people.js';
import { PLAYER } from '../player.js';
import { addMood } from '../morale.js';

import { pick, shuffle, near } from './util.js';

export const missingChild = {
  tags: ['drama', 'tutorial'], // a clear first thing to do: good as a game's first drama

  // Who, where, and what it costs: chosen when it starts (at `systemId`).
  config(world, params) {
    const { universe } = world;
    const start = Number(params.systemId);
    const crew = params.crew;
    const leads = shuffle(near(universe, start, 3)).slice(0, 3);
    const clue = pick(leads);
    const errand = pick(near(universe, clue, 2).filter((id) => id !== start && !leads.includes(id)));
    const childAt = pick(near(universe, clue, 4).filter((id) => id !== start && !leads.includes(id) && id !== errand));
    // Its people (see people.js), by id.
    const person = (opts) => newPerson(world.people, opts).id;
    return {
      crew,
      child: person({ last: crew.split(' ').at(-1) }), // shares the family name
      start, leads, clue, errand, childAt,
      lord: person(),
      courier: person(),
      captor: person(),
      price: 600 + 100 * Math.floor(Math.random() * 8),
      ransom: 500 + 100 * Math.floor(Math.random() * 6)
    };
  },

  steps: {
    // Docked at the last place the child was seen.
    start(p) {
      const c = p.config;
      const at = p.planetRef(c.start);
      const member = p.crew();
      member.traits = member.traits.filter((t) => t.kind !== 'drama-seed');
      member.traits.push({ kind: 'drama', plot: 'missingChild', revealed: true, label: 'Missing child', value: p.name(c.child) });
      p.stage('askAround', `Help ${p.personRef()} look for ${p.ref(c.child)}: take shore leave on ${at} to ask around.`, c.start);
      p.listen(`/players/${PLAYER}/shoreleave/${c.start}`, 'asked');
      p.scene('plea');
    },
    // Shore leave turned up three leads: a sub-quest for each.
    asked(p) {
      const c = p.config;
      const names = c.leads.map((id) => p.planetRef(id));
      p.stage('search', `Help ${p.personRef()} find ${p.ref(c.child)}: follow the leads to ${names.join(', ')}.`);
      c.leads.forEach((id, i) => {
        const sub = p.quest(`lead${i}`, `Look for ${p.ref(c.child)} on ${names[i]}.`, id);
        sub.subscriptions.push({ pattern: `/players/${PLAYER}/arrive/${id}`, actions: [{ type: 'step', quest: p.q.id, step: 'searched', arg: id }] });
      });
      p.scene('leads');
    },
    // Docked at one of the leads.
    searched(p, at) {
      const c = p.config;
      const i = c.leads.indexOf(at);
      if (at !== c.clue) {
        p.end('complete', `${p.q.id}_lead${i}`);
        return p.scene('deadEnd');
      }
      c.leads.forEach((_, j) => p.end(j === i ? 'complete' : 'dropped', `${p.q.id}_lead${j}`));
      p.steps.confront();
    },
    // The crime lord: pay, serve, or fight. Coming back here brings them up again.
    confront(p) {
      const c = p.config;
      const at = p.planetRef(c.clue);
      p.stage('lord', `${p.ref(c.lord)} on ${at} knows where ${p.ref(c.child)} went. Pay, serve, or make them talk.`, c.clue);
      p.onArrive(c.clue, 'meetLord');
      p.engage(c.clue, `See ${p.name(c.lord)}.`, 'meetLord');
      p.scene('lord');
    },
    meetLord(p) {
      p.scene('lord');
    },
    pay(p) {
      p.world.ship.credits -= p.config.price;
      p.event(`−${p.config.price.toLocaleString()} cr. Balance ${p.world.ship.credits.toLocaleString()} cr.`);
      p.steps.told();
    },
    // Serve: carry word to someone a couple of hops off, then come back.
    serve(p) {
      const c = p.config;
      const there = p.planetRef(c.errand);
      p.stage('errand', `Run ${p.ref(c.lord)}'s errand: a word for ${p.ref(c.courier)} on ${there}.`);
      const sub = p.quest('errand', `Take ${p.ref(c.lord)}'s message to ${p.ref(c.courier)} on ${there}.`, c.errand);
      sub.subscriptions.push({ pattern: `/players/${PLAYER}/arrive/${c.errand}`, actions: [{ type: 'step', quest: p.q.id, step: 'delivered' }] });
      p.scene('errand');
    },
    delivered(p) {
      const c = p.config;
      p.end('complete', `${p.q.id}_errand`);
      p.scene('delivered');
      p.stage('report', `Go back to ${p.ref(c.lord)} on ${p.planetRef(c.clue)}: the errand's done.`, c.clue);
      p.onArrive(c.clue, 'told');
    },
    // Fight: the lord and two mercs. Win, and they talk; lose, and try again later.
    fight(p) {
      const c = p.config;
      const id = p.fight('lord', {
        foes: [{ preset: 'boss', name: p.name(c.lord), title: 'Crime Lord' }, { preset: 'merc' }, { preset: 'merc' }],
        vars: { lord: p.ref(c.lord) },
        prepared: { enemy: 0.7 }, // their back room
        start: "This wasn't what {{lord}} wanted to hear. {{Their}} people reach for their guns.",
        ready: "Let's do this.",
        won: '{{lord}} goes down, and starts talking.',
        lost: "{{lord}}'s people throw you out into the street."
      });
      p.stage('fighting', `Make ${p.ref(c.lord)} talk.`, c.clue);
      p.listen(`/fights/${id}/won`, 'told');
      p.listen(`/fights/${id}/lost`, 'beaten');
    },
    beaten(p) {
      const c = p.config;
      p.stage('lord', `${p.ref(c.lord)} on ${p.planetRef(c.clue)} still knows where ${p.ref(c.child)} went.`, c.clue);
      p.onArrive(c.clue, 'meetLord');
      p.engage(c.clue, `See ${p.name(c.lord)}.`, 'meetLord');
    },
    // The lord gives up where the child is.
    told(p) {
      const c = p.config;
      p.scene('told');
      p.stage('rescue', `Find ${p.ref(c.child)} on ${p.planetRef(c.childAt)}.`, c.childAt);
      p.onArrive(c.childAt, 'meetCaptor');
      p.engage(c.childAt, `See ${p.name(c.captor)} about ${p.name(c.child)}.`, 'meetCaptor');
    },
    meetCaptor(p) {
      p.scene('captor');
    },
    ransom(p) {
      const c = p.config;
      const { ship } = p.world;
      ship.credits -= c.ransom;
      p.event(`−${c.ransom.toLocaleString()} cr. Balance ${ship.credits.toLocaleString()} cr.`);
      // The child stays on here, as the crew member's contact; they're Loyal.
      const member = p.crew();
      addContact(member, p.person(c.child), c.childAt, { cycle: p.world.cycle });
      member.traits = member.traits.filter((t) => t.kind !== 'drama');
      member.traits.push({ kind: 'loyal', plot: 'missingChild', revealed: true, label: 'Loyal', value: `You brought ${p.name(c.child)} home` });
      addMood(member, { label: 'Loyal', amount: 20, ends: 'Lasting' });
      p.scene('reunion');
    },
    home(p) {
      p.end('complete');
    }
  },

  // Lines are [who, text] (who null: narration); options run steps.
  scenes: {
    plea: (p) => {
      const c = p.config;
      const at = p.planetRef(c.start);
      return {
        lines: [
          [p.crew(), `Captain, a word? This is the last place anyone saw ${p.ref(c.child)}. My kid. I've been looking a long time.`],
          [p.crew(), `If we took some shore leave on ${at}, I could ask around.`]
        ],
        options: [{ label: "We'll see what we can find." }]
      };
    },
    leads: (p) => {
      const c = p.config;
      const names = c.leads.map((id) => p.planetRef(id));
      return {
        lines: [[p.crew(), `Someone remembered ${p.ref(c.child)}. Said they talked about ${names[0]}, ${names[1]} and ${names[2]}. That's something.`]],
        options: [{ label: "Then we'll try all three." }]
      };
    },
    deadEnd: (p) => ({
      lines: [[p.crew(), `Nothing here. Nobody's seen ${p.ref(p.config.child)}.`]],
      options: [{ label: 'On to the next.' }]
    }),
    lord: (p) => {
      const c = p.config;
      const { credits } = p.world.ship;
      return {
        lines: [
          [null, `${p.personRef()}'s questions lead you to a back room, and ${p.ref(c.lord)}.`],
          [c.lord, `${p.ref(c.child)}? I might know where they went. Information isn't free.`]
        ],
        options: [
          { label: 'Name your price.', note: `${c.price.toLocaleString()} cr`, when: credits >= c.price, step: 'pay' },
          { label: 'What would you have me do?', step: 'serve' },
          { label: "We'll beat it out of you.", note: 'fight', step: 'fight' },
          { label: 'Not now.' }
        ]
      };
    },
    errand: (p) => {
      const c = p.config;
      return {
        lines: [[c.lord, `A favor, then. Take word to ${p.ref(c.courier)} on ${p.planetRef(c.errand)}: "The shipment moves at dawn." Do that, and come back.`]],
        options: [{ label: 'Consider it done.' }]
      };
    },
    delivered: (p) => ({
      lines: [[p.config.courier, `From ${p.ref(p.config.lord)}? Tell them it's done.`]],
      options: [{ label: 'Back to ' + p.world.universe.nodes[p.config.clue].name + ', then.' }]
    }),
    told: (p) => {
      const c = p.config;
      return {
        lines: [[c.lord, `${p.ref(c.child)}'s on ${p.planetRef(c.childAt)}. ${p.ref(c.captor)} has them. Don't say where you heard it.`]],
        options: [{ label: "Let's go." }]
      };
    },
    captor: (p) => {
      const c = p.config;
      return {
        lines: [[c.captor, `You're here about ${p.ref(c.child)}. ${c.ransom.toLocaleString()} cr and they walk out with you.`]],
        options: [
          { label: 'Pay the ransom.', note: `${c.ransom.toLocaleString()} cr`, when: p.world.ship.credits >= c.ransom, step: 'ransom' },
          { label: 'Not yet.' }
        ]
      };
    },
    reunion: (p) => {
      const c = p.config;
      return {
        lines: [
          [c.child, `…${p.crew().name.split(' ')[0]}? You came.`],
          [p.crew(), `I always would have. Captain, I won't forget this.`],
          [c.child, `I'll stay on here and find my feet. If you ever need anything on this world, ask.`]
        ],
        options: [{ label: 'Welcome home.', step: 'home' }]
      };
    }
  }
};
