// The escape hatch for a stranded ship: a shady fixer sells (or lends) enough
// Star Fuel to reach anywhere within two hops.
//
// Stranded: not enough fuel for any jump from here, and either no fuel for
// sale here or not enough credits to buy enough. (Selling cargo might fix
// that; the option shows anyway and goes away once you can buy.)
//
// Their price is the highest fuel price anywhere in the universe. If there's
// no fuel here they offer to sell at it; refuse (or if fuel is here but you
// can't afford it) and they offer it as a loan, due in 50 cycles.

import { GOODS } from './goods.js';
import { stats } from './modules.js';
import { newPerson, nameOf } from './people.js';
import { PLAYER } from './player.js';
import { addQuest, endQuest } from './quests.js';
import { planetRef, personRef } from './refs.js';
import { priceOf } from './situations.js';
import { cantShowYourFace, hunted, hopCost } from './traits.js';

const LOAN_CYCLES = 50;

// [neighbour, fuel to get there] for this ship.
const neighbours = (universe, id, ship) =>
    universe.edges
        .filter(([a, b]) => a === id || b === id)
        .map(([a, b, cost]) => [a === id ? b : a, hopCost(ship, cost)]);

export function stranded({ ship, node, universe, price }) {
    const cheapest = Math.min(
        ...neighbours(universe, node.id, ship).map(([, cost]) => cost),
    );
    if (ship.fuel >= cheapest) return false;
    const fuel = node.market.find((m) => m.good === 'fuel');
    return !fuel || ship.credits < (cheapest - ship.fuel) * price(fuel);
}

// What they'll offer: enough fuel for the costliest two-hop trip from here.
export function offer({ ship, node, universe, situations }) {
    let need = 0;
    for (const [mid, c1] of neighbours(universe, node.id, ship))
        for (const [end, c2] of neighbours(universe, mid, ship))
            if (end !== node.id) need = Math.max(need, c1 + c2);
    const price = Math.max(
        ...universe.nodes.flatMap((n) =>
            n.market
                .filter((m) => m.good === 'fuel')
                .map(priceOf(situations, n)),
        ),
    );
    // ...as much of it as the tanks will take.
    const amount = Math.max(1, Math.min(need, stats(ship).fuelCap) - ship.fuel);
    return { amount, price, total: amount * price };
}

// Start the conversation: push it and say the opening lines. The fixer is
// someone new each time (`who`, a person id), who'll also be the one collecting.
export function meetFixer(visit, world) {
    if (!stranded(world)) throw new Error("you're not stranded");
    const o = offer(world);
    const sells = !world.node.market.some((m) => m.good === 'fuel');
    visit.feed.push({
        kind: 'event',
        text: 'In a smoky room, you find someone who might part with some Star Fuel for a price...',
    });
    const top = {
        kind: 'fixer',
        step: sells ? 'sell' : 'loan',
        who: newPerson(world.people).id,
        ...o,
    };
    visit.stack.push(top);
    visit.feed.push(sells ? sellLine(top, world) : loanLine(top, world));
}

const sellLine = (o, { people }) => ({
    kind: 'npc',
    who: nameOf(people, o.who),
    text: `Nobody's selling fuel here but me. ${o.amount} Star Fuel, ${o.price} cr a unit. ${o.total.toLocaleString()} cr, all told.`,
});
const loanLine = (o, { people, cycle }) => ({
    kind: 'npc',
    who: nameOf(people, o.who),
    text: `Tell you what. Take ${o.amount} Star Fuel now, and bring me ${o.total.toLocaleString()} cr within ${LOAN_CYCLES} cycles. By cycle ${cycle + LOAN_CYCLES}, say.`,
});

export const fixer = {
    act(visit, world, body) {
        const { ship, cycle, node, quests, people } = world;
        const top = visit.stack.at(-1);
        const get = () => {
            ship.fuel += top.amount;
            visit.feed.push({
                kind: 'event',
                text: `+${top.amount} ${GOODS.fuel.name}.`,
            });
        };
        if (top.step === 'sell' && body.action === 'buy') {
            if (ship.credits < top.total)
                throw new Error(`you have ${ship.credits.toLocaleString()} cr`);
            ship.credits -= top.total;
            visit.feed.push({ kind: 'you', text: 'Deal.' });
            visit.feed.push({
                kind: 'event',
                text: `−${top.total.toLocaleString()} cr. Balance ${ship.credits.toLocaleString()} cr.`,
            });
            get();
            return 'pop';
        }
        if (top.step === 'sell' && body.action === 'refuse') {
            visit.feed.push({ kind: 'you', text: "That's too steep." });
            top.step = 'loan';
            visit.feed.push(loanLine(top, world));
            return;
        }
        if (top.step === 'loan' && body.action === 'borrow') {
            visit.feed.push({ kind: 'you', text: 'Deal.' });
            get();
            const q = loanQuest(
                node,
                top.total,
                cycle + LOAN_CYCLES,
                people.find((p) => p.id === top.who),
            );
            addQuest(quests, q);
            visit.feed.push({ kind: 'event', text: `New quest: ${q.text}` });
            return 'pop';
        }
        if (top.step === 'loan' && body.action === 'refuse') {
            visit.feed.push({ kind: 'you', text: 'No thanks.' });
            visit.feed.push({
                kind: 'npc',
                who: nameOf(people, top.who),
                text: 'Suit yourself. You know where to find me.',
            });
            return 'pop';
        }
        throw new Error('unknown action');
    },
};

