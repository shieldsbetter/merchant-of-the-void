import { devHunter, devRepair, devFirefight } from './api.js';

// The Menu tab: back to the game list, and a Dev section of testing shortcuts.
export function mountMenu(root) {
  root.innerHTML = `
    <div class="main-menu menu">
      <a class="button" href="#/games">Back to Game List</a>
    </div>
    <h4 class="menu-head">Dev</h4>
    <div class="dev menu">
      <button data-do="hunter">Trigger bounty hunter</button>
      <button data-do="firefight">Trigger firefight</button>
      <button data-do="repair">Full repair</button>
      <p class="msg"></p>
    </div>`;
  const msg = root.querySelector('.msg');
  root.querySelector('.dev').onclick = async (e) => {
    const what = e.target.closest('button')?.dataset.do;
    if (!what) return;
    try {
      if (what === 'hunter') {
        const { now } = await devHunter();
        msg.textContent = now ? 'The hunter is on you. Close this to face them.' : "The hunter will be waiting when you next dock.";
      } else if (what === 'firefight') {
        const { now } = await devFirefight();
        msg.textContent = now ? 'Hunters are in the docking bay. Close this to fight.' : 'Hunters will storm the bay when you next dock.';
      } else {
        const ship = await devRepair();
        const e = ship.stats.effective;
        msg.textContent = `Repaired: hull ${e.hull}/${e.maxHull}, critical systems ${e.crits}/${e.maxCrits}, not Limping.`;
      }
    } catch (x) {
      msg.textContent = x.message;
    }
  };
  return () => {};
}
