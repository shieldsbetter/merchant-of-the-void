// Encounters between systems. A trip (g.trip; see game.js) passes a cycle
// at a time, and at the top of each one there's a roll: an encounter stops
// the trip out in empty space, in a visit of its own (`space`: between which
// systems), whose root conversation, 'drift', carries on once it's dealt with.
//
// For now, pirates: 1 in 30 each cycle, from cycle 20, until you've
// outgrown them: your ship (repaired) would beat them 75% of the time or
// more, and you've beaten them twice (ship.pirateWins; see combat.js).
import { pirateOdds } from './combat.js';
import { planetRef } from './refs.js';

const PIRATES = { chance: 1 / 30, from: 20, until: 0.75, wins: 2 };
const TOLL = 0.25; // of your credits, what pirates ask

// What waits out here this cycle: a conversation entry, or null.
export function encounter(g) {
    if (g.cycle < PIRATES.from || Math.random() >= PIRATES.chance) return null;
    if (
        (g.ship.pirateWins ?? 0) >= PIRATES.wins &&
        pirateOdds(g.ship, g.crew) >= PIRATES.until
    )
        return null;
    const owed = Math.max(50, 10 * Math.round((g.ship.credits * TOLL) / 10));
    return { kind: 'combat', enemy: 'pirate', owed };
}

// The visit an encounter happens in: out between `from` and `to`.
export function spaceVisit(g, { from, to }) {
    const [a, b] = [from, to].map((id) => g.universe.nodes[id]);
    return {
        id: `space-${Date.now().toString(36)}`,
        planet: to, // (where you're headed: the world things happen in)
        space: { from, to, fromName: a.name, toName: b.name },
        feed: [
            {
                kind: 'event',
                text: `Somewhere between ${planetRef(a)} and ${planetRef(b)}...`,
            },
        ],
        stack: [{ kind: 'drift' }],
    };
}

// The root of an encounter's visit: once it's over, carry on.
export const drift = {
    act(visit, world, body) {
        if (body.action !== 'continue') throw new Error('unknown action');
        visit.feed.push({ kind: 'you', text: `On to ${visit.space.toName}.` });
        return 'continue';
    },
};
