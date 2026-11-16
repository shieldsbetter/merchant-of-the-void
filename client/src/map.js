import {
    getUniverse,
    getVisit,
    getShip,
    getJournal,
    setCourse,
    departNow,
    currentGame,
} from './api.js';
import { badges, badgeEl, badgeSvg, explain } from './badges.js';
import { journey } from './travel.js';

const SVG = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
};

// The view transform survives leaving and returning to the map, until you
// arrive somewhere new: then it re-centres on you.
const shared = { view: null, from: null, game: null }; // from: the ship position the view was last fitted to

// Cheapest route by fuel (fewest hops breaks ties): { path: [ids], fuel }.
function cheapest(nodes, edges, from, to) {
    const best = new Map([[from, { fuel: 0, hops: 0, prev: null }]]);
    const open = new Set([from]);
    const worse = (a, b) => a.fuel - b.fuel || a.hops - b.hops;
    while (open.size) {
        const id = [...open].reduce((x, y) =>
            worse(best.get(x), best.get(y)) <= 0 ? x : y,
        );
        open.delete(id);
        if (id === to) break;
        const cur = best.get(id);
        for (const [a, b, cost] of edges) {
            if (a !== id && b !== id) continue;
            const next = a === id ? b : a;
            const cand = {
                fuel: cur.fuel + cost,
                hops: cur.hops + 1,
                prev: id,
            };
            if (!best.has(next) || worse(cand, best.get(next)) < 0)
                (best.set(next, cand), open.add(next));
        }
    }
    const path = [to];
    while (best.get(path[0]).prev != null) path.unshift(best.get(path[0]).prev);
    return { path, fuel: best.get(to).fuel };
}

// Faction territory. Each faction system has a reach: a rounded shape
// around it that bulges along routes to same-faction neighbours (past the
// halfway line) and spans narrow wedges between them, so space a faction's
// routes enclose is covered. Each system also has its Voronoi cell (the
// space nearer it than any other system). A faction holds the parts of its
// systems' cells that any of its reaches cover: cells keep factions apart,
// reaches keep territory near its systems. Filled as one; outlined where it
// faces another faction or independent system, or ends in open space.
const REACH = 180; // how far a system's territory reaches, away from its own
const BAND = 130; // half-width of the bulge toward a same-faction neighbour
function territories(nodes, edges, factions) {
    const g = el('g', { class: 'territory' });
    const allies = nodes.map(() => []);
    for (const [a, b] of edges)
        if (nodes[a].faction != null && nodes[a].faction === nodes[b].faction)
            (allies[a].push(nodes[b]), allies[b].push(nodes[a]));
    const reach = nodes.map((n) =>
        n.faction == null ? null : reachShape(n, allies[n.id]),
    );
    const fills = factions.map(() => []);
    const borders = factions.map(() => []);
    const fmt = (p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    for (const n of nodes) {
        const f = n.faction;
        if (f == null) continue;
        const cell = voronoiCell(n, nodes);
        const mine = nodes
            .filter((m) => m.faction === f)
            .map((m) => reach[m.id]);
        for (const shape of mine) {
            const piece = clipConvex(cell, shape);
            if (piece.length < 3) continue;
            fills[f].push(`M${piece.map(fmt).join('L')}Z`);
            const cx = piece.reduce((s, p) => s + p.x, 0) / piece.length,
                cy = piece.reduce((s, p) => s + p.y, 0) / piece.length;
            piece.forEach((p, k) => {
                const q = piece[(k + 1) % piece.length];
                if (p.src !== 'rim') {
                    // On a bisector: a border if the system across is someone else's.
                    if (nodes[p.src].faction !== f)
                        borders[f].push(`M${fmt(p)}L${fmt(q)}`);
                    return;
                }
                // On a reach's edge: a border wherever no other reach covers past it.
                const STEPS = 6;
                for (let t = 0; t < STEPS; t++) {
                    const a = lerp(p, q, t / STEPS),
                        b = lerp(p, q, (t + 1) / STEPS),
                        mid = lerp(a, b, 0.5);
                    const d = Math.hypot(mid.x - cx, mid.y - cy) || 1;
                    const out = {
                        x: mid.x + ((mid.x - cx) / d) * 2,
                        y: mid.y + ((mid.y - cy) / d) * 2,
                    };
                    // Covered: still this faction's there (nearest one of its systems,
                    // and inside one of its reaches other than this one).
                    const nearest = nodes.reduce((b, m) =>
                        (m.x - out.x) ** 2 + (m.y - out.y) ** 2 <
                        (b.x - out.x) ** 2 + (b.y - out.y) ** 2
                            ? m
                            : b,
                    );
                    const covered =
                        nearest.faction === f &&
                        mine.some((s) => s !== shape && inConvex(s, out));
                    if (!covered) borders[f].push(`M${fmt(a)}L${fmt(b)}`);
                }
            });
        }
    }
    factions.forEach((fac, i) => {
        // Pieces overlap; the group's opacity keeps the overlaps even.
        const fill = el('g', { class: 'fill' });
        fill.append(el('path', { d: fills[i].join(''), fill: fac.color }));
        g.append(
            fill,
            el('path', {
                class: 'border',
                d: borders[i].join(''),
                stroke: fac.color,
            }),
        );
    });
    return g;
}

const lerp = (a, b, t) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
});
const cross = (o, a, b) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const orient = (poly) =>
    Math.sign(
        poly.reduce(
            (s, p, i) => s + cross(poly[0], p, poly[(i + 1) % poly.length]),
            0,
        ),
    ) || 1;
