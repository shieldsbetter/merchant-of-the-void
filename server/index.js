import Fastify from 'fastify';

import { crewEdge } from './combat.js';
import { publicCrew, publicContacts, contactsOf } from './crew.js';
import { publicFactions } from './factions.js';
import {
    shown,
    setCourse,
    actOn,
    departNow,
    tripTick,
    setOfficer,
    dev,
    summary,
    worldAt,
} from './game.js';
import { GOODS } from './goods.js';
import { install, publicShip } from './modules.js';
import { nameOf } from './people.js';
import { compiled, fill, progress, assign, canStart } from './planets.js';
import { setQuestArchived, publicQuests } from './quests.js';
import { setArchived, publicRumors } from './rumors.js';
import { moveStack, splitStack, renameShip } from './ship.js';
import { priceOf } from './situations.js';
import { listGames, game, createGame, deleteGame, persist } from './store.js';
import { SYSTEMS } from './universe.js';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const app = Fastify({ logger: true });

// Every request names its session (x-session: a device's random id) and,
// for anything in a game, the game (x-game). Game requests get req.g; a
// missing or someone else's game is a 409, so the client goes to its list.
const GLOBAL = ['/api/goods', '/api/games'];
app.addHook('preHandler', async (req, reply) => {
    if (
        !req.url.startsWith('/api/') ||
        GLOBAL.some((p) => req.url.startsWith(p))
    )
        return;
    try {
        req.g = game(req.headers['x-session'], req.headers['x-game']);
    } catch (e) {
        return reply.code(409).send({ error: e.message, noGame: true });
    }
});
// Changes are saved after every POST.
app.addHook('onResponse', async (req) => {
    if (req.method === 'POST' && req.g) persist(req.g);
});

// A thrown Error becomes a 400 with its message.
const guard = (fn) => async (req, reply) => {
    try {
        return await fn(req);
    } catch (e) {
        return reply.code(400).send({ error: e.message });
    }
};

// The ship, as the client sees it: who's after you by name, not person id
// (see people.js); and its effective stats with the crew's experience (see
// combat.js's crewEdge), which stats.crew spells out.
const shipOut = (g) => {
    const ship = publicShip(g.ship);
    const edge = crewEdge(g.crew),
        e = ship.stats.effective;
    e.damage = e.damage.map((d) => +(d * (1 + edge.damage)).toFixed(1));
    e.maneuver += edge.maneuver;
    ship.stats.crew = edge;
    ship.traits = ship.traits.map((t) =>
        t.lender == null
            ? t
            : { ...t, lender: nameOf(g.people, t.lender) ?? 'someone' },
    );
    return ship;
};

app.get('/api/goods', async () => GOODS);

// The session's games.
const sid = (req) => req.headers['x-session'];
app.get(
    '/api/games',
    guard((req) => listGames(sid(req)).map(summary)),
);
// A new game draws its planets from the library (see planets.js), and can't
// start until there are enough.
app.post(
    '/api/games',
    guard((req) => {
        canStart(SYSTEMS);
        const g = createGame(sid(req), req.body?.name);
        assign(g);
        persist(g);
        return summary(g);
    }),
);
app.delete(
    '/api/games/:id',
    guard((req) => (deleteGame(sid(req), req.params.id), { ok: true })),
);

app.get('/api/ship', async (req) => shipOut(req.g));
app.post(
    '/api/ship/install',
    guard(
        (req) => (
            install(req.g.ship, req.body?.slot, req.body?.at),
            shipOut(req.g)
        ),
    ),
);
app.get('/api/crew', async (req) =>
    publicCrew(req.g.crew, req.g.universe.nodes, req.g.cycle),
);
app.get('/api/contacts', async (req) => publicContacts(req.g));
app.post(
    '/api/ship/officer',
    guard(
        (req) => (
            setOfficer(req.g, req.body?.post, req.body?.who),
            shipOut(req.g)
        ),
    ),
);
app.post(
    '/api/ship/name',
    guard((req) => (renameShip(req.g.ship, req.body?.name), shipOut(req.g))),
);
app.post(
    '/api/ship/move',
    guard(
        (req) => (
            moveStack(req.g.ship, req.body?.from, req.body?.to),
            shipOut(req.g)
        ),
    ),
);
app.post(
    '/api/ship/split',
    guard(
        (req) => (
            splitStack(req.g.ship, req.body?.at, req.body?.qty),
            shipOut(req.g)
        ),
    ),
);

