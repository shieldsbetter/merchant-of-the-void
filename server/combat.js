// Space combat: a conversation. Both ships fire simultaneously, step after
// step, until a pause point: a ship's hull first drops to 15% or below, a
// critical system is knocked out, or a ship is dead in the water (no hull, or
// no critical systems left). At each pause you choose: keep fighting, or try
// to escape. A failed escape starts the next round at once, with you firing at
// reduced strength.
//
// Hull and critical-system damage stay with the ship (ship.combat.wear and
// .lostCrits: damage, not current values, so modules that change the maxima
// don't change how damaged you are), except that after any fight it's
// patched back up to a floor: 25% hull and one critical system, at the cost
// of cycles.
import { refOf } from './people.js';
import { effect } from './traits.js';
import { patchUp } from './aftermath.js';
import { boarding } from './firefight.js';
import { say } from './grammar.js';
import { stats } from './modules.js';
import { lostFight } from './morale.js';
import { personRef } from './refs.js';

const LOW = 0.15; // pause when a ship's hull first falls to this fraction
const SIMS = 300; // fights simulated for the odds

// A new ship's base combat stats (modules add to them; see modules.js). Per
// step: damage in [lo, hi], crit = chance of knocking out a critical system.
// wear = hull damage taken, lostCrits = critical systems knocked out.
export const shipCombat = () => ({
    maxHull: 100,
    maxCrits: 1,
    damage: [3, 7],
    crit: 0.015,
    maneuver: 10,
    wear: 0,
    lostCrits: 0,
});

export const ENEMIES = {
    hunter: {
        name: 'Bounty hunter',
        hull: 110,
        maxHull: 110,
        crits: 1,
        maxCrits: 1,
        damage: [4, 8],
        crit: 0.02,
        maneuver: 12,
        // The announcement, and the button that takes you to the fight.
        arrive: 'A ship drops out of the dark on your tail: a bounty hunter.',
        ready: 'Red alert!',
        // Before the fight, if they know what you owe ({{owed}} cr): a chance to
        // pay them off instead. Templates (grammar.js); the lender is "they".
        talk: {
            intro: 'You still owe {{lender}} back on {{system}}. {{They}} sent me to collect.',
            claim: "I've got {{their}} money.",
            offer: "Well, if you give it to me, maybe I pretend I didn't find you.",
            paid: "Shame we didn't run into each other.",
            refuse: 'The hard way, then. Love the hard way.',
        },
        win: "The hunter's ship goes dark. You leave them drifting. They'll be back.",
        escape: 'You break away and lose them in the dust.',
        lose: "Dead in the water, you can only watch as the hunter's ship locks onto your airlock.",
    },
    // Out between systems (see encounters.js): about 60/40 against a new
    // ship. Their toll ({{owed}} cr) or a fight; beat them and there's salvage.
    pirate: {
        name: 'Pirates',
        hull: 101,
        maxHull: 101,
        crits: 1,
        maxCrits: 1,
        damage: [3, 7],
        crit: 0.015,
        maneuver: 10,
        arrive: 'Your scopes light up: a ship running dark, closing fast. Pirates.',
        ready: 'Red alert!',
        // (No offer step: paying is the claim.)
        talk: {
            intro: 'Cut your engines. {{owed}} cr and you fly on. Or we take it all. Your choice.',
            claim: 'Fine. Take it.',
            paid: 'Pleasure doing business. Fly safe out here.',
            refuse: 'Brave. Stupid, but brave.',
        },
        win: 'The pirate ship breaks apart. You pick through what drifts free.',
        escape: 'You outrun them into the dark.',
        lose: 'Dead in the water, you can only watch as the pirates lock onto your airlock.',
    },
};

// Your chances against pirates in a ship like yours, fully repaired (see encounters.js).
export const pirateOdds = (ship, crew) =>
    odds(
        fighter(
            { ...ship, combat: { ...ship.combat, wear: 0, lostCrits: 0 } },
            crew,
        ),
        ENEMIES.pirate,
    );

