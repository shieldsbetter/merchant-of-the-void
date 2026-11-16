import navIcon from 'game-icon:compass';

// The ship's officers, as the client last heard (each getShip; see api.js):
// for now the navigator, a crew member's id (or 'captain'), whose name gets
// a compass in front of it wherever it's shown.
let navigator = null;

export const setOfficers = (officers) => (navigator = officers?.navigator ?? null);
export const isNavigator = (crewId) => crewId != null && crewId === navigator;

// A person's name for display: the compass first, if `crewId` (a crew
// member's id, or 'captain') is the navigator's.
export function named(name, crewId) {
  const frag = document.createDocumentFragment();
  if (isNavigator(crewId)) {
    const i = document.createElement('i'); // (not a span: span styles shouldn't reach it)
    i.className = 'officer-icon';
    i.title = 'Navigator';
    i.innerHTML = navIcon;
    frag.append(i);
  }
  frag.append(name);
  return frag;
}
