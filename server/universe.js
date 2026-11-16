// Deterministic universe: random points, connected by a Gabriel graph.
// A Gabriel graph is planar and always connected (it contains the MST),
// and brute force is fine at this size.
//
// Seeds are a tree, keyed by name rather than by draw order, so changing how
// one thing is generated can't shift anything else:
//   universe seed
//     the root stream: positions only
//     ('shipyards'): which systems get a ship yard, and what tier
//     ('factions'): the factions, their names and territory
//     ('system', id): each system's seed
//       ('name'), ('market'), ('dish'), ('yard'): one per aspect
//       (('planet') was its look, before planets came from the library;
//       see planets.js)
// Anything new gets its own label (`derive`), never draws from a stream
// something else uses.

import { TYPES } from './faction-types.js';
import { GOODS, CARGO, MODULES, fuelCost } from './goods.js';

// A seed derived from `seed` and a path of labels (FNV-1a, then mixed).
export function derive(seed, ...path) {
    let h = 0x811c9dc5;
    for (const ch of `${seed}/${path.join('/')}`)
        h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    return h | 0;
}

export function rng(seed) {
    let a = seed | 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const SYL = [
    'ka',
    'ter',
    'vo',
    'lin',
    'sar',
    'eth',
    'mo',
    'rix',
    'an',
    'dul',
    'pe',
    'zor',
    'ul',
    'quen',
    'bra',
    'is',
];
const TERRAINS = ['continents', 'ridged', 'plates', 'archipelago', 'pangaea'];

function name(r) {
    const n = 2 + Math.floor(r() * 2);
    let s = '';
    for (let i = 0; i < n; i++) s += SYL[Math.floor(r() * SYL.length)];
    return s[0].toUpperCase() + s.slice(1);
}

function hsl(h, s, l) {
    const f = (n) => {
        const k = (n + h / 30) % 12;
        const c =
            l -
            s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(c * 255)
            .toString(16)
            .padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

// A random planet's look (options for the planet library's Planet): what
// the planet library bakes (see planets.js).
export function planetOptions(r) {
    return {
        seed: Math.floor(r() * 1e9),
        terrain: TERRAINS[Math.floor(r() * TERRAINS.length)],
        oceanColor: hsl(r() * 360, 0.5, 0.3),
        landColor: hsl(r() * 360, 0.4, 0.4),
        landColorB: hsl(r() * 360, 0.35, 0.5),
        biomeSplit: r() * 0.6,
        seaLevel: 0.3 + r() * 0.6,
        cloudAmount: r() * 0.6,
        civilization: r() * 0.7,
        rings: r() < 0.2,
    };
}

// 3–6 goods, each with a price around its base and a local stock that
// buying draws down (and selling raises), drifting back to its set point,
// `par`, over time (see restock). Prices are static for now.
// About 75% of markets also sell Star Fuel.
function market(r) {
    const cargo = [...CARGO];
    const ids = cargo.sort(() => r() - 0.5).slice(0, 3 + Math.floor(r() * 4));
    const price = (good) =>
        Math.max(1, Math.round(GOODS[good].base * (0.6 + r() * 0.9)));
    const goods = ids.map((good) => ({
        good,
        price: price(good),
        stock: GOODS[good].stack * (1 + Math.floor(r() * 4)),
    }));
    if (r() < 0.75)
        goods.push({
            good: 'fuel',
            price: price('fuel'),
            stock: 20 + Math.floor(r() * 60),
        });
    for (const m of goods) m.par = m.stock;
    return goods;
}

// A cycle passes: every market's stock moves toward its par by a twentieth
// of par (at least 1), so an emptied market is full again in 20 cycles.
export function restock(universe) {
    for (const n of universe.nodes)
        for (const m of n.market) {
            const step = Math.max(1, Math.round(m.par / 20));
            m.stock =
                m.stock < m.par
                    ? Math.min(m.par, m.stock + step)
                    : Math.max(m.par, m.stock - step);
        }
}

// Mad-libbed local dish: "<style> <main> <form>", e.g. "smoked eel dumplings".
const STYLE = [
    'smoked',
    'candied',
    'fermented',
    'spiced',
    'twice-fried',
    'pickled',
    'charred',
    'sweet-and-sour',
    'braised',
    'salt-cured',
];
const MAIN = [
    'eel',
    'moss',
    'tuber',
    'beetle',
    'kelp',
    'mushroom',
    'grubworm',
    'river-crab',
    'flatbread',
    'lichen',
    'yam',
    'sand-lobster',
];
const FORM = [
    'dumplings',
    'stew',
    'skewers',
    'pie',
    'noodles',
    'fritters',
    'porridge',
    'tacos',
    'rolls',
    'broth',
];
function dish(r) {
    const pick = (a) => a[Math.floor(r() * a.length)];
    return `${pick(STYLE)} ${pick(MAIN)} ${pick(FORM)}`;
}

export const SYSTEMS = 40; // in a universe

export function makeUniverse({
    seed = 7,
    count = SYSTEMS,
    size = 2000,
    minDist = 160,
} = {}) {
    const r = rng(seed);
    const pts = [];
    while (pts.length < count) {
        const x = r() * size,
            y = r() * size;
        if (pts.every((p) => (p.x - x) ** 2 + (p.y - y) ** 2 > minDist ** 2))
            pts.push({ x, y });
    }

    const edges = [];
    for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
            const a = pts[i],
                b = pts[j];
            const mx = (a.x + b.x) / 2,
                my = (a.y + b.y) / 2;
            const r2 = ((a.x - b.x) ** 2 + (a.y - b.y) ** 2) / 4;
            const blocked = pts.some(
                (p, k) =>
                    k !== i &&
                    k !== j &&
                    (p.x - mx) ** 2 + (p.y - my) ** 2 < r2,
            );
            if (!blocked) edges.push([i, j, fuelCost(a, b)]); // [from, to, fuel]
        }
    }

    const nodes = pts.map((p, id) => {
        const sys = derive(seed, 'system', id);
        const r = (aspect) => rng(derive(sys, aspect));
        return {
            id,
            seed: sys,
            name: name(r('name')),
            x: Math.round(p.x),
            y: Math.round(p.y),
            market: market(r('market')),
            dish: dish(r('dish')),
        };
    });
    shipyards(nodes, rng(derive(seed, 'shipyards')));
    const factions = makeFactions(nodes, edges, rng(derive(seed, 'factions')));
    return { nodes, edges, factions };
}

// System traits: node.traits, fixed by the seed. For now, ship yards: a third
// of systems have one, rarer the higher the tier (chosen from the universe's
// 'shipyards' stream). A yard's stock of modules (node.yard, which buying and
// selling change) is tier + 1 different modules of its tier or below, from
// that system's own 'yard' stream.
const YARDS = { 1: 6, 2: 4, 3: 3 }; // how many of each tier
function shipyards(nodes, r) {
    for (const n of nodes) n.traits = [];
    const order = nodes.map((n) => n.id).sort(() => r() - 0.5);
    for (const [tier, count] of Object.entries(YARDS).map(([t, c]) => [
        Number(t),
        c,
    ])) {
        for (const id of order.splice(0, count)) {
            nodes[id].traits.push({
                kind: 'shipyard',
                tier,
                label: `Ship Yard Tier ${tier}`,
            });
            const y = rng(derive(nodes[id].seed, 'yard'));
            const eligible = MODULES.filter(
                (g) => GOODS[g].module.tier <= tier,
            ).sort(() => y() - 0.5);
            nodes[id].yard = eligible.slice(0, tier + 1).map((good) => ({
                good,
                qty: 1,
                price: Math.round(GOODS[good].base * (0.9 + y() * 0.3)),
            }));
        }
    }
}

// Factions: three small powers, the starting state of a mostly unclaimed
// universe (dramas can grow, merge and break them later). Three seeds
// spread far apart (each next one the system farthest from those chosen)
// grow in turns, one system at a time along the routes, each to a size of
// 3 to 8 systems (and any enclave they wall in); the rest are independent. Each node gets `faction` (an
// index, or null).
const COLORS = ['#b07cf0', '#f0895c', '#45c1d4'];

function makeFactions(nodes, edges, r) {
    const pick = (a) => a[Math.floor(r() * a.length)];
    const adj = nodes.map(() => []);
    for (const [a, b] of edges) (adj[a].push(b), adj[b].push(a));
    const dist = (from) => {
        const d = Array(nodes.length).fill(Infinity);
        d[from] = 0;
        const q = [from];
        while (q.length) {
            const x = q.shift();
            for (const y of adj[x])
                if (d[y] === Infinity) ((d[y] = d[x] + 1), q.push(y));
        }
        return d;
    };
    // Seeds: farthest-point sampling from a random start.
    const seeds = [Math.floor(r() * nodes.length)];
    while (seeds.length < 3) {
        const ds = seeds.map(dist);
        let best = 0,
            far = -1;
        for (let i = 0; i < nodes.length; i++) {
            const m = Math.min(...ds.map((d) => d[i]));
            if (m > far) ((far = m), (best = i));
        }
        seeds.push(best);
    }
    // Grow in turns: each faction claims one unclaimed neighbour of its own,
    // until it's its size (or boxed in).
    const sizes = seeds.map(() => 3 + Math.floor(r() * 6));
    const owner = Array(nodes.length).fill(-1);
    const frontier = seeds.map((s, i) => ((owner[s] = i), [s]));
    for (let grew = true; grew;) {
        grew = false;
        for (let i = 0; i < 3; i++) {
            if (frontier[i].length >= sizes[i]) continue;
            const options = frontier[i].flatMap((x) =>
                adj[x].filter((y) => owner[y] < 0),
            );
            if (!options.length) continue;
            const y = pick(options);
            owner[y] = i;
            frontier[i].push(y);
            grew = true;
        }
    }
    // No enclaves: a pocket of unclaimed systems whose every route out leads
    // into one faction's territory is that faction's too. (No draws: nothing
    // else shifts.)
    const seen = new Set();
    for (let i = 0; i < nodes.length; i++) {
        if (owner[i] >= 0 || seen.has(i)) continue;
        const pocket = [i],
            borders = new Set();
        seen.add(i);
        for (let k = 0; k < pocket.length; k++)
            for (const y of adj[pocket[k]]) {
                if (owner[y] >= 0) borders.add(owner[y]);
                else if (!seen.has(y)) (seen.add(y), pocket.push(y));
            }
        if (borders.size === 1)
            for (const x of pocket) owner[x] = [...borders][0];
    }
    // Each a different type (see faction-types.js), named in its fashion.
    const types = Object.keys(TYPES)
        .map((k) => [r(), k])
        .sort((a, b) => a[0] - b[0])
        .map(([, k]) => k);
    const factions = seeds.map((capital, i) => {
        const t = TYPES[types[i]];
        const name =
            r() < 0.6
                ? `${pick(t.adj)} ${pick(t.noun)}`
                : `${pick(t.noun)} of ${nodes[capital].name}`;
        return { name, type: types[i], color: COLORS[i], capital };
    });
    for (const n of nodes)
        n.faction = owner[n.id] >= 0 && owner[n.id] < 3 ? owner[n.id] : null;
    return factions;
}