// Crew who've been through space fights: after each (however it ends),
// each has a 1 in 3 chance of the next step up. Every step, of everyone
// aboard, adds a little to the ship: DAMAGE to its damage, and MANEUVER to
// its maneuverability (so a whole crew of Old Hands: +9% damage, +2).
const SPACE = [
    {
        label: 'Space Legs',
        value: "They've been in a space fight",
        says: 'has found their Space Legs',
    },
    {
        label: 'Seasoned Sailor',
        value: "They've been in a few space fights",
        says: 'is a Seasoned Sailor',
    },
    {
        label: 'Old Hand',
        value: "There's no ship fight they haven't seen",
        says: 'is an Old Hand',
    },
];
const DAMAGE = 0.005,
    MANEUVER = 0.125; // per step, per crew member
const steps = (crew = []) =>
    crew.reduce(
        (n, c) => n + (c.traits.find((t) => t.kind === 'spacer')?.level ?? 0),
        0,
    );
function promote(visit, crew) {
    for (const c of crew) {
        const t = c.traits.find((t) => t.kind === 'spacer');
        const level = t?.level ?? 0;
        if (level >= SPACE.length || Math.random() >= 1 / 3) continue;
        const { label, value, says } = SPACE[level];
        const next = {
            kind: 'spacer',
            level: level + 1,
            revealed: true,
            label,
            value,
        };
        if (t) Object.assign(t, next);
        else c.traits.push(next);
        visit.feed.push({ kind: 'event', text: `${personRef(c)} ${says}.` });
    }
}

// Your side as it fights: stats with modules, trait effects (Limping, ...),
// and what the crew have learned (see SPACE).
export const fighter = (ship, crew) => {
    const s = stats(ship),
        e = crewEdge(crew);
    return {
        ...s,
        maneuver: s.maneuver + e.maneuver,
        dmgX: effect(ship, 'damage') * (1 + e.damage),
        critX: effect(ship, 'crit'),
    };
};

// What the crew's experience adds: { damage (a fraction), maneuver }.
export const crewEdge = (crew) => {
    const n = steps(crew);
    return { damage: n * DAMAGE, maneuver: Math.floor(n * MANEUVER) };
};
const out = (s) => s.hull <= 0 || s.crits <= 0; // dead in the water
const low = (s) => s.hull <= LOW * s.maxHull;

// Escape chance, and your strength in the round after a failed attempt:
// even at 50%, 5 points per point of maneuverability you have on them.
const edge = (me, them) =>
    Math.min(0.9, Math.max(0.1, 0.5 + (me.maneuver - them.maneuver) * 0.05));

// One round: steps of simultaneous fire until a pause point. `x` scales your
// fire (a failed escape). Mutates both sides; returns what happened.
function round(me, them, x = 1, r = Math.random) {
    const was = { me: low(me), them: low(them) };
    const log = { dealt: 0, taken: 0, myCrit: 0, theirCrit: 0 };
    for (let i = 0; i < 500; i++) {
        const shot = (s, mult) => ({
            dmg: Math.round(
                (s.damage[0] + r() * (s.damage[1] - s.damage[0])) *
                    mult *
                    (s.dmgX ?? 1),
            ),
            crit: r() < s.crit * mult * (s.critX ?? 1),
        });
        const mine = shot(me, x),
            theirs = shot(them, 1);
        them.hull = Math.max(0, them.hull - mine.dmg);
        me.hull = Math.max(0, me.hull - theirs.dmg);
        log.dealt += mine.dmg;
        log.taken += theirs.dmg;
        if (mine.crit) (them.crits--, log.myCrit++);
        if (theirs.crit) (me.crits--, log.theirCrit++);
        if (out(me) || out(them) || mine.crit || theirs.crit) break;
        if ((!was.me && low(me)) || (!was.them && low(them))) break;
    }
    return log;
}

