// The player's ship: a list of holds, each a fixed array of slots.
// A slot is null or { good, qty }, with qty never above that good's stack height.
// Consigned cargo (carried for a quest) is { good, qty, quest: id }: it only
// stacks with cargo from the same quest, and can't be sold.
//
// Holds have tags (refrigerated, habitable), and some goods need one. A good
// that needs a tag goes only in a hold with it; a hold with tags takes only
// goods that need one of them. (Cargo already in the wrong hold, from older
// saves, can stay or move out, but nothing new goes in wrong.)
export const fits = (hold, good) => {
  const need = GOODS[good]?.needs;
  return need ? hold.tags.includes(need) : !hold.tags.length;
};
export const misfit = (hold, good) => {
  const { name, needs, plural } = GOODS[good];
  return needs ? `${name} need${plural ? '' : 's'} a ${needs} hold` : `the ${hold.name} only takes ${hold.tags.join('/')} cargo`;
};
// Credits live on the ship too.

import { GOODS } from './goods.js';
import { stats } from './modules.js';

const empty = (n) => Array(n).fill(null);

// A ship's name, until you give it another (see renameShip).
const ADJ = ['Stubborn', 'Patient', 'Wandering', 'Lucky', 'Quiet', 'Restless', 'Crooked', 'Faithful', 'Rusty', 'Bright', 'Long', 'Second'];
const NOUN = ['Heron', 'Gull', 'Tern', 'Mule', 'Kettle', 'Lantern', 'Compass', 'Sparrow', 'Promise', 'Wager', 'Comet', 'Anchor'];
export const shipName = (r = Math.random) => `${ADJ[Math.floor(r() * ADJ.length)]} ${NOUN[Math.floor(r() * NOUN.length)]}`;

export const NAME_MAX = 50;

// Rename the ship: 1 to NAME_MAX characters, trimmed.
export function renameShip(ship, name) {
  name = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('give the ship a name');
  if (name.length > NAME_MAX) throw new Error(`a name is at most ${NAME_MAX} characters`);
  ship.name = name;
}

export function makeShip() {
  return {
    name: shipName(),
    credits: 1000,
    fuel: 10,
    traits: [], // see traits.js
    // combat stats (see combat.js) are added by the server: ship.combat
    // Just a small main hold; modules add space (see modules.js).
    holds: [{ name: 'Main Hold', tags: [], slots: empty(8) }],
    slots: Array(5).fill(null) // expansion slots; see modules.js
  };
}

// Drag one stack onto another slot. Same good: merge as much as fits, the
// remainder stays behind. Otherwise: swap (which covers moving into an empty slot).
export function moveStack(ship, from, to) {
  const slot = (p) => {
    const hold = ship.holds[p?.hold];
    if (!hold || !Number.isInteger(p.slot) || p.slot < 0 || p.slot >= hold.slots.length) throw new Error('bad slot');
    return hold.slots;
  };
  const a = slot(from), b = slot(to);
  const src = a[from.slot], dst = b[to.slot];
  if (!src) throw new Error('nothing to move');
  if (a === b && from.slot === to.slot) return;
  // Each stack has to fit where it ends up (within one hold, nothing changes).
  const ha = ship.holds[from.hold], hb = ship.holds[to.hold];
  if (ha !== hb) {
    if (!fits(hb, src.good)) throw new Error(misfit(hb, src.good));
    const merging = dst && dst.good === src.good && dst.quest === src.quest;
    if (dst && !merging && !fits(ha, dst.good)) throw new Error(misfit(ha, dst.good));
  }

  if (dst && dst.good === src.good && dst.quest === src.quest) {
    const n = Math.min(src.qty, GOODS[src.good].stack - dst.qty);
    dst.qty += n;
    src.qty -= n;
    if (src.qty === 0) a[from.slot] = null;
  } else {
    a[from.slot] = dst;
    b[to.slot] = src;
  }
}

// Split qty off a stack into the first empty slot of the same hold.
export function splitStack(ship, at, qty) {
  const slots = ship.holds[at?.hold]?.slots;
  const src = slots?.[at.slot];
  if (!src) throw new Error('nothing to split');
  if (!Number.isInteger(qty) || qty < 1 || qty >= src.qty) throw new Error('bad quantity');
  const free = slots.indexOf(null);
  if (free === -1) throw new Error('no empty slot in this hold');
  src.qty -= qty;
  slots[free] = { ...src, qty };
}

