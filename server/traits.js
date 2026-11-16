// Ship traits: lasting facts about the ship, shown on the Ship tab. Like
// quests, a trait can subscribe to events (see events.js).
// trait: { id, kind, label, value, subscriptions, hidden?, effects?, ...details }
// Hidden traits do their work through subscriptions and aren't shown.
// effects: multipliers on the ship ({ fuel, damage, crit }); see effect().
import { PLAYER } from './player.js';
import { GOODS } from './goods.js';
import { planetRef, personRef } from './refs.js';

// The product of every trait's (and installed module's) multiplier for `key`
// (1 if none).
export const effect = (ship, key) =>
    [
        ...ship.traits,
        ...(ship.slots ?? []).filter(Boolean).map((g) => GOODS[g].module),
    ].reduce((x, t) => x * (t.effects?.[key] ?? 1), 1);

// Fuel (and so cycles) for a hop of base cost `cost`.
export const hopCost = (ship, cost) => Math.ceil(cost * effect(ship, 'fuel'));

export function addShipTrait(ship, trait) {
    trait.id = Math.max(0, ...ship.traits.map((t) => t.id)) + 1;
    ship.traits.push(trait);
    return trait;
}

// A brand new ship: whatever happens on its first dock (for now, a crew
// member's introduction to a contact; see contacts.js), then it's gone.
export const newShip = () => ({
    kind: 'new',
    hidden: true,
    label: 'New ship',
    subscriptions: [
        {
            pattern: `/players/${PLAYER}/arrive/:systemId`,
            actions: [
                { type: 'push', conversation: { kind: 'intro' } },
                { type: 'end' },
            ],
        },
    ],
});

// Badly damaged: hops cost more, and the guns are weak. (Repairs to come.)
export const limping = () => ({
    kind: 'limping',
    label: 'Limping',
    value: 'Hops +50% · damage −50% · crit −75%',
    effects: { fuel: 1.5, damage: 0.5, crit: 0.25 },
    subscriptions: [],
});

// A bounty hunter on your trail, sent by `lender` (a person id) for the `owed` cr you
// borrowed on `system`: one hop in five, they're waiting when you arrive
// (see combat.js). Gone once they've collected.
export const hunted = (lender, owed, system) => ({
    kind: 'hunted',
    lender,
    hidden: true,
    label: 'Hunted',
    subscriptions: [
        {
            pattern: `/players/${PLAYER}/hop/:from/:to`,
            actions: [
                {
                    type: 'defer',
                    chance: 0.2,
                    conversation: {
                        kind: 'combat',
                        enemy: 'hunter',
                        lender,
                        owed,
                        system,
                    },
                },
            ],
        },
    ],
});

// Wanted at a planet, by `lender` (a person; none: someone) for `owed` cr. Docking there gets you a
// warning; anything you do there (a heartbeat; see events.js) has a 1 in 4
// chance of the lender finding you (see firefight.js). And you can't do
// anything there that takes time, like shore leave (see visit.js).
export const cantShowYourFace = (node, lender = null, owed = 400) => ({
    kind: 'wanted',
    label: "Can't show your face",
    value: node.name,
    planet: node.id,
    lender: lender?.id ?? 'Someone you owe',
    owed,
    subscriptions: [
        {
            pattern: `/players/${PLAYER}/arrive/${node.id}`,
            actions: [
                {
                    type: 'push',
                    conversation: {
                        kind: 'notice',
                        says: `${lender ? personRef(lender) : 'Someone you owe'} is looking for you on ${planetRef(node)}. It would be unwise to stick around, but you might get a little business done...`,
                        reply: "We'll be quick.",
                    },
                },
            ],
        },
        {
            pattern: `/players/${PLAYER}/heartbeat/${node.id}`,
            actions: [
                {
                    type: 'push',
                    chance: 0.25,
                    conversation: {
                        kind: 'confront',
                        lender: lender?.id ?? 'Someone you owe',
                        owed,
                        system: node.name,
                    },
                },
            ],
        },
    ],
});
