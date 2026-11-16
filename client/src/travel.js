import { tripTick } from './api.js';

// Travelling between systems (see server/game.js's trip): the screen fades
// out to a clock, a circle whose hand swings round once a cycle (easing out
// of the top and back into it), the cycles left big in the middle. Each turn
// starts with asking the server for the next cycle (which may bring an
// encounter); at the top of the turn, once the answer's in, it goes round
// again, or stops: you've arrived, or something's out there (the hand
// rests at the top a moment first). The screen stays covered until the
// new visit's drawn (landed()).
const CYCLE = 750; // ms, one turn of the hand
const FADE = 300; // ms, out and back in
const UH_OH = 700; // ms, the hand stopped at the top before an encounter

let veil = null; // the overlay, while travelling

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fade out (unless already out) to the clock.
async function cover() {
  if (veil) return;
  veil = document.createElement('div');
  veil.className = 'travel';
  veil.innerHTML = `
    <svg viewBox="-50 -50 100 100" aria-label="Time passing">
      <circle r="44" />
      <line class="hand" x1="0" y1="-26" x2="0" y2="-38" />
      <text class="left" dy="0.35em"></text>
    </svg>`;
  document.body.append(veil);
  veil.getBoundingClientRect(); // (so the fade runs)
  veil.classList.add('on');
  await sleep(FADE);
}
// One turn of the hand, `left` cycles to go (this one included).
const turn = (left) => {
  veil.querySelector('.left').textContent = left;
  return veil.querySelector('.hand').animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: CYCLE, easing: 'ease-in-out' }).finished;
};

// Time passing where you are (say, waiting on repairs): `cycles` turns of
// the clock, nothing to roll. The screen stays covered until landed().
export async function pass(cycles) {
  await cover();
  for (let i = 0; i < cycles; i++) await turn(cycles - i);
}

// Travel on until there's a visit (arrived, or an encounter): it, as the
// server gave it. `trip`: the trip as it stands (see server/game.js).
export async function journey(trip) {
  await cover();
  try {
    for (let left = trip.left; ; ) {
      const next = tripTick();
      await turn(left);
      const v = await next;
      left = v.trip?.left;
      if (v.id) {
        if (v.space) await sleep(UH_OH);
        return v;
      }
    }
  } catch (x) {
    landed();
    throw x;
  }
}

// The new visit's drawn: fade back in on it.
export function landed() {
  const v = veil;
  if (!v) return;
  veil = null;
  v.classList.remove('on');
  setTimeout(() => v.remove(), FADE);
}
