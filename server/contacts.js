// Contacts: people crew members know on particular planets, met on shore
// leave (see crew.js). Docking where
// any live puts "Local contacts..." on the menu. Each contact, once between
// hops, can be asked for work (a courier quest) and, once between hops, about
// rumors (they may say how long one will last).
import { GOODS, PAY_PER_FUEL, GRACE, payFor, parcel, amountOf } from './goods.js';
import { PLAYER } from './player.js';
import { emit } from './events.js';
import { addContact, contactsOf } from './crew.js';
import { stage, regardOf } from './contact-types.js';
import { missionFor } from './missions.js';
import { startPlot } from './plots.js';
import { newPerson } from './people.js';
import { addQuest, endQuest } from './quests.js';
import { loadCargo, dropCargo } from './ship.js';
import { cheapest } from './graph.js';
import { offer, meetFixer, stranded } from './fixer.js';
import { push } from './visit.js';
import { planetRef, personRef, says } from './refs.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Who's here: [{ crew: crew member's name, contact (a person) }].
export const contactsHere = ({ crew, people, node }) =>
  crew.flatMap((c) => contactsOf(c, people).filter((k) => k.planet === node.id).map((contact) => ({ crew: c.name, contact })));

// The list of contacts here, to pick one or go back.
export const contacts = {
  open(visit, world, top) {
    top.list = contactsHere(world).map(({ crew, contact }) => ({
      crew, name: contact.name, id: contact.id, position: contact.position ?? null, traits: [regardOf(contact)?.label, ...(contact.traits ?? []).map((t) => t.label)].filter(Boolean)
    }));
  },
  act(visit, world, body) {
    const top = visit.stack.at(-1);
    if (body.action === 'back') return 'pop';
    if (body.action !== 'pick') throw new Error('unknown action');
    const who = top.list[Number(body.index)];
    if (!who) throw new Error('no such contact');
    visit.feed.push({ kind: 'you', text: `${who.crew}'s contact ${who.name}` });
    push(visit, world, { kind: 'contact', crew: who.crew, name: who.name, id: who.id });
    emit(`/players/${PLAYER}/contacts/${who.id}/talk`, { visit, world });
  }
};

// A new ship's first dock: a random crew member has a contact a hop or two
// away who might have work, and suggests looking them up (a quest that
// completes when you talk to them).
export const intro = {
  open(visit, world, top) {
    const { crew, node, universe, quests } = world;
    const c = pick(crew);
    const near = within(universe, node.id, 2);
    const there = universe.nodes[pick(near.length ? near : [node.id])];
    const k = addContact(c, newPerson(world.people), there.id, { cycle: world.cycle, type: 'shopkeeper', people: world.people });
    top.who = c.name;
    top.reply = "We'll try to say hello.";
    visit.feed.push(says(c, `I have a contact in the ${planetRef(there)} system, not far from here. They might be able to set us up with work.`));
    const q = addQuest(quests, {
      kind: 'visit',
      text: `Visit ${personRef(c)}'s contact ${personRef(k)} on ${planetRef(there)}.`,
      planet: there.id,
      subscriptions: [
        { pattern: `/players/${PLAYER}/contacts/${k.id}/talk`, actions: [{ type: 'end', outcome: 'complete' }] }
      ]
    });
    visit.feed.push({ kind: 'event', text: `New quest: ${q.text}` });
  },
  act(visit, world, body) {
    if (body.action !== 'ok') throw new Error('unknown action');
    visit.feed.push({ kind: 'you', text: visit.stack.at(-1).reply });
    return 'pop';
  }
};

// Planets 1 to `max` hops from `from`.
function within(universe, from, max) {
  const hops = new Map([[from, 0]]);
  let edge = [from];
  for (let d = 1; d <= max; d++) {
    const next = [];
    for (const [a, b] of universe.edges)
      for (const [x, y] of [[a, b], [b, a]]) if (edge.includes(x) && !hops.has(y)) hops.set(y, d), next.push(y);
    edge = next;
  }
  return [...hops.keys()].filter((id) => id !== from);
}

// How hurried a courier job is: time allowed, as a multiple of the cheapest
// route's cycles, and the bonus on top of the fuel cost it pays.
const URGENCY = [
  { slack: 5, bonus: 0.5, says: 'No rush.' },
  { slack: 2, bonus: 1, says: "Sooner's better." },
  { slack: 1.5, bonus: 2, says: "It's urgent." }
];

// A courier job from contact `k`: a parcel (see goods.js), to a random planet.
// Pays roughly the fuel there (at PAY_PER_FUEL) plus the urgency bonus, more
// for cargo that needs a special hold, and more again the better they think
// of you (see contact-types.js's REGARD).
function job({ universe, node, cycle }, k) {
  const r = regardOf(k);
  const { good, qty } = parcel();
  const dest = pick(universe.nodes.filter((n) => n.id !== node.id));
  const { fuel } = cheapest(universe, node.id, dest.id);
  const u = pick(URGENCY);
  return {
    good,
    qty,
    dest: dest.id,
    destName: planetRef(dest), // (for text)
    due: cycle + Math.ceil(fuel * u.slack) + GRACE,
    pay: Math.round(fuel * PAY_PER_FUEL * (1 + u.bonus) * payFor(good) * (r?.pay ?? 1) * (0.85 + Math.random() * 0.3)),
    friend: !!r,
    says: u.says
  };
}

// The job as a quest: docking at the destination delivers; the cycle after
// the deadline, the cargo is forfeit and a crew member tells you.
function courierQuest(o, from) {
  const text = `Deliver ${amountOf(o.good, o.qty)} to ${o.destName} by cycle ${o.due} for ${o.pay} cr.`;
  return {
    kind: 'courier',
    text,
    planet: o.dest,
    from,
    good: o.good,
    qty: o.qty,
    pay: o.pay,
    subscriptions: [
      { pattern: `/players/${PLAYER}/arrive/${o.dest}`, actions: [{ type: 'push', conversation: { kind: 'delivery' } }] },
      {
        pattern: `/cycles/${o.due + 1}/start`,
        actions: [
          { type: 'dropCargo' },
          {
            type: 'defer',
            conversation: {
              kind: 'notice',
              says: `We missed the delivery to ${o.destName}, Captain. The ${GOODS[o.good].name} ${GOODS[o.good].plural ? 'are' : 'is'} forfeit.`,
              reply: "Can't win them all.",
              after: `Quest failed: ${text}`
            }
          },
          { type: 'end' }
        ]
      }
    ]
  };
}

// What a contact says when asked about rumors: about a random one you've
// heard. Half the time, if it's still going, how long it has left (at most).
// (Only rumors about situations, the ones with a gist: a plot's rumors
// aren't market talk.) Hearing one's over clears it from your rumors.
function rumorTalk({ rumors, situations, cycle }) {
  const known = rumors.filter((r) => r.gist);
  if (!known.length) return "Can't say I've heard anything you haven't.";
  const r = pick(known);
  const about = r.gist;
  const s = situations.find((s) => s.text === r.text);
  if (!s) {
    rumors.splice(rumors.indexOf(r), 1);
    return `${about[0].toUpperCase() + about.slice(1)}? Old news. That's all blown over.`;
  }
  if (Math.random() < 0.5) return `Yeah, I've heard about ${about}. No idea how long it'll last, though.`;
  const left = s.end - cycle;
  const max = left + Math.floor(Math.random() * 3);
  return left <= 5
    ? `Yeah, I've heard about ${about}. I hear it's almost resolved. ${plural(max, 'more cycle')}, max.`
    : `Yeah, I've heard about ${about}. Word is it'll last another ${plural(max, 'cycle')}, at most.`;
}

// Talking to one contact. Entry: { crew, name, id, step: 'menu' | 'offer',
// offer, canWork, canRumor }. First, whatever's changed for them since you
// last talked (their `news`; see contact-types.js).
//
// Work: if their arc wants something (see contact-types.js), a mission of
// theirs (see missions.js), one at a time; otherwise a courier job.
export const contact = {
  open(visit, world, top) {
    const k = find(world, top);
    top.step = 'menu';
    visit.feed.push({ kind: 'event', text: `${top.crew} introduces you to ${top.name}.` });
    visit.feed.push(says(k, k.news ?? 'What can I do for you, Captain?'));
    delete k.news;
    refresh(world, top);
  },
  act(visit, world, body) {
    const top = visit.stack.at(-1);
    const k = find(world, top);
    const say = (text) => visit.feed.push(says(k, text));
    const a = body.action;
    if (top.step === 'menu' && a === 'work') {
      if (!top.canWork) throw new Error(`${top.name} has nothing more for you until you've been somewhere`);
      visit.feed.push({ kind: 'you', text: 'Got any work?' });
      if (onJob(world, k)) return void say("You're still on that last job of mine.");
      // The offer stands until you hop (or take it): ask again, same job.
      const st = stage(k);
      const o = (top.offer = k.offer ??= (st && missionFor(world, k, st)) || job(world, k));
      top.step = 'offer';
      if (o.mission) say(o.text);
      else say(`I've got ${amountOf(o.good, o.qty)} that need${o.qty === 1 && !GOODS[o.good].plural ? 's' : ''} to be on ${o.destName} by cycle ${o.due}. ${o.says} Pays ${o.pay} cr.${o.friend ? ' Friends\' rates.' : ''}`);
    } else if (top.step === 'offer' && a === 'accept' && top.offer.mission) {
      const q = startPlot(world, visit, top.offer.mission, { offer: top.offer.config }); // throws (no room): no deal
      visit.feed.push({ kind: 'you', text: 'Deal.' });
      visit.feed.push({ kind: 'event', text: `New quest: ${q.text}` });
      k.offer.taken = true;
      Object.assign(top, { step: 'menu', offer: null });
    } else if (top.step === 'offer' && a === 'accept') {
      const q = addQuest(world.quests, courierQuest(top.offer, top.name));
      try {
        loadCargo(world.ship, q.good, q.qty, q.id);
      } catch (e) {
        endQuest(world.quests, q.id);
        throw e;
      }
      visit.feed.push({ kind: 'you', text: 'Deal.' });
      visit.feed.push({ kind: 'event', text: `Loaded ${amountOf(q.good, q.qty)} (consigned).` });
      visit.feed.push({ kind: 'event', text: `New quest: ${q.text}` });
      k.offer.taken = true;
      Object.assign(top, { step: 'menu', offer: null });
    } else if (top.step === 'offer' && a === 'decline') {
      visit.feed.push({ kind: 'you', text: 'Not this time.' });
      say("I'll find someone else."); // (no coming back for it later)
      Object.assign(top, { step: 'menu', offer: null });
    } else if (top.step === 'menu' && a === 'rumor') {
      if (!top.canRumor) throw new Error(`${top.name} has nothing more to say until you've been somewhere`);
      (k.asked ??= {}).rumor = true;
      visit.feed.push({ kind: 'you', text: 'Heard any rumors?' });
      say(rumorTalk(world));
    } else if (top.step === 'menu' && a === 'back') {
      world.pulse = true; // done with them: a heartbeat
      return 'pop';
    } else throw new Error('unknown action');
    refresh(world, top);
  }
};

const find = ({ people }, top) => people.find((p) => p.id === top.id) ?? people.find((p) => p.name === top.name); // (by name: from before contacts were people)
// Whether you're on a mission of theirs.
const onJob = (world, k) => world.quests.some((q) => q.config?.contact === k.id);

// Once each between hops (crew.js's hop() clears `asked`).
function refresh(world, top) {
  const k = find(world, top);
  top.canWork = !k.offer?.taken;
  top.canRumor = !k.asked?.rumor;
}

// Arriving with a courier job's cargo: hand it over and get paid. Says its
// piece as it opens, then gets out of the way.
export const delivery = {
  open(visit, { ship, quests }, top) {
    const q = quests.find((q) => q.id === top.quest);
    // Lost on the way (seized by a bounty hunter): nothing to hand over.
    if (!ship.holds.some((h) => h.slots.some((st) => st?.quest === q.id))) {
      visit.feed.push({ kind: 'event', text: `${q.from}'s people are waiting for cargo you no longer have.` });
      return 'pop';
    }
    dropCargo(ship, q.id);
    ship.credits += q.pay;
    endQuest(quests, q.id);
    visit.feed.push({ kind: 'event', text: `You hand over ${amountOf(q.good, q.qty)} for ${q.from}.` });
    visit.feed.push({ kind: 'event', text: `Quest complete: ${q.text}` });
    visit.feed.push({ kind: 'event', text: `+${q.pay.toLocaleString()} cr. Balance ${ship.credits.toLocaleString()} cr.` });
    return 'pop';
  }
};

// Contact traits (contact.traits: [{ kind, label }]). Owed a Favor: you took
// their help when you were stranded.
const FAVOR = { kind: 'favor', label: 'Owed a Favor' };
const HELP_CHANCE = 1 / 3; // each contact's, when you're stranded
const DISCOUNT = 0.6; // of what the stranger would charge

// Stranded: before the stranger, your contacts here may each (1 in 3) offer
// the same fuel at a discount. Take an offer (they're then owed a favor), or
// look elsewhere: the stranger (see fixer.js).
export function askForHelp(visit, world) {
  if (!stranded(world)) throw new Error("you're not stranded");
  const o = offer(world);
  const price = Math.max(1, Math.round(o.price * DISCOUNT));
  const offers = contactsHere(world)
    .filter(() => Math.random() < HELP_CHANCE)
    .map(({ crew, contact }) => ({ crew, name: contact.name, id: contact.id, amount: o.amount, total: o.amount * price }));
  if (!offers.length) return meetFixer(visit, world);
  visit.feed.push({ kind: 'event', text: 'Word gets around among your contacts.' });
  for (const f of offers)
    visit.feed.push({ kind: 'npc', who: f.name, text: `Heard you're stuck. I can spare ${f.amount} Star Fuel. ${f.total.toLocaleString()} cr, and you owe me one.` });
  visit.stack.push({ kind: 'favors', offers });
}

export const favors = {
  act(visit, world, body) {
    const top = visit.stack.at(-1);
    const { ship } = world;
    if (body.action === 'elsewhere') {
      visit.feed.push({ kind: 'you', text: "I'll find another way." });
      visit.stack.pop();
      meetFixer(visit, world);
      return;
    }
    if (body.action !== 'accept') throw new Error('unknown action');
    const f = top.offers[Number(body.index)];
    if (!f) throw new Error('no such offer');
    if (ship.credits < f.total) throw new Error(`you have ${ship.credits.toLocaleString()} cr`);
    ship.credits -= f.total;
    ship.fuel += f.amount;
    const k = world.people.find((p) => p.id === f.id);
    k.traits ??= [];
    if (!k.traits.some((t) => t.kind === FAVOR.kind)) k.traits.push({ ...FAVOR });
    (k.ledger ??= []).push({ cycle: world.cycle, text: `Sold you ${f.amount} Star Fuel cheap when you were stranded. You owe them one.` });
    visit.feed.push({ kind: 'you', text: `Thanks, ${f.name}. I owe you one.` });
    visit.feed.push({ kind: 'event', text: `−${f.total.toLocaleString()} cr. +${f.amount} Star Fuel.` });
    return 'pop';
  }
};

