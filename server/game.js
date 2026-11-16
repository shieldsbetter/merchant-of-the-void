// One game: a universe (regenerated from its seed by the current code) and
// the player's progress in it. What's saved is only what the game added: the
// player's ship, crew, clock, and so on, plus small overrides on the
// universe (market and ship-yard stock). Loading lays those over a freshly
// generated universe and fills in anything missing, so a save from older
// code is read under the current rules without being repaired first.
import { makeUniverse, restock } from './universe.js';
import { GOODS } from './goods.js';
import { makeShip, shipName } from './ship.js';
import { startVisit, act, present, push, interject, blocking } from './visit.js';
import { makeCrew, hop } from './crew.js';
import { expire, restless, trauma } from './morale.js';
import { newPerson } from './people.js';
import { personRef } from './refs.js';
import { becomes } from './contact-types.js';
import { tick, seed as seedSituations, priceOf, gist } from './situations.js';
import { hear, prune } from './rumors.js';
import { emit, undefer, perform } from './events.js';
import { PLAYER } from './player.js';
import { addShipTrait, newShip, hopCost, cantShowYourFace } from './traits.js';
import { shipCombat } from './combat.js';
import { crewFight } from './firefight.js';
import { stats, SLOTS } from './modules.js';
import { direct } from './plots.js';
import { cheapest } from './graph.js';
import { hail } from './arrival.js';
import { encounter, spaceVisit } from './encounters.js';

// A brand new game on `seed`.
export function newGame(id, seed, name) {
  const g = load({ id, seed, created: Date.now() });
  g.name = name ?? `${g.universe.nodes[0].name} sector`;
  addShipTrait(g.ship, newShip()); // set the new ship up on its first arrival (officers: see normalize)
  arrive(g, hereOf(g));
  return g;
}

// A game from saved data (any age). Missing pieces get defaults.
export function load(data) {
  const universe = makeUniverse({ seed: data.seed });
  const cyclesPerHop = universe.edges.reduce((n, e) => n + e[2], 0) / universe.edges.length;
  overlay(universe, data);
  const people = data.people ?? []; // everyone named; see people.js
  const g = {
    id: data.id,
    name: data.name ?? `${universe.nodes[0].name} sector`,
    seed: data.seed,
    created: data.created ?? Date.now(),
    universe,
    cyclesPerHop,
    cycle: data.cycle ?? 0,
    ship: data.ship ?? makeShip(),
    people,
    crew: data.crew ?? makeCrew(people, universe.nodes), // kept off `ship` so its secret traits never get sent
    rumors: data.rumors ?? [],
    quests: (data.quests ?? []).filter((q) => !supply(q.config)),
    deferred: data.deferred ?? [], // conversations waiting for you to arrive; see events.js
    reputation: data.reputation ?? {}, // with each faction (by index); see factions.js
    offers: Object.fromEntries(Object.entries(data.offers ?? {}).filter(([, o]) => !supply(o))), // faction offices' job offers, until the next hop
    course: data.course ?? null, // the system you're headed for, if any (set on the map)
    planets: data.planets ?? null, // each system's planet, from the library (see planets.js)
    visit: data.visit ?? null, // the system you're in: its thread since you arrived (or an encounter on the way); see visit.js
    trip: data.trip ?? null, // between systems: { from, to, left: cycles to go }; see depart
    dramas: data.dramas ?? null // dramas the game's had (each happens once); see plots.js's direct
  };
  g.situations = data.situations ?? seedSituations(universe, cyclesPerHop); // secret from the client
  normalize(g);
  // Firefights from before turns were drawn by lottery: start them over.
  for (const e of [...(g.visit?.stack ?? []), ...g.deferred])
    if (e.kind === 'firefight' && e.f && e.f.version !== 2) Object.assign(e, { f: null, phase: 'alert' });
  // You're always in a system, or on your way to one; older saves could be between visits.
  if (!g.visit && !g.trip) g.visit = startVisit(hereOf(g));
  return g;
}

// Faction supply jobs are gone; older saves may have one, taken or offered.
const supply = (o) => o?.kind === 'supply';

