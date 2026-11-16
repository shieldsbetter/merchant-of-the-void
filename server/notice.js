import { says } from './refs.js';

// A notice: a crew member tells you something (usually that a quest failed),
// and you have one reply. Entry: { kind: 'notice', says, reply, after }, where
// `after` is an optional feed event once you've replied.
export const notice = {
  // Who says it: `crew` (an id), or `who` (a name, from before ids), or
  // anyone aboard.
  open(visit, { crew }, top) {
    const m = crew.find((c) => c.id === top.crew) ?? (top.who && crew.find((c) => c.name === top.who)) ?? crew[Math.floor(Math.random() * crew.length)];
    Object.assign(top, { who: m?.name ?? top.who, crew: m?.id });
    visit.feed.push(m ? says(m, top.says) : { kind: 'npc', who: top.who, text: top.says });
  },
  act(visit, world, body) {
    if (body.action !== 'ok') throw new Error('unknown action');
    const top = visit.stack.at(-1);
    visit.feed.push({ kind: 'you', text: top.reply });
    if (top.after) visit.feed.push({ kind: 'event', text: top.after });
    return 'pop';
  }
};
