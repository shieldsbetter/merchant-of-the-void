// A visit: the system you're in, from your arrival there. The feed is its
// thread so far, and the stack its conversations; only the top one can be
// acted on, and under them all is the root menu, from which you depart.
// Lives on the server so a reload can't skip it.

import { arrival } from './arrival.js';
import { combat } from './combat.js';
import {
    contacts,
    contact,
    delivery,
    intro,
    favors,
    askForHelp,
    contactsHere,
} from './contacts.js';
import { shoreLeave } from './crew.js';
import { drift } from './encounters.js';
import { factionOffice } from './factions.js';
import { firefight, boarding, confront, publicFight } from './firefight.js';
import { fixer, repay, stranded } from './fixer.js';
import { GOODS } from './goods.js';
import { notice } from './notice.js';
import { scene } from './plots.js';
import { planetRef } from './refs.js';
import { repair } from './repair.js';
import { trade } from './ship.js';
import { shipyard, yardTier } from './shipyard.js';

const SHORE_LEAVE = 300; // credits

// Each conversation kind handles its own actions: it can push another
// conversation (see push). Returning 'pop' ends it (the root menu returns
// 'depart' instead, to hop on; see game.js). An optional open(visit, world, entry)
// runs when it's pushed, to say its opening lines; if it returns 'pop' the
// conversation was only something to say, and is done.
// A conversation can be `blocking`: a reason you can't depart while it's on
// the stack (a string, or a function of its entry), as a fight is. An entry
// can say so for itself instead (its own `blocking`). See blocking().
// A conversation can also set world.pulse to have a heartbeat (see events.js)
// once its action is done; menu's depart has one first, which can stop you.
// `world`: { ship, node, universe, cycle, crew, situations, cyclesPerHop, price, course(),
// hear, quests, deferred, rumors, passTime }, where price(m) is a market entry's current price and hear(text)
// records a rumor. passTime(n) runs the clock forward n cycles.
// (Built on first use, not at load: most of these come from modules that
// import this one back, so at load time they may not exist yet.)
let conversations;
const CONVERSATIONS = () =>
    (conversations ??= {
        // The root: what to do here, and departing on the course laid in.
        menu: {
            act(visit, world, body) {
                const { ship } = world;
                if (body.action === 'trade') {
                    visit.feed.push({ kind: 'you', text: 'Trade.' });
                    visit.stack.push({ kind: 'trading' });
                } else if (body.action === 'leave') {
                    if (lyingLow(world))
                        throw new Error('it would be unwise to stick around');
                    if (ship.credits < SHORE_LEAVE)
                        throw new Error(
                            `shore leave costs ${SHORE_LEAVE} cr, you have ${ship.credits}`,
                        );
                    ship.credits -= SHORE_LEAVE;
                    // Only rumors you haven't heard (archived ones count as heard).
                    const rumors = world.situations
                        .map((s) => s.text)
                        .filter((t) => !world.rumors.some((r) => r.text === t));
                    visit.feed.push({ kind: 'you', text: 'Shore leave.' });
                    visit.feed.push({
                        kind: 'event',
                        text: `−${SHORE_LEAVE} cr. Balance ${ship.credits.toLocaleString()} cr.`,
                    });
                    const lines = shoreLeave(
                        world.crew,
                        world.people,
                        ship.shoreLeaves ?? 0,
                        rumors,
                        world.cyclesPerHop,
                        world.node,
                        world.cycle,
                    );
                    for (const { rumor } of lines) if (rumor) world.hear(rumor);
                    visit.feed.push(
                        ...lines.map(({ rumor, gain, ...line }) => line),
                    );
                    ship.shoreLeaves = (ship.shoreLeaves ?? 0) + 1; // reset by the next hop
                    world.emit(`/players/1/shoreleave/${world.node.id}`, visit);
                    world.passTime(1); // a cycle ashore, after which anything due happens
                } else if (body.action === 'office') {
                    if (world.node.faction == null)
                        throw new Error('no faction office here');
                    visit.feed.push({
                        kind: 'you',
                        text: `${world.universe.factions[world.node.faction].name} office...`,
                    });
                    push(visit, world, { kind: 'factionOffice' });
                } else if (body.action === 'shipyard') {
                    if (!yardTier(world.node))
                        throw new Error('no ship yard here');
                    visit.feed.push({ kind: 'you', text: 'Ship Yard...' });
                    push(visit, world, { kind: 'shipyard' });
                } else if (body.action === 'repair') {
                    if (!yardTier(world.node))
                        throw new Error('no ship yard here');
                    if (lyingLow(world))
                        throw new Error('it would be unwise to stick around');
                    if (!ship.combat.wear && !ship.combat.lostCrits)
                        throw new Error('nothing needs repairing');
                    visit.feed.push({ kind: 'you', text: 'Repairs...' });
                    push(visit, world, { kind: 'repair' });
                } else if (body.action === 'contacts') {
                    visit.feed.push({ kind: 'you', text: 'Local contacts...' });
                    push(visit, world, { kind: 'contacts' });
                } else if (body.action === 'trouble') {
                    visit.feed.push({
                        kind: 'you',
                        text: 'We might be in trouble...',
                    });
                    askForHelp(visit, world);
                } else if (body.action === 'engage') {
                    // Back into something going on here (see engagements).
                    const e = engagements(world)[Number(body.index)];
                    if (!e) throw new Error("that isn't going on here");
                    visit.feed.push({ kind: 'you', text: e.label });
                    world.perform(e.actions, e.quest, visit);
                } else if (body.action === 'depart') {
                    const c = world.course();
                    if (!c) throw new Error('lay in a course on the map first');
                    if (ship.fuel < c.fuel)
                        throw new Error(
                            `need ${c.fuel} Star Fuel to reach ${c.nextName}, you have ${ship.fuel}`,
                        );
                    // Trying to leave is a heartbeat: someone may catch you on the way out.
                    const depth = visit.stack.length;
                    world.heartbeat(visit);
                    if (visit.stack.length > depth) return;
                    visit.feed.push({
                        kind: 'you',
                        text: `Depart for ${c.nextName}.`,
                    });
                    return 'depart';
                } else throw new Error('unknown action');
            },
        },
        fixer,
        repay,
        notice,
        contacts,
        contact,
        delivery,
        intro,
        favors,
        combat,
        shipyard,
        repair,
        firefight,
        boarding,
        confront,
        scene,
        factionOffice,
        arrival,
        drift,
        trading: {
            act(visit, world, body) {
                const { ship, node, price } = world;
                if (body.action === 'done') {
                    visit.feed.push({ kind: 'you', text: 'Done trading.' });
                    return 'pop';
                }
                if (body.action !== 'trade') throw new Error('unknown action');
                const orders = body.orders ?? [];
                if (!orders.length) throw new Error('nothing to trade');
                const before = ship.credits;
                trade(ship, node.market, orders, price);
                const words = orders.map(
                    ({ good, qty }) =>
                        `${qty > 0 ? 'Bought' : 'Sold'} ${Math.abs(qty)} ${GOODS[good].name}`,
                );
                const delta = ship.credits - before;
                // (What you'd expect: no pause, so the market's straight back. Anything
                // the heartbeat brings on still takes its time.)
                visit.feed.push({
                    kind: 'you',
                    text: words.join(', ') + '.',
                    weight: 0,
                });
                visit.feed.push({
                    kind: 'event',
                    text: `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toLocaleString()} cr. Balance ${ship.credits.toLocaleString()} cr.`,
                    weight: 0,
                });
                world.pulse = true;
            },
        },
    });

