// Ship yards (a system trait; see universe.js): buy modules from the yard's
// stock (node.yard), or sell any module from the hold for 60% of its base
// price, after which the yard has it for sale.
import { GOODS, MODULES } from './goods.js';
import { loadCargo } from './ship.js';
import { planetRef } from './refs.js';

const SELL = 0.6; // of a module's base price
const RESELL = 1.1; // what the yard then asks for it

export const yardTier = (node) => node.traits?.find((t) => t.kind === 'shipyard')?.tier ?? 0;
const sellPrice = (good) => Math.round(GOODS[good].base * SELL);

// What the widget needs, refreshed after every action.
function refresh({ node }, top) {
  top.stock = node.yard.map((s) => ({ ...s }));
  top.buys = Object.fromEntries(MODULES.map((g) => [g, sellPrice(g)]));
}

export const shipyard = {
  open(visit, world, top) {
    top.tier = yardTier(world.node);
    visit.feed.push({ kind: 'event', text: `You walk the gantries of ${planetRef(world.node)}'s tier ${top.tier} ship yard.` });
    visit.feed.push({ kind: 'npc', who: 'Yardmaster', text: "See anything you like? I'll take any module off your hands, too." });
    refresh(world, top);
  },
  act(visit, world, body) {
    const top = visit.stack.at(-1);
    const { ship, node } = world;
    const event = (text) => visit.feed.push({ kind: 'event', text });
    if (body.action === 'buy') {
      const s = node.yard[Number(body.index)];
      if (!s) throw new Error('no such module');
      if (ship.credits < s.price) throw new Error(`you have ${ship.credits.toLocaleString()} cr`);
      loadCargo(ship, s.good, 1); // throws if the hold is full
      ship.credits -= s.price;
      if (!--s.qty) node.yard.splice(node.yard.indexOf(s), 1);
      visit.feed.push({ kind: 'you', text: `I'll take the ${GOODS[s.good].name}.` });
      event(`−${s.price.toLocaleString()} cr. Balance ${ship.credits.toLocaleString()} cr.`);
    } else if (body.action === 'sell') {
      const hold = ship.holds[Number(body.hold)];
      const st = hold?.slots[Number(body.slot)];
      if (!st || !GOODS[st.good].module || st.quest) throw new Error("that's not a module");
      const price = sellPrice(st.good);
      hold.slots[Number(body.slot)] = null; // modules stack one to a slot
      ship.credits += price;
      const s = node.yard.find((s) => s.good === st.good);
      if (s) s.qty++;
      else node.yard.push({ good: st.good, qty: 1, price: Math.round(GOODS[st.good].base * RESELL) });
      visit.feed.push({ kind: 'you', text: `What'll you give me for this ${GOODS[st.good].name}?` });
      event(`+${price.toLocaleString()} cr. Balance ${ship.credits.toLocaleString()} cr.`);
    } else if (body.action === 'back') {
      return 'pop';
    } else throw new Error('unknown action');
    world.pulse = true; // a sale: a heartbeat
    refresh(world, top);
  }
};