// The loan, as a quest: docking back at the planet you borrowed at brings
// the lender (a person) round to collect. `due` is the last cycle to pay in; when the
// next one starts, the quest fails, a crew member tells you so, you can't
// show your face there again, and a bounty hunter comes looking.
function loanQuest(node, owed, due, lender) {
    const text = `Return to ${planetRef(node)} with ${owed.toLocaleString()} cr for ${personRef(lender)} by cycle ${due}.`;
    return {
        kind: 'loan',
        text,
        lender: lender.id,
        planet: node.id,
        owed,
        due,
        // Arriving brings the lender round; and while you're there, you can go to them.
        engage: [
            {
                planet: node.id,
                label: `See ${lender.name} about the loan.`,
                actions: [{ type: 'push', conversation: { kind: 'repay' } }],
            },
        ],
        subscriptions: [
            {
                pattern: `/players/${PLAYER}/arrive/${node.id}`,
                actions: [{ type: 'push', conversation: { kind: 'repay' } }],
            },
            {
                pattern: `/cycles/${due + 1}/start`,
                actions: [
                    {
                        type: 'defer',
                        conversation: {
                            kind: 'notice',
                            says: `Deadline to pay ${personRef(lender)} back on ${planetRef(node)} has passed, Captain...`,
                            reply: "We'll cross that bridge when we come to it.",
                            after: `Quest failed: ${text}`,
                        },
                    },
                    {
                        type: 'addShipTrait',
                        trait: cantShowYourFace(node, lender, owed),
                    },
                    {
                        type: 'addShipTrait',
                        trait: hunted(lender.id, owed, node.name),
                    },
                    { type: 'end' },
                ],
            },
        ],
    };
}

// The lender collecting: pay up, or ask for more time. Pushed by the loan
// quest, so `top.quest` is its id.
export const repay = {
    open(visit, { quests, people }, top) {
        const q = quests.find((q) => q.id === top.quest);
        top.owed = q.owed;
        visit.feed.push({
            kind: 'event',
            text: 'No sooner do you arrive than someone wants to see you...',
        });
        visit.feed.push({
            kind: 'npc',
            who: nameOf(people, q.lender) ?? 'Stranger',
            text: `Well, well. I believe you owe me ${q.owed.toLocaleString()} cr.`,
        });
    },
    act(visit, { ship, quests, cycle, people }, body) {
        const top = visit.stack.at(-1);
        const q = quests.find((q) => q.id === top.quest);
        if (body.action === 'pay') {
            if (ship.credits < q.owed)
                throw new Error(`you have ${ship.credits.toLocaleString()} cr`);
            ship.credits -= q.owed;
            endQuest(quests, q.id);
            visit.feed.push({ kind: 'you', text: "Here's your money." });
            visit.feed.push({
                kind: 'event',
                text: `−${q.owed.toLocaleString()} cr. Balance ${ship.credits.toLocaleString()} cr.`,
            });
            visit.feed.push({
                kind: 'npc',
                who: nameOf(people, q.lender) ?? 'Stranger',
                text: 'Pleasure doing business.',
            });
            visit.feed.push({
                kind: 'event',
                text: `Quest complete: ${q.text}`,
            });
            return 'pop';
        }
        if (body.action === 'later') {
            const left = q.due - cycle;
            visit.feed.push({
                kind: 'you',
                text: 'I need a little more time.',
            });
            visit.feed.push({
                kind: 'npc',
                who: nameOf(people, q.lender) ?? 'Stranger',
                text:
                    left > 0
                        ? `You've got ${left} cycle${left > 1 ? 's' : ''}. Cycle ${q.due}. Don't make me come looking for you.`
                        : "This is your last cycle. Don't make me come looking for you.",
            });
            return 'pop';
        }
        throw new Error('unknown action');
    },
};