// The universe's overrides: market stock ({ nodeId: { good: stock } }) and
// ship-yard stock ({ nodeId: [...] }), applied only to goods and modules the
// current code still has. (Older saves stored whole arrays; read those too.)
function overlay(universe, data) {
  const stocks = data.stocks ?? Object.fromEntries((data.markets ?? []).map((m, i) => [i, Object.fromEntries(m.map((x) => [x.good, x.stock]))]));
  for (const [id, s] of Object.entries(stocks)) {
    for (const m of universe.nodes[id]?.market ?? []) if (m.good in s) m.stock = s[m.good];
  }
  const yards = data.yards && !Array.isArray(data.yards) ? data.yards : Object.fromEntries((data.yards ?? []).map((y, i) => [i, y]).filter(([, y]) => y));
  for (const [id, y] of Object.entries(yards)) {
    const node = universe.nodes[id];
    if (node?.yard) node.yard = y.filter((s) => GOODS[s.good]?.module);
  }
}

// Fill in whatever older code didn't save.
// The ship's officers: a crew member's id in each post, or 'captain' (doing
// it themselves). Someone no longer aboard leaves it to the captain. (Posts
// once held names.)
function officers(g) {
  const { ship, crew } = g;
  ship.officers ??= { navigator: crew[Math.floor(Math.random() * crew.length)]?.id ?? 'captain' };
  for (const [post, who] of Object.entries(ship.officers)) {
    const c = typeof who === 'string' && who !== 'captain' ? crew.find((x) => x.name === who) : crew.find((x) => x.id === who);
    ship.officers[post] = c ? c.id : 'captain';
  }
}

