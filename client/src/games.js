import { listGames, createGame, deleteGame, currentGame, setCurrentGame } from './api.js';
import { licensesLink } from './licenses.js';

// The game list: this device's games. Open one, start a new one (a new
// universe), or delete one.
export function mountGames(root) {
  root.innerHTML = `
    <div class="games">
      <h1>Your games</h1>
      <ul></ul>
      <button class="new">New game</button>
      <p class="error"></p>
      <footer></footer>
    </div>`;
  root.querySelector('footer').append(...licensesLink());
  const list = root.querySelector('ul');
  const error = root.querySelector('.error');
  let gone = false;

  const open = (id) => {
    setCurrentGame(id);
    location.hash = '#/system';
  };
  const draw = (games) => {
    if (gone) return;
    if (!games.length) {
      list.innerHTML = '<li class="none">No games yet.</li>';
      return;
    }
    list.replaceChildren(...games.map((g) => {
      const li = document.createElement('li');
      li.classList.toggle('current', g.id === currentGame());
      li.innerHTML = `
        <button class="open"><b></b><span></span></button>
        <button class="delete">Delete</button>`;
      li.querySelector('b').textContent = g.name;
      li.querySelector('span').textContent = `Cycle ${g.cycle} · ${g.at ?? '?'} · ${g.credits.toLocaleString()} cr`;
      li.querySelector('.open').onclick = () => open(g.id);
      li.querySelector('.delete').onclick = async () => {
        if (!confirm(`Delete ${g.name}? This can't be undone.`)) return;
        await deleteGame(g.id);
        if (g.id === currentGame()) setCurrentGame(null);
        draw(await listGames());
      };
      return li;
    }));
  };
  root.querySelector('.new').onclick = async () => {
    try {
      open((await createGame()).id);
    } catch (x) {
      error.textContent = x.message;
    }
  };
  listGames().then(draw, (x) => (error.textContent = x.message));
  return () => (gone = true);
}
