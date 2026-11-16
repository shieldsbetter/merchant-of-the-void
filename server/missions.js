// Missions: what contacts ask of you (see contact-types.js). Each is a plot
// (see plots.js) that ends by one of its shape's exits (exit()), which moves
// the contact's arc on. Generic on purpose: an arc wraps its own story
// around whichever mission of the right shape comes up.
//
// A mission has `shape`, `offer(world, contact)`, which makes one: { config,
// pitch (text, filled with the config's vars: see contact-types.js) }, and
// the plot's own steps and scenes. Its config always has `contact` (their id).

import { render, advance } from './contact-types.js';
import {
    GOODS,
    CARGO,
    PAY_PER_FUEL,
    GRACE,
    parcel,
    amountOf,
} from './goods.js';
import { cheapest } from './graph.js';
import { newPerson, personOf } from './people.js';
import { hops } from './plots/util.js';
import { planetRef, personRef } from './refs.js';
import { loadCargo, dropCargo, holding, takeGoods, fits } from './ship.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const cr = (n) => `${n.toLocaleString()} cr`;

// A system `lo` to `hi` hops from `from`.
const away = (universe, from, lo, hi) => {
    const d = hops(universe, from, hi);
    return pick([...d.keys()].filter((id) => d.get(id) >= lo));
};
// When it's due: the route's cycles (there and back, for `legs` 2), with
// slack, plus grace.
const due = (world, a, b, legs = 1) =>
    world.cycle +
    Math.ceil(cheapest(world.universe, a, b).fuel * legs * 2) +
    GRACE;
const fee = (world, a, b, legs = 1) =>
    Math.round(
        cheapest(world.universe, a, b).fuel *
            legs *
            PAY_PER_FUEL *
            1.5 *
            (0.85 + Math.random() * 0.3),
    );

// The common parts of each mission's steps: whose it is, their text, being
// paid, and ending by an exit.
const contactOf = (p) => personOf(p.world.people, p.config.contact);
const words = (p, text, extra) =>
    render(p.world, contactOf(p), text, { ...p.config.vars, ...extra });
const pay = (p, n) => {
    p.world.ship.credits += n;
    p.event(`+${cr(n)}. Balance ${cr(p.world.ship.credits)}.`);
};
function exit(p, name) {
    p.end(name === 'failure' ? 'failed' : 'complete');
    advance(p.world, contactOf(p), name);
}
// Out of time: any of their cargo is gone, and a crew member says so.
function late(p) {
    dropCargo(p.world.ship, p.q.id);
    p.world.deferred.push({
        kind: 'notice',
        says: words(p, "We ran out of time on {{name}}'s job, Captain."),
        reply: 'Noted.',
    });
    exit(p, 'failure');
}
// The plot's first stage: its journal text (`text`, filled), where it's
// marked, and the deadline.
function begin(p, text, planet) {
    p.stage('go', words(p, text), planet);
    p.listen(`/cycles/${p.config.due + 1}/start`, 'late');
}

// A parcel your holds can take (as a contact's courier jobs needn't be: see
// contacts.js): a mission's part of someone's story, not a missed chance.
function carryable(world) {
    let p = parcel();
    for (
        let i = 0;
        i < 50 && !world.ship.holds.some((h) => fits(h, p.good));
        i++
    )
        p = parcel();
    return p;
}

