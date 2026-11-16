import { mountCrew } from './crew.js';
import { mountHolds } from './holds.js';
import { mountJournal } from './journal.js';
import { mountMenu } from './menu.js';
import { mountShipTraits } from './ship-traits.js';

const TABS = {
    ship: ['Ship', mountShipTraits],
    hold: ['Hold', mountHolds],
    crew: ['Crew', mountCrew],
    journal: ['Journal', mountJournal],
    menu: ['Menu', mountMenu],
};
let current = 'hold'; // remembered between visits to the ship screen

// Ship screen: a tab bar over whichever tab is open.
export function mountShip(root) {
    root.innerHTML = `<div class="ship"><nav class="tabs"></nav><div class="tab-body"></div></div>`;
    const nav = root.querySelector('.tabs');
    const body = root.querySelector('.tab-body');
    let unmount = () => {};

    const open = (tab) => {
        current = tab;
        unmount();
        body.replaceChildren();
        nav.querySelectorAll('button').forEach((b) =>
            b.classList.toggle('on', b.dataset.tab === tab),
        );
        unmount = TABS[tab][1](body);
    };

    nav.append(
        ...Object.entries(TABS).map(([tab, [label]]) => {
            const b = document.createElement('button');
            b.dataset.tab = tab;
            b.textContent = label;
            b.onclick = () => open(tab);
            return b;
        }),
    );
    open(current);
    return () => unmount();
}
