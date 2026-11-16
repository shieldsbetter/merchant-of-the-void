// Plots: quests that tell a story in stages. A plot is an ordinary quest
// with three more things: `plot` (which template drives it, see PLOTS),
// `config` (its names, systems and prices, chosen when it starts) and
// `stage`. Its subscriptions run named steps of the template ({ type: 'step',
// quest, step, arg }), so a save holds only names and data, never code.
//
// What a plot makes gets an id built from its own: sub-quests
// `<plot id>_<key>`, fights `fight_<plot id>_<key>`. Those fire events when
// they finish (`/quests/<id>/<outcome>`, `/fights/<id>/won|lost`) that the
// plot can listen for.
//
// Scenes are the plot's conversations: lines, then options that run steps.
// Plots also start from traits: the director (below) seeds one on a crew
// member, and it starts its plot on the next dock.

import { emit } from './events.js';
import { MISSIONS } from './missions.js';
import { newPerson, personOf, nameOf } from './people.js';
import { PLAYER } from './player.js';
import { factionJob } from './plots/faction-job.js';
import { missingChild } from './plots/missing-child.js';
import { vendetta } from './plots/vendetta.js';
import { addQuest } from './quests.js';
import { planetRef, personRef, says } from './refs.js';

// Every plot template. `tags` describe them: 'drama' (the director's to
// start), 'tutorial' (a clear first thing to do, good for a game's first
// drama), 'job' (a faction's job, taken at its office), 'mission' (a
// contact's; see missions.js).
const PLOTS = { missingChild, vendetta, factionJob, ...MISSIONS };

const find = (world, id) => world.quests.find((q) => q.id === id);

// What a step can do, for the plot `q` (in `world`, docked at `visit` or not).
function context(q, world, visit) {
    const plot = PLOTS[q.plot];
    const ctx = {
        q,
        world,
        visit,
        config: q.config,
        // The crew member it's about: by id (by name, for plots from before ids;
        // or held captive, off the crew).
        crew: () =>
            world.crew.find((c) => c.id === q.config.crewId) ??
            world.crew.find((c) => c.name === q.config.crew) ??
            q.config.captive ??
            undefined,
        // Them, in text (see refs.js).
        personRef: () => {
            const m = ctx.crew();
            return m?.id != null ? personRef(m) : q.config.crew;
        },
        // A system, in text.
        planetRef: (id) => planetRef(world.universe.nodes[id]),
        // Someone new (see people.js), for a plot's config to keep by id.
        newPerson: (opts) => newPerson(world.people, opts).id,
        // A person, by the id a config keeps (or, in plots from before people,
        // their name): them, their name, and them in text.
        person: (x) => personOf(world.people, x),
        name: (x) => nameOf(world.people, x),
        ref: (x) => personRef(personOf(world.people, x)),
        say: (who, text) => visit?.feed.push({ kind: 'npc', who, text }),
        event: (text) => visit?.feed.push({ kind: 'event', text }),
        // A scene now if docked, else when you next dock.
        scene: (name) => {
            const entry = { kind: 'scene', quest: q.id, scene: name };
            if (visit) world.push(visit, entry);
            else world.deferred.push(entry);
        },
        // Move to a stage: new journal text and map marker, fresh subscriptions
        // and ways back in.
        stage: (name, text, planet = null) =>
            Object.assign(q, {
                stage: name,
                text,
                planet,
                subscriptions: [],
                engage: [],
            }),
        listen: (pattern, step, arg) =>
            q.subscriptions.push({
                pattern,
                actions: [{ type: 'step', quest: q.id, step, arg }],
            }),
        onArrive: (planet, step, arg) =>
            ctx.listen(`/players/${PLAYER}/arrive/${planet}`, step, arg),
        // A way back into this from the root menu at `planet` (until the next
        // stage): `label` runs `step`. For a scene you can say "not now" to.
        engage: (planet, label, step, arg) =>
            (q.engage ??= []).push({
                planet,
                label,
                actions: [{ type: 'step', quest: q.id, step, arg }],
            }),
        // A sub-quest, with its own journal entry and map marker.
        quest: (key, text, planet, subscriptions = []) =>
            addQuest(world.quests, {
                id: `${q.id}_${key}`,
                parent: q.id,
                text,
                planet,
                subscriptions,
            }),
        // End a quest (this plot by default), and say so.
        end: (outcome, id = q.id) => {
            const sub = find(world, id);
            if (!sub) return;
            world.quests.splice(world.quests.indexOf(sub), 1);
            if (outcome !== 'dropped')
                ctx.event(`Quest ${outcome}: ${sub.text}`);
            emit(`/quests/${id}/${outcome}`, { visit, world });
        },
        // A firefight; its result fires `/fights/fight_<id>_<key>/won|lost`.
        // spec: { foes, start (the announcement), ready? (its button), won, lost,
        // vars?, prepared? }: lines are grammar.js templates, filled from vars;
        // prepared is how ready each side is ({ crew, enemy }, 0-1; see firefight.js).
        fight: (key, spec) => {
            const entry = {
                kind: 'firefight',
                setting: 'plot',
                fightId: `fight_${q.id}_${key}`,
                ...spec,
            };
            if (visit) world.push(visit, entry);
            else world.deferred.push(entry);
            return entry.fightId;
        },
    };
    // Steps can run other steps: p.steps.name(arg).
    ctx.steps = Object.fromEntries(
        Object.entries(plot.steps).map(([k, f]) => [k, (arg) => f(ctx, arg)]),
    );
    return ctx;
}

