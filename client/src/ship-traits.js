import pencilIcon from 'game-icon:pencil';

import {
    getShip,
    getGoods,
    getCrew,
    installModule,
    renameShip,
    setOfficer,
} from './api.js';
import { named } from './officers.js';

const NAME_MAX = 50; // as the server allows
const POSTS = { navigator: 'Navigator' }; // the ship's officers' posts

// Ship tab: the ship's name (tap the pencil to change it), its officers
// (tap a post to put someone else in it), the hull bar and critical systems, five expansion slots, combat
// attributes (effective, with the base value when modules or traits change
// it), then the ship's traits. Tap a slot to install a module from the hold.
export function mountShipTraits(root) {
    root.innerHTML = `
    <div class="ship-traits">
      <div class="ship-name">
        <h1></h1><button type="button" class="edit" aria-label="Rename the ship">${pencilIcon}</button>
        <form hidden><input name="name" maxlength="${NAME_MAX}" autocomplete="off" aria-label="Ship's name" /><button>Save</button><button type="button" class="cancel">Cancel</button></form>
        <p class="error"></p>
      </div>
      <div class="health">
        <div class="row"><span class="label">Hull</span><span class="nums"></span></div>
        <div class="bar"><span></span></div>
      </div>
      <h2>Officers</h2><div class="slots officers"></div>
      <h2>Expansion slots</h2><div class="slots modules"></div>
      <h2>Combat</h2><div class="grid combat"></div>
      <h2>Traits</h2><div class="grid traits"></div>
    </div>
    <dialog class="modules">
      <form method="dialog">
        <h2></h2>
        <div class="list"></div>
        <p class="error"></p>
        <menu><button>Cancel</button></menu>
      </form>
    </dialog>`;
    const dialog = root.querySelector('dialog');
    let gone = false;
    let goods = {};
    let crew = []; // who could hold a post

    // The name, and renaming: the pencil swaps it for a field (Enter or Save
    // to keep, Escape or Cancel not to).
    const head = root.querySelector('.ship-name');
    const form = head.querySelector('form'),
        input = form.querySelector('input'),
        err = head.querySelector('.error');
    const editing = (on) => {
        form.hidden = !on;
        head.querySelector('h1').hidden = head.querySelector('.edit').hidden =
            on;
        err.textContent = '';
        if (on) {
            input.value = head.querySelector('h1').textContent;
            input.focus();
            input.select();
        }
    };
    head.querySelector('.edit').onclick = () => editing(true);
    form.querySelector('.cancel').onclick = () => editing(false);
    input.onkeydown = (e) => {
        if (e.key === 'Escape') editing(false);
    };
    form.onsubmit = async (e) => {
        e.preventDefault();
        try {
            const ship = await renameShip(input.value);
            editing(false);
            draw(ship);
        } catch (x) {
            err.textContent = x.message;
        }
    };

    const draw = (ship) => {
        if (gone) return;
        head.querySelector('h1').textContent = ship.name;
        const { base, effective: e } = ship.stats;
        const crits =
            '◆'.repeat(Math.max(0, e.crits)) +
            '◇'.repeat(e.maxCrits - Math.max(0, e.crits));
        root.querySelector('.health .nums').textContent =
            `${e.hull}/${e.maxHull} · ${crits}`;
        root.querySelector('.health .bar > span').style.width =
            `${(e.hull / e.maxHull) * 100}%`;

        // Each post, and who's in it (a crew member, or the captain in a pinch).
        root.querySelector('.officers').replaceChildren(
            ...Object.entries(POSTS).map(([post, title]) => {
                const b = document.createElement('button');
                b.className = 'slot-card full';
                b.innerHTML = `<b></b><span></span>`;
                b.querySelector('b').textContent = title;
                const id = ship.officers[post];
                b.querySelector('span').append(
                    named(
                        id === 'captain'
                            ? 'The Captain'
                            : (crew.find((c) => c.id === id)?.name ?? '?'),
                        id,
                    ),
                );
                b.onclick = () => appoint(ship, post);
                return b;
            }),
        );

        root.querySelector('.modules').replaceChildren(
            ...ship.slots.map((g, i) => {
                const b = document.createElement('button');
                b.className = `slot-card${g ? ' full' : ''}`;
                b.innerHTML = g ? `<b></b><span></span>` : `<span>Empty</span>`;
                if (g) {
                    b.querySelector('b').textContent = goods[g].name;
                    b.querySelector('span').textContent = desc(goods[g].module);
                }
                b.onclick = () => choose(ship, i);
                return b;
            }),
        );

        // Effective value, and the base one if something changed it.
        const stat = (label, b, v) => ({
            label,
            value: v,
            base: v === b ? null : b,
        });
        const dmg = (d) => `${d[0]}–${d[1]}`;
        const pct = (c) => `${+(c * 100).toFixed(2)}%`;
        cards(root.querySelector('.combat'), [
            stat('Max hull', String(base.maxHull), String(e.maxHull)),
            stat('Critical systems', String(base.maxCrits), String(e.maxCrits)),
            stat('Damage output', dmg(base.damage), dmg(e.damage)),
            stat('Crit chance', pct(base.crit), pct(e.crit)),
            stat('Maneuverability', String(base.maneuver), String(e.maneuver)),
            stat('Hop cost', '×1', `×${e.fuel}`),
            stat('Fuel tanks', String(base.fuelCap), String(e.fuelCap)),
            // (Already in damage and maneuverability above.)
            {
                label: 'Crew experience',
                value:
                    ship.stats.crew?.damage || ship.stats.crew?.maneuver
                        ? [
                              ship.stats.crew.damage &&
                                  `+${+(ship.stats.crew.damage * 100).toFixed(1)}% damage`,
                              ship.stats.crew.maneuver &&
                                  `+${ship.stats.crew.maneuver} maneuverability`,
                          ]
                              .filter(Boolean)
                              .join(' · ')
                        : 'None yet',
                base: null,
            },
        ]);
        const traits = ship.traits.filter((t) => !t.hidden);
        if (traits.length) cards(root.querySelector('.traits'), traits);
        else
            root.querySelector('.traits').innerHTML =
                `<p class="none">Nothing notable about this ship. Yet.</p>`;
    };

    // Who could take `post`: the captain and each crew member (the one in it
    // now marked, and not to be chosen again).
    const appoint = async (ship, post) => {
        dialog.querySelector('h2').textContent = POSTS[post];
        dialog.querySelector('.error').textContent = '';
        const list = dialog.querySelector('.list');
        list.replaceChildren(
            ...[{ id: 'captain', name: 'The Captain' }, ...crew].map(
                ({ id, name }) => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.innerHTML = `<b></b><span></span>`;
                    b.querySelector('b').append(named(name, id));
                    const current = ship.officers[post] === id;
                    b.querySelector('span').textContent = current
                        ? `${POSTS[post]} now`
                        : id === 'captain'
                          ? 'Do it yourself'
                          : '';
                    b.disabled = current;
                    b.onclick = async () => {
                        try {
                            draw(await setOfficer(post, id));
                            dialog.close();
                        } catch (x) {
                            dialog.querySelector('.error').textContent =
                                x.message;
                        }
                    };
                    return b;
                },
            ),
        );
        dialog.showModal();
    };

    // The modules in the hold, to put in slot i (replacing what's there).
    const choose = (ship, i) => {
        dialog.querySelector('h2').textContent = ship.slots[i]
            ? `Replace ${goods[ship.slots[i]].name}`
            : `Slot ${i + 1}`;
        const list = dialog.querySelector('.list');
        const mods = ship.holds
            .flatMap((h, hold) =>
                h.slots.map((st, slot) => ({ st, at: { hold, slot } })),
            )
            .filter(({ st }) => st && goods[st.good].module && !st.quest);
        const put = async (at) => {
            try {
                draw(await installModule(i, at));
                dialog.close();
            } catch (x) {
                dialog.querySelector('.error').textContent = x.message;
            }
        };
        dialog.querySelector('.error').textContent = '';
        list.replaceChildren(
            ...mods.map(({ st, at }) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.innerHTML = `<b></b><span></span>`;
                b.querySelector('b').textContent = goods[st.good].name;
                b.querySelector('span').textContent = desc(
                    goods[st.good].module,
                );
                // A unique module installed in another slot can't go in this one too.
                const taken =
                    goods[st.good].module.unique &&
                    ship.slots.some((g, j) => g === st.good && j !== i);
                if (taken) {
                    b.disabled = true;
                    b.querySelector('span').textContent +=
                        ' · already installed';
                }
                b.onclick = () => put(at);
                return b;
            }),
        );
        if (!mods.length)
            list.innerHTML = `<p class="none">No modules in the hold.</p>`;
        // A filled slot can also be emptied, its module going back to the hold.
        if (ship.slots[i]) {
            const clear = document.createElement('button');
            clear.type = 'button';
            clear.className = 'clear';
            clear.innerHTML = `<b>Clear</b><span>Return the module to the hold</span>`;
            clear.onclick = () => put(null);
            list.append(clear);
        }
        dialog.showModal();
    };

    Promise.all([getShip(), getGoods(), getCrew()]).then(([ship, g, c]) => {
        goods = g;
        crew = c;
        draw(ship);
    });
    return () => (gone = true);
}

const desc = (m) => `${m.unique ? 'Unique · ' : ''}${m.desc}`;

function cards(grid, items) {
    grid.replaceChildren(
        ...items.map((t) => {
            const card = document.createElement('div');
            card.className = 'trait';
            card.innerHTML = `<span class="label"></span><span class="value"></span>`;
            card.querySelector('.label').textContent = t.label;
            card.querySelector('.value').textContent = t.value;
            if (t.base)
                card.insertAdjacentHTML(
                    'beforeend',
                    `<span class="base">base ${t.base}</span>`,
                );
            return card;
        }),
    );
}
