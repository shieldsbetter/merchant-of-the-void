import { crewFight } from './firefight.js';
import { says, personRef, planetRef } from './refs.js';
import { becomes, TYPES, regardOf } from './contact-types.js';
import { newPerson } from './people.js';
import { addMood, moraleOf } from './morale.js';
// The crew. Traits are secret: only revealed ones leave the server.
// Morale is out of 200: a base, plus moods while they last (see morale.js).

const HOME = { amount: 40, max: 180, hops: 10 }; // arriving at their homeworld: lasting this many hops' worth of cycles

// Give crew member `c` person `p` (see people.js) as a contact on `planet`
// (at `cycle`): the crew member keeps their id; they keep where they are, who
// introduced you, and their ledger (what you've done for them). `type`: what
// they do, starting their arc (see contact-types.js); plots' characters have none.
export function addContact(c, p, planet, { cycle = null, type, people } = {}) {
    Object.assign(p, {
        planet,
        via: c.id,
        traits: p.traits ?? [],
        ledger: p.ledger ?? [],
    });
    p.ledger.push({ cycle, text: `Met through ${personRef(c)}.` });
    if (type) becomes(p, type, people);
    c.contacts.push(p.id);
    return p;
}

// Crew member `c`'s contacts, as people.
export const contactsOf = (c, people) =>
    c.contacts.map((id) => people.find((p) => p.id === id)).filter(Boolean);

// Six new people (see people.js), as a crew.
export function makeCrew(people, nodes, r = Math.random) {
    const pick = (a) => a[Math.floor(r() * a.length)];
    return Array.from({ length: 6 }, () => newPerson(people, { r })).map(
        ({ id, name }) => ({
            id, // their person id
            name,
            base: 90 + Math.floor(r() * 40),
            traits: [
                { kind: 'homeworld', planet: pick(nodes).id, revealed: false },
            ],
            moods: [], // see morale.js
            ashore: 0, // the cycle of their last shore leave (see morale.js's restless)
            contacts: [], // their ids (people); made on shore leave; see below and contacts.js
            fight: crewFight(r), // hidden combat stats; see firefight.js
        }),
    );
}

const morale = (c) => moraleOf(c).morale;

// What the client may see: morale, and what makes it up (each mood, what it
// adds after limits, and cycles left, if it runs out); unrevealed traits stay
// on the server.
export const publicCrew = (crew, nodes, cycle) =>
    crew.map((c) => ({
        id: c.id,
        name: c.name,
        morale: morale(c),
        base: c.base,
        moods: moraleOf(c).parts.map(({ m, effect }) => ({
            label: m.label,
            amount: m.amount,
            max: m.max ?? null,
            min: m.min ?? null,
            effect,
            cyclesLeft: m.expires == null ? null : m.expires - cycle,
            ends: m.ends ?? null,
        })),
        traits: c.traits
            .filter((t) => t.revealed)
            .map((t) =>
                t.kind === 'homeworld'
                    ? { label: 'Homeworld', value: nodes[t.planet].name }
                    : { label: t.label, value: t.value },
            ),
    }));

// What the client sees of your contacts: who they are, where, through whom,
// what they do now, and their ledger (newest first). Never their arc.
export const publicContacts = ({ crew, people, universe }) =>
    crew.flatMap((c) =>
        contactsOf(c, people).map((k) => ({
            id: k.id,
            name: k.name,
            crew: c.name,
            planet: planetRef(universe.nodes[k.planet]),
            type: TYPES[k.type]?.label ?? null,
            position: k.position ?? null,
            traits: [
                regardOf(k)?.label,
                ...(k.traits ?? []).map((t) => t.label),
            ].filter(Boolean),
            ledger: [...(k.ledger ?? [])].reverse(),
        })),
    );

// Each crew member's morale, for fights (see firefight.js).
export const crewMorale = morale;

// Arriving on another planet (at `cycle`): everyone home is cheered (see
// HOME). One of them, at random, says the arrival line, which
// reveals their homeworld; the others' stay secret. And every contact can be
// asked for work and rumors again.
export function hop(crew, people, node, cyclesPerHop, cycle, r = Math.random) {
    const home = [];
    for (const c of crew) {
        for (const k of contactsOf(c, people)) {
            k.asked = {};
            delete k.offer; // a new job next time
        }
        const t = c.traits.find(
            (t) => t.kind === 'homeworld' && t.planet === node.id,
        );
        if (!t) continue;
        // (A fresh visit replaces the last one's.)
        addMood(c, {
            key: 'homeworld',
            label: `Home on ${node.name}`,
            amount: HOME.amount,
            max: HOME.max,
            expires: cycle + Math.round(cyclesPerHop * HOME.hops),
        });
        home.push({ c, t });
    }
    if (!home.length) return [];
    const { c, t } = home[Math.floor(r() * home.length)];
    t.revealed = true;
    return [says(c, `I can't wait to get some ${node.dish}.`)];
}

