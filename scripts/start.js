// `npm start`: API, Vite and an ngrok tunnel together. Once the tunnel is up,
// its public URL is printed alongside Vite's links, with a QR code for a phone.
// `npm start -- --reset`: first delete every game (and the old single save),
// for a fresh start.
import { rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import QRCode from 'qrcode';

if (process.argv.includes('--reset')) {
    rmSync(new URL('../saves', import.meta.url), {
        recursive: true,
        force: true,
    });
    rmSync(new URL('../save.json', import.meta.url), { force: true });
    console.log('Reset: all games deleted.');
}

spawn(
    'npx',
    [
        'concurrently',
        '-n',
        'api,web,ngrok',
        '-c',
        'cyan,magenta,yellow',
        'node scripts/api.js',
        'vite',
        'npm run tunnel',
    ],
    { stdio: 'inherit' },
).on('exit', (code) => process.exit(code ?? 0));

// ngrok's local API (port 4040) knows the public URL once the tunnel is up.
async function tunnelUrl() {
    for (let i = 0; i < 60; i++) {
        try {
            const { tunnels } = await (
                await fetch('http://127.0.0.1:4040/api/tunnels')
            ).json();
            const url = tunnels.find((t) =>
                t.public_url.startsWith('https://'),
            )?.public_url;
            if (url) return url;
        } catch {}
        await new Promise((r) => setTimeout(r, 500));
    }
    return null;
}

const url = await tunnelUrl();
if (url) {
    const qr = await QRCode.toString(url, { type: 'terminal', small: true });
    console.log(
        `\n  \x1b[32m➜\x1b[0m  \x1b[1mNgrok\x1b[0m:   \x1b[36m${url}/\x1b[0m\n\n${qr}`,
    );
} else
    console.log(
        "\n  Couldn't get the ngrok URL (is ngrok's API on port 4040?)",
    );