// Chance you win if you fight on from here: simulate it to the end.
export function odds(me, them) {
    let wins = 0;
    for (let n = 0; n < SIMS; n++) {
        const a = structuredClone(me),
            b = structuredClone(them);
        for (let i = 0; i < 50 && !out(a) && !out(b); i++) round(a, b);
        if (out(b) && !out(a)) wins++;
    }
    return wins / SIMS;
}

// The combat conversation. Entry: { enemy: kind, lender?, owed?, system?,
// them: stats, arrive?/ready? (the announcement and its button, if not the
// enemy's own), phase: 'alert' (they've shown up; you click through before
// the fight screen) | 'talk' | 'offer' (a hunter's chance to pay them off)
// | 'start' | 'pause' | 'over', outcome ('win' | 'lose' | 'escape', once over),
// odds, escape, me: your stats (for the panel) }. When the fight ends it
// stays up, showing the final state, until you close it; closing applies
// the consequences.
export const combat = {
    blocking: 'You are in combat and cannot leave.',
    open(visit, world, top) {
        // Fill in who sent them (a bounty hunter's lender) and what's owed.
        const fill = (text) =>
            say(
                text,
                {
                    lender: refOf(world.people, top.lender, 'Someone you owe'),
                    system: top.system,
                    owed: top.owed?.toLocaleString(),
                },
                true,
            );
        top.them = JSON.parse(JSON.stringify(ENEMIES[top.enemy]), (k, v) =>
            typeof v === 'string' ? fill(v) : v,
        );
        visit.feed.push({
            kind: 'event',
            text: top.arrive ? fill(top.arrive) : top.them.arrive,
        });
        top.ready = top.ready ? fill(top.ready) : top.them.ready;
        top.phase = 'alert';
        refresh(world, top);
    },
    act(visit, world, body) {
        const top = visit.stack.at(-1);
        if (top.phase === 'alert') {
            if (body.action !== 'ready') throw new Error('unknown action');
            visit.feed.push({ kind: 'you', text: top.ready });
            // A hunter who knows the debt talks first; anyone else just attacks.
            top.phase = top.them.talk && top.owed ? 'talk' : 'start';
            if (top.phase === 'talk')
                visit.feed.push({
                    kind: 'npc',
                    who: top.them.name,
                    text: top.them.talk.intro,
                });
            return;
        }
        if (top.phase === 'over') {
            if (body.action !== 'close') throw new Error('the fight is over');
            return aftermath(visit, world, top);
        }
        if (top.phase === 'talk' || top.phase === 'offer')
            return talk(visit, world, top, body.action);
        const me = fighter(world.ship, world.crew);
        const them = top.them;
        let x = 1;
        if (body.action === 'escape') {
            visit.feed.push({ kind: 'you', text: 'Get us out of here!' });
            if (Math.random() < edge(me, them))
                return over(visit, world, top, 'escape', me);
            visit.feed.push({
                kind: 'event',
                text: "They stay on you. You're caught out of position.",
            });
            x = edge(me, them);
        } else if (body.action === 'fight') {
            visit.feed.push({
                kind: 'you',
                text:
                    top.phase === 'start' ? 'Battle stations.' : 'Keep firing.',
            });
        } else throw new Error('unknown action');

        const log = round(me, them, x);
        Object.assign(world.ship.combat, {
            wear: me.maxHull - me.hull,
            lostCrits: me.maxCrits - me.crits,
        });
        visit.feed.push({
            kind: 'event',
            text: `You trade fire: ${log.dealt} damage dealt, ${log.taken} taken.`,
        });
        if (log.myCrit)
            visit.feed.push({
                kind: 'event',
                text: 'A lucky shot knocks out one of their critical systems!',
            });
        if (log.theirCrit)
            visit.feed.push({
                kind: 'event',
                text: 'They knock out one of your critical systems!',
            });
        if (out(me)) return over(visit, world, top, 'lose', me);
        if (out(them)) return over(visit, world, top, 'win', me);
        top.phase = 'pause';
        refresh(world, top, me);
    },
};

