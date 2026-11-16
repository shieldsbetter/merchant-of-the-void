// Firefights: people with guns, as a conversation, turn by turn.
//
// A turn: someone standing is picked at random, weighted by initiative
// (never the same person twice in a row). If their side's morale is low,
// they may fail a grit check, and all they can do is collect themselves.
// Otherwise abilities are drawn by lottery from what they could usefully
// do, weighted by how good they are at each: there's always a choice
// (several abilities, or one with several targets), and sometimes more.
// Whatever's chosen just happens: the luck is in what you're offered.
// Enemies choose for themselves; yours wait for you.
//
// Abilities:
//   drop      an enemy in the open goes down (or, with luck left, loses a luck point)
//   cover     you can't be dropped until you're flushed out
//   flush     an enemy in cover is out of it
//   pin       an enemy in cover loses their next turn
//   drag      a downed ally is pulled to safety (no Trauma, but they stay down)
//   rally     (leaders) your side's morale rises
//   order     (leaders) an ally in the open gets into cover
//   collect   (after a failed grit check) your side's morale rises a little
// Anything but pin and collect means moving, and breaks your own cover.
//
// Morale (per side, 0-100) falls as your people go down (a leader most of
// all), and when you're badly outnumbered; it rises as theirs go down, and
// with rallying. A side with nobody standing loses; so does one whose
// morale breaks (they run, or give up). Crew left down on the losing side
// carry Trauma afterwards.

import { crewMorale } from './crew.js';
import { seized, plundered, patchUp } from './aftermath.js';
import { freeName, refOf, nameOf } from './people.js';
import { lostFight, trauma } from './morale.js';
import { say } from './grammar.js';
import { personRef } from './refs.js';

const MORALE = {
    down: 15, // your side, when one of yours goes down
    leaderDown: 30, // ...when it's a leader
    dropped: 5, // the dropper's side
    luck: 5, // your side, when a leader's luck saves them
    outnumbered: 8, // a side with half the people standing, or fewer, after each action
    pin: 5,
    flush: 3,
    drag: 5,
    rally: 3, // per point of leadership
    collect: 12,
    shaky: 50, // below this, grit checks can fail
    breaks: 10, // at or below this, a side breaks
};

// Combat stats. initiative: how often they act (the weight on the wheel).
// accuracy: how often a shot is among what they're offered (drop's
// strength is accuracy × 20). Trained fighters act often and find shots;
// everyone else gets the occasional lucky one. Your crew's edge is numbers:
// the seven of you act about as often as two or three mercenaries.
//
// A crew member's hidden combat stats: not a combat crew.
export const crewFight = (r = Math.random) => ({
    initiative: 2 + Math.floor(r() * 3),
    accuracy: +(0.04 + r() * 0.08).toFixed(2),
    grit: 3 + Math.floor(r() * 6),
    awareness: 2 + Math.floor(r() * 7),
    leadership: 1 + Math.floor(r() * 6),
});
// Leaders can rally and give orders, and have luck: shots it takes to drop them.
const CAPTAIN = {
    initiative: 6,
    accuracy: 0.3,
    grit: 8,
    awareness: 6,
    leadership: 8,
    leader: true,
    luck: 2,
};
const HUNTER = {
    title: 'Bounty Hunter',
    initiative: 10,
    accuracy: 0.5,
    grit: 7,
    awareness: 6,
    leadership: 4,
};
const MERC = {
    title: 'Mercenary',
    initiative: 10,
    accuracy: 0.5,
    grit: 7,
    awareness: 6,
    leadership: 4,
};
const LENDER = {
    title: 'Lender',
    initiative: 6,
    accuracy: 0.3,
    grit: 6,
    awareness: 5,
    leadership: 7,
    leader: true,
    luck: 1,
};
const BOSS = {
    title: 'Boss',
    initiative: 8,
    accuracy: 0.4,
    grit: 8,
    awareness: 6,
    leadership: 8,
    leader: true,
    luck: 2,
};
const THUG = {
    title: 'Thug',
    initiative: 6,
    accuracy: 0.25,
    grit: 5,
    awareness: 4,
    leadership: 3,
};
// Stat blocks a plot can ask for by name.
const PIRATE = { ...HUNTER, title: 'Pirate' };
const PRESETS = {
    hunter: HUNTER,
    pirate: PIRATE,
    merc: MERC,
    lender: LENDER,
    boss: BOSS,
    thug: THUG,
};