const inConvex = (poly, p) => {
    const o = orient(poly);
    return poly.every(
        (a, i) => cross(a, poly[(i + 1) % poly.length], p) * o >= 0,
    );
};

// A system's reach: a circle, bulging toward `allies` and over narrow wedges
// between them (a convex shape).
function reachShape(n, allies) {
    const pts = Array.from({ length: 28 }, (_, k) => {
        const a = (k / 28) * Math.PI * 2;
        return { x: n.x + REACH * Math.cos(a), y: n.y + REACH * Math.sin(a) };
    });
    for (const m of allies) {
        const dx = m.x - n.x,
            dy = m.y - n.y,
            d = Math.hypot(dx, dy);
        const ux = dx / d,
            uy = dy / d,
            along = d / 2 + 30; // just past halfway
        for (const s of [-1, 1])
            pts.push({
                x: n.x + ux * along - uy * BAND * s,
                y: n.y + uy * along + ux * BAND * s,
            });
    }
    for (const [i, a] of allies.entries())
        for (const b of allies.slice(i + 1)) {
            const ang = Math.abs(
                Math.atan2(a.y - n.y, a.x - n.x) -
                    Math.atan2(b.y - n.y, b.x - n.x),
            );
            if (Math.min(ang, 2 * Math.PI - ang) < (110 * Math.PI) / 180)
                pts.push({ x: a.x, y: a.y }, { x: b.x, y: b.y });
        }
    return hull(pts);
}

// A system's Voronoi cell, within a box well beyond the map. Each vertex's
// `src` names what the edge from it to the next one faces: another system's
// index, or 'rim' (the box).
function voronoiCell(n, nodes) {
    let cell = [
        { x: -5000, y: -5000, src: 'rim' },
        { x: 9000, y: -5000, src: 'rim' },
        { x: 9000, y: 9000, src: 'rim' },
        { x: -5000, y: 9000, src: 'rim' },
    ];
    for (const m of nodes) {
        if (m === n) continue;
        // Keep what's nearer n than m: (p - mid) · (m - n) <= 0.
        const dx = m.x - n.x,
            dy = m.y - n.y,
            mx = (m.x + n.x) / 2,
            my = (m.y + n.y) / 2;
        cell = clipHalf(cell, (p) => (p.x - mx) * dx + (p.y - my) * dy, m.id);
    }
    return cell;
}