// Before a hunter's fight: offer them the money (if you have it), and pay it
// over, or refuse, and fight. Paying ends the encounter; the hunter stays on
// your trail.
function talk(visit, world, top, action) {
    const { talk, name } = top.them;
    const hunter = (text) => visit.feed.push({ kind: 'npc', who: name, text });
    const fight = () => {
        hunter(talk.refuse);
        top.phase = 'start';
        refresh(world, top);
    };
    const pay = () => {
        if (world.ship.credits < top.owed)
            throw new Error(
                `you have ${world.ship.credits.toLocaleString()} cr`,
            );
        world.ship.credits -= top.owed;
        visit.feed.push({
            kind: 'event',
            text: `−${top.owed.toLocaleString()} cr. Balance ${world.ship.credits.toLocaleString()} cr.`,
        });
        hunter(talk.paid);
        return 'pop';
    };
    if (top.phase === 'talk' && action === 'claim') {
        if (world.ship.credits < top.owed)
            throw new Error(
                `you have ${world.ship.credits.toLocaleString()} cr`,
            );
        visit.feed.push({ kind: 'you', text: talk.claim });
        if (!talk.offer) return pay(); // (pirates: just pay)
        hunter(talk.offer);
        top.phase = 'offer';
    } else if (top.phase === 'talk' && action === 'refuse') {
        visit.feed.push({ kind: 'you', text: "You'll get nothing from me." });
        fight();
    } else if (top.phase === 'offer' && action === 'pay') {
        if (world.ship.credits < top.owed)
            throw new Error(
                `you have ${world.ship.credits.toLocaleString()} cr`,
            );
        visit.feed.push({ kind: 'you', text: 'Take it.' });
        return pay();
    } else if (top.phase === 'offer' && action === 'refuse') {
        visit.feed.push({ kind: 'you', text: 'On second thought, no.' });
        fight();
    } else throw new Error('unknown action');
}

function refresh(world, top, me = fighter(world.ship, world.crew)) {
    top.me = {
        hull: me.hull,
        maxHull: me.maxHull,
        crits: me.crits,
        maxCrits: me.maxCrits,
    };
    top.odds = odds(me, top.them);
    top.escape = edge(me, top.them);
}

// The fight's over: say how, and show the final state (odds settle at 100%
// or 0%; an escape leaves them where they were).
function over(visit, world, top, outcome, me) {
    visit.feed.push({ kind: 'event', text: top.them[outcome] });
    refresh(world, top, me);
    Object.assign(top, { phase: 'over', outcome });
    if (outcome !== 'escape') top.odds = outcome === 'win' ? 1 : 0;
    if (outcome === 'lose') lostFight(world);
    promote(visit, world.crew);
}

// Closing a finished fight. Beaten by a bounty hunter or pirates, you're
// boarded (see firefight.js); otherwise the ship is patched up to the floor.
// Beating pirates, there's salvage.
const SALVAGE = [100, 300]; // cr
function aftermath(visit, world, top) {
    if (
        top.outcome === 'lose' &&
        (top.enemy === 'hunter' || top.enemy === 'pirate')
    ) {
        visit.stack.pop();
        const entry = {
            kind: 'boarding',
            lender: top.lender,
            enemy: top.enemy,
        };
        visit.stack.push(entry);
        boarding.open(visit, world, entry);
        return;
    }
    visit.feed.push({ kind: 'you', text: 'Stand down.' });
    if (top.outcome === 'win' && top.enemy === 'pirate') {
        world.ship.pirateWins = (world.ship.pirateWins ?? 0) + 1; // (see encounters.js)
        const cr =
            10 *
            Math.round(
                (SALVAGE[0] + Math.random() * (SALVAGE[1] - SALVAGE[0])) / 10,
            );
        world.ship.credits += cr;
        visit.feed.push({
            kind: 'event',
            text: `Salvage: +${cr.toLocaleString()} cr. Balance ${world.ship.credits.toLocaleString()} cr.`,
        });
    }
    patchUp(visit, world);
    return 'pop';
}
