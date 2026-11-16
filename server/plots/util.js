// Helpers for plot templates.
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const shuffle = (a) =>
    a
        .map((x) => [Math.random(), x])
        .sort((p, q) => p[0] - q[0])
        .map(([, x]) => x);

// Hops from `from` to every system within `max` (as a Map, `from` itself 0).
export function hops(universe, from, max) {
    const out = new Map([[from, 0]]);
    let edge = [from];
    for (let d = 1; d <= max; d++) {
        const next = [];
        for (const [a, b] of universe.edges)
            for (const [x, y] of [
                [a, b],
                [b, a],
            ])
                if (edge.includes(x) && !out.has(y))
                    (out.set(y, d), next.push(y));
        edge = next;
    }
    return out;
}

// Systems 1 to `max` hops from `from`.
export const near = (universe, from, max) =>
    [...hops(universe, from, max).keys()].filter((id) => id !== from);
