import { getGoods, getShip, moveStack, splitStack } from './api.js';

// Cargo screen. Drag a stack onto another slot (any hold) to move, swap or merge;
// the server decides the outcome and sends back the whole ship.
// Long press or right click a stack to split it.
export function mountHolds(root) {
  root.innerHTML = `
    <div class="holds"><p class="credits-line"><b class="credits"></b> credits</p><p class="hold-msg"></p><div class="hold-list"></div></div>
    <dialog class="split">
      <form method="dialog">
        <h2></h2>
        <input type="range" name="qty" min="1" />
        <p><output></output> → new stack</p>
        <p class="error"></p>
        <menu><button value="cancel">Cancel</button><button value="ok">Split</button></menu>
      </form>
    </dialog>`;
  const list = root.querySelector('.hold-list');
  const dialog = root.querySelector('dialog');
  let goods = {};
  let ship = null;
  let gone = false;

  const render = (next) => {
    if (gone) return;
    ship = next;
    root.querySelector('.credits').textContent = ship.credits.toLocaleString();
    list.replaceChildren(...ship.holds.map((hold, h) => {
      const sec = document.createElement('section');
      sec.className = 'hold';
      sec.innerHTML = `<header><h2></h2><span class="tags"></span></header><div class="slots"></div>`;
      sec.querySelector('h2').textContent = hold.name;
      sec.querySelector('.tags').append(...hold.tags.map((t) => {
        const s = document.createElement('span');
        s.className = 'tag';
        s.textContent = t;
        return s;
      }));
      sec.querySelector('.slots').append(...hold.slots.map((st, s) => {
        const d = document.createElement('div');
        d.className = 'slot';
        d.dataset.hold = h;
        d.dataset.slot = s;
        if (st) {
          const g = goods[st.good];
          d.classList.add('full');
          d.classList.toggle('consigned', st.quest != null); // carried for a quest; see the Journal
          d.innerHTML = `<span class="name"></span><span class="qty"></span>`;
          d.querySelector('.name').textContent = g.name;
          d.querySelector('.qty').textContent = `${st.qty}/${g.stack}`;
        }
        return d;
      }));
      return sec;
    }));
  };

  Promise.all([getGoods(), getShip()]).then(([g, s]) => {
    goods = g;
    render(s);
  });

  const pos = (el) => ({ hold: Number(el.dataset.hold), slot: Number(el.dataset.slot) });

  const openSplit = (el) => {
    const at = pos(el);
    const st = ship.holds[at.hold].slots[at.slot];
    if (dialog.open || st.qty < 2) return;
    const range = dialog.querySelector('input');
    const out = dialog.querySelector('output');
    const err = dialog.querySelector('.error');
    dialog.querySelector('h2').textContent = `Split ${goods[st.good].name} (${st.qty})`;
    range.max = st.qty - 1;
    range.value = Math.floor(st.qty / 2);
    out.textContent = range.value;
    range.oninput = () => (out.textContent = range.value);
    err.textContent = '';
    dialog.onclose = null;
    dialog.querySelector('form').onsubmit = async (e) => {
      if (e.submitter?.value !== 'ok') return;
      e.preventDefault(); // keep it open until the server answers
      try {
        render(await splitStack(at, Number(range.value)));
        dialog.close();
      } catch (x) {
        err.textContent = x.message;
      }
    };
    dialog.showModal();
  };

  // Drag: pointer-based so it works on touch. Only filled slots start a drag
  // (and only they have touch-action: none), so the list still scrolls.
  let drag = null;

  const onDown = (e) => {
    const src = e.target.closest('.slot.full');
    if (!src || e.button !== 0) return;
    src.setPointerCapture(e.pointerId);
    drag = { src, x0: e.clientX, y0: e.clientY, ghost: null };
    if (e.pointerType === 'mouse') return; // mouse uses right click
    drag.timer = setTimeout(() => {
      drag = null;
      openSplit(src);
    }, 500);
  };

  const onMove = (e) => {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      clearTimeout(drag.timer);
      const r = drag.src.getBoundingClientRect();
      drag.ghost = drag.src.cloneNode(true);
      drag.ghost.classList.add('ghost');
      drag.ghost.style.width = `${r.width}px`;
      drag.ghost.style.height = `${r.height}px`;
      document.body.append(drag.ghost);
      drag.src.classList.add('dragging');
    }
    drag.ghost.style.transform = `translate(${e.clientX - drag.ghost.offsetWidth / 2}px, ${e.clientY - drag.ghost.offsetHeight / 2}px)`;
    list.querySelectorAll('.over').forEach((x) => x.classList.remove('over'));
    target(e)?.classList.add('over');
  };

  const target = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest('.slot');

  const onUp = async (e) => {
    if (!drag) return;
    const { src, ghost, timer } = drag;
    clearTimeout(timer);
    drag = null;
    ghost?.remove();
    src.classList.remove('dragging');
    list.querySelectorAll('.over').forEach((x) => x.classList.remove('over'));
    const dst = ghost && e.type === 'pointerup' && target(e);
    if (!dst || dst === src) return;
    try {
      render(await moveStack(pos(src), pos(dst)));
    } catch (x) {
      // Say why (e.g. this cargo needs a different kind of hold), briefly.
      const note = root.querySelector('.hold-msg');
      note.textContent = x.message;
      clearTimeout(note.timer);
      note.timer = setTimeout(() => (note.textContent = ''), 3000);
    }
  };

  list.addEventListener('pointerdown', onDown);
  list.addEventListener('pointermove', onMove);
  list.addEventListener('pointerup', onUp);
  list.addEventListener('pointercancel', onUp);
  // Right click; also swallows the browser's own long-press menu on touch.
  list.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const el = e.target.closest('.slot.full');
    if (el && !drag) openSplit(el);
  });

  return () => {
    gone = true;
    clearTimeout(drag?.timer);
    drag?.ghost?.remove();
  };
}