// The journal: rumors and quests, each archivable. Changes return the whole journal.
const journal = (g) => ({
    rumors: publicRumors(g.rumors, g.cycle),
    quests: publicQuests(g.quests, g.cycle),
    factions: publicFactions(worldAt(g, g.universe.nodes[0])),
});
const ARCHIVE = {
    rumors: (g, id, at) => setArchived(g.rumors, id, at),
    quests: (g, id, at) => setQuestArchived(g.quests, id, at),
};
app.get('/api/journal', async (req) => journal(req.g));
app.post(
    '/api/journal/:section/:id/archive',
    guard(
        (req) => (
            ARCHIVE[req.params.section](req.g, req.params.id, req.g.cycle),
            journal(req.g)
        ),
    ),
);
app.post(
    '/api/journal/:section/:id/restore',
    guard(
        (req) => (
            ARCHIVE[req.params.section](req.g, req.params.id, null),
            journal(req.g)
        ),
    ),
);

// Dev tools (the ship screen's Dev tab).
app.post(
    '/api/dev/hunter',
    guard((req) => dev.hunter(req.g)),
);
app.post(
    '/api/dev/firefight',
    guard((req) => dev.firefight(req.g)),
);
app.post(
    '/api/dev/repair',
    guard((req) => (dev.repair(req.g), shipOut(req.g))),
);

app.get('/api/universe', async (req) => ({
    // fuel: whether its market sells Star Fuel; contacts: yours there.
    nodes: req.g.universe.nodes.map(({ id, name, x, y, traits, market }) => ({
        id,
        name,
        x,
        y,
        traits,
        fuel: market.some((m) => m.good === 'fuel'),
        faction: req.g.universe.nodes[id].faction,
        contacts: req.g.crew.flatMap((c) =>
            contactsOf(c, req.g.people)
                .filter((k) => k.planet === id)
                .map((k) => ({ name: k.name, crew: c.name })),
        ),
    })),
    edges: req.g.universe.edges,
    factions: req.g.universe.factions,
    cycle: req.g.cycle,
}));

app.get('/api/planets/:id', async (req, reply) => {
    const { universe, situations } = req.g;
    const node = universe.nodes[Number(req.params.id)];
    if (!node) return reply.code(404).send({ error: 'no such planet' });
    // Each good's current price here, and its average across every market that
    // trades it (the galactic average).
    const avg = (good) => {
        const ps = universe.nodes.flatMap((n) =>
            n.market.filter((m) => m.good === good).map(priceOf(situations, n)),
        );
        return Math.round(ps.reduce((a, b) => a + b, 0) / ps.length);
    };
    const market = node.market.map((m) => ({
        ...m,
        price: priceOf(situations, node)(m),
        avg: avg(m.good),
    }));
    return { id: node.id, name: node.name, traits: node.traits, market };
});

// The planet itself, compiled (see planets.js): gzipped, for any browser
// that takes gzip (all of them), unzipped otherwise.
app.get('/api/planets/:id/compiled', async (req, reply) => {
    const node = req.g.universe.nodes[Number(req.params.id)];
    if (!node) return reply.code(404).send({ error: 'no such planet' });
    let gz;
    try {
        gz = withPlanets(req.g, () => compiled(req.g, node.id));
    } catch (e) {
        return reply.code(409).send({ error: e.message });
    }
    reply.type('application/json');
    if (/\bgzip\b/.test(req.headers['accept-encoding'] ?? ''))
        return reply.header('content-encoding', 'gzip').send(gz);
    return reply.send(gunzipSync(gz));
});

// Whether this game has its planets yet: { done, total }.
app.get('/api/bake', async (req) => withPlanets(req.g, () => progress(req.g)));

// Run `fn`, saving the game if that gave it its planets (a game from before
// the library gets them the first time it's looked at; see planets.js).
function withPlanets(g, fn) {
    const had = !!g.planets;
    try {
        return fn();
    } finally {
        if (!had && g.planets) persist(g);
    }
}

app.get('/api/visit', async (req) => shown(req.g));
app.post(
    '/api/course',
    guard((req) => setCourse(req.g, req.body?.to ?? null)),
);
app.post(
    '/api/depart',
    guard((req) => departNow(req.g)),
);
// Between systems: the next cycle of the trip (see game.js).
app.post(
    '/api/trip/tick',
    guard((req) => tripTick(req.g)),
);
app.post(
    '/api/visit/act',
    guard((req) => actOn(req.g, req.body)),
);

if (process.env.NODE_ENV === 'production') {
    const { default: fastifyStatic } = await import('@fastify/static');
    await app.register(fastifyStatic, {
        root: fileURLToPath(new URL('../dist', import.meta.url)),
    });
}

// Fill the planet library, if it's short (on a worker; see planets.js).
fill();
await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