// The other side: a plot's `foes`, or (a lender who's found you) the lender
// and two mercenaries, or `count` bounty hunters. Extras get a name no
// person has (they aren't people; see people.js).
function foes(people, top) {
    const out = [];
    const add = (
        stats,
        name = freeName(people, { taken: out.map((p) => p.name) }),
    ) => out.push({ ...stats, name });
    if (top.foes) {
        for (const f of top.foes)
            add(
                {
                    ...PRESETS[f.preset],
                    ...(f.title ? { title: f.title } : {}),
                },
                f.name,
            );
    } else if (top.setting === 'docks') {
        add(LENDER, nameOf(people, top.lender) ?? 'Lender');
        add(MERC);
        add(MERC);
    } else
        for (let i = 0; i < top.count; i++)
            add(top.setting === 'pirates' ? PIRATE : HUNTER);
    return out;
}

// A fresh fight: the captain and crew against `them`. `prepared`: how ready
// each side was for it ({ crew, enemy }, 0-1): for now, each combatant's
// chance of starting in cover.
function setup(crew, them, prepared = {}) {
    const people = [
        {
            id: 'captain',
            crewId: 'captain',
            name: 'Captain',
            side: 'crew',
            ...CAPTAIN,
        },
        ...crew.map((c, i) => ({
            id: `crew${i}`,
            crewId: c.id,
            name: c.name,
            side: 'crew',
            ...seasoned(c),
        })),
        ...them.map((p, i) => ({ id: `foe${i}`, side: 'enemy', ...p })),
    ].map((p) => ({
        ...p,
        luck: p.luck ?? 0,
        maxLuck: p.luck ?? 0,
        leader: !!p.leader,
        state: 'up',
        cover: Math.random() < (prepared[p.side] ?? 0),
        pinned: false,
    }));
    // Your side's spirit starts from the crew's morale (out of 200) and the
    // captain's leadership.
    const avg = crew.length
        ? crew.reduce((n, c) => n + c.morale, 0) / crew.length
        : 100;
    return {
        version: 2,
        people,
        morale: {
            crew: Math.min(100, Math.round(avg / 2 + CAPTAIN.leadership * 3)),
            enemy: 80,
        },
        last: null, // who acted last (who can't act next)
        turn: null, // whose turn it is
        seq: 0, // turns so far (the client spins the wheel for each new one)
        slices: [], // the wheel this turn was picked on: [{ id, weight }]
        options: [], // what the one whose turn it is can do: [{ ability, targets }]
        failed: false, // their grit check failed: collecting themselves is all they can do
        result: null, // what just happened
    };
}

const standing = (f, side) =>
    f.people.filter((p) => p.side === side && p.state === 'up');
const other = (side) => (side === 'crew' ? 'enemy' : 'crew');
const clamp = (n) => Math.max(0, Math.min(100, n));
const byId = (f, id) => f.people.find((p) => p.id === id);
const sideName = (side) => (side === 'crew' ? 'the crew' : 'their side');

// A weighted pick from [{ weight, ... }].
function lottery(items) {
    const total = items.reduce((n, x) => n + x.weight, 0);
    let r = Math.random() * total;
    for (const x of items) if ((r -= x.weight) < 0) return x;
    return items.at(-1);
}

