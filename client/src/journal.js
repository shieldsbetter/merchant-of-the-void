import { getJournal, getShip, archiveEntry, restoreEntry } from './api.js';
import { rich } from './refs.js';

// Journal tab: the factions and where you stand with them; active quests;
// and rumors (newest first, with how long ago you heard them). Either can be archived (Delete) and restored (+) from the
// archive, which lists the freshest archiving first. Archived rumors expire
// after a while; archived quests stay until the quest ends.
export function mountJournal(root) {
  root.innerHTML = `
    <div class="journal">
      <h2>Factions</h2><ul class="factions"></ul>
      <h2>Quests</h2><ul class="quests"></ul>
      <h2>Rumors</h2><ul class="rumors"></ul>
      <button class="switch"></button>
    </div>`;
  const toggle = root.querySelector('.switch');
  let archive = false;
  let gone = false;

  const ago = (n) => (n ? `${n} cycle${n > 1 ? 's' : ''} ago` : 'just now');
  const SECTIONS = {
    rumors: {
      order: (a, b) => a.ago - b.ago,
      note: (r) => (archive ? `Heard ${ago(r.ago)} · archived ${ago(r.archivedAgo)}` : `Heard ${ago(r.ago)}`),
      none: 'No rumors yet. Shore leave is a good place to hear some.'
    },
    quests: {
      order: (a, b) => a.id - b.id,
      note: (q) => (archive ? `Archived ${ago(q.archivedAgo)}` : ''),
      none: 'No quests.'
    }
  };

  const draw = (journal) => {
    if (gone) return;
    root.querySelector('ul.factions').replaceChildren(...(journal.factions ?? []).map((f) => {
      const li = document.createElement('li');
      li.className = 'faction';
      li.innerHTML = `<div><p><span class="swatch"></span><b></b></p><span class="ago"></span></div><span class="rep"></span>`;
      li.querySelector('.swatch').style.background = f.color;
      li.querySelector('b').textContent = f.name;
      li.querySelector('.ago').textContent = f.type;
      const rep = li.querySelector('.rep');
      rep.textContent = `${f.reputation > 0 ? '+' : ''}${f.reputation}`;
      rep.classList.toggle('up', f.reputation > 0);
      rep.classList.toggle('down', f.reputation < 0);
      return li;
    }));
    let archived = 0;
    for (const [section, { order, note, none }] of Object.entries(SECTIONS)) {
      const all = journal[section];
      archived += all.filter((e) => e.archivedAgo != null).length;
      const shown = all
        .filter((e) => (e.archivedAgo != null) === archive)
        .sort(archive ? (a, b) => a.archivedAgo - b.archivedAgo : order);
      const list = root.querySelector(`ul.${section}`);
      if (!shown.length) {
        list.innerHTML = `<li class="none">${archive ? 'Nothing archived.' : none}</li>`;
        continue;
      }
      list.replaceChildren(...shown.map((e) => {
        const li = document.createElement('li');
        li.innerHTML = `<div><p></p><span class="ago"></span></div><button></button>`;
        li.querySelector('p').append(rich(e.text));
        li.querySelector('.ago').textContent = note(e);
        const b = li.querySelector('button');
        b.textContent = archive ? '+' : 'Delete';
        b.className = archive ? 'restore' : 'delete';
        b.onclick = async () => draw(await (archive ? restoreEntry : archiveEntry)(section, e.id));
        return li;
      }));
    }
    toggle.textContent = archive ? '← Journal' : `Archive (${archived})`;
  };

  toggle.onclick = async () => {
    archive = !archive;
    draw(await getJournal());
  };
  Promise.all([getJournal(), getShip()]).then(([journal]) => draw(journal)); // (the ship: who's navigator)
  return () => (gone = true);
}
