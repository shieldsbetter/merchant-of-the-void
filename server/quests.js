// Quests: things you've taken on. Each is plain data: an id, its text, and
// event subscriptions (see events.js) that drive it.
// quest: { id, text, planet, subscriptions: [{ pattern, actions: [...] }], ...details }
// planet: the system it ties you to (shown on the map).

// Ids are numbers, unless the quest brings its own (plots and what they
// spawn use strings built from their ids; see plots.js).
export function addQuest(quests, quest) {
    quest.id ??=
        Math.max(
            0,
            ...quests.map((q) => q.id).filter((id) => typeof id === 'number'),
        ) + 1;
    quests.push(quest);
    return quest;
}

// Also ends ship traits: anything with an id in a list.
export function endQuest(quests, id) {
    const i = quests.findIndex((q) => q.id === id);
    if (i >= 0) quests.splice(i, 1);
}

// Archiving only hides a quest in the journal; it stays active (and its
// subscriptions keep firing) until it ends.
export function setQuestArchived(quests, id, cycle) {
    const q = quests.find((q) => String(q.id) === String(id));
    if (!q) throw new Error('no such quest');
    q.archived = cycle;
}

export const publicQuests = (quests, cycle) =>
    quests.map((q) => ({
        id: q.id,
        text: q.text,
        planets: planetsOf(q),
        danger: q.danger ?? null,
        archivedAgo: q.archived == null ? null : cycle - q.archived,
    }));

// A quest's systems: its own `planets` (a quest with several places to go),
// or its `planet`, or (quests from before that was recorded) the planet a
// arrival subscription of its names.
function planetsOf(q) {
    if (q.planets) return q.planets;
    if (q.planet != null) return [q.planet];
    for (const s of q.subscriptions) {
        const m = s.pattern.match(/\/arrive\/(\d+)$/);
        if (m) return [Number(m[1])];
    }
    return [];
}
