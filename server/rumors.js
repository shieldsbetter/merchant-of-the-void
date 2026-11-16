// Rumors the crew have heard (never the same one twice; see visit.js).
// Archiving hides one; an archived rumor is deleted for good 100 cycles after
// it was archived.
// rumor: { id, text, gist, heard: cycle, archived: cycle | null }, where
// gist is a short way to refer to it ("the glut of water on Anan").
const EXPIRES = 100; // cycles after archiving

export function hear(rumors, text, cycle, gist) {
    rumors.push({
        id: Math.max(0, ...rumors.map((r) => r.id)) + 1,
        text,
        gist,
        heard: cycle,
        archived: null,
    });
}

export const prune = (rumors, cycle) =>
    rumors.filter((r) => r.archived == null || cycle - r.archived < EXPIRES);

export function setArchived(rumors, id, cycle) {
    const r = rumors.find((r) => String(r.id) === String(id));
    if (!r) throw new Error('no such rumor');
    r.archived = cycle;
}

// For the client: ages in cycles rather than absolute cycles.
export const publicRumors = (rumors, cycle) =>
    rumors.map((r) => ({
        id: r.id,
        text: r.text,
        ago: cycle - r.heard,
        archivedAgo: r.archived == null ? null : cycle - r.archived,
    }));
