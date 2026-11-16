// Repairs, at a ship yard: choose how much hull, and how many critical
// systems, to restore. Time and cost are each a straight rate per point,
// and the time's spent ashore: the crew take shore leave meanwhile (see
// crew.js's ashore), at no less than shore leave's price per cycle. A
// Limping new ship (75 hull down) is 1,200 cr and 4 cycles. Repaired in
// full, the ship's no longer Limping.
import { stats } from './modules.js';
import { ashore } from './crew.js';
import { PLAYER } from './player.js';

export const RATES = { hull: { cycles: 0.05, cost: 16 }, crit: { cycles: 0.5, cost: 160 } }; // per point

// What restoring `hull` points and `crits` critical systems takes.
export const quote = (hull, crits) => ({
  cycles: Math.ceil(hull * RATES.hull.cycles + crits * RATES.crit.cycles - 1e-9),
  cost: hull * RATES.hull.cost + crits * RATES.crit.cost
});

// What the widget needs: the damage, and the rates (it quotes as you choose).
function refresh({ ship }, top) {
  const { maxHull, maxCrits } = stats(ship);
  const c = ship.combat;
  Object.assign(top, { hull: maxHull - c.wear, maxHull, crits: maxCrits - c.lostCrits, maxCrits, wear: c.wear, lostCrits: c.lostCrits, rates: RATES });
}

export const repair = {
  open(visit, world, top) {
    refresh(world, top);
    visit.feed.push({
      kind: 'npc',
      who: 'Yardmaster',
      text: top.wear || top.lostCrits ? 'She’s seen some action. Tell me how much you want fixed.' : 'Not a scratch on her. Nothing for me to do.'
    });
  },
  act(visit, world, body) {
    const top = visit.stack.at(-1);
    if (body.action === 'back') return 'pop';
    if (body.action !== 'accept') throw new Error('unknown action');
    const { ship } = world;
    const hull = Number(body.hull), crits = Number(body.crits);
    const c = ship.combat;
    if (![hull, crits].every(Number.isInteger) || hull < 0 || crits < 0 || hull > c.wear || crits > c.lostCrits) throw new Error("that's not what needs fixing");
    if (!hull && !crits) throw new Error('nothing to repair');
    const q = quote(hull, crits);
    if (ship.credits < q.cost) throw new Error(`that's ${q.cost.toLocaleString()} cr; you have ${ship.credits.toLocaleString()} cr`);
    ship.credits -= q.cost;
    visit.feed.push({ kind: 'you', text: 'Fix her up.' });
    visit.feed.push({ kind: 'event', text: `−${q.cost.toLocaleString()} cr. Balance ${ship.credits.toLocaleString()} cr.` });
    // (Off the stack first: anything the time brings goes on top of the menu.)
    visit.stack.splice(visit.stack.indexOf(top), 1);
    world.emit(`/players/${PLAYER}/shoreleave/${world.node.id}`, visit);
    const { gained, lines } = ashore(world, q.cycles);
    c.wear -= hull;
    c.lostCrits -= crits;
    refresh(world, top);
    const healed = !c.wear && !c.lostCrits && ship.traits.some((t) => t.kind === 'limping');
    if (healed) ship.traits = ship.traits.filter((t) => t.kind !== 'limping');
    const s = q.cycles === 1 ? '' : 's';
    visit.feed.push({
      kind: 'event',
      text: `${q.cycles} cycle${s} later, the yard's done: hull ${top.hull}/${top.maxHull}, critical systems ${'◆'.repeat(top.crits)}${'◇'.repeat(top.maxCrits - top.crits)}.${healed ? ' Your ship is no longer Limping.' : ''}`
    });
    visit.feed.push({ kind: 'event', text: `Meanwhile, the crew took shore leave. ${gained ? `Crew morale +${gained}.` : 'They were bored of this place.'}` });
    visit.feed.push(...lines);
  }
};