// `quest`: only consigned cargo for that quest (undefined: your own cargo).
const same = (st, good, quest) => st?.good === good && st.quest === quest;
const count = (ship, good, quest) =>
  ship.holds.flatMap((h) => h.slots).reduce((n, st) => n + (same(st, good, quest) ? st.qty : 0), 0);

// Fill partial stacks of the good first, then empty slots, holds in order.
function add(ship, good, qty, quest) {
  const { stack } = GOODS[good];
  const holds = ship.holds.filter((h) => fits(h, good));
  if (!holds.length) throw new Error(GOODS[good].needs ? misfit(null, good) : 'no hold for it');
  for (const hold of holds) {
    hold.slots.forEach((st) => {
      if (qty && same(st, good, quest) && st.qty < stack) {
        const n = Math.min(qty, stack - st.qty);
        st.qty += n;
        qty -= n;
      }
    });
  }
  for (const hold of holds) {
    hold.slots.forEach((st, i) => {
      if (qty && !st) {
        const n = Math.min(qty, stack);
        hold.slots[i] = quest == null ? { good, qty: n } : { good, qty: n, quest };
        qty -= n;
      }
    });
  }
  if (qty) throw new Error(`not enough hold space for ${GOODS[good].name}`);
}

// Take from the smallest stacks first, so selling tidies the hold.
function remove(ship, good, qty) {
  if (count(ship, good) < qty) throw new Error(`you don't have ${qty} ${GOODS[good].name}`);
  const stacks = ship.holds.flatMap((h) => h.slots.map((st, i) => ({ h, i, st }))).filter((x) => same(x.st, good));
  stacks.sort((a, b) => a.st.qty - b.st.qty);
  for (const { h, i, st } of stacks) {
    const n = Math.min(qty, st.qty);
    st.qty -= n;
    qty -= n;
    if (!st.qty) h.slots[i] = null;
  }
}

// orders: [{ good, qty }], qty > 0 buys, qty < 0 sells. All or nothing.
// Buying draws down the market's stock, selling adds to it.
// Sells run first so the space they free can take the buys.
// `price` gives a market entry's current price (see situations.js).
export function trade(ship, market, orders, price = (m) => m.price) {
  const next = structuredClone(ship);
  const stock = new Map(market.map((m) => [m.good, m.stock]));
  const sorted = [...orders].sort((a, b) => a.qty - b.qty);
  for (const { good, qty } of sorted) {
    const m = market.find((x) => x.good === good);
    if (!m) throw new Error(`this market doesn't trade ${good}`);
    if (!Number.isInteger(qty) || qty === 0) throw new Error('bad quantity');
    if (qty > stock.get(good)) throw new Error(`${GOODS[good].name}: only ${stock.get(good)} in stock`);
    stock.set(good, stock.get(good) - qty);
    if (good === 'fuel') {
      if (next.fuel + qty < 0) throw new Error(`you don't have ${-qty} Star Fuel`);
      const { fuelCap } = stats(ship);
      if (qty > 0 && next.fuel + qty > fuelCap) throw new Error(`your tanks hold ${fuelCap} Star Fuel`);
      next.fuel += qty;
    } else if (qty > 0) add(next, good, qty);
    else remove(next, good, -qty);
    next.credits -= qty * price(m);
  }
  if (next.credits < 0) throw new Error('not enough credits');
  Object.assign(ship, next);
  for (const m of market) m.stock = stock.get(m.good);
}

// Load consigned cargo for a quest. All or nothing.
export function loadCargo(ship, good, qty, quest) {
  const next = structuredClone(ship);
  add(next, good, qty, quest);
  Object.assign(ship, next);
}

// Unload all of a quest's consigned cargo.
export function dropCargo(ship, quest) {
  for (const h of ship.holds) h.slots = h.slots.map((st) => (st?.quest === quest ? null : st));
}

// How much of a good is in the hold (your own, not consigned).
export const holding = (ship, good) => count(ship, good);

// Hand over `qty` of a good from the hold (your own, not consigned). All or nothing.
export function takeGoods(ship, good, qty) {
  const next = structuredClone(ship);
  remove(next, good, qty);
  Object.assign(ship, next);
}