// Why you can't depart now (the first blocking conversation's reason), or null.
export function blocking(visit) {
    for (const e of visit.stack) {
        const b = e.blocking ?? CONVERSATIONS()[e.kind].blocking;
        if (b) return typeof b === 'function' ? b(e) : b;
    }
    return null;
}

// What's going on in this system that you can get back into from the root
// menu: each quest's `engage` entries here ({ planet, label, actions }, the
// actions as an event subscription's; see events.js). A plot registers its
// own with p.engage (see plots.js).
export const engagements = (world) =>
    world.quests.flatMap((quest) =>
        (quest.engage ?? [])
            .filter((e) => e.planet === world.node.id)
            .map((e) => ({ ...e, quest })),
    );

// `lines`: extra feed items for this arrival (e.g. crew who are home).
export function startVisit(node, lines = []) {
    return {
        id: `${node.id}-${Date.now().toString(36)}`, // this arrival, as distinct from any other there
        planet: node.id,
        feed: [
            { kind: 'event', text: `You arrive at ${planetRef(node)}.` },
            ...lines,
        ],
        stack: [{ kind: 'menu', leaveCost: SHORE_LEAVE }],
    };
}

// Somewhere you can't show your face: nothing that takes time.
export const lyingLow = ({ ship, node }) =>
    ship.traits.some((t) => t.kind === 'wanted' && t.planet === node.id);

// Put a conversation on top of the stack.
export function push(visit, world, entry) {
    visit.stack.push(entry);
    if (CONVERSATIONS()[entry.kind].open?.(visit, world, entry) === 'pop')
        visit.stack.pop();
}

// Put something that happens to you (an event's conversation, a plot's
// scene or fight, something deferred) on the stack: one at a time. While
// another is still open, it waits its turn (visit.waiting), so two never
// talk over each other.
export function interject(visit, world, entry) {
    entry.interrupt = true;
    if (visit.stack.some((e) => e.interrupt))
        (visit.waiting ??= []).push(entry);
    else push(visit, world, entry);
}

// The next waiting interruption, once none is open (one that only says its
// piece is done at once: then the next).
function next(visit, world) {
    while (visit.waiting?.length && !visit.stack.some((e) => e.interrupt))
        push(visit, world, visit.waiting.shift());
}

// What the client gets: the visit, plus whether the "We might be in
// trouble..." (see fixer.js), "Local contacts..." and "Ship Yard..." options are on.
// A firefight's combat stats stay on the server.
export const present = (visit, world) =>
    visit && {
        ...visit,
        stack: visit.stack.map((e) =>
            e.kind === 'firefight' ? { ...e, f: publicFight(e.f) } : e,
        ),
        trouble: stranded(world),
        contacts: contactsHere(world).length > 0,
        shipyard: yardTier(world.node) > 0,
        office:
            world.node.faction == null
                ? null
                : world.universe.factions[world.node.faction].name,
        lyingLow: lyingLow(world),
        engage: engagements(world).map((e) => e.label),
        blocking: blocking(visit),
    };

// Returns 'depart' when the root menu's Depart goes ahead.
export function act(visit, world, body) {
    const top = visit.stack.at(-1);
    const done = CONVERSATIONS()[top.kind].act(visit, world, body ?? {});
    if (done === 'depart' || done === 'continue') return done; // (see game.js)
    if (done === 'pop') visit.stack.pop();
    if (world.pulse) {
        world.pulse = false;
        world.heartbeat(visit);
    }
    next(visit, world);
}
