// Ship upgrades: expansion slots (ship.slots; five, plus any a module like
// Hull Expansion adds), each empty or holding a module good (see goods.js).
// Installing takes the module from the hold and puts whatever it replaces
// back there. Stats change at once. A unique module can only be installed once.
import { GOODS } from './goods.js';
import { effect } from './traits.js';
import { fits, misfit } from './ship.js';

export const SLOTS = 5;

// The holds and their sizes: a base, plus what modules add (by key). A hold
// of size 0 doesn't exist.
const HOLDS = [
  { name: 'Main Hold', tags: [], base: 8, key: 'mainHold' },
  { name: 'Cold Store', tags: ['refrigerated'], base: 0, key: 'coldStore' },
  { name: 'Passenger Deck', tags: ['habitable'], base: 0, key: 'passengers' }
];
const holdSizes = (slots) =>
  HOLDS.map((h) => h.base + slots.filter(Boolean).reduce((n, g) => n + (GOODS[g].module.adds?.[h.key] ?? 0), 0));

// Rebuild the holds to the sizes the modules give, keeping each hold's
// cargo where it was; returns the stacks with nowhere left to be.
function reshape(ship) {
  const sizes = holdSizes(ship.slots);
  const out = ship.holds.filter((x) => !HOLDS.some((h) => h.name === x.name)).flatMap((x) => x.slots.filter(Boolean));
  ship.holds = HOLDS.flatMap((h, i) => {
    const old = ship.holds.find((x) => x.name === h.name)?.slots ?? [];
    out.push(...old.slice(sizes[i]).filter(Boolean));
    if (!sizes[i]) return [];
    return [{ name: h.name, tags: h.tags, slots: Array.from({ length: sizes[i] }, (_, k) => old[k] ?? null) }];
  });
  return out;
}
export const FUEL_CAP = 15; // Star Fuel the tanks hold, before modules

const installed = (ship) => (ship.slots ?? []).filter(Boolean).map((g) => GOODS[g].module);

// The ship's stats with its modules: base (ship.combat) plus each module's
// adds. Current hull and crits are the maxima less the damage taken (never
// below 1 here: only removing a module could do that, outside a fight).
export function stats(ship) {
  const c = ship.combat;
  const add = (k) => installed(ship).reduce((n, m) => n + (m.adds?.[k] ?? 0), 0);
  const maxHull = Math.max(1, c.maxHull + add('hull'));
  const maxCrits = c.maxCrits + add('crits');
  const lo = Math.max(0, c.damage[0] + add('dmgLo'));
  return {
    hull: Math.max(1, maxHull - c.wear),
    maxHull,
    crits: Math.max(1, maxCrits - c.lostCrits),
    maxCrits,
    damage: [lo, Math.max(lo, c.damage[1] + add('dmgHi'))],
    crit: Math.max(0, c.crit + add('crit')),
    maneuver: c.maneuver + add('maneuver'),
    fuelCap: FUEL_CAP + add('fuelCap')
  };
}

// For the client: the ship, plus its base and effective stats (effective =
// with modules, then trait and module multipliers like Limping's).
export function publicShip(ship) {
  const s = stats(ship);
  const x = (k) => effect(ship, k);
  return {
    ...ship,
    stats: {
      base: { ...ship.combat, fuel: 1, fuelCap: FUEL_CAP },
      effective: {
        ...s,
        damage: s.damage.map((d) => +(d * x('damage')).toFixed(1)),
        crit: s.crit * x('crit'),
        fuel: +x('fuel').toFixed(3)
      }
    }
  };
}

// Put the module at hold position `at` into expansion slot `slot`; any
// module already there goes back into the hold. With no `at`, just empty the
// slot. If that changes how many slots there are (Hull Expansion), modules in
// slots that go away go back to the hold too. All or nothing.
export function install(ship, slot, at) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= ship.slots.length) throw new Error('bad slot');
  const next = structuredClone(ship);
  const toHold = []; // modules coming out
  if (at == null) {
    if (!next.slots[slot]) return;
    toHold.push(next.slots[slot]);
    next.slots[slot] = null;
  } else {
    const hold = next.holds[at.hold];
    const st = hold?.slots[at.slot];
    if (!st || !GOODS[st.good].module || st.quest) throw new Error("that's not a module");
    const { unique } = GOODS[st.good].module;
    if (unique && next.slots.some((g, i) => g === st.good && i !== slot)) throw new Error(`only one ${GOODS[st.good].name} can be installed`);
    hold.slots[at.slot] = null; // modules stack one to a slot
    if (next.slots[slot]) toHold.push(next.slots[slot]);
    next.slots[slot] = st.good;
  }
  // Grow or shrink to the slot count the modules now give.
  const count = SLOTS + next.slots.filter(Boolean).reduce((n, g) => n + (GOODS[g].module.adds?.slots ?? 0), 0);
  while (next.slots.length < count) next.slots.push(null);
  toHold.push(...next.slots.splice(count).filter(Boolean));
  // Hold space follows the modules too (only when that changed, so older
  // ships keep their holds until then): cargo in space that's gone moves.
  const stacks = toHold.map((g) => ({ good: g, qty: 1 }));
  if (holdSizes(next.slots).join() !== holdSizes(ship.slots).join()) stacks.push(...reshape(next));
  for (const st of stacks) {
    const free = next.holds.flatMap((h) => h.slots.map((x, i) => ({ h, i, x }))).find((f) => !f.x && fits(f.h, st.good));
    if (!free) {
      const somewhere = next.holds.some((h) => fits(h, st.good));
      throw new Error(somewhere || !GOODS[st.good].needs ? `no room in the hold for the ${GOODS[st.good].name}` : misfit(null, st.good));
    }
    free.h.slots[free.i] = st;
  }
  Object.assign(ship, { slots: next.slots, holds: next.holds });
}