// What `p` could usefully do now, and how good they are at each:
// [{ ability, strength, targets (ids, or null for none needed) }].
function abilities(f, p) {
    const foes = standing(f, other(p.side)),
        mine = f.people.filter((x) => x.side === p.side);
    const open = foes.filter((t) => !t.cover),
        covered = foes.filter((t) => t.cover);
    const out = [];
    const add = (ability, strength, targets = null) => {
        if (strength > 0 && (!targets || targets.length))
            out.push({
                ability,
                strength,
                targets: targets && targets.map((t) => t.id),
            });
    };
    add('drop', p.accuracy * 20, open);
    if (!p.cover) add('cover', 4);
    add('flush', p.awareness * 0.8, covered);
    add(
        'pin',
        p.awareness - 4,
        covered.filter((t) => !t.pinned),
    );
    add(
        'drag',
        p.grit * 0.6,
        mine.filter((x) => x.state === 'down'),
    );
    if (p.leader && f.morale[p.side] < 90) add('rally', p.leadership * 0.6);
    if (p.leader)
        add(
            'order',
            p.leadership * 0.5,
            mine.filter((x) => x !== p && x.state === 'up' && !x.cover),
        );
    return out;
}

// This turn's choices for `p`: one ability by lottery, a second if the first
// leaves nothing to choose, then each of the rest by its own chance. There
// are always at least two choices (abilities, or targets for one): if
// nothing else can be done, collecting yourself makes up the second.
function offer(f, p) {
    const pool = abilities(f, p).map((a) => ({ ...a, weight: a.strength }));
    const take = (a) => pool.splice(pool.indexOf(a), 1)[0];
    const out = pool.length ? [take(lottery(pool))] : [];
    const choices = () => out.reduce((n, a) => n + (a.targets?.length ?? 1), 0);
    if (choices() < 2 && pool.length) out.push(take(lottery(pool)));
    for (const a of [...pool])
        if (Math.random() < Math.min(0.9, a.strength / 12)) out.push(take(a));
    // (Someone's always standing on the other side, so there's always a drop
    // or a flush: collecting yourself is a second choice, never the only one.)
    if (choices() < 2) out.push({ ability: 'collect', targets: null });
    return out.map(({ ability, targets }) => ({ ability, targets }));
}

// The next turn: spin for who, then see what they can do. Enemies (and
// anyone pinned) act straight away.
function nextTurn(f) {
    const up = f.people.filter((p) => p.state === 'up');
    const can = up.length > 1 ? up.filter((p) => p.id !== f.last) : up;
    f.slices = can.map((p) => ({ id: p.id, weight: p.initiative }));
    const p = byId(f, lottery(f.slices).id);
    Object.assign(f, {
        turn: p.id,
        seq: f.seq + 1,
        result: null,
        options: [],
        failed: false,
    });
    if (p.pinned) {
        p.pinned = false;
        return finish(f, p, `${p.name} is pinned down and can't act.`);
    }
    const m = f.morale[p.side];
    f.failed =
        m < MORALE.shaky &&
        Math.random() < ((MORALE.shaky - m) / MORALE.shaky) * (1 - p.grit / 12);
    f.options = f.failed
        ? [{ ability: 'collect', targets: null }]
        : offer(f, p);
    if (p.side === 'enemy') {
        const { ability, target } = choose(f, p);
        return perform(f, p, ability, target);
    }
    return 'choose';
}

// An enemy's choice among what they're offered: drop someone if they can
// (the captain more than their share), else flush, rally when it's bad,
// drag, pin, take cover, order.
function choose(f, p) {
    const o = Object.fromEntries(f.options.map((x) => [x.ability, x]));
    const pickOf = (x) =>
        x.targets?.[Math.floor(Math.random() * x.targets.length)] ?? null;
    if (o.drop) {
        const target =
            o.drop.targets.includes('captain') && Math.random() < 0.35
                ? 'captain'
                : pickOf(o.drop);
        return { ability: 'drop', target };
    }
    if (f.failed) return { ability: 'collect', target: null };
    if (o.rally && f.morale[p.side] < 40)
        return { ability: 'rally', target: null };
    for (const a of [
        'flush',
        'drag',
        'pin',
        'cover',
        'rally',
        'order',
        'collect',
    ])
        if (o[a]) return { ability: a, target: pickOf(o[a]) };
}