export const MISSIONS = {
    // Carry a parcel to someone who can't quite pay what they owe for it:
    // squeeze the full balance out of them, or take what they can spare.
    parcel: {
        shape: 'force-finesse',
        offer(world, k) {
            const there = away(world.universe, k.planet, 1, 3);
            const { good, qty } = carryable(world);
            const c = {
                contact: k.id,
                dest: there,
                good,
                qty,
                due: due(world, k.planet, there),
                pay: fee(world, k.planet, there),
                recipient: newPerson(world.people).id,
            };
            c.vars = {
                there: planetRef(world.universe.nodes[there]),
                what: amountOf(good, qty),
                due: c.due,
                pay: cr(c.pay),
            };
            return {
                config: c,
                pitch: [
                    '{{what}} needs to reach {{recipient}} on {{there}} by cycle {{due}}. {{recipient}} owes me for it; collect, and {{pay}} of it is yours.',
                    'Can you get {{what}} to {{recipient}} on {{there}}? By cycle {{due}}. Collect what {{recipient}} owes and keep {{pay}}.',
                ],
            };
        },
        steps: {
            start(p) {
                const c = p.config;
                loadCargo(p.world.ship, c.good, c.qty, p.q.id); // throws (no room, wrong hold): no mission
                begin(
                    p,
                    'Deliver {{what}} to {{recipient}} on {{there}} for {{name}}, and collect. By cycle {{due}}.',
                    c.dest,
                );
                p.onArrive(c.dest, 'arrived');
                p.event(`Loaded ${c.vars.what} (consigned).`);
            },
            arrived(p) {
                if (
                    !p.world.ship.holds.some((h) =>
                        h.slots.some((st) => st?.quest === p.q.id),
                    )
                )
                    return p.event('You no longer have the cargo.');
                p.scene('handoff');
            },
            force(p) {
                dropCargo(p.world.ship, p.q.id);
                p.event(
                    words(
                        p,
                        '{{recipient}} pays in full, glaring at you the whole time.',
                    ),
                );
                pay(p, p.config.pay);
                exit(p, 'force');
            },
            finesse(p) {
                dropCargo(p.world.ship, p.q.id);
                const n = Math.round(p.config.pay * 0.6);
                p.event(
                    words(p, "{{recipient}} pays what there is. It's short."),
                );
                pay(p, n);
                exit(p, 'finesse');
            },
            late,
        },
        scenes: {
            handoff: (p) => ({
                lines: [
                    [
                        p.config.recipient,
                        words(p, [
                            "{{name}} sent this? Already? I... can't cover the whole balance today.",
                            'Ah. That. Look, things are tight. I can pay some of it.',
                            "I wasn't expecting it so soon. Can {{name}} wait for the rest?",
                        ]),
                    ],
                ],
                options: [
                    {
                        label: 'Pay in full. Now.',
                        note: cr(p.config.pay),
                        step: 'force',
                    },
                    {
                        label: words(
                            p,
                            '{{name}} will understand. Pay what you can.',
                        ),
                        note: cr(Math.round(p.config.pay * 0.6)),
                        step: 'finesse',
                    },
                ],
            }),
        },
    },

    // Collect a debt: lean on the debtor (a fight with their friends) or settle
    // for what they can pay.
    debt: {
        shape: 'force-finesse',
        offer(world, k) {
            const there = away(world.universe, k.planet, 1, 2);
            const owed = 600 + 100 * Math.floor(Math.random() * 10);
            const c = {
                contact: k.id,
                dest: there,
                owed,
                due: due(world, k.planet, there),
                debtor: newPerson(world.people).id,
            };
            c.vars = {
                there: planetRef(world.universe.nodes[there]),
                owed: cr(owed),
                half: cr(owed / 2),
                due: c.due,
            };
            return {
                config: { ...c, pay: owed / 2 },
                pitch: [
                    '{{debtor}} on {{there}} owes me {{owed}} and has stopped answering. Collect by cycle {{due}} and half is yours.',
                    "There's {{owed}} I'm owed by {{debtor}}, over on {{there}}. Get it back by cycle {{due}}; we split it.",
                ],
            };
        },
        steps: {
            start(p) {
                const c = p.config;
                begin(
                    p,
                    'Collect the {{owed}} {{debtor}} owes {{name}}, on {{there}}. By cycle {{due}}.',
                    c.dest,
                );
                p.onArrive(c.dest, 'found');
                p.engage(c.dest, words(p, 'Find {{debtor}}.'), 'found');
                p.listen(`/fights/fight_${p.q.id}_collect/won`, 'beat');
                p.listen(`/fights/fight_${p.q.id}_collect/lost`, 'beaten');
            },
            found(p) {
                p.scene('collect');
            },
            lean(p) {
                p.fight('collect', {
                    foes: [{ preset: 'thug' }, { preset: 'thug' }].map((f) => ({
                        ...f,
                        title: `${p.name(p.config.debtor)}'s friend`,
                    })),
                    vars: { debtor: p.ref(p.config.debtor) },
                    prepared: { enemy: 0.4 },
                    start: "{{debtor}}'s friends step out of the back room.",
                    ready: 'Make them pay.',
                    won: '{{debtor}} counts out every credit with shaking hands.',
                    lost: "You're thrown out into the street. {{debtor}} keeps the money.",
                });
            },
            beat(p) {
                pay(p, p.config.owed / 2);
                exit(p, 'force');
            },
            beaten(p) {
                exit(p, 'failure');
            },
            settle(p) {
                p.event(
                    words(
                        p,
                        '{{debtor}} scrapes together what little there is.',
                    ),
                );
                pay(p, Math.round((p.config.owed * 0.4) / 2));
                exit(p, 'finesse');
            },
            late,
        },
        scenes: {
            collect: (p) => ({
                lines: [
                    [
                        p.config.debtor,
                        words(p, [
                            "{{name}} sent you? I don't have it. Not all of it. Times are hard.",
                            'I was going to pay! I can do some. Not {{owed}}.',
                            "Please. I've got a little. That's all there is.",
                        ]),
                    ],
                ],
                options: [
                    { label: 'All of it. Now.', note: 'fight', step: 'lean' },
                    {
                        label: "Then I'll take what you've got.",
                        note: cr(Math.round((p.config.owed * 0.4) / 2)),
                        step: 'settle',
                    },
                    { label: 'Not now.' },
                ],
            }),
        },
    },

    // Fetch a parcel from a supplier who's raised the price: take it anyway, or
    // pay the difference. Then bring it back.
    fetch: {
        shape: 'force-finesse',
        offer(world, k) {
            const there = away(world.universe, k.planet, 1, 2);
            const { good, qty } = carryable(world);
            const c = {
                contact: k.id,
                dest: there,
                good,
                qty,
                due: due(world, k.planet, there, 2),
                pay: fee(world, k.planet, there, 2),
                supplier: newPerson(world.people).id,
            };
            c.extra = Math.round(c.pay * 0.4);
            c.vars = {
                there: planetRef(world.universe.nodes[there]),
                what: amountOf(good, qty),
                due: c.due,
                pay: cr(c.pay),
                extra: cr(c.extra),
            };
            return {
                config: c,
                pitch: [
                    "{{supplier}} on {{there}} is holding {{what}} for me. It's paid for. Bring it back by cycle {{due}} and I'll pay {{pay}}.",
                    'I need {{what}} picked up from {{supplier}}, on {{there}}, and brought here by cycle {{due}}. {{pay}}.',
                ],
            };
        },
        steps: {
            start(p) {
                begin(
                    p,
                    'Pick up {{what}} from {{supplier}} on {{there}} and bring it to {{name}} on {{here}}. By cycle {{due}}.',
                    p.config.dest,
                );
                p.onArrive(p.config.dest, 'pickup');
                p.engage(
                    p.config.dest,
                    words(p, 'See {{supplier}}.'),
                    'pickup',
                );
            },
            pickup(p) {
                p.scene('pickup');
            },
            take(p, how) {
                const c = p.config;
                if (how === 'finesse' && p.world.ship.credits < c.extra)
                    return p.event(`You don't have ${cr(c.extra)}.`);
                // No room (or no hold for it): come back when there is (see engage).
                try {
                    loadCargo(p.world.ship, c.good, c.qty, p.q.id);
                } catch (e) {
                    return p.event(`${e.message}. Make room and come back.`);
                }
                if (how === 'finesse') {
                    p.world.ship.credits -= c.extra;
                    p.event(
                        `−${cr(c.extra)}. Balance ${cr(p.world.ship.credits)}.`,
                    );
                } else
                    p.event(
                        words(
                            p,
                            "{{supplier}} doesn't stop you. {{supplier}} doesn't forget your face, either.",
                        ),
                    );
                c.how = how;
                p.event(`Loaded ${c.vars.what} (consigned).`);
                const k = contactOf(p);
                p.stage(
                    'back',
                    words(
                        p,
                        'Bring {{what}} to {{name}} on {{here}}. By cycle {{due}}.',
                    ),
                    k.planet,
                );
                p.listen(`/cycles/${c.due + 1}/start`, 'late');
                p.onArrive(k.planet, 'back');
            },
            force: (p) => p.steps.take('force'),
            finesse: (p) => p.steps.take('finesse'),
            refuse: (p) => exit(p, 'failure'),
            back(p) {
                if (
                    !p.world.ship.holds.some((h) =>
                        h.slots.some((st) => st?.quest === p.q.id),
                    )
                )
                    return p.event('You no longer have the cargo.');
                dropCargo(p.world.ship, p.q.id);
                p.event(words(p, 'You hand {{what}} over to {{name}}.'));
                pay(p, p.config.pay);
                exit(p, p.config.how);
            },
            late,
        },
        scenes: {
            pickup: (p) => ({
                lines: [
                    [
                        p.config.supplier,
                        words(p, [
                            'For {{name}}? Prices went up. {{extra}} more, or it stays here.',
                            "{{name}} paid last season's price. It's {{extra}} more now.",
                            'Costs have gone up. {{extra}}, or no deal.',
                        ]),
                    ],
                ],
                options: [
                    { label: 'It was paid for. Load it.', step: 'force' },
                    {
                        label: 'Fine.',
                        note: cr(p.config.extra),
                        when: p.world.ship.credits >= p.config.extra,
                        step: 'finesse',
                    },
                    { label: 'Then keep it.', step: 'refuse' },
                    { label: 'Not now.' },
                ],
            }),
        },
    },

    // Bring them some ordinary goods their market doesn't have (you buy them).
    errand: {
        shape: 'pass-fail',
        offer(world, k) {
            const sold = world.universe.nodes[k.planet].market.map(
                (m) => m.good,
            );
            const goods = CARGO.filter(
                (g) => !sold.includes(g) && !GOODS[g].needs,
            );
            const good = pick(
                goods.length ? goods : CARGO.filter((g) => !GOODS[g].needs),
            );
            const qty = Math.max(
                1,
                Math.round((GOODS[good].stack * (1 + Math.random())) / 2),
            );
            const c = {
                contact: k.id,
                good,
                qty,
                due: world.cycle + 20 + Math.floor(Math.random() * 10),
                pay: Math.round(GOODS[good].base * qty * 1.6),
            };
            c.vars = { what: amountOf(good, qty), due: c.due, pay: cr(c.pay) };
            return {
                config: c,
                pitch: [
                    "I need {{what}}, and nobody on {{here}} sells it. Bring it by cycle {{due}} and I'll pay {{pay}}.",
                    'Could you find me {{what}}? Cycle {{due}} at the latest. {{pay}} for the lot.',
                ],
            };
        },
        steps: {
            start(p) {
                const k = contactOf(p);
                begin(
                    p,
                    'Bring {{name}} on {{here}} {{what}}. By cycle {{due}}.',
                    k.planet,
                );
                p.engage(
                    k.planet,
                    words(p, 'Bring {{name}} {{what}}.'),
                    'hand',
                );
            },
            hand(p) {
                const c = p.config;
                if (holding(p.world.ship, c.good) < c.qty)
                    return p.event(`You don't have ${c.vars.what}.`);
                takeGoods(p.world.ship, c.good, c.qty);
                p.event(words(p, 'You hand {{what}} over to {{name}}.'));
                pay(p, c.pay);
                exit(p, 'success');
            },
            late: (p) => late(p),
        },
        scenes: {},
    },

    // Carry a letter, simply. Arrive in time, or don't.
    letter: {
        shape: 'pass-fail',
        offer(world, k) {
            const there = away(world.universe, k.planet, 1, 3);
            const c = {
                contact: k.id,
                dest: there,
                good: 'letter',
                qty: 1,
                due: due(world, k.planet, there),
                pay: fee(world, k.planet, there),
                to: newPerson(world.people).id,
            };
            c.vars = {
                there: planetRef(world.universe.nodes[there]),
                due: c.due,
                pay: cr(c.pay),
            };
            return {
                config: c,
                pitch: [
                    'This letter has to reach {{to}} on {{there}} by cycle {{due}}. It matters. {{pay}}.',
                    "Take a letter to {{to}}, on {{there}}? Cycle {{due}}. {{pay}}, and don't read it.",
                ],
            };
        },
        steps: {
            start(p) {
                loadCargo(p.world.ship, 'letter', 1, p.q.id);
                begin(
                    p,
                    "Carry {{name}}'s letter to {{to}} on {{there}}. By cycle {{due}}.",
                    p.config.dest,
                );
                p.onArrive(p.config.dest, 'arrived');
            },
            arrived(p) {
                if (
                    !p.world.ship.holds.some((h) =>
                        h.slots.some((st) => st?.quest === p.q.id),
                    )
                )
                    return p.event('You no longer have the letter.');
                dropCargo(p.world.ship, p.q.id);
                p.event(
                    words(
                        p,
                        '{{to}} reads the letter twice, then folds it away.',
                    ),
                );
                pay(p, p.config.pay);
                exit(p, 'success');
            },
            late,
        },
        scenes: {},
    },
};

// (As plots: tagged, and configured by the offer.)
for (const m of Object.values(MISSIONS))
    Object.assign(m, {
        tags: ['mission'],
        config: (world, params) => params.offer,
    });

// A mission for contact `k`'s arc stage: { mission, config, text, pay }, or
// null (no arc, or nothing of the shape it needs).
export function missionFor(world, k, st) {
    const kinds = Object.keys(MISSIONS).filter(
        (m) => MISSIONS[m].shape === st.need,
    );
    if (!kinds.length) return null;
    const mission = pick(kinds);
    const { config, pitch } = MISSIONS[mission].offer(world, k);
    const extra = {
        ...config.vars,
        ...Object.fromEntries(
            ['recipient', 'debtor', 'supplier', 'to']
                .filter((r) => config[r] != null)
                .map((r) => [r, personRef(personOf(world.people, config[r]))]),
        ),
    };
    config.vars = extra;
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    const text = [st.frame, st.bridge, pitch]
        .map((t) => cap(render(world, k, t, extra)))
        .join(' ');
    return { mission, config, pay: config.pay, text };
}
