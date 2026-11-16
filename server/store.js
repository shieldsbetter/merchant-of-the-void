// Sessions and their games, on disk. A session is a device (a random id the
// client keeps); it owns a list of games, and can only see and change its
// own. Each game is a file, saves/games/<id>.json (see game.js for what's in
// it); sessions.json maps session ids to their game ids.
import {
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
    rmSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { load, newGame, save } from './game.js';

const DIR =
    process.env.SAVES ?? fileURLToPath(new URL('../saves', import.meta.url)); // SAVES=dir for separate data (tests)
const GAMES = join(DIR, 'games');
const SESSIONS = join(DIR, 'sessions.json');
// The single game from before there were several: claimed by the first
// session to show up.
const LEGACY =
    process.env.LEGACY ??
    fileURLToPath(new URL('../save.json', import.meta.url));
mkdirSync(GAMES, { recursive: true });

const sessions = existsSync(SESSIONS)
    ? JSON.parse(readFileSync(SESSIONS, 'utf8'))
    : { sessions: {}, legacyImported: false };
const writeSessions = () =>
    writeFileSync(SESSIONS, JSON.stringify(sessions, null, 1));
const cache = new Map(); // game id -> game

const file = (id) => join(GAMES, `${id}.json`);
const SAFE = /^[\w-]{1,64}$/;

// The session's record, made on first sight (and given the legacy game, once).
function session(sid) {
    if (!SAFE.test(sid ?? '')) throw new Error('no session');
    if (!sessions.sessions[sid]) {
        sessions.sessions[sid] = { games: [] };
        if (!sessions.legacyImported && existsSync(LEGACY)) {
            const id = randomUUID();
            const g = load({
                ...JSON.parse(readFileSync(LEGACY, 'utf8')),
                id,
                seed: 7,
                name: 'Your first game',
            });
            writeFileSync(file(id), JSON.stringify(save(g)));
            sessions.sessions[sid].games.push(id);
            sessions.legacyImported = true;
        }
        writeSessions();
    }
    return sessions.sessions[sid];
}

export const listGames = (sid) => session(sid).games.map((id) => game(sid, id));

// A session's game, loaded (once) from disk.
export function game(sid, id) {
    if (!session(sid).games.includes(id)) throw new Error('no such game');
    if (!cache.has(id))
        cache.set(id, load(JSON.parse(readFileSync(file(id), 'utf8'))));
    return cache.get(id);
}

export function createGame(sid, name) {
    const s = session(sid);
    const id = randomUUID();
    const g = newGame(id, 1 + Math.floor(Math.random() * 2 ** 31), name);
    cache.set(id, g);
    persist(g);
    s.games.push(id);
    writeSessions();
    return g;
}

export function deleteGame(sid, id) {
    const s = session(sid);
    if (!s.games.includes(id)) throw new Error('no such game');
    s.games = s.games.filter((g) => g !== id);
    cache.delete(id);
    rmSync(file(id), { force: true });
    writeSessions();
}

export const persist = (g) =>
    writeFileSync(file(g.id), JSON.stringify(save(g)));
