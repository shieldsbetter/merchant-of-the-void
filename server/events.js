// Events: things that happen, named by a path like '/players/1/arrive/12'.
// Active quests and ship traits subscribe with router-style patterns and a list of actions to
// run when a matching event fires. A pattern segment is literal, ':name'
// (matches any one segment and captures it as params.name), or '**' (any
// number of segments, not captured). Actions get the captured params.
// Subscriptions and actions are plain data so they save with the game.
//
// Events so far:
//   /players/:playerId/arrive/:systemId   you arrived in a system (a hop, or
//     a new game's first system)
//   /cycles/:n/start                    the clock reached cycle n
//   /players/:playerId/hop/:from/:to    you set off from one planet to another
//   /players/:playerId/heartbeat/:systemId   you did something on a planet:
//     finished with a contact, traded, bought or sold a module, tried to depart
//   /players/:playerId/contacts/:contactId/talk   you started talking to a contact
// Actions so far (a quest may list several, run in order; any may have a
// `chance` of happening, 0 to 1):
//   { type: 'push', conversation: { kind, ... } }   onto the visit's stack now,
//     tagged with whoever pushed it and the event's params
//     ({ quest: id, params } or { trait: id, params })
//   { type: 'defer', conversation }   like push, but at the next chance to
//     talk: for now, the next time you arrive somewhere
//   { type: 'end', outcome? }   the quest (or trait) is over; with an outcome
//     ('complete', 'failed') and in a system, the feed says so
//   { type: 'addShipTrait', trait }   the ship gains a trait (see traits.js)
//   { type: 'dropCargo' }   unload the quest's consigned cargo
//   { type: 'step', quest, step, arg }   run a step of a plot (see plots.js)
//   { type: 'startPlot', plot, crew }   start a plot (a crew trait's, say)
//   /players/:playerId/shoreleave/:systemId   you took shore leave there
//   /quests/:id/:outcome, /fights/:id/won|lost   a quest or fight finished
// (Events are listed above; these last two lines are events too.)
import { interject } from './visit.js';
import { endQuest } from './quests.js';
import { addShipTrait } from './traits.js';
import { dropCargo } from './ship.js';
import { runStep, startPlot } from './plots.js';

// The params captured by matching `path` against `pattern`, or null if it
// doesn't match.
export function match(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  const go = (i, j, params) => {
    if (i === p.length) return j === s.length ? params : null;
    if (p[i] === '**') return go(i + 1, j, params) ?? (j < s.length ? go(i, j + 1, params) : null);
    if (j === s.length) return null;
    if (p[i].startsWith(':')) return go(i + 1, j + 1, { ...params, [p[i].slice(1)]: s[j] });
    return p[i] === s[j] ? go(i + 1, j + 1, params) : null;
  };
  return go(0, 0, {});
}

// Who can listen: name -> the list they live in. (Crew traits live on each
// crew member; the list is gathered from them.)
const listeners = (world) => ({
  quest: world.quests,
  trait: world.ship.traits,
  crewTrait: world.crew.flatMap((c) => c.traits.filter((t) => t.subscriptions))
});

// `by`: { group, owner }, the quest or trait whose subscription fired.
const entry = (action, { group, owner }, params) => ({ ...structuredClone(action.conversation), [group]: owner.id, params });

const ACTIONS = {
  push: (action, by, params, { visit, world }) => interject(visit, world, entry(action, by, params)),
  defer: (action, by, params, { world }) => world.deferred.push(entry(action, by, params)),
  end: (action, { group, owner }, params, { visit, world }) => {
    if (group === 'crewTrait') for (const c of world.crew) c.traits = c.traits.filter((t) => t !== owner);
    else endQuest(listeners(world)[group], owner.id);
    if (action.outcome && visit) visit.feed.push({ kind: 'event', text: `Quest ${action.outcome}: ${owner.text}` });
    if (group === 'quest') emit(`/quests/${owner.id}/${action.outcome ?? 'ended'}`, { visit, world });
  },
  // A step gets its subscription's arg, or else the event's params.
  step: (action, by, params, { visit, world }) => runStep(world, visit, action.quest, action.step, action.arg ?? params),
  startPlot: (action, by, params, { visit, world }) => startPlot(world, visit, action.plot, { ...params, crew: action.crew }),
  addShipTrait: (action, by, params, { world }) => addShipTrait(world.ship, structuredClone(action.trait)),
  dropCargo: (action, { owner }, params, { world }) => dropCargo(world.ship, owner.id)
};

// Run `actions` as `by` ({ group, owner }) would on an event: what a quest's
// way back into its business (its `engage` entries; see visit.js) does.
export function perform(actions, by, params, ctx) {
  for (const action of actions) ACTIONS[action.type](action, by, params, ctx);
}

// Push the conversations deferred until you next arrive.
export function undefer(visit, world) {
  for (const e of world.deferred.splice(0)) interject(visit, world, e);
}

// Run every action subscribed to `path`. `ctx`: { visit, world } (visit is
// null between systems, mid-hop).
export function emit(path, ctx) {
  for (const [group, list] of Object.entries(listeners(ctx.world)))
    for (const owner of [...list])
      for (const sub of owner.subscriptions ?? []) {
        const params = match(sub.pattern, path);
        if (!params) continue;
        for (const action of sub.actions)
          if (action.chance == null || Math.random() < action.chance) ACTIONS[action.type](action, { group, owner }, params, ctx);
      }
}
