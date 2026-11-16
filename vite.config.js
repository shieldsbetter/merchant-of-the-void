import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

// Icons from game-icons.net (CC BY 3.0; see CREDITS.md), via the Iconify
// set. `import anvil from 'game-icon:anvil'` gives that icon's SVG markup, so
// only icons actually used end up in the bundle. Names: https://game-icons.net
function gameIcons() {
  let set;
  const PREFIX = 'game-icon:';
  return {
    name: 'game-icons',
    resolveId: (id) => (id.startsWith(PREFIX) ? '\0' + id : null),
    load(id) {
      if (!id.startsWith('\0' + PREFIX)) return null;
      const name = id.slice(PREFIX.length + 1);
      set ??= createRequire(import.meta.url)('@iconify-json/game-icons/icons.json');
      const icon = set.icons[name];
      if (!icon) throw new Error(`no game icon "${name}"`);
      const svg = `<svg class="gi" viewBox="0 0 ${set.width} ${set.height}" aria-hidden="true">${icon.body}</svg>`;
      return `export default ${JSON.stringify(svg)};`;
    }
  };
}

// `import licenses from 'virtual:licenses'`: every package in package.json,
// with its version, license and license text, for the in-game licenses list.
function licenses() {
  const ID = 'virtual:licenses';
  const root = fileURLToPath(new URL('.', import.meta.url));
  // Packages that don't ship a license file.
  const TEXT = {
    '@iconify-json/game-icons':
      'Icons by Lorc, Delapouite and contributors, from https://game-icons.net\n\n' +
      'Licensed under Creative Commons Attribution 3.0 Unported (CC BY 3.0):\n' +
      'https://creativecommons.org/licenses/by/3.0/'
  };
  return {
    name: 'licenses',
    resolveId: (id) => (id === ID ? '\0' + ID : null),
    load(id) {
      if (id !== '\0' + ID) return null;
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
      const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).sort();
      const list = names.map((name) => {
        // (Not require.resolve: a package whose `exports` doesn't list its
        // package.json can't be resolved that way.)
        const dir = join(root, 'node_modules', name);
        const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        const file = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
        return {
          name,
          version: meta.version,
          license: meta.license,
          text: TEXT[name] ?? (file ? readFileSync(join(dir, file), 'utf8') : `${meta.license} (no license text included)`)
        };
      });
      return `export default ${JSON.stringify(list)};`;
    }
  };
}

export default defineConfig({
  root: 'client',
  plugins: [gameIcons(), licenses()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    host: true, // reachable from a phone on the LAN
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app', '.ngrok.dev', '.ngrok.io'], // npm start's tunnel
    fs: { allow: [fileURLToPath(new URL('.', import.meta.url))] },
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } }
  }
});
