import { plain } from './refs.js';
import yardIcon from 'game-icon:auto-repair';
import wantedIcon from 'game-icon:wanted-reward';
import questIcon from 'game-icon:scroll-unfurled';
import noFuelIcon from 'game-icon:jerrycan';
import contactIcon from 'game-icon:shaking-hands';
import dangerIcon from 'game-icon:hazard-sign';

// Badges: small icons for a system's attributes and what's going on there,
// on the map and (larger) in its info card, where tapping one explains it.
//   ship yard: blue, a gear and wrench, with the yard's tier in the corner
//   can't show your face: red, a wanted poster
//   a quest tied to it: gold, a scroll (one per quest)
//   no fuel station: orange, a fuel can
//   your contacts there: teal, a handshake
//   a quest's danger zone (an ambush could be waiting): purple, a hazard sign
// `icon` is SVG markup (game-icons.net; see vite.config.js); `tier` is an
// optional corner number.
export function badges(node, ship, quests = []) {
  const out = [];
  const yard = node.traits?.find((t) => t.kind === 'shipyard');
  if (yard)
    out.push({
      kind: 'yard',
      icon: yardIcon,
      tier: yard.tier,
      title: `Ship Yard, Tier ${yard.tier}`,
      text: `Buy and sell upgrade modules here. Its stock runs to tier ${yard.tier} modules${yard.tier < 3 ? '' : ', the best there are'}, and it will buy any module.`
    });
  const wanted = ship.traits.find((t) => t.kind === 'wanted' && t.planet === node.id);
  if (wanted)
    out.push({
      kind: 'wanted',
      icon: wantedIcon,
      title: "Can't show your face",
      text: `You let a debt to ${wanted.lender ?? 'someone'} on ${node.name} lapse, and they're looking for you. No shore leave here, and the more business you do, the likelier they find you.`
    });
  if (node.fuel === false)
    out.push({
      kind: 'nofuel',
      icon: noFuelIcon,
      title: 'No fuel station',
      text: "Nobody sells Star Fuel here. Arrive with enough to leave, or you'll be at the mercy of whoever will sell it to you."
    });
  if (node.contacts?.length)
    out.push({
      kind: 'contact',
      icon: contactIcon,
      title: node.contacts.length > 1 ? 'Contacts' : 'Contact',
      text: node.contacts.map((k) => `${k.name}, ${k.crew}'s contact`).join('\n')
    });
  for (const q of quests.filter((q) => q.danger?.planets.includes(node.id)))
    out.push({ kind: 'danger', icon: dangerIcon, title: 'Danger', text: plain(q.danger.text) });
  for (const q of quests.filter((q) => q.planets.includes(node.id)))
    out.push({ kind: 'quest', icon: questIcon, title: 'Quest', text: plain(q.text) });
  return out;
}

// One badge as a button (the map's info card, the System tab's header):
// tap it for what it means.
export function badgeEl(b) {
  const e = document.createElement('button');
  e.type = 'button';
  e.className = `badge ${b.kind}`;
  e.innerHTML = b.icon + (b.tier ? `<span class="tier">${b.tier}</span>` : '');
  e.setAttribute('aria-label', b.title);
  e.onclick = () => explain(b);
  return e;
}

// What a badge means: a dialog (one, shared). Anything else with a title
// and some text can use it too.
let dialog = null;
export function explain(b) {
  if (!dialog?.isConnected) {
    dialog = document.createElement('dialog');
    dialog.className = 'badge-info';
    dialog.innerHTML = `<form method="dialog"><h2></h2><p></p><menu><button>OK</button></menu></form>`;
    document.body.append(dialog);
  }
  dialog.querySelector('h2').textContent = b.title;
  dialog.querySelector('p').textContent = b.text;
  dialog.showModal();
}

// One badge as SVG (for the map), `size` px square at (x, y).
export function badgeSvg(b, x, y, size) {
  const inset = size * 0.15;
  const icon = b.icon.replace('<svg ', `<svg x="${x + inset}" y="${y + inset}" width="${size - 2 * inset}" height="${size - 2 * inset}" `);
  const tier = b.tier
    ? `<circle class="tier" cx="${x + size}" cy="${y + size}" r="6"/><text x="${x + size}" y="${y + size}" dy="0.36em">${b.tier}</text>`
    : '';
  return `<rect class="${b.kind}" x="${x}" y="${y}" width="${size}" height="${size}" rx="${b.kind === 'yard' ? 4 : size / 2}"/>${icon}${tier}`;
}
