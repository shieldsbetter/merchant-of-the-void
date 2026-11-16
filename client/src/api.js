import { setOfficers } from './officers.js';
import { setHere } from './refs.js';
// This device's session (made on first visit) and the game it's playing,
// both kept in the browser and sent with every request.
const store = {
    get: (k) => {
        try {
            return localStorage.getItem(k);
        } catch {
            return null;
        }
    },
    set: (k, v) => {
        try {
            if (v == null) localStorage.removeItem(k);
            else localStorage.setItem(k, v);
        } catch {
            // No storage (a private window, say): just don't remember.
        }
    },
};
let session = store.get('session');
if (!session) store.set('session', (session = crypto.randomUUID()));
export const currentGame = () => store.get('game');
export const setCurrentGame = (id) => store.set('game', id);

async function req(method, path, body) {
    const headers = {
        'x-session': session,
        ...(currentGame() ? { 'x-game': currentGame() } : {}),
    };
    if (body) headers['content-type'] = 'application/json';
    const res = await fetch(`/api${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        // No game (or not ours): off to the game list.
        if (err?.noGame) {
            setCurrentGame(null);
            location.hash = '#/games';
        }
        throw new Error(err?.error ?? `${method} ${path}: ${res.status}`);
    }
    return res.json();
}

export const listGames = () => req('GET', '/games');
// Threads that are news, not history (see planet-view.js): a game made, or
// a visit travelled to (a system, or an encounter on the way), since the page loaded.
const news = new Set();
export const createGame = () =>
    req('POST', '/games', {}).then((g) => (news.add(g.id), g));
export const isNews = (game, visit) =>
    news.has(game) || news.has(`${game}:${visit}`);
export const deleteGame = (id) => req('DELETE', `/games/${id}`);

export const getUniverse = () => req('GET', '/universe');
export const getPlanet = (id) => req('GET', `/planets/${id}`);
export const getCompiledPlanet = (id) => req('GET', `/planets/${id}/compiled`);
export const getBake = () => req('GET', '/bake');
// Visits (the system you're in, or none: out in space) say where you are.
const at = (v) => (setHere(v.id && !v.space ? v.planet : null), v);
export const getVisit = () => req('GET', '/visit').then(at);
export const setCourse = (to) => req('POST', '/course', { to });
export const departNow = () => req('POST', '/depart', {}).then(at);
export const tripTick = () =>
    req('POST', '/trip/tick', {}).then(
        (v) => (v.id && news.add(`${currentGame()}:${v.id}`), at(v)),
    );
export const act = (body) => req('POST', '/visit/act', body).then(at);
export const getGoods = () => req('GET', '/goods');
// (Every fetch of the ship updates who its officers are; see officers.js.)
const withOfficers = (ship) => (setOfficers(ship.officers), ship);
export const getShip = () => req('GET', '/ship').then(withOfficers);
export const setOfficer = (post, who) =>
    req('POST', '/ship/officer', { post, who }).then(withOfficers);
export const getCrew = () => req('GET', '/crew');
export const getContacts = () => req('GET', '/contacts');
export const moveStack = (from, to) => req('POST', '/ship/move', { from, to });
export const splitStack = (at, qty) => req('POST', '/ship/split', { at, qty });
export const installModule = (slot, at) =>
    req('POST', '/ship/install', { slot, at });
export const renameShip = (name) => req('POST', '/ship/name', { name });
export const getJournal = () => req('GET', '/journal');
export const devHunter = () => req('POST', '/dev/hunter');
export const devRepair = () => req('POST', '/dev/repair');
export const devFirefight = () => req('POST', '/dev/firefight');
// section: 'rumors' | 'quests'
export const archiveEntry = (section, id) =>
    req('POST', `/journal/${section}/${id}/archive`);
export const restoreEntry = (section, id) =>
    req('POST', `/journal/${section}/${id}/restore`);
