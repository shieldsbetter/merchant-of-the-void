// Goods catalog. stack = max units per slot; base = typical price in credits;
// needs = the hold tag it must be stored under (see ship.js's fits);
// plural = the name takes plural grammar ("Spices are").
export const GOODS = {
  grain:       { name: 'Grain',       stack: 50, base: 8 },
  ore:         { name: 'Iron Ore',    stack: 20, base: 15 },
  medicine:    { name: 'Medicine',    stack: 10, base: 90, needs: 'refrigerated' },
  fish:        { name: 'Frozen Fish', stack: 30, base: 20, needs: 'refrigerated' },
  colonists:   { name: 'Colonists',   stack: 5,  base: 150, plural: true, needs: 'habitable' },
  machinery:   { name: 'Machinery',   stack: 4,  base: 300 },
  textiles:    { name: 'Textiles',    stack: 25, base: 30, plural: true },
  electronics: { name: 'Electronics', stack: 10, base: 120, plural: true },
  water:       { name: 'Water',       stack: 40, base: 5 },
  spices:      { name: 'Spices',      stack: 15, base: 60, plural: true },
  // Not cargo: buying/selling it changes ship.fuel instead of the holds.
  fuel:        { name: 'Star Fuel',   stack: null, base: 12 },

  // Ship upgrade modules (see modules.js): carried in the hold, installed in
  // the ship's expansion slots. `adds` are added to the ship's base combat
  // stats (hull, crits, dmgLo, dmgHi, crit, maneuver), fuel capacity
  // (fuelCap), slot count (slots) and hold space (mainHold, coldStore,
  // passengers: slots in each hold; see modules.js); `effects` multiply, like trait effects (fuel = hop cost).
  // `unique`: only one can be installed. `tier` (1-3): the ship yards that
  // sell it (see shipyard.js). Not sold at markets.
  armor:     { name: 'Armor Plating',      stack: 1, base: 900, module: { tier: 1, desc: '+40 hull · −2 maneuverability', adds: { hull: 40, maneuver: -2 } } },
  backup:    { name: 'Backup Core',        stack: 1, base: 2500, module: { tier: 3, unique: true, desc: '+1 critical system · −10 hull', adds: { crits: 1, hull: -10 } } },
  expansion: { name: 'Hull Expansion',     stack: 1, base: 3000, module: { tier: 3, unique: true, desc: '+2 slots (net +1)', adds: { slots: 2 } } },
  overcharge:{ name: 'Overcharged Cannons', stack: 1, base: 1200, module: { tier: 2, desc: '+3 max damage · hops ×1.15', adds: { dmgHi: 3 }, effects: { fuel: 1.15 } } },
  stabilizer:{ name: 'Gun Stabilizers',    stack: 1, base: 1100, module: { tier: 1, desc: '+2 min damage · −1 maneuverability', adds: { dmgLo: 2, maneuver: -1 } } },
  targeting: { name: 'Targeting Computer', stack: 1, base: 1500, module: { tier: 2, desc: '+1% crit chance · −1 max damage', adds: { crit: 0.01, dmgHi: -1 } } },
  thrusters: { name: 'Vectored Thrusters', stack: 1, base: 1000, module: { tier: 1, desc: '+4 maneuverability · −20 hull', adds: { maneuver: 4, hull: -20 } } },
  tanks:     { name: 'Auxiliary Tanks',    stack: 1, base: 800, module: { tier: 1, desc: '+10 fuel capacity · −1 maneuverability', adds: { fuelCap: 10, maneuver: -1 } } },
  pods:      { name: 'Cargo Pods',         stack: 1, base: 700, module: { tier: 1, desc: '+3 main hold slots', adds: { mainHold: 3 } } },
  freezer:   { name: 'Freezer Module',     stack: 1, base: 1400, module: { tier: 2, unique: true, desc: 'A 5-slot Cold Store', adds: { coldStore: 5 } } },
  cabin:     { name: 'Passenger Cabin',    stack: 1, base: 600, module: { tier: 1, desc: '+1 Passenger Deck slot', adds: { passengers: 1 } } },
  drive:     { name: 'Efficient Drive',    stack: 1, base: 1300, module: { tier: 2, unique: true, desc: 'Hops ×0.75 · −10 hull', adds: { hull: -10 }, effects: { fuel: 0.75 } } }
};

