import { named } from './officers.js';

// References in server text (see server/refs.js): [[planet:12|Anan]] is a
// link to that system's route; [[person:3|Pell Brandt]] is that person
// (with the navigator's compass, if it's them; `crew`, in older text). Who or what is meant comes
// from the id, never from matching a name.
const REF = /\[\[(planet|person|crew):([^|\]]+)\|([^\]]*)\]\]/g;

const STRUCK = /~~(.*?)~~/g; // ~~struck through~~

// The system you're in (see api.js: every visit from the server says): its
// name isn't a link, there being nowhere to go.
let here = null;
export const setHere = (id) => (here = id == null ? null : String(id));

// The text as nodes, references made, struck-through parts struck.
export function rich(text) {
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const m of text.matchAll(STRUCK)) {
        frag.append(refs(text.slice(at, m.index)));
        const s = document.createElement('s');
        s.append(refs(m[1]));
        frag.append(s);
        at = m.index + m[0].length;
    }
    frag.append(refs(text.slice(at)));
    return frag;
}

function refs(text) {
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const m of text.matchAll(REF)) {
        frag.append(text.slice(at, m.index));
        const [, kind, id, name] = m;
        if (kind === 'planet' && id === here) frag.append(name);
        else if (kind === 'planet') {
            const a = document.createElement('a');
            a.href = `#/route/${id}`;
            a.textContent = name;
            frag.append(a);
        } else
            frag.append(named(name, id === 'captain' ? 'captain' : Number(id)));
        at = m.index + m[0].length;
    }
    frag.append(text.slice(at));
    return frag;
}

// The text with references reduced to their names, for anywhere only plain
// text goes.
export const plain = (text) => text.replace(REF, '$3').replace(STRUCK, '$1');