// `p` does `ability` (to `target`, an id, if it needs one). It's one of
// their options, or an error.
function perform(f, p, ability, target) {
    const o = f.options.find((x) => x.ability === ability);
    if (!o) throw new Error("that isn't one of the options");
    if (o.targets && !o.targets.includes(target))
        throw new Error('pick a target');
    const t = target && byId(f, target);
    const shift = (side, n) => (f.morale[side] = clamp(f.morale[side] + n));
    if (!['pin', 'collect'].includes(ability)) p.cover = false; // moving breaks cover
    let text;
    if (ability === 'drop') {
        if (t.luck > 0) {
            t.luck--;
            shift(t.side, -MORALE.luck);
            text = `${p.name} hits ${t.name}, but ${t.name}'s luck holds.`;
        } else {
            Object.assign(t, { state: 'down', cover: false, pinned: false });
            shift(t.side, -(t.leader ? MORALE.leaderDown : MORALE.down));
            shift(p.side, MORALE.dropped);
            text = `${p.name} drops ${t.name}.`;
        }
    } else if (ability === 'cover') {
        p.cover = true;
        text = `${p.name} takes cover.`;
    } else if (ability === 'flush') {
        t.cover = false;
        shift(t.side, -MORALE.flush);
        text = `${p.name} flushes ${t.name} out of cover.`;
    } else if (ability === 'pin') {
        t.pinned = true;
        shift(t.side, -MORALE.pin);
        text = `${p.name} pins ${t.name} down.`;
    } else if (ability === 'drag') {
        t.state = 'safe';
        shift(p.side, MORALE.drag);
        text = `${p.name} drags ${t.name} to safety.`;
    } else if (ability === 'rally') {
        shift(p.side, p.leadership * MORALE.rally);
        text = `${p.name} rallies ${sideName(p.side)}.`;
    } else if (ability === 'order') {
        t.cover = true;
        text = `${p.name} orders ${t.name} into cover.`;
    } else if (ability === 'collect') {
        shift(p.side, MORALE.collect);
        text =
            f.failed && p.side === 'enemy'
                ? `${p.name} fails a grit check, and takes a moment to collect themself.`
                : `${p.name} collects themself.`;
    }
    // Badly outnumbered: it tells.
    for (const side of ['crew', 'enemy'])
        if (
            standing(f, side).length &&
            standing(f, side).length * 2 <= standing(f, other(side)).length
        )
            shift(side, -MORALE.outnumbered);
    return finish(f, p, text);
}

// After a turn: say what happened, and whether that's the end of it.
function finish(f, p, text) {
    f.last = p.id;
    f.options = [];
    for (const side of ['crew', 'enemy']) {
        if (!standing(f, side).length) f.over = other(side);
        else if (f.morale[side] <= MORALE.breaks) {
            f.over = other(side);
            text +=
                side === 'enemy'
                    ? " The enemy's nerve breaks, and they run."
                    : " Your crew's nerve breaks.";
        }
        if (f.over) break;
    }
    f.result = text;
    return f.over ? 'over' : 'result';
}

