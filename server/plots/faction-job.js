// A faction's job (taken at its office; see factions.js): deliver, survey or
// bounty, worded by the faction's type. Doing it pays credits and
// +10 reputation with the faction; missing a delivery's deadline costs 5.

import { TYPES } from '../faction-types.js';
import { PAY_PER_FUEL, GRACE, payFor, parcel, amountOf } from '../goods.js';
import { cheapest } from '../graph.js';
import { planetRef } from '../refs.js';
import { loadCargo, dropCargo } from '../ship.js';
import { pick, near, hops } from './util.js';

const REP = 10; // for a job done
const LATE = -5; // for a delivery missed

const name = (world, id) => planetRef(world.universe.nodes[id]); // (for text)

// A job offer from faction `f` at system `at`: { kind, text, pay, ... }.
export function makeOffer(world, f, at) {
    const { universe } = world;
    const fac = universe.factions[f];
    const type = TYPES[fac.type];
    const kind = pick(Object.keys(type.jobs));
    const job = type.jobs[kind];
    const indep = (ids) =>
        ids.filter((id) => universe.nodes[id].faction == null);
    const o = { kind, faction: f, at };
    if (kind === 'deliver') {
        const d = hops(universe, at, 5);
        const far = [...d.keys()].filter((id) => d.get(id) >= 2);
        // Pilgrims go to their own faith's worlds; smugglers to nobody's.
        const prefer =
            fac.type === 'theocracy'
                ? far.filter((id) => universe.nodes[id].faction === f)
                : fac.type === 'anarchist'
                  ? indep(far)
                  : far;
        o.dest = pick(prefer.length ? prefer : far);
        Object.assign(o, parcel(fac.type));
        const fuel = cheapest(universe, at, o.dest).fuel;
        o.due = world.cycle + Math.ceil(fuel * 2) + GRACE;
        o.pay = Math.round(
            fuel *
                PAY_PER_FUEL *
                2.2 *
                payFor(o.good) *
                (0.85 + Math.random() * 0.3),
        );
    } else if (kind === 'survey') {
        const around = near(universe, at, 4);
        const options = indep(around).length >= 2 ? indep(around) : around;
        o.targets = options
            .map((id) => [Math.random(), id])
            .sort((a, b) => a[0] - b[0])
            .slice(0, 2 + Math.floor(Math.random() * 2))
            .map(([, id]) => id);
        // Paid like a delivery, by the fuel for the tour: nearest target first.
        let cur = at,
            fuel = 0;
        for (const left = [...o.targets]; left.length;) {
            left.sort(
                (a, b) =>
                    cheapest(universe, cur, a).fuel -
                    cheapest(universe, cur, b).fuel,
            );
            fuel += cheapest(universe, cur, left[0]).fuel;
            cur = left.shift();
        }
        o.pay = Math.round(
            fuel * PAY_PER_FUEL * 2.2 * (0.85 + Math.random() * 0.3),
        );
    } else {
        o.dest =
            pick(indep(near(universe, at, 3))) ?? pick(near(universe, at, 3));
        o.pay = 600 + 100 * Math.floor(Math.random() * 4);
    }
    o.text = job.text({
        faction: fac.name,
        dest:
            o.dest != null
                ? name(world, o.dest)
                : o.targets
                  ? o.targets.map((id) => name(world, id)).join(', ')
                  : '',
        what: o.good && amountOf(o.good, o.qty),
        n: o.targets?.length,
    });
    if (o.due) o.text += ` By cycle ${o.due}.`;
    return o;
}

export const factionJob = {
    tags: ['job'],
    config: (world, params) => params.offer,

    steps: {
        start(p) {
            const c = p.config;
            p.stage(c.kind, c.text, c.dest ?? c.targets?.[0] ?? null);
            if (c.kind === 'deliver') {
                loadCargo(p.world.ship, c.good, c.qty, p.q.id); // throws (no room, wrong hold): no job
                p.onArrive(c.dest, 'delivered');
                p.listen(`/cycles/${c.due + 1}/start`, 'late');
                p.event(`Loaded ${amountOf(c.good, c.qty)} (consigned).`);
            } else if (c.kind === 'survey') {
                c.done = [];
                p.q.planets = [...c.targets];
                for (const id of c.targets) p.onArrive(id, 'surveyed', id);
            } else {
                p.onArrive(c.dest, 'raid');
                p.engage(c.dest, 'Go after them.', 'raid'); // again, if they drove you off
                p.listen(`/fights/fight_${p.q.id}_raid/won`, 'paid');
            }
            p.event(`New quest: ${c.text}`);
        },
        delivered(p) {
            const has = p.world.ship.holds.some((h) =>
                h.slots.some((st) => st?.quest === p.q.id),
            );
            if (!has)
                return p.event('You no longer have the cargo to deliver.');
            dropCargo(p.world.ship, p.q.id);
            p.steps.paid();
        },
        late(p) {
            dropCargo(p.world.ship, p.q.id);
            p.world.deferred.push({
                kind: 'notice',
                says: `We missed the deadline for the ${p.world.universe.factions[p.config.faction].name}, Captain. They won't be pleased.`,
                reply: 'Noted.',
            });
            p.end('failed');
            p.steps.rep(LATE);
        },
        surveyed(p, id) {
            const c = p.config;
            if (!c.done.includes(id)) c.done.push(id);
            const left = c.targets.filter((t) => !c.done.includes(t));
            p.event(`Survey of ${name(p.world, id)} recorded.`);
            if (!left.length) {
                p.q.text = c.text; // (done: said whole, as it was taken)
                return p.steps.paid();
            }
            p.q.planets = left;
            // The journal's text, with the worlds surveyed struck through (see refs.js).
            p.q.text = c.done.reduce(
                (t, d) =>
                    t.replace(name(p.world, d), `~~${name(p.world, d)}~~`),
                c.text,
            );
        },
        raid(p) {
            const c = p.config;
            p.fight('raid', {
                foes: [
                    { preset: 'thug' },
                    { preset: 'thug' },
                    { preset: 'merc' },
                ],
                vars: { faction: p.world.universe.factions[c.faction].name },
                prepared: { enemy: 0.5 }, // dug in
                start: 'The crew the {{faction}} sent you after is here, and armed.',
                ready: 'Clear them out.',
                won: 'They break and run. Job done.',
                lost: "They drive you off. They're still here.",
            });
        },
        // Done: say so, then the pay and the reputation.
        paid(p) {
            const c = p.config;
            p.end('complete');
            p.world.ship.credits += c.pay;
            p.event(
                `+${c.pay.toLocaleString()} cr. Balance ${p.world.ship.credits.toLocaleString()} cr.`,
            );
            p.steps.rep(REP);
        },
        rep(p, n) {
            const f = p.config.faction;
            p.world.reputation[f] = (p.world.reputation[f] ?? 0) + n;
            p.event(
                `Reputation with the ${p.world.universe.factions[f].name} ${n > 0 ? '+' : '−'}${Math.abs(n)}.`,
            );
        },
    },
    scenes: {},
};
