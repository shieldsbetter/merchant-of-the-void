// Situations: ongoing events centred on one system that push the price of one
// good up or down. The effect fades with hops from the centre, and each
// situation ends on its own after a set number of cycles. Secret for now;
// rumors will let the player learn about them.
import { GOODS } from './goods.js';
import { say } from './grammar.js';
import { planetRef } from './refs.js';

// Why a good gets scarce (price up) or plentiful (price down).
const CAUSES = {
  grain:       { up: 'A blight in the hydroponic vats', down: 'A bumper harvest' },
  ore:         { up: 'A cave-in at the main mine', down: 'The discovery of a rich new vein' },
  medicine:    { up: 'A spreading fever', down: 'A new pharmaceutical plant' },
  fish:        { up: 'A parasitic algae', down: 'A record spawning season' },
  colonists:   { up: 'A frontier land rush', down: 'A wave of refugees' },
  machinery:   { up: 'A construction boom', down: 'The closure of the shipyards' },
  textiles:    { up: 'A fashion craze', down: 'A glut of synthetic silk' },
  electronics: { up: 'A solar flare frying circuit boards', down: 'A smuggling ring dumping contraband' },
  water:       { up: 'A failing ice-hauler fleet', down: 'A comet captured in orbit' },
  spices:      { up: 'A royal wedding', down: 'A collapse of the spice cartel' }
};

// Strength levels: the price multiplier at the centre, and how to say it.
// Templates (see grammar.js) agree with the good: {{Cause}}/{{cause}},
// {{good}}, {{planet}}.
const LEVELS = {
  up: [
    { factor: 1.3, text: '{{Cause}} is causing the price of {{good}} on {{planet}} to rise.' },
    { factor: 1.7, text: '{{Cause}} has sent the price of {{good}} on {{planet}} soaring.' },
    { factor: 2.5, text: '{{good}} {{#number}}is|are{{/number}} fetching extravagant prices on {{planet}}, thanks to {{cause}}.' }
  ],
  down: [
    { factor: 0.75, text: '{{Cause}} has the price of {{good}} on {{planet}} dipping.' },
    { factor: 0.55, text: '{{Cause}} has caused the price of {{good}} on {{planet}} to slump.' },
    { factor: 0.35, text: '{{good}} {{#number}}is|are{{/number}} going for next to nothing on {{planet}} after {{cause}}.' }
  ]
};

const SPAWN_CHANCE = 0.1; // per cycle
const REACH = 3; // hops beyond the centre that still feel it
const LASTS = [10, 30]; // how long a situation lasts, in hops' worth of cycles

// Hops from `from` to every system within REACH.
function hopsFrom(universe, from) {
  const hops = { [from]: 0 };
  let edge = [from];
  for (let d = 1; d <= REACH; d++) {
    const next = [];
    for (const [a, b] of universe.edges)
      for (const [x, y] of [[a, b], [b, a]])
        if (edge.includes(x) && !(y in hops)) (hops[y] = d), next.push(y);
    edge = next;
  }
  return hops;
}

function makeSituation(universe, cycle, cyclesPerHop, r) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const good = pick(Object.keys(CAUSES));
  const center = pick(universe.nodes.filter((n) => n.market.some((m) => m.good === good)));
  const way = r() < 0.5 ? 'up' : 'down';
  const { factor, text } = pick(LEVELS[way]);
  const hops = LASTS[0] + r() * (LASTS[1] - LASTS[0]);
  return {
    good,
    center: center.id,
    factor,
    end: cycle + Math.round(hops * cyclesPerHop),
    reach: hopsFrom(universe, center.id),
    text: say(
      text,
      { Cause: CAUSES[good][way], cause: CAUSES[good][way][0].toLowerCase() + CAUSES[good][way].slice(1), good: GOODS[good].name, planet: planetRef(center) },
      GOODS[good].plural
    )
  };
}

// Time passes: drop situations that have ended, maybe start new ones.
export function tick(situations, universe, cycle, elapsed, cyclesPerHop, r = Math.random) {
  const live = situations.filter((s) => s.end > cycle);
  for (let i = 0; i < elapsed; i++) if (r() < SPAWN_CHANCE) live.push(makeSituation(universe, cycle, cyclesPerHop, r));
  return live;
}

// A new universe starts mid-history: run the clock up to cycle 0 from long
// enough ago that the oldest possible situation would have ended.
export function seed(universe, cyclesPerHop, r = Math.random) {
  let situations = [];
  for (let c = -Math.ceil(LASTS[1] * cyclesPerHop); c < 0; c++) situations = tick(situations, universe, c + 1, 1, cyclesPerHop, r);
  return situations;
}

// A short way to refer to a situation: "the shortage of water on Anan".
export const gist = (s, universe) =>
  `the ${s.factor > 1 ? 'shortage' : 'glut'} of ${GOODS[s.good].name.toLowerCase()} on ${planetRef(universe.nodes[s.center])}`;

// A market's price after situations: each multiplies it, its effect halving
// (in log terms) with every hop from its centre.
export const priceOf = (situations, node) => (m) =>
  Math.max(
    1,
    Math.round(
      situations
        .filter((s) => s.good === m.good && node.id in s.reach)
        .reduce((p, s) => p * s.factor ** (0.5 ** s.reach[node.id]), m.price)
    )
  );