// Where it happens: how it starts, and how it ends for each side winning.
// Each setting's lines (grammar.js templates, with {{n}}, the number of
// foes, {{foes}}, their names, {{lender}}, and a fight's own `vars`): the
// announcement, its button, and how it ends (in the feed, after); and
// `prepared`, how ready each side is (see setup): yours, repelling boarders
// at your own airlock; theirs, on their own ground. A fight's entry can override any of them (a plot's fight
// gives its own; see plots.js).
const SETTINGS = {
    bay: {
        start: '{{n}} bounty hunters storm the docking bay, guns up.',
        ready: 'Weapons up!',
        won: 'You defeated {{foes}}.',
        lost: 'You were defeated by {{foes}}. The hunters own the bay.',
    },
    boarding: {
        start: '{{n}} bounty hunters come through the airlock, guns up.',
        ready: 'Hold the line!',
        prepared: { crew: 0.7 },
        won: "The hunters drag their wounded back through the airlock and cast off. They'll be back.",
        lost: 'You were defeated by {{foes}}. The hunters own your ship.',
    },
    pirates: {
        start: '{{n}} pirates come through the airlock, guns up.',
        ready: 'Hold the line!',
        prepared: { crew: 0.7 },
        won: 'The pirates drag their wounded back through the airlock and cast off.',
        lost: 'You were defeated by {{foes}}. The pirates own your ship.',
    },
    plot: {
        start: 'Weapons come out.',
        ready: 'Weapons up!',
        won: 'You defeated {{foes}}.',
        lost: 'You were defeated by {{foes}}.',
    },
    docks: {
        start: '{{lender}} steps back, and two mercenaries step up.',
        ready: "Let's do this.",
        prepared: { enemy: 0.5 },
        won: "{{lender}} and the mercs fall back into the crowd. This isn't over.",
        lost: 'You were defeated by {{foes}}.',
    },
};
// A fight's line, filled in. People are "they".
const line = (top, key, people) =>
    say(
        top[key] ?? SETTINGS[top.setting][key],
        {
            n: top.count,
            foes: names(top),
            lender: refOf(people, top.lender),
            ...top.vars,
        },
        true,
    );
// "A, B and C": who you're up against (once the fight's begun).
function names(top) {
    const ns = (top.f?.people ?? [])
        .filter((p) => p.side === 'enemy')
        .map((p) => p.name);
    return ns.length > 1
        ? `${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}`
        : (ns[0] ?? 'them');
}

// A hunter (or pirates: `enemy`) who's beaten you in space, at your airlock:
// stand down and lose everything, or fight them off.
export const boarding = {
    blocking: 'Boarders are at the airlock. You cannot leave.',
    open(visit, world, top) {
        visit.feed.push({
            kind: 'npc',
            who: top.enemy === 'pirate' ? 'Pirate' : 'Bounty hunter',
            text: 'Stand down and nobody has to get hurt.',
        });
    },
    act(visit, world, body) {
        const top = visit.stack.at(-1);
        if (body.action === 'surrender') {
            visit.feed.push({ kind: 'you', text: 'We stand down.' });
            if (top.enemy === 'pirate') plundered(visit, world);
            else seized(visit, world, top.lender);
            patchUp(visit, world);
            return 'pop';
        }
        if (body.action !== 'repel') throw new Error('unknown action');
        visit.feed.push({ kind: 'you', text: 'Repel boarders!' });
        visit.stack.pop();
        const entry = {
            kind: 'firefight',
            boarding: true,
            lender: top.lender,
            ...(top.enemy === 'pirate' ? { setting: 'pirates' } : {}),
        };
        visit.stack.push(entry);
        firefight.open(visit, world, entry);
    },
};