// Keep the part of `poly` where side(p) <= 0; new edges along the cut get `src`.
function clipHalf(poly, side, src) {
    const out = [];
    poly.forEach((a, i) => {
        const b = poly[(i + 1) % poly.length];
        const sa = side(a),
            sb = side(b);
        const cut = () => {
            const t = sa / (sa - sb);
            return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
        };
        if (sa <= 0) out.push(a);
        if (sa <= 0 && sb > 0) out.push({ ...cut(), src }); // leaving: the new edge runs along the cut
        if (sa > 0 && sb <= 0) out.push({ ...cut(), src: a.src }); // entering: back on a's edge
    });
    return out;
}

// A cell cut down to a convex shape; the shape's edges come out as 'rim'.
function clipConvex(cell, shape) {
    const o = orient(shape);
    let out = cell;
    shape.forEach((a, i) => {
        const b = shape[(i + 1) % shape.length];
        out = clipHalf(out, (p) => -cross(a, b, p) * o, 'rim');
    });
    return out;
}

// Convex hull (monotone chain), counter-clockwise.
function hull(pts) {
    const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) =>
        (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const half = (list) => {
        const h = [];
        for (const q of list) {
            while (
                h.length >= 2 &&
                cross(h[h.length - 2], h[h.length - 1], q) <= 0
            )
                h.pop();
            h.push(q);
        }
        h.pop();
        return h;
    };
    return [...half(p), ...half([...p].reverse())];
}

