import systemIcon from 'game-icon:ringed-planet';
import statusIcon from 'game-icon:spaceship';
import navIcon from 'game-icon:treasure-map';

import { currentGame, getBake } from './api.js';
import { mountGames } from './games.js';
import { mountMap } from './map.js';
import { mountSystem } from './planet-view.js';
import { mountShip } from './ship.js';

// Hash routes, one per tab: '#/' Nav (the map; '#/route/:id' opens it on a
// system), '#/system' the system you're in and its thread, '#/ship' Status
// (hold, crew, ship, journal, menu). '#/games' the game list (where you land
// with no game chosen) has no tabs.
const app = document.getElementById('app');
let unmount = () => {};

// The tab bar, along the bottom.
const TABS = [
    { label: 'Nav', icon: navIcon, hash: '#/' },
    { label: 'System', icon: systemIcon, hash: '#/system' },
    { label: 'Status', icon: statusIcon, hash: '#/ship' },
];
const tabbar = document.createElement('nav');
tabbar.className = 'tabbar';
tabbar.append(
    ...TABS.map((t) => {
        const a = document.createElement('a');
        a.href = t.hash;
        a.innerHTML = `${t.icon}<span></span>`;
        a.querySelector('span').textContent = t.label;
        return a;
    }),
);
document.body.append(tabbar);
const tabOf = (h) => (h === '#/system' ? 1 : h === '#/ship' ? 2 : 0);
const showTabs = (on, h) => {
    document.body.classList.toggle('tabbed', on);
    tabbar.hidden = !on;
    [...tabbar.children].forEach((a, i) =>
        a.classList.toggle('on', i === tabOf(h)),
    );
    tabbar.style.setProperty('--tab', tabOf(h)); // slides the highlight
};

// Games whose planets are all baked (see server/planets.js). Until then, a
// game shows a loading screen instead.
const ready = new Set();

// "Generating universe…", with progress, until the current game is ready;
// then on to the route.
function generating() {
    app.innerHTML =
        '<div class="generating"><h1>Generating universe…</h1><progress></progress><p class="dim"></p></div>';
    const bar = app.querySelector('progress');
    let timer,
        gone = false;
    const poll = async () => {
        try {
            const { done, total } = await getBake();
            if (gone) return;
            if (done >= total) {
                ready.add(currentGame());
                return route();
            }
            Object.assign(bar, { max: total, value: done });
            app.querySelector('p').textContent = `${done} of ${total} systems`;
        } catch {
            // The server's busy or restarting: ask again next time round.
        }
        if (!gone) timer = setTimeout(poll, 1000);
    };
    poll();
    return () => {
        gone = true;
        clearTimeout(timer);
    };
}

function route() {
    unmount();
    app.replaceChildren();
    if (!currentGame() && location.hash !== '#/games')
        return void location.replace('#/games');
    const h = location.hash;
    if (h.startsWith('#/planet/')) return void location.replace('#/system'); // the old visit route
    showTabs(h !== '#/games' && ready.has(currentGame()), h);
    if (h === '#/games') return void (unmount = mountGames(app));
    if (!ready.has(currentGame())) return void (unmount = generating());
    const r = h.match(/^#\/route\/(\d+)$/);
    unmount =
        h === '#/ship'
            ? mountShip(app)
            : h === '#/system'
              ? mountSystem(app)
              : r
                ? mountMap(app, { plan: Number(r[1]) })
                : mountMap(app);
}

window.addEventListener('hashchange', route);
route();