// Run step `name` of plot `id` (from an event subscription or a scene).
export function runStep(world, visit, id, name, arg) {
    const q = find(world, id);
    if (!q) return;
    PLOTS[q.plot].steps[name](context(q, world, visit), arg);
}

// Start plot `kind`: `params` from whatever started it (say, the dock).
export function startPlot(world, visit, kind, params) {
    const plot = PLOTS[kind];
    const n =
        1 +
        world.quests.filter((x) => String(x.id).startsWith('plot_')).length +
        Math.floor(Math.random() * 1e6);
    const q = addQuest(world.quests, {
        id: `plot_${n}`,
        plot: kind,
        stage: 'start',
        text: '',
        subscriptions: [],
        config: {},
    });
    try {
        q.config = plot.config(world, params);
        // Who it's about, by id (whatever their name; see refs.js).
        if (q.config.crew && q.config.crewId == null)
            q.config.crewId =
                params.crewId ??
                world.crew.find((c) => c.name === q.config.crew)?.id;
        plot.steps.start(context(q, world, visit));
    } catch (e) {
        world.quests.splice(world.quests.indexOf(q), 1); // it couldn't start: no quest
        throw e;
    }
    return q;
}

// Scenes: { kind: 'scene', quest, scene }. Lines when it opens, then the
// options; choosing one ends the scene and runs its step (if any).
export const scene = {
    blocking:
        "You're in the middle of something. See it through before you leave.",
    open(visit, world, top) {
        const q = find(world, top.quest);
        if (!q) return 'pop';
        const s = PLOTS[q.plot].scenes[top.scene](context(q, world, visit));
        // Who speaks: a person (or their id; or, in plots from before people,
        // their name), or no one (narration).
        for (const [who, text] of s.lines) {
            const p =
                typeof who === 'object' ? who : personOf(world.people, who);
            visit.feed.push(
                who == null
                    ? { kind: 'event', text }
                    : p?.id != null
                      ? says(p, text)
                      : { kind: 'npc', who: p?.name ?? who, text },
            );
        }
        top.options = s.options.map(({ label, note, when = true, step }) => ({
            label,
            note,
            enabled: !!when,
            step,
        }));
    },
    act(visit, world, body) {
        const top = visit.stack.at(-1);
        const o = top.options?.[Number(body.index)];
        if (body.action !== 'choose' || !o) throw new Error('unknown action');
        if (!o.enabled) throw new Error("you can't do that now");
        visit.feed.push({ kind: 'you', text: o.label });
        visit.stack.pop();
        if (o.step) runStep(world, visit, top.quest, o.step);
    },
};

// The director: keeps primary dramas going. Before cycle 15 it wants none;
// after, one. Short of that, it seeds a hidden trait on a crew member with
// no drama going, for a drama the game hasn't had (world.dramas: each is
// crossed off once seeded, so it's big and memorable, never repeated, even
// if that leaves the director short), which starts the plot at the next
// arrival (see traits as listeners in events.js). A game's first drama is
// always a 'tutorial' one.
const WANT = (cycle) => (cycle < 15 ? 0 : 1);
export function direct(world) {
    const traits = world.crew.flatMap((c) => c.traits);
    const drama = (k) => PLOTS[k].tags?.includes('drama');
    const active =
        world.quests.filter((q) => q.plot && !q.parent && drama(q.plot))
            .length + traits.filter((t) => t.kind === 'drama-seed').length;
    if (active >= WANT(world.cycle)) return;
    const first = !world.dramas.length;
    // Each drama happens once a game: one that's been seeded is crossed off.
    const kinds = Object.keys(PLOTS).filter(
        (k) =>
            drama(k) &&
            !world.dramas.includes(k) &&
            (!first || PLOTS[k].tags.includes('tutorial')),
    );
    // Every (crew member, plot) pair still possible.
    const busy = (c) =>
        c.traits.some((t) => t.kind === 'drama-seed' || t.kind === 'drama');
    const pairs = world.crew
        .filter((c) => !busy(c))
        .flatMap((c) =>
            kinds
                .filter((k) => !c.traits.some((t) => t.plot === k))
                .map((k) => [c, k]),
        );
    if (!pairs.length) return;
    const [c, kind] = pairs[Math.floor(Math.random() * pairs.length)];
    world.dramas.push(kind);
    c.traits.push({
        id: `seed_${Date.now()}`,
        kind: 'drama-seed',
        revealed: false,
        plot: kind,
        subscriptions: [
            {
                pattern: `/players/${PLAYER}/arrive/:systemId`,
                actions: [{ type: 'startPlot', plot: kind, crew: c.name }],
            },
        ],
    });
}
