// Runs the API server and restarts it whenever a file in server/ changes.
// (Instead of `node --watch`, which watches each file it loaded: on Linux, a
// file that's replaced rather than edited in place, as many editors and
// tools save, stops being watched, and later edits to it go unnoticed.
// Watching the directory sees every change.)

import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../server', import.meta.url));
let child = null;
let again = false;

function start() {
    child = spawn(process.execPath, ['server/index.js'], { stdio: 'inherit' });
    child.on('exit', () => {
        child = null;
        if (again) {
            again = false;
            start();
        }
    });
}

// A burst of changes (a save, several files at once) is one restart.
let timer = null;
watch(dir, (event, file) => {
    if (!file?.endsWith('.js')) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
        console.log(`Restarting (${file} changed)`);
        if (child) {
            again = true;
            child.kill('SIGTERM');
        } else start();
    }, 150);
});

for (const sig of ['SIGINT', 'SIGTERM'])
    process.on(sig, () => (child?.kill(sig), process.exit(0)));
start();