// The Nav tab: the map, where you lay in a course, and depart on it a hop at
// a time (a shortcut for the System tab's Depart: not while something there
// won't let you leave). `plan`: a system to select (and
// fit the view to the route there), as a system name's link asks.
export function mountMap(root, { plan } = {}) {
    if (shared.game !== currentGame())
        Object.assign(shared, { view: null, from: null, game: currentGame() }); // another game's map
    let view = plan == null ? shared.view : null;

    const svg = el('svg', { class: 'map' });
    const world = el('g');
    svg.append(world);
    const hud = document.createElement('div');
    hud.className = 'hud';
    hud.innerHTML = `<div><b class="fuel"></b> <span class="dim">Star Fuel</span> · <span class="dim">Cycle</span> <b class="cycle"></b></div><div class="msg"></div>`;
    // Bottom bar for the selected system: name, route, badges, and Set Course
    // there (or Clear Course, if that's where it's set); and, with a course
    // laid in, Depart on its next hop.
    const bar = document.createElement('div');
    bar.className = 'depart';
    bar.innerHTML = `
    <div class="info"><b class="dest"></b><div class="detail"></div><div class="badges"></div></div>
    <div class="actions"><button class="set"></button><button class="go">Depart<small></small></button></div>`;
    let selected = plan;
    let course = null; // the system the course is laid in to (server's)
    let next = null; // the course as the server sees it: { next, nextName, fuel, ... }
    root.append(svg, hud, bar);

    // Things drawn at a map point but sized in screen pixels (reticle, fuel
    // labels): apply() undoes the zoom on them. `min` (map units) keeps one at
    // least that big zoomed in: its screen size grows once min × zoom passes 1.
    const fixed = [];
    const pinned = (cls, x, y, min = 0) => {
        const g = el('g', { class: cls });
        fixed.push({ g, x, y, min });
        return g;
    };
    const apply = () => {
        world.setAttribute(
            'transform',
            `translate(${view.x} ${view.y}) scale(${view.k})`,
        );
        for (const { g, x, y, min } of fixed)
            g.setAttribute(
                'transform',
                `translate(${x} ${y}) scale(${Math.max(1, min * view.k) / view.k})`,
            );
    };

    Promise.all([getUniverse(), getShip(), getJournal(), getVisit()]).then(
        ([{ nodes, edges, cycle, factions = [] }, ship, { quests }, visit]) => {
            // Hop costs for this ship: traits (Limping) and modules multiply them (server's hopCost).
            const fuelX = ship.stats.effective.fuel;
            edges = edges.map(([a, b, cost]) => [
                a,
                b,
                Math.ceil(cost * fuelX),
            ]);
            hud.querySelector('.fuel').textContent =
                `${ship.fuel}/${ship.stats.effective.fuelCap}`;
            hud.querySelector('.cycle').textContent = cycle;
            const here = nodes.find(
                (n) => n.x === ship.position.x && n.y === ship.position.y,
            );
            // Neighbours of where you are, and the fuel to reach each.
            const routes = new Map();
            for (const [a, b, cost] of edges) {
                if (a === here?.id) routes.set(b, cost);
                if (b === here?.id) routes.set(a, cost);
            }
            const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
            const costs = new Map(
                edges.map(([a, b, cost]) => [key(a, b), cost]),
            );
            // Factions, underneath everything: each one's territory filled with its
            // colour and outlined where it meets anyone else's (or open space), and
            // its name across the middle, the same size at any zoom. Independent
            // systems have neither. See territories() below.
            world.append(territories(nodes, edges, factions));
            const factionLabels = factions.map((f, i) => {
                const mine = nodes.filter((n) => n.faction === i);
                const g = pinned(
                    'faction-label',
                    mine.reduce((s, n) => s + n.x, 0) / mine.length,
                    mine.reduce((s, n) => s + n.y, 0) / mine.length,
                );
                const t = el('text', { fill: f.color });
                t.textContent = f.name;
                g.append(t);
                return g;
            });
            const labels = [];
            const others = []; // badges on edges you can't take from here
            const badgePins = []; // planets' attribute icons
            const marks = new Map(); // edge key -> its line and badge, to highlight a course
            for (const [a, b, cost] of edges) {
                const route = a === here?.id || b === here?.id;
                const line = el('line', {
                    class: `edge${route ? ' route' : ''}`,
                    x1: nodes[a].x,
                    y1: nodes[a].y,
                    x2: nodes[b].x,
                    y2: nodes[b].y,
                });
                world.append(line);
                // Every edge shows its fuel cost; the ones you can take now stand out.
                const g = pinned(
                    `cost${!route ? ' other' : cost > ship.fuel ? ' short' : ''}`,
                    (nodes[a].x + nodes[b].x) / 2,
                    (nodes[a].y + nodes[b].y) / 2,
                );
                marks.set(key(a, b), [line, g]);
                g.append(el('circle', { r: 10 }));
                const t = el('text', { dy: '0.35em' });
                t.textContent = cost;
                g.append(t);
                (route ? labels : others).push(g);
            }
            for (const n of nodes) {
                const reachable = n === here || routes.get(n.id) <= ship.fuel;
                const g = el('g', {
                    class: `node${reachable ? '' : ' far'}`,
                    'data-id': n.id,
                    transform: `translate(${n.x} ${n.y})`,
                });
                g.append(el('circle', { r: 14 }));
                const label = el('text', { y: 34 });
                label.textContent = n.name;
                g.append(label);
                world.append(g);
                // Badges up and to the right of the planet, at a fixed screen size.
                const bs = badges(n, ship, quests);
                if (bs.length) {
                    const pin = pinned('badges', n.x, n.y);
                    pin.innerHTML = bs
                        .map((b, i) => badgeSvg(b, 10 + i * 26, -34, 20))
                        .join('');
                    badgePins.push(pin);
                }
            }
            world.append(...factionLabels, ...others, ...labels, ...badgePins); // over the nodes, the ones that matter on top

            // Exactly one system is always selected: where you are, or another, with
            // the cheapest route there highlighted and Set Course to lay it in (Clear
            // Course, if it's laid in already). The map opens on the course's end.
            let chosen = [];
            const set = bar.querySelector('.set'),
                go = bar.querySelector('.go');
            // Depart: on to the System tab, where you arrive (or whatever stopped
            // you is); or why you can't, in a dialog.
            go.onclick = async () => {
                go.disabled = true;
                let trip;
                try {
                    trip = (await departNow()).trip;
                } catch (x) {
                    explain({ title: "Can't depart", text: x.message });
                    go.disabled = false;
                    return;
                }
                // Time passes on the way; the System tab fades in on arrival, or on
                // whatever's out there (see travel.js).
                try {
                    await journey(trip);
                } finally {
                    location.hash = '#/system';
                }
            };
            select = (id) => {
                chosen.forEach((e) => e.classList.remove('chosen'));
                chosen = [];
                hud.querySelector('.msg').textContent = '';
                const n = nodes[id];
                selected = id;
                bar.querySelector('.dest').textContent = n.name;
                bar.querySelector('.badges').replaceChildren(
                    ...badges(n, ship, quests).map(badgeEl),
                );
                bar.classList.toggle('route', n !== here);
                set.hidden = n === here;
                go.hidden = !next;
                if (next)
                    go.querySelector('small').textContent =
                        `${next.nextName} · ${next.fuel} fuel`;
                if (n === here) {
                    bar.querySelector('.detail').textContent = 'You are here';
                    return;
                }
                const path = routes.has(id)
                    ? [here.id, id]
                    : cheapest(nodes, edges, here.id, id).path;
                const legs = path
                    .slice(1)
                    .map((to, i) => costs.get(key(path[i], to)));
                const fuel = legs.reduce((a, b) => a + b, 0);
                chosen = path
                    .slice(1)
                    .flatMap((to, i) => marks.get(key(path[i], to)));
                chosen.forEach((e) => e.classList.add('chosen'));
                const hops = legs.length;
                bar.querySelector('.detail').textContent =
                    (hops === 1
                        ? `${fuel} Star Fuel`
                        : `${hops} hops · ${fuel} Star Fuel · next: ${nodes[path[1]].name}`) +
                    (fuel > ship.fuel ? ` — you have ${ship.fuel}` : '') +
                    (course === id ? ' · course laid in' : '');
                set.textContent = course === id ? 'Clear Course' : 'Set Course';
                set.onclick = () => lay(course === id ? null : id);
            };
            // Lay in (or clear) the course; depart from the System tab.
            const lay = async (to) => {
                try {
                    next = (await setCourse(to)).course;
                    course = next?.dest ?? null;
                    hud.querySelector('.msg').textContent = '';
                    select(selected);
                } catch (x) {
                    hud.querySelector('.msg').textContent = x.message;
                }
            };
            hereId = here.id;
            tapped = (x, y) => {
                const r = svg.getBoundingClientRect();
                let best = null,
                    bestD = Math.max(SLOP, 14 * view.k);
                for (const n of nodes) {
                    const d = Math.hypot(
                        r.left + view.x + n.x * view.k - x,
                        r.top + view.y + n.y * view.k - y,
                    );
                    if (d <= bestD) ((best = n.id), (bestD = d));
                }
                return best;
            };
            // Tapping empty space: back to where you are, and no course laid in.
            deselect = () => {
                if (course != null) lay(null);
                select(here.id);
            };
            // Start on the system asked for, or the course's end, or where you are.
            next = visit.course;
            course = next?.dest ?? null;
            const start = plan ?? course ?? here.id;
            select(nodes[start] ? start : here.id);
            // Reticle on the ship: a ring with four ticks, slowly turning. Drawn last
            // so it sits on top, and ignores pointers so taps reach the planet under it.
            // Sizes are screen pixels; apply() scales it, and zoomed in far enough
            // that the planet's dot (radius 14) would reach the ring, grows it to
            // stay just outside (ring at 14/12 of the dot's radius).
            const reticle = pinned(
                'reticle',
                ship.position.x,
                ship.position.y,
                14 / 12,
            );
            const spin = el('g', { class: 'spin' });
            spin.append(el('circle', { r: 14 }));
            for (const [x1, y1, x2, y2] of [
                [0, -10, 0, -20],
                [0, 10, 0, 20],
                [-10, 0, -20, 0],
                [10, 0, 20, 0],
            ]) {
                spin.append(el('line', { x1, y1, x2, y2 }));
            }
            reticle.append(spin);
            world.append(reticle);
            const { x: sx, y: sy } = ship.position;
            const trip = plan != null && cheapest(nodes, edges, here.id, plan);
            if (
                !view ||
                (!trip && (shared.from?.x !== sx || shared.from?.y !== sy))
            ) {
                // Fit the ship and its next hops (and any planned route), centred on that
                // group, with a 30% margin. Height leaves room for the fuel HUD above and
                // the selected-system bar below.
                const group = [
                    { x: sx, y: sy },
                    ...[...routes.keys(), ...(trip ? trip.path : [])].map(
                        (id) => nodes[id],
                    ),
                ];
                const xs = group.map((n) => n.x),
                    ys = group.map((n) => n.y);
                const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
                    cy = (Math.min(...ys) + Math.max(...ys)) / 2;
                const w =
                    Math.max(200, Math.max(...xs) - Math.min(...xs)) * 1.3;
                const h =
                    Math.max(200, Math.max(...ys) - Math.min(...ys)) * 1.3;
                const { width, height } = svg.getBoundingClientRect();
                const top = 110,
                    bottom = 254; // the fuel HUD; the selected-system bar and the tab strip
                const k = Math.min(width / w, (height - top - bottom) / h);
                view = {
                    k,
                    x: width / 2 - k * cx,
                    y: (top + height - bottom) / 2 - k * cy,
                };
                if (!trip)
                    Object.assign(shared, { view, from: { x: sx, y: sy } });
            }
            apply();
        },
    );

    // Pointer handling: one pointer pans, two pinch-zoom, a short tap on a node visits it.
    const pointers = new Map();
    let moved = 0;

    const zoomAt = (px, py, factor) => {
        const k = Math.max(0.1, Math.min(8, view.k * factor));
        factor = k / view.k;
        view.x = px - (px - view.x) * factor;
        view.y = py - (py - view.y) * factor;
        view.k = k;
        apply();
    };

    svg.addEventListener('pointerdown', (e) => {
        svg.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 1) moved = 0;
    });

    svg.addEventListener('pointermove', (e) => {
        const prev = pointers.get(e.pointerId);
        if (!prev || !view) return;
        const cur = { x: e.clientX, y: e.clientY };
        if (pointers.size === 1) {
            view.x += cur.x - prev.x;
            view.y += cur.y - prev.y;
            moved += Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
            apply();
        } else if (pointers.size === 2) {
            const [other] = [...pointers]
                .filter(([id]) => id !== e.pointerId)
                .map(([, p]) => p);
            const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
            const d1 = Math.hypot(cur.x - other.x, cur.y - other.y);
            const r = svg.getBoundingClientRect();
            zoomAt(
                (cur.x + other.x) / 2 - r.left,
                (cur.y + other.y) / 2 - r.top,
                d1 / d0,
            );
            moved = Infinity; // a pinch is never a tap
        }
        pointers.set(e.pointerId, cur);
    });

    const end = (e) => {
        if (!pointers.delete(e.pointerId)) return;
        if (pointers.size === 0 && moved < 8 && e.type === 'pointerup') {
            const id = tapped(e.clientX, e.clientY);
            // Tapping where you are opens the System tab; any other system is
            // selected; empty space deselects.
            if (id === hereId) location.hash = '#/system';
            else if (id != null) select(id);
            else deselect();
        }
    };
    let select = () => {}; // set once the map has loaded
    // The system a tap at (x, y) on screen means: the nearest within SLOP
    // screen pixels of its centre (however small it's drawn; zoomed in, its
    // whole dot), or null.
    const SLOP = 32;
    let tapped = () => null; // set once the map has loaded
    let deselect = () => {};
    let hereId = null;
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);

    svg.addEventListener(
        'wheel',
        (e) => {
            e.preventDefault();
            if (!view) return;
            const r = svg.getBoundingClientRect();
            zoomAt(
                e.clientX - r.left,
                e.clientY - r.top,
                Math.exp(-e.deltaY * 0.0015),
            );
        },
        { passive: false },
    );

    return () => {};
}
