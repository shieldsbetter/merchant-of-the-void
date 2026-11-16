// References in text the client shows: a system, or a person, by id, with
// the name to show: [[planet:12|Anan]], [[person:3|Pell Brandt]]. The
// client makes a system a link to it, and marks a person by who they are
// (the navigator's compass; see client/src/refs.js), never by matching
// names. Only text shown as rich text carries them: the feed's lines, quest
// and rumor text. Button labels, errors and the like stay plain. And
// ~~text~~ is struck through (say, a place on a quest you've been to).
export const planetRef = (node) => `[[planet:${node.id}|${node.name}]]`;
// (A person from before people, with only a name, is just the name.)
export const personRef = (p) =>
    p?.id != null ? `[[person:${p.id}|${p.name}]]` : (p?.name ?? 'Someone');

// A person saying something, in the feed: their name, and who they are.
export const says = (p, text) => ({
    kind: 'npc',
    who: p.name,
    person: p.id,
    text,
});