// Shore leave: everyone's morale goes up (to at most LEAVE_MAX) for
// LEAVE_HOPS hops' worth of cycles, by less each time until the next hop
// (`n` = shore leaves taken since). One
// crew member at most comes back with a rumor (one of `rumors`, the ones you
// haven't heard; 1 in 3), and one at most makes a new contact here (1 in 10). Whether you've asked a contact for work or
// rumors since the last hop is tracked on it too:
// { id, name, planet, asked: { work, rumor } }.
const LEAVE_GAINS = [10, 7, 5, 2, 1, 0];
const LEAVE_HOPS = 5;
const LEAVE_MAX = 150;
const RUMOR_CHANCE = 1 / 3; // per shore leave, for the whole crew
const CONTACT_CHANCE = 0.1; // likewise

// A crew member may pick up one of `rumors` (texts you haven't heard): 1 in 3.
// Returns their line (with `rumor` set, for the caller to record), or null.
// (Shore leave's the chance; see below.)
export function overhear(crew, rumors, r = Math.random) {
    if (!rumors.length || r() >= RUMOR_CHANCE) return null;
    const c = crew[Math.floor(r() * crew.length)];
    const rumor = rumors[Math.floor(r() * rumors.length)];
    return {
        ...says(c, `Captain, I heard an interesting rumor:\n\n${rumor}`),
        rumor,
    };
}

// Time ashore: `cycles` shore leaves in a row (a cycle each, passing as it
// goes; each like the menu's, with its rumor and contact chances), for the
// one-off cost of the whole (say, waiting on repairs). Returns the morale
// gained in all, and what the crew turned up (rumors heard, contacts made).
export function ashore(world, cycles) {
    const { ship } = world;
    let gained = 0;
    const lines = [];
    for (let i = 0; i < cycles; i++) {
        // Only rumors you haven't heard (archived ones count as heard).
        const rumors = world.situations
            .map((s) => s.text)
            .filter((t) => !world.rumors.some((r) => r.text === t));
        const [morale, ...rest] = shoreLeave(
            world.crew,
            world.people,
            ship.shoreLeaves ?? 0,
            rumors,
            world.cyclesPerHop,
            world.node,
            world.cycle,
        );
        gained += morale.gain;
        ship.shoreLeaves = (ship.shoreLeaves ?? 0) + 1; // reset by the next hop
        for (const { rumor, ...line } of rest) {
            if (rumor) world.hear(rumor);
            lines.push(line);
        }
        world.passTime(1);
    }
    return { gained, lines };
}

export function shoreLeave(
    crew,
    people,
    n,
    rumors,
    cyclesPerHop,
    node,
    cycle,
    r = Math.random,
) {
    const amount = LEAVE_GAINS[Math.min(n, LEAVE_GAINS.length - 1)];
    const expires = cycle + Math.round(cyclesPerHop * LEAVE_HOPS);
    const lines = [
        {
            kind: 'event',
            text: amount
                ? `Crew morale +${amount}.`
                : 'The crew are bored of this place.',
            gain: amount,
        },
    ];
    for (const c of crew) {
        if (amount)
            addMood(c, {
                label: `Shore leave on ${node.name}`,
                amount,
                max: LEAVE_MAX,
                expires,
            });
        c.ashore = cycle; // (no longer restless)
        c.moods = c.moods.filter((m) => m.key !== 'restless');
    }
    const heard = overhear(crew, rumors, r);
    if (heard) lines.push(heard);
    if (r() < CONTACT_CHANCE) {
        const c = crew[Math.floor(r() * crew.length)];
        const k = addContact(c, newPerson(people, { r }), node.id, {
            cycle,
            type: 'shopkeeper',
            people,
        });
        lines.push(
            says(
                c,
                `I made a friend here, Captain. ${k.name}. Could be useful.`,
            ),
        );
    }
    return lines;
}
