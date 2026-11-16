// An "Open Source Licenses" link and its dialog: the libraries we use; pick
// one for its license. The texts are big, so they load the first time it's
// opened. Returns the link and the dialog, to put on the page.
export function licensesLink() {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'licenses';
    link.textContent = 'Open Source Licenses';
    const dialog = document.createElement('dialog');
    dialog.className = 'licenses';
    dialog.innerHTML = `
    <form method="dialog">
      <h2>Open Source Licenses</h2>
      <div class="list"></div>
      <pre hidden></pre>
      <menu><button type="button" class="back" hidden>Back</button><button>Close</button></menu>
    </form>`;
    const list = dialog.querySelector('.list');
    const text = dialog.querySelector('pre');
    const back = dialog.querySelector('.back');
    const showList = () => {
        list.hidden = false;
        text.hidden = back.hidden = true;
        dialog.querySelector('h2').textContent = 'Open Source Licenses';
    };
    const fill = (licenses) =>
        list.replaceChildren(
            ...licenses.map((l) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.innerHTML = `<b></b><span></span>`;
                b.querySelector('b').textContent = l.name;
                b.querySelector('span').textContent =
                    `${l.version} · ${l.license}`;
                b.onclick = () => {
                    dialog.querySelector('h2').textContent = l.name;
                    text.textContent = l.text;
                    list.hidden = true;
                    text.hidden = back.hidden = false;
                    text.scrollTop = 0;
                };
                return b;
            }),
        );
    back.onclick = showList;
    link.onclick = async () => {
        if (!list.children.length)
            fill((await import('virtual:licenses')).default);
        showList();
        dialog.showModal();
    };
    return [link, dialog];
}