function normalize(g) {
  // Docking became arriving (once per hop): its event moved.
  const arrived = (x) => JSON.parse(JSON.stringify(x).replaceAll('/dock/', '/arrive/'));
  for (const k of ['quests', 'deferred', 'crew']) g[k] = arrived(g[k]);
  g.ship.traits = arrived(g.ship.traits ?? []);
  const { ship, crew, universe } = g;
  ship.traits ??= [];
  ship.name ??= shipName();

  // The wanted trait once threw you out; now it warns (and needs a lender).
  ship.traits = ship.traits.map((t) => (t.kind === 'wanted' && !t.lender ? { ...cantShowYourFace(universe.nodes[t.planet]), id: t.id } : t));
  ship.combat ??= shipCombat();
  if ('hull' in ship.combat) {
    // Damage was once stored as current hull; now it's wear.
    const c = ship.combat;
    Object.assign(c, { wear: c.maxHull - c.hull, lostCrits: c.maxCrits - c.crits });
    delete c.hull;
    delete c.crits;
  }
  ship.slots ??= Array(SLOTS).fill(null);
  ship.slots = ship.slots.map((s) => (s && GOODS[s]?.module ? s : null));
  for (const h of ship.holds) h.slots = h.slots.map((st) => (st && GOODS[st.good] ? st : null)); // goods since removed
  ship.position ??= { x: universe.nodes[0].x, y: universe.nodes[0].y };
  for (const c of crew) c.id ??= Math.max(0, ...crew.map((x) => x.id ?? 0)) + 1; // crew from before ids
  for (const c of crew) {
    c.contacts ??= [];
    // Morale was a base, fading boosts and traits' morale; now it's moods
    // (see morale.js): a boost, at what it's faded to, until it would have
    // run out; a trait's, lasting.
    if (!c.moods) {
      c.moods = (c.boosts ?? []).map((b) => ({
        label: b.source === 'homeworld' ? 'Home' : 'Shore leave',
        amount: Math.round((b.amount * b.cyclesLeft) / b.cycles),
        expires: g.cycle + b.cyclesLeft
      })).filter((m) => m.amount);
      for (const t of c.traits) if (t.morale) c.moods.push({ label: t.label, amount: t.morale, ends: 'Lasting' });
      delete c.boosts;
    }
    for (const t of c.traits) delete t.morale;
    c.ashore ??= g.cycle; // (shore leave's tracked from now on)
    if (c.traits.some((t) => t.kind === 'trauma') && !c.moods.some((m) => m.label === 'Trauma')) trauma(c);
    c.fight ??= crewFight();
    // Crew were once nearly as quick and sure as mercenaries: now they're not.
    if (c.fight.initiative == null) Object.assign(c.fight, { initiative: crewFight().initiative, accuracy: crewFight().accuracy });
  }
  officers(g);
  for (const [i, k] of crew.flatMap((c) => c.contacts).filter((k) => typeof k === 'object').entries()) {
    k.id ??= 1000 + i;
    k.traits ??= [];
  }
  // Games from before people: the crew and their contacts become people (a
  // contact with a crew member's id gets a new one, and the quests that
  // listen for it follow).
  if (!g.people.length) {
    const contacts = crew.flatMap((c) => c.contacts).filter((k) => typeof k === 'object');
    let next = Math.max(0, ...crew.map((c) => c.id), ...contacts.map((k) => k.id)) + 1;
    const moved = {};
    for (const c of crew) g.people.push({ id: c.id, name: c.name });
    for (const k of contacts) {
      if (g.people.some((p) => p.id === k.id)) (moved[k.id] = next), (k.id = next++);
      g.people.push({ id: k.id, name: k.name });
    }
    g.quests = JSON.parse(JSON.stringify(g.quests).replace(/\/contacts\/(\d+)\/talk/g, (m, id) => `/contacts/${moved[id] ?? id}/talk`));
  }
  // Contacts from before they were people of their own: each becomes their
  // person, made a shopkeeper (so an arc's going; see contact-types.js), and
  // the crew member keeps their id.
  for (const c of crew)
    c.contacts = c.contacts.map((k) => {
      if (typeof k !== 'object') return k;
      const p = g.people.find((p) => p.id === k.id) ?? newPerson(g.people, { name: k.name });
      Object.assign(p, { planet: k.planet, via: c.id, traits: k.traits ?? [], ledger: [{ cycle: null, text: `Met through ${personRef(c)}.` }] });
      if (k.offer) p.offer = k.offer;
      if (k.asked) p.asked = k.asked;
      becomes(p, 'shopkeeper', g.people);
      return p.id;
    });
  // Games from before dramas were once each: the ones they've had, from the
  // crew's traits (a seed, the drama, what it left) and the plots going.
  g.dramas ??= [...new Set([...crew.flatMap((c) => c.traits), ...g.quests].map((x) => x.plot).filter((k) => k && k !== 'factionJob'))];
  // Plots from before people: their characters' names become people (as
  // they were, even if someone else has the name).
  for (const q of g.quests)
    for (const k of ['child', 'lord', 'courier', 'captor', 'informant'])
      if (typeof q.config?.[k] === 'string') q.config[k] = newPerson(g.people, { name: q.config[k] }).id;
  // Plots from before crew ids: who they're about, by name.
  for (const q of g.quests) if (q.config?.crew && q.config.crewId == null) q.config.crewId = crew.find((c) => c.name === q.config.crew)?.id;
}

// What's saved: the game's own state and the universe's overrides.
export function save(g) {
  const { id, name, seed, created, cycle, ship, crew, people, situations, rumors, quests, deferred, course, planets, visit, trip, dramas, universe, reputation, offers } = g;
  return {
    id, name, seed, created, cycle, ship, crew, people, situations, rumors, quests, deferred, course, planets, visit, trip, dramas, reputation, offers,
    stocks: Object.fromEntries(universe.nodes.map((n) => [n.id, Object.fromEntries(n.market.map((m) => [m.good, m.stock]))])),
    yards: Object.fromEntries(universe.nodes.filter((n) => n.yard).map((n) => [n.id, n.yard]))
  };
}

// The system the ship is in.
const hereOf = (g) => g.universe.nodes.find((n) => n.x === g.ship.position.x && n.y === g.ship.position.y);

// For the game list.
export function summary(g) {
  const here = hereOf(g);
  return { id: g.id, name: g.name, created: g.created, cycle: g.cycle, at: here?.name, credits: g.ship.credits };
}