// The conversation. Entry: { f: the fight (once it's begun), start?/ready?/
// won?/lost?/vars?/prepared? (its lines and readiness, if not the setting's
// own; see SETTINGS),
// phase, outcome, boarding?, lender? } (boarding: hunters who beat you in
// space, at your airlock; losing to them costs what losing in space would
// have). Phases: 'alert' (it's about to start; you click through to it),
// 'choose' (one of yours to act: { action: 'act', ability, target }),
// 'result' (what just happened; { action: 'next' } for the next turn),
// 'over' (the last thing that happened; { action: 'close' } to go back).
export const firefight = {
    blocking: 'You are in combat and cannot leave.',
    open(visit, world, top) {
        top.setting ??= top.boarding ? 'boarding' : 'bay';
        top.count ??= top.foes?.length ?? 2 + Math.floor(Math.random() * 2);
        visit.feed.push({
            kind: 'event',
            text: line(top, 'start', world.people),
        });
        top.ready = line(top, 'ready', world.people);
        top.phase = 'alert';
    },
    act(visit, world, body) {
        const top = visit.stack.at(-1);
        if (top.phase === 'alert') {
            if (body.action !== 'ready') throw new Error('unknown action');
            visit.feed.push({ kind: 'you', text: top.ready });
            const crew = world.crew.map((c) => ({
                ...c,
                morale: crewMorale(c),
            }));
            top.f = setup(
                crew,
                foes(world.people, top),
                top.prepared ?? SETTINGS[top.setting].prepared,
            );
            top.phase = nextTurn(top.f);
            return;
        }
        if (top.phase === 'over') {
            if (body.action !== 'close') throw new Error('the fight is over');
            top.outcome = top.f.over === 'crew' ? 'win' : 'lose';
            visit.feed.push({
                kind: 'event',
                text: line(
                    top,
                    top.outcome === 'win' ? 'won' : 'lost',
                    world.people,
                ),
            });
            return aftermath(visit, world, top);
        }
        if (top.phase === 'result') {
            if (body.action !== 'next') throw new Error('unknown action');
            top.phase = nextTurn(top.f);
            return;
        }
        if (body.action !== 'act') throw new Error('unknown action');
        const f = top.f;
        top.phase = perform(
            f,
            byId(f, f.turn),
            body.ability,
            body.target ?? null,
        );
    },
};

// Each fight (won or lost), every crew member in it has a 1 in 3 chance of
// the next step up: Blooded, then Seasoned, then Hardened. Each step's
// `adds` (in all, not on top of the last) go on their combat stats: by
// Hardened, about as quick and sure as the captain, and steadier.
const SEASONING = [
    {
        label: 'Blooded',
        value: "They've been in a firefight",
        adds: { initiative: 1, accuracy: 0.04, grit: 1 },
    },
    {
        label: 'Seasoned',
        value: "They've been in a few firefights",
        adds: { initiative: 2, accuracy: 0.09, grit: 2 },
    },
    {
        label: 'Hardened',
        value: 'Nothing fazes them any more',
        adds: { initiative: 3, accuracy: 0.15, grit: 3 },
    },
];
// A crew member's combat stats, with what they've been through.
function seasoned(c) {
    const level = c.traits?.find((t) => t.kind === 'seasoned')?.level ?? 0;
    const adds = SEASONING[level - 1]?.adds ?? {};
    return Object.fromEntries(
        Object.entries(c.fight).map(([k, v]) => [
            k,
            adds[k] ? +(v + adds[k]).toFixed(2) : v,
        ]),
    );
}
const PROMOTION = 1 / 3;
function season(visit, world, top) {
    const ids = top.f.people
        .filter(
            (p) =>
                p.side === 'crew' && p.crewId != null && p.crewId !== 'captain',
        )
        .map((p) => p.crewId);
    for (const c of world.crew.filter((c) => ids.includes(c.id))) {
        const t = c.traits.find((t) => t.kind === 'seasoned');
        const level = t?.level ?? 0;
        if (level >= SEASONING.length || Math.random() >= PROMOTION) continue;
        const { label, value } = SEASONING[level];
        const next = {
            kind: 'seasoned',
            level: level + 1,
            revealed: true,
            label,
            value,
        };
        if (t) Object.assign(t, next);
        else c.traits.push(next);
        visit.feed.push({
            kind: 'event',
            text: `${personRef(c)} is ${next.label}.`,
        });
    }
}

