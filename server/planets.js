// The planet library: planets baked in advance (the planet library's
// expensive terrain noise and colouring, done here instead of on the phone),
// each kept as its compiled JSON, gzipped, in library/planets/<id>.json.gz.
// At startup a worker thread bakes random planets until there are
// PLANET_LIBRARY of them (see config.js); a game's systems each get a
// different one, drawn at random (see assign). Games depend on these files:
// they live outside saves/, and nothing deletes them.

import { PLANET_LIBRARY } from './config.js';
import { planetOptions } from './universe.js';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const DIR =
    process.env.LIBRARY ??
    fileURLToPath(new URL('../library/planets', import.meta.url)); // LIBRARY=dir for a separate one (tests)
mkdirSync(DIR, { recursive: true });
const fileFor = (id) => join(DIR, `${id}.json.gz`);

// The planets baked so far, by id.
const library = readdirSync(DIR)
    .filter((f) => /^\d+\.json\.gz$/.test(f))
    .map((f) => parseInt(f, 10))
    .sort((a, b) => a - b);

// Bake until the library is full: one planet at a time, on the worker.
export function fill(log = console.log) {
    let next = Math.max(-1, ...library) + 1;
    const todo = PLANET_LIBRARY - library.length;
    if (todo <= 0) return;
    log(
        `Planet library: ${library.length}/${PLANET_LIBRARY}; baking ${todo} more.`,
    );
    const worker = new Worker(new URL('./bake-worker.js', import.meta.url));
    const bake = () => {
        if (library.length >= PLANET_LIBRARY) return void worker.terminate();
        worker.postMessage({
            options: planetOptions(Math.random),
            file: fileFor(next),
        });
    };
    worker.on('message', ({ error }) => {
        if (error)
            log(`Planet library: a bake failed (${error}); trying another.`);
        else {
            library.push(next);
            if (library.length % 10 === 0 || library.length === PLANET_LIBRARY)
                log(`Planet library: ${library.length}/${PLANET_LIBRARY}.`);
        }
        next++;
        bake();
    });
    worker.on('error', (e) =>
        log(`Planet library: the baker died (${e.message}).`),
    );
    bake();
}

// Give a game's systems their planets (each a different one, at random), if
// it hasn't any yet and the library has enough. Returns whether it has them.
export function assign(g) {
    const n = g.universe.nodes.length;
    if (g.planets?.length === n) return true;
    if (library.length < n) return false;
    const pool = [...library];
    g.planets = Array.from(
        { length: n },
        () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0],
    );
    return true;
}

// Whether a new game could have its planets now; if not, an error saying so.
export function canStart(n) {
    if (library.length < n)
        throw new Error(
            `The planet library is still being built (${library.length} of ${n} planets). Try again in a minute.`,
        );
}

// How far along a game is to having its planets: { done, total } (done is
// the library's size while it's short).
export const progress = (g) => {
    const total = g.universe.nodes.length;
    return { done: assign(g) ? total : library.length, total };
};

// A system's planet (its index in the game), as gzipped compiled JSON.
export function compiled(g, node) {
    if (!assign(g)) throw new Error('planets not ready');
    const file = fileFor(g.planets[node]);
    if (!existsSync(file)) throw new Error('planet missing from the library');
    return readFileSync(file);
}