// Everything a conversation can see or change, at the planet you're on.
export function worldAt(g, node) {
  const world = {
    ship: g.ship, node, universe: g.universe, cycle: g.cycle, crew: g.crew, people: g.people, situations: g.situations,
    cyclesPerHop: g.cyclesPerHop, quests: g.quests, deferred: g.deferred, rumors: g.rumors,
    reputation: g.reputation, offers: g.offers, dramas: g.dramas,
    course: () => courseOf(g),
    price: priceOf(g.situations, node),
    hear: (text) => {
      const s = g.situations.find((s) => s.text === text);
      hear(g.rumors, text, g.cycle, s && gist(s, g.universe));
    },
    passTime: (n) => {
      passTime(g, n, node);
      world.cycle = g.cycle;
    },
    heartbeat: (v) => emit(`/players/${PLAYER}/heartbeat/${node.id}`, { visit: v, world }),
    emit: (path, v) => emit(path, { visit: v, world }),
    // Arrived (port control done with; see arrival.js): anything deferred
    // happens, and the arrival event fires.
    arrived: (v) => {
      undefer(v, world);
      emit(`/players/${PLAYER}/arrive/${node.id}`, { visit: v, world });
    },
    perform: (actions, quest, v) => perform(actions, { group: 'quest', owner: quest }, {}, { visit: v, world }),
    push: (v, entry) => interject(v, world, entry) // (a plot's scene or fight: one at a time)
  };
  return world;
}

// Run the clock forward n cycles (travelling, or ashore at `node`): each
// cycle starts with its event, situations come and go, archived rumors
// expire, moods run out. If you're docked, anything deferred happens now.
// (situations and rumors change in place, so worlds already handed out see it.)
function passTime(g, n, node) {
  for (let i = 0; i < n; i++) {
    g.cycle++;
    emit(`/cycles/${g.cycle}/start`, { visit: g.visit, world: worldAt(g, node) });
    g.situations.splice(0, Infinity, ...tick(g.situations, g.universe, g.cycle, 1, g.cyclesPerHop));
    g.rumors.splice(0, Infinity, ...prune(g.rumors, g.cycle));
    restock(g.universe);
  }
  expire(g.crew, g.cycle);
  restless(g.crew, g.cycle);
  if (g.visit && !g.visit.space) undefer(g.visit, worldAt(g, node)); // (out in space, it waits till you arrive)
}


// The system you're in, as the client sees it: its thread, and the course.
// Between systems with nothing going on, there's no visit: just the trip.
export const shown = (g) => ({
  ...(g.visit && present(g.visit, worldAt(g, g.universe.nodes[g.visit.planet]))),
  course: courseOf(g),
  trip: g.trip && { ...g.trip, toName: g.universe.nodes[g.trip.to].name }
});

// The course laid in, as the client needs it: where to, how far, and the
// next hop (and its fuel, for this ship). Null if there's none.
function courseOf(g) {
  if (g.course == null) return null;
  const { universe, ship } = g;
  const { path, fuel } = cheapest(universe, hereOf(g).id, g.course);
  const next = path[1];
  const edge = universe.edges.find(([a, b]) => (a === path[0] && b === next) || (b === path[0] && a === next));
  return { dest: g.course, destName: universe.nodes[g.course].name, next, nextName: universe.nodes[next].name, fuel: hopCost(ship, edge[2]), hops: path.length - 1, total: fuel };
}

// Lay in a course to system `to` (null: none).
export function setCourse(g, to) {
  if (g.trip) throw new Error("you're between systems: change course when you get there");
  if (to == null) g.course = null;
  else {
    const node = g.universe.nodes[Number(to)];
    if (!node) throw new Error('no such system');
    if (node === hereOf(g)) throw new Error("you're already here");
    g.course = node.id;
  }
  return shown(g);
}

// Arrive in a system: its thread starts with port control hailing you
// (see arrival.js); once that's done with, `lines` (say, crew who are home)
// are said, anything deferred happens, and the arrival event fires.
function arrive(g, node, lines = []) {
  g.ship.position = { x: node.x, y: node.y };
  if (g.course === node.id) g.course = null; // there
  g.visit = startVisit(node, hail(node, g.universe, g.ship, g.crew.find((c) => c.id === g.ship.officers?.navigator)));
  g.visit.stack.push({ kind: 'arrival', lines });
}

