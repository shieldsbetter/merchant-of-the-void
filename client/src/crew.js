import { getCrew, getShip, getContacts } from './api.js';
import { named } from './officers.js';
import { rich } from './refs.js';

// Crew tab: name and morale (out of 200) for each crew member. Tap one for
// their page: their morale and what's behind it (the base, and each mood:
// what it adds, and when it runs out), and the traits you've discovered.
// Then your contacts (the crew's): what they do, and where. Tap one for
// their page: who introduced you, and their ledger (what's passed between you).
export function mountCrew(root) {
    let gone = false;
    let crew = [];
    let contacts = [];

    const bar = (morale) => {
        const m = document.createElement('span');
        m.className = 'morale';
        m.innerHTML = `<span class="bar"><span></span></span><span class="n"></span>`;
        m.querySelector('.bar > span').style.width = `${(morale / 200) * 100}%`;
        m.querySelector('.n').textContent = `${morale}/200`;
        return m;
    };

    const list = () => {
        root.innerHTML = `<div class="roster"><ul class="crew"></ul><h2>Contacts</h2><ul class="crew contacts"></ul></div>`;
        root.querySelector('.contacts').append(
            ...contacts.map((k) => {
                const li = document.createElement('li');
                li.innerHTML = `<span class="what"><span class="name"></span><small></small></span><span class="where"></span>`;
                li.querySelector('.name').textContent = k.name;
                li.querySelector('small').append(
                    k.position ? rich(k.position) : `${k.crew}'s contact`,
                );
                li.querySelector('.where').append(rich(k.planet));
                li.onclick = (e) => e.target.closest('a') || contact(k);
                return li;
            }),
        );
        if (!contacts.length)
            root.querySelector('.contacts').outerHTML =
                `<p class="none">None yet. The crew make friends on shore leave.</p>`;
        root.querySelector('.crew').append(
            ...crew.map((c) => {
                const li = document.createElement('li');
                li.innerHTML = `<span class="name"></span>`;
                li.querySelector('.name').append(named(c.name, c.id));
                li.append(bar(c.morale));
                li.onclick = () => person(c);
                return li;
            }),
        );
    };

    // A mood's amount, and its limit: "+10, up to 150", "−5, down to 50".
    const amount = (m) => {
        const n = `${m.amount > 0 ? '+' : '−'}${Math.abs(m.amount)}`;
        const limit =
            m.amount > 0
                ? m.max != null && m.max < 200
                    ? `, up to ${m.max}`
                    : ''
                : m.min
                  ? `, down to ${m.min}`
                  : '';
        return n + limit;
    };
    const ends = (m) =>
        m.cyclesLeft != null
            ? `${m.cyclesLeft} cycle${m.cyclesLeft === 1 ? '' : 's'} left`
            : (m.ends ?? 'Lasting');

    const person = (c) => {
        root.innerHTML = `
      <div class="person">
        <button type="button" class="back">‹ Crew</button>
        <h1></h1>
        <div class="total"></div>
        <h2>Morale</h2>
        <ul class="moods"></ul>
        <h2>Traits</h2>
        <div class="grid"></div>
      </div>`;
        root.querySelector('.back').onclick = list;
        root.querySelector('h1').append(named(c.name, c.id));
        root.querySelector('.total').append(bar(c.morale));
        const row = (label, value, note, extra) => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="what"><b></b><small></small></span><span class="amt"><b></b><small></small></span>`;
            li.querySelector('.what b').textContent = label;
            li.querySelector('.what small').textContent = note;
            li.querySelector('.amt b').textContent = value;
            li.querySelector('.amt small').textContent = extra;
            return li;
        };
        root.querySelector('.moods').append(
            row('Base', String(c.base), 'Who they are', ''),
            ...c.moods.map((m) => {
                const li = row(
                    m.label,
                    amount(m),
                    ends(m),
                    m.effect !== m.amount
                        ? `counts ${m.effect >= 0 ? '+' : '−'}${Math.abs(m.effect)}`
                        : '',
                );
                li.classList.add(m.amount > 0 ? 'up' : 'down');
                return li;
            }),
        );
        if (!c.moods.length)
            root.querySelector('.moods').insertAdjacentHTML(
                'beforeend',
                `<li class="none">Nothing else on their mind.</li>`,
            );
        const grid = root.querySelector('.grid');
        if (!c.traits.length)
            grid.innerHTML = `<p class="none">Nothing discovered yet.</p>`;
        else
            grid.replaceChildren(
                ...c.traits.map((t) => {
                    const card = document.createElement('div');
                    card.className = 'trait';
                    card.innerHTML = `<span class="label"></span><span class="value"></span>`;
                    card.querySelector('.label').textContent = t.label;
                    card.querySelector('.value').textContent = t.value;
                    return card;
                }),
            );
    };

    // A contact's page.
    const contact = (k) => {
        root.innerHTML = `
      <div class="person">
        <button type="button" class="back">‹ Crew</button>
        <h1></h1>
        <p class="position"></p>
        <p class="position via"></p>
        <h2>Ledger</h2>
        <ul class="ledger"></ul>
      </div>`;
        root.querySelector('.back').onclick = list;
        root.querySelector('h1').textContent = k.name;
        root.querySelector('.position').append(
            ...(k.position ? [rich(k.position), ', on '] : ['On ']),
            rich(k.planet),
            k.traits.length ? ` · ${k.traits.join(' · ')}` : '',
        );
        root.querySelector('.via').append(`${k.crew}'s contact`);
        root.querySelector('.ledger').append(
            ...k.ledger.map((l) => {
                const li = document.createElement('li');
                li.innerHTML = `<span class="when"></span><span class="text"></span>`;
                li.querySelector('.when').textContent =
                    l.cycle == null ? '' : `Cycle ${l.cycle}`;
                li.querySelector('.text').append(rich(l.text));
                return li;
            }),
        );
    };

    Promise.all([getCrew(), getContacts(), getShip()]).then(([c, k]) => {
        // (the ship: who's navigator)
        if (gone) return;
        crew = c;
        contacts = k;
        list();
    });
    return () => (gone = true);
}