// Parcels: one-of-a-kind things to deliver (a contact's courier job, a
// faction's contract), never bought or sold. `qty`: how many a job is, [lo,
// hi] (most, just the one); `from`: who sends them: anyone (a contact), or a
// faction of that type (see faction-types.js).
const PARCELS = {
  letters:    { name: 'Box of Letters', stack: 1 },
  deed:       { name: 'Notarized Deed', stack: 1 },
  instrument: { name: 'Hand-Crafted Instrument', stack: 1 },
  art:        { name: 'Exotic Artwork', stack: 1 },
  wardrobe:   { name: 'Antique Wardrobe', stack: 1 },
  apparatus:  { name: 'Custom Apparatus', stack: 1 },
  rifle:      { name: 'Antique Laser Rifle', stack: 1 },
  vaccine:    { name: 'Prototype Vaccine', stack: 1, needs: 'refrigerated' },
  heirloom:   { name: 'Family Heirloom', stack: 1 },
  cake:       { name: 'Wedding Cake', stack: 1, needs: 'refrigerated' },
  hound:      { name: 'Prize Racing Hound', stack: 1, needs: 'habitable' },
  urn:        { name: 'Funeral Urn', stack: 1 },
  wine:       { name: 'Case of Vintage Wine', stack: 1 },
  telescope:  { name: 'Brass Telescope', stack: 1 },
  megafauna:  { name: 'Taxidermied Megafauna', stack: 1 },
  perfume:    { name: 'Exotic Perfume', stack: 1 },
  remains:    { name: 'Unearthed Remains', plural: true, stack: 1 },
  fresco:     { name: 'Ancient Fresco', stack: 1 },
  letter:     { name: 'Handwritten Letter', stack: 1 },
  books:      { name: 'Old Books', plural: true, stack: 1 },
  fabric:     { name: 'Custom Fabric', plural: true, stack: 1 },
  pilgrims:   { name: 'Pilgrims', plural: true, stack: 5, qty: [3, 8], needs: 'habitable', from: 'theocracy' },
  relic:      { name: 'Holy Relic', stack: 1, from: 'theocracy' },
  scripture:  { name: 'Illuminated Scripture', stack: 1, from: 'theocracy' },
  artifact:   { name: 'Blessed Artifact', stack: 1, from: 'theocracy' },
  contracts:  { name: 'Sealed Contracts', plural: true, stack: 1, from: 'mercantile' },
  gems:       { name: 'Gemstone Samples', plural: true, stack: 1, from: 'mercantile' },
  delegates:  { name: 'Trade Delegates', plural: true, stack: 5, qty: [2, 4], needs: 'habitable', from: 'mercantile' },
  crates:     { name: 'Unmarked Crates', plural: true, stack: 1, qty: [2, 4], from: 'anarchist' },
  papers:     { name: 'Forged Papers', plural: true, stack: 1, from: 'anarchist' },
  package:    { name: "Package (Don't Ask)", stack: 1, from: 'anarchist' },
  cores:      { name: 'Sealed Data Cores', plural: true, stack: 10, qty: [3, 8], from: 'technocratic' },
  ledgers:    { name: 'Census Ledgers', plural: true, stack: 1, from: 'technocratic' },
  pouch:      { name: 'Diplomatic Pouch', stack: 1, from: 'technocratic' },
  reactor:    { name: 'Prototype Reactor Core', stack: 1, from: 'technologist' },
  specimens:  { name: 'Lab Specimens', plural: true, stack: 5, qty: [2, 5], needs: 'refrigerated', from: 'technologist' },
  ai:         { name: 'Experimental AI Core', stack: 1, from: 'technologist' },
  bacteria:   { name: 'Bacterial Samples', plural: true, stack: 1, needs: 'refrigerated', from: 'technologist' }
};
for (const [k, p] of Object.entries(PARCELS)) GOODS[k] = { ...p, base: 0, parcel: true, qty: p.qty ?? [1, 1], from: p.from ?? 'anyone' };

// What markets deal in: everything but fuel, modules and parcels.
export const MODULES = Object.keys(GOODS).filter((g) => GOODS[g].module);
export const CARGO = Object.keys(GOODS).filter((g) => g !== 'fuel' && !GOODS[g].module && !GOODS[g].parcel);

// A parcel sent by `from` (see PARCELS), and how many: { good, qty }.
export function parcel(from = 'anyone') {
  const ks = Object.keys(GOODS).filter((g) => GOODS[g].parcel && GOODS[g].from === from);
  const good = ks[Math.floor(Math.random() * ks.length)];
  const [lo, hi] = GOODS[good].qty;
  return { good, qty: lo + Math.floor(Math.random() * (hi - lo + 1)) };
}

// `qty` of a good, in words: "an Antique Laser Rifle", "Sealed Contracts",
// "4 Pilgrims", "12 Grain".
export function amountOf(good, qty) {
  const { name, plural, parcel } = GOODS[good];
  if (qty !== 1 || !parcel) return `${qty} ${name}`;
  return plural ? name : `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`;
}

// What jobs pay per unit of fuel a job's route takes (before any bonus):
// its own rate, so fuel's price can change without changing what jobs pay.
export const PAY_PER_FUEL = 25;
// Cycles a delivery job allows on top of its route's fuel times its slack.
export const GRACE = 4;
// A delivery job's pay multiplier for cargo that needs a special hold
// (refrigerated, habitable): you have to have the space.
export const payFor = (good) => (GOODS[good].needs ? 1.5 : 1);

// Fuel to travel along an edge: linear in distance.
export const fuelCost = (a, b) => Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 100);
