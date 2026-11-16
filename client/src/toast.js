// A short message that drops in from the top of the screen and fades away.
// A new one replaces any still showing.
let el, timer;
export function toast(text) {
    if (!el) {
        el = document.createElement('div');
        el.className = 'toast';
        document.body.append(el);
    }
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth; // restart the transition
    el.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('show'), 2200);
}