// The next hop of the course: this system's thread is over, and the trip
// begins (g.trip). Time passes a cycle at a time (tripTick), each maybe
// bringing an encounter (see encounters.js), and then you arrive (land).
function depart(g) {
  const { ship, universe } = g;
  const c = courseOf(g);
  if (!c) throw new Error('lay in a course on the map first');
  const here = hereOf(g), node = universe.nodes[c.next];
  if (ship.fuel < c.fuel) throw new Error(`need ${c.fuel} Star Fuel to reach ${node.name}, you have ${ship.fuel}`);
  ship.fuel -= c.fuel;
  g.visit = null; // between systems
  g.trip = { from: here.id, to: node.id, left: c.fuel };
  emit(`/players/${PLAYER}/hop/${here.id}/${node.id}`, { visit: null, world: worldAt(g, node) });
}

// A cycle of the trip passes. The last brings you there; any other may bring
// an encounter, out in space (and the trip waits until it's over: see
// encounters.js's drift).
export function tripTick(g) {
  if (!g.trip) throw new Error("you're not travelling");
  if (g.visit) throw new Error('something needs dealing with first');
  const node = g.universe.nodes[g.trip.to];
  passTime(g, 1, node);
  if (--g.trip.left <= 0) land(g);
  else {
    const e = encounter(g);
    if (e) {
      g.visit = spaceVisit(g, g.trip);
      push(g.visit, worldAt(g, node), e);
    }
  }
  return shown(g);
}

// The trip's over: you arrive.
function land(g) {
  const { ship, universe } = g;
  const node = universe.nodes[g.trip.to];
  g.trip = null;
  ship.shoreLeaves = 0; // shore leave's diminishing returns start over
  for (const k of Object.keys(g.offers)) delete g.offers[k]; // offices have new work
  const lines = hop(g.crew, g.people, node, g.cyclesPerHop, g.cycle);
  direct(worldAt(g, node)); // maybe a new drama, starting on arrival
  arrive(g, node, lines);
}

// Act on the top conversation (the root menu's Depart hops; see visit.js).
export function actOn(g, body) {
  if (!g.visit) throw new Error("you're between systems");
  const done = act(g.visit, worldAt(g, g.universe.nodes[g.visit.planet]), body);
  if (done === 'depart') depart(g);
  if (done === 'continue') g.visit = null; // an encounter's over: on with the trip
  return shown(g);
}

// The ship's posts, and who can fill them (any crew member, or the captain).
const POSTS = ['navigator'];
export function setOfficer(g, post, who) {
  if (!POSTS.includes(post)) throw new Error('no such post');
  const c = g.crew.find((x) => x.id === Number(who));
  if (who !== 'captain' && !c) throw new Error('no such crew member');
  g.ship.officers[post] = c ? c.id : 'captain';
}

// Depart from anywhere (the map's shortcut for the root menu's Depart):
// not while something's blocking it, else whatever else is open is closed
// and it's the menu's Depart, heartbeat and all.
export function departNow(g) {
  if (!g.visit) throw new Error("you're already on your way");
  const reason = blocking(g.visit);
  if (reason) throw new Error(reason);
  // (Checked first, so a depart that can't happen closes nothing.)
  const c = courseOf(g);
  if (!c) throw new Error('lay in a course first');
  if (g.ship.fuel < c.fuel) throw new Error(`need ${c.fuel} Star Fuel to reach ${c.nextName}, you have ${g.ship.fuel}`);
  g.visit.stack.length = 1;
  return actOn(g, { action: 'depart' });
}

// A conversation, now.
export function begin(g, entry) {
  push(g.visit, worldAt(g, g.universe.nodes[g.visit.planet]), entry);
  return { ok: true, now: true };
}

// Dev tools.
export const dev = {
  hunter: (g) =>
    begin(g, {
      kind: 'combat', enemy: 'hunter', lender: newPerson(g.people).id, owed: 400 + 10 * Math.floor(Math.random() * 30),
      system: g.universe.nodes[Math.floor(Math.random() * g.universe.nodes.length)].name
    }),
  firefight: (g) => begin(g, { kind: 'firefight' }),
  // Full repair: hull and critical systems back to max, and no more Limping.
  repair: (g) => {
    g.ship.traits = g.ship.traits.filter((t) => t.kind !== 'limping');
    Object.assign(g.ship.combat, { wear: 0, lostCrits: 0 });
  }
};

export { stats };
