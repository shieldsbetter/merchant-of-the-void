// Morale: out of 200. Each crew member has a base, and modifiers that add
// to it while they last: c.moods = [{ label, amount, max?, min?, expires?,
// ends?, key? }].
//   amount: +n raises morale, but not past `max` (if it's there already, no
//     effect); −n lowers it, but not below `min`. (0 and 200 always bound it.)
//   expires: the cycle it's gone at; or `ends`, words for when it goes (say,
//     a trait's: 'Lasting'). Neither: it lasts.
//   key: one of a kind (a newer one replaces it; say, a homeworld visit).
// Which order they apply in matters, with limits: so that as many as
// possible count, the lowering ones go first, the highest floor first, then
// the raising ones, the lowest cap first.

// Give crew member `c` a mood (replacing any of the same key).
export function addMood(c, m) {
  c.moods = (c.moods ?? []).filter((x) => !m.key || x.key !== m.key); // (a crew member held captive through the change has none yet)
  c.moods.push(m);
}

// Morale, and what each mood actually adds (`effect`, after the limits).
export function moraleOf(c) {
  let v = Math.max(0, Math.min(200, c.base));
  const moods = c.moods ?? [];
  const down = moods.filter((m) => m.amount < 0).sort((a, b) => (b.min ?? 0) - (a.min ?? 0));
  const up = moods.filter((m) => m.amount > 0).sort((a, b) => (a.max ?? 200) - (b.max ?? 200));
  const parts = [];
  for (const m of down) {
    const floor = Math.max(0, m.min ?? 0);
    const to = v <= floor ? v : Math.max(floor, v + m.amount);
    parts.push({ m, effect: to - v });
    v = to;
  }
  for (const m of up) {
    const cap = Math.min(200, m.max ?? 200);
    const to = v >= cap ? v : Math.min(cap, v + m.amount);
    parts.push({ m, effect: to - v });
    v = to;
  }
  return { morale: v, parts };
}

// Time's passed, to `cycle`: moods that have run out are gone.
export function expire(crew, cycle) {
  for (const c of crew) c.moods = (c.moods ?? []).filter((m) => m.expires == null || m.expires > cycle);
}

// Losing a fight: everyone's shaken for a while (another loss replaces it).
const LOST = { amount: -10, min: 50, hops: 3 };
export function lostFight({ crew, cycle, cyclesPerHop }) {
  for (const c of crew)
    addMood(c, { key: 'lost-fight', label: 'Lost a fight', amount: LOST.amount, min: LOST.min, expires: cycle + Math.round(cyclesPerHop * LOST.hops) });
}

// Trauma (left down when a fight was lost; see firefight.js): for good.
export const trauma = (c) => addMood(c, { label: 'Trauma', amount: -15, ends: 'Lasting' });

// Too long without shore leave (c.ashore: the cycle of their last; see
// crew.js's shoreLeave): the worst that applies, until the next.
const RESTLESS = [
  { after: 40, label: 'Far too long since shore leave', amount: -20, min: 25 },
  { after: 25, label: 'Too long since shore leave', amount: -10, min: 50 }
];
export function restless(crew, cycle) {
  for (const c of crew) {
    c.moods = (c.moods ?? []).filter((m) => m.key !== 'restless');
    const r = RESTLESS.find((r) => cycle - (c.ashore ?? 0) >= r.after);
    if (r) c.moods.push({ key: 'restless', label: r.label, amount: r.amount, min: r.min, ends: 'Until shore leave' });
  }
}
