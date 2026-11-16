// The planet baker, on its own thread (see planets.js): it takes one planet's
// options and a file at a time, bakes, and writes the gzipped compiled JSON
// there (via a temporary file, so a half-written planet is never seen).
import { parentPort } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { renameSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const Planet = createRequire(import.meta.url)('@shieldsbetter/planet');

parentPort.on('message', ({ options, file }) => {
    try {
        // The render size doesn't matter (only the textures are kept), but an
        // offscreen planet's maxResolution is its size, and it's saved with the
        // planet: put back the default, or the client would draw at 1×1.
        const opts = {
            ...options,
            maxResolution: Planet.DEFAULTS.maxResolution,
        };
        writeFileSync(
            `${file}.tmp`,
            gzipSync(JSON.stringify(Planet.offscreen(1, 1, opts).compile())),
        );
        renameSync(`${file}.tmp`, file);
        parentPort.postMessage({ file });
    } catch (e) {
        parentPort.postMessage({ file, error: e.message });
    }
});
