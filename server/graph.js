// Cheapest route by fuel (fewest hops breaks ties): { path: [ids], fuel }.
// (The client's map has its own copy for drawing routes.)
export function cheapest(universe, from, to) {
  const best = new Map([[from, { fuel: 0, hops: 0, prev: null }]]);
  const open = new Set([from]);
  const worse = (a, b) => a.fuel - b.fuel || a.hops - b.hops;
  while (open.size) {
    const id = [...open].reduce((x, y) => (worse(best.get(x), best.get(y)) <= 0 ? x : y));
    open.delete(id);
    if (id === to) break;
    const cur = best.get(id);
    for (const [a, b, cost] of universe.edges) {
      if (a !== id && b !== id) continue;
      const next = a === id ? b : a;
      const cand = { fuel: cur.fuel + cost, hops: cur.hops + 1, prev: id };
      if (!best.has(next) || worse(cand, best.get(next)) < 0) best.set(next, cand), open.add(next);
    }
  }
  const path = [to];
  while (best.get(path[0]).prev != null) path.unshift(best.get(path[0]).prev);
  return { path, fuel: best.get(to).fuel };
}