// Closing it: on a loss, crew still lying where they fell carry Trauma; and
// whoever fought may be the more seasoned for it.
function aftermath(visit, world, top) {
    season(visit, world, top);
    if (top.outcome === 'lose') {
        const left = top.f.people.filter(
            (p) =>
                p.side === 'crew' && p.id !== 'captain' && p.state === 'down',
        );
        for (const p of left) {
            const c = world.crew.find((c) =>
                p.crewId != null ? c.id === p.crewId : c.name === p.name,
            );
            c?.traits.push({
                kind: 'trauma',
                revealed: true,
                label: 'Trauma',
                value: `Gunned down by ${top.setting === 'pirates' ? 'pirates' : 'bounty hunters'}`,
            });
            if (c) trauma(c);
        }
        lostFight(world);
        const ref = (p) =>
            p.crewId != null
                ? personRef({ id: p.crewId, name: p.name })
                : p.name;
        if (left.length)
            visit.feed.push({
                kind: 'event',
                text: `${left.map(ref).join(', ')} will carry this one.`,
            });
    }
    // Boarders who win take what beating you in space would have; a lender
    // who wins takes the hold (the ship itself wasn't in the fight).
    if (top.setting === 'boarding') {
        if (top.outcome === 'lose') seized(visit, world, top.lender);
        patchUp(visit, world);
    }
    if (top.setting === 'pirates') {
        if (top.outcome === 'lose') plundered(visit, world);
        patchUp(visit, world);
    }
    if (top.setting === 'docks' && top.outcome === 'lose')
        seized(visit, world, top.lender, { limp: false });
    // A plot's fight: tell it how it went (after this conversation's gone).
    if (top.fightId) {
        visit.stack.pop();
        world.emit(
            `/fights/${top.fightId}/${top.outcome === 'win' ? 'won' : 'lost'}`,
            visit,
        );
        return;
    }
    return 'pop';
}

// A lender who's caught you where you can't show your face: pay double and
// you're square (no more ban, no more hunter), or fight them and their mercs.
export const confront = {
    blocking: (e) => `${e.name ?? e.lender} is in your face. You cannot leave.`,
    open(visit, world, top) {
        top.name = nameOf(world.people, top.lender) ?? 'Someone you owe';
        visit.feed.push({
            kind: 'npc',
            who: top.name,
            text: "You've got nerve coming back here. You owe me money.",
        });
    },
    act(visit, world, body) {
        const top = visit.stack.at(-1);
        const { ship } = world;
        const price = top.owed * 2;
        if (body.action === 'pay') {
            if (ship.credits < price)
                throw new Error(`you have ${ship.credits.toLocaleString()} cr`);
            ship.credits -= price;
            ship.traits = ship.traits.filter(
                (t) =>
                    !(t.kind === 'wanted' && t.lender === top.lender) &&
                    !(t.kind === 'hunted' && t.lender === top.lender),
            );
            visit.feed.push({
                kind: 'you',
                text: "Here. Twice what I owe. We're square.",
            });
            visit.feed.push({
                kind: 'event',
                text: `−${price.toLocaleString()} cr. Balance ${ship.credits.toLocaleString()} cr.`,
            });
            visit.feed.push({
                kind: 'npc',
                who: top.name,
                text: 'Square. Show your face whenever you like.',
            });
            return 'pop';
        }
        if (body.action !== 'fight') throw new Error('unknown action');
        visit.feed.push({ kind: 'you', text: "You'll get nothing from me." });
        visit.stack.pop();
        const entry = {
            kind: 'firefight',
            setting: 'docks',
            lender: top.lender,
            count: 3,
        };
        visit.stack.push(entry);
        firefight.open(visit, world, entry);
    },
};

// For the client: the fight as the screen needs it (stats stay secret).
export const publicFight = (f) =>
    f && {
        morale: f.morale,
        turn: f.turn,
        seq: f.seq,
        slices: f.slices,
        options: f.options,
        failed: f.failed,
        result: f.result,
        over: f.over ?? null,
        people: f.people.map(
            ({
                id,
                crewId,
                name,
                title,
                side,
                state,
                cover,
                pinned,
                luck,
                maxLuck,
                leader,
            }) => ({
                id,
                crewId,
                name,
                title,
                side,
                state,
                cover,
                pinned,
                luck,
                maxLuck,
                leader,
            }),
        ),
    };
