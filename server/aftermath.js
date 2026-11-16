// What's left to do after a fight, whatever kind it was.
import { addShipTrait, limping } from './traits.js';
import { stats } from './modules.js';
import { refOf } from './people.js';

const FLOOR = 0.25; // hull you're patched back up to after a fight

// Beaten by a bounty hunter (in space, or when they board): they take
// everything in the hold, the ship is Limping, and the debt they came for is
// settled, so you can show your face again and they stop hunting you.
// (`limp: false` when the ship itself wasn't in the fight.)
// Beaten by pirates: they strip the hold, and the ship is Limping (no debt
// in it: anything you owe, you still owe).
export function plundered(visit, { ship }) {
    for (const h of ship.holds) h.slots = h.slots.map(() => null);
    if (!ship.traits.some((t) => t.kind === 'limping'))
        addShipTrait(ship, limping());
    visit.feed.push({
        kind: 'event',
        text: 'The pirates strip the hold bare and cast off, leaving you drifting.',
    });
    visit.feed.push({
        kind: 'event',
        text: 'Your hold is empty. Your ship is Limping.',
    });
}

export function seized(visit, { ship, people }, lender, { limp = true } = {}) {
    for (const h of ship.holds) h.slots = h.slots.map(() => null);
    ship.traits = ship.traits.filter(
        (t) => t.kind !== 'wanted' && t.kind !== 'hunted',
    );
    if (limp && !ship.traits.some((t) => t.kind === 'limping'))
        addShipTrait(ship, limping());
    visit.feed.push({
        kind: 'event',
        text: `They strip the hold bare, and leave word: ${refOf(people, lender, 'Someone you owe')} considers the debt settled.`,
    });
    visit.feed.push({
        kind: 'event',
        text: `Your hold is empty.${limp ? ' Your ship is Limping.' : ''} You can show your face again.`,
    });
}

// Patch the ship up to the floor (25% hull, one critical system), losing a
// cycle per 5% of hull patched and two per critical system brought back.
export function patchUp(visit, world) {
    const c = world.ship.combat;
    const { maxHull, maxCrits } = stats(world.ship);
    const hull = Math.max(0, Math.round(FLOOR * maxHull) - (maxHull - c.wear));
    const crits = Math.max(0, 1 - (maxCrits - c.lostCrits));
    c.wear -= hull;
    c.lostCrits -= crits;
    const cycles = Math.round((hull / maxHull) * 20) + 2 * crits;
    if (cycles) {
        visit.feed.push({
            kind: 'event',
            text: `You lose ${cycles} cycle${cycles > 1 ? 's' : ''} getting the ship back up and running.`,
        });
        world.passTime(cycles);
    }
}
