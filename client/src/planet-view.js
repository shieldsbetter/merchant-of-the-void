import Planet from '@shieldsbetter/planet';
import enemyIcon from 'game-icon:crosshair';

import {
    getPlanet,
    getCompiledPlanet,
    getGoods,
    getShip,
    getVisit,
    getUniverse,
    getJournal,
    act,
    currentGame,
    isNews,
} from './api.js';
import { badges, badgeEl } from './badges.js';
import { named } from './officers.js';
import { rich } from './refs.js';
import { toast } from './toast.js';
import { journey, pass, landed } from './travel.js';

// The System tab: the system you're in, and its thread since you arrived
// (feed + conversation stack, kept on the server; and the thread as drawn,
// kept here: see `kept`), with a widget for
// whichever conversation is on top. Departing (from the root menu) arrives
// somewhere else, and the view moves on with it.
export function mountSystem(root) {
    let id = null; // the system shown
    root.innerHTML = `
    <div class="visit">
      <header><div><div class="title"><h1></h1><div class="badges"></div></div><div class="credits"></div></div></header>
      <div class="planet"></div>
      <div class="odds" hidden></div>
      <div class="fight" hidden></div>
      <ol class="feed"></ol>
    </div>`;
    const $ = (s) => root.querySelector(s);
    let feed = $('.feed');
    let planet = null;
    let gone = false;
    let goods = {};

    const bubble = (kind, content) => {
        const li = document.createElement('li');
        li.className = kind;
        li.append(content);
        return li;
    };
    // A line of the feed. Someone speaking gets a chat bubble: their name on
    // top (in their own colour), the words beneath; a run of lines from the
    // same person shares one name, and the bubbles sit closer.
    const say = (item, i, all) => {
        // A blank line is a paragraph break: a little space, not a whole line.
        const text = document.createElement('span');
        text.className = 'text';
        text.append(
            ...item.text.split(/\n\s*\n/).map((para) => {
                const p = document.createElement('span');
                p.className = 'para';
                p.append(rich(para));
                return p;
            }),
        );
        const li = bubble(item.kind, text);
        const prev = all?.[i - 1];
        const cont =
            prev &&
            prev.kind === item.kind &&
            prev.who === item.who &&
            item.kind !== 'event';
        if (cont) li.classList.add('cont');
        if (item.who && !cont) {
            const who = document.createElement('b');
            who.className = 'who';
            who.append(named(item.who, item.person ?? item.crew)); // (`crew`, in older lines)
            who.style.color = nameColor(item.who);
            li.prepend(who);
        }
        return li;
    };

    // The system itself: its name, market data, and planet (which the server
    // bakes; see server/planets.js). The planet appears whenever it arrives;
    // nothing waits for it.
    // Out in space (an encounter on the way: `space`), there's no planet, just
    // where you are: between two systems.
    const enter = async (to, space) => {
        id = to;
        planet?.destroy();
        planet = null;
        if (space)
            return void ($('h1').textContent =
                `Somewhere between ${space.fromName} and ${space.toName}`);
        getCompiledPlanet(to).then(
            (c) => {
                if (!gone && id === to) planet = Planet.from($('.planet'), c);
            },
            () => {},
        );
        const data = await getPlanet(to);
        if (!gone && id === to) $('h1').textContent = data.name;
    };

    // Delivering the feed: lines new since it was last drawn appear one at a
    // time, sliding up from the bottom, each followed by a pause for its
    // weight (an item's own `weight`, in ms, or its length: longer lines take
    // longer to read); the widget comes last. Opening the tab again picks up
    // the thread as it was left (see `kept`: spent widgets and all), and
    // delivers the rest. A newer delivery (say, after you act again) takes
    // over from wherever this one had got to.
    let delivered = 0; // feed items on screen
    let deliveredAt = null; // the visit they're of
    let run = 0; // the delivery in progress
    const pause = (item) =>
        item.weight ??
        (item.kind === 'you'
            ? 250
            : Math.min(2200, 350 + item.text.length * 22));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // `loaded`: the visit as loaded when the tab opened, not after you did
    // something. A thread not kept here, loaded so, is history, and shows at
    // once (unless it's news: a brand new game, or you just departed from the map).
    const deliver = async (visit, widget, loaded) => {
        const mine = ++run,
            key = `${currentGame()}:${visit.id ?? visit.planet}`;
        // A different visit (you've departed, or just opened the tab): its
        // thread starts afresh.
        let resumed = false;
        if (
            deliveredAt !== key &&
            kept?.key === key &&
            kept.delivered <= visit.feed.length
        ) {
            // This thread, as it was when the tab was last open.
            feed.replaceWith(kept.feed);
            feed = kept.feed;
            delivered = kept.delivered;
            deliveredAt = key;
            resumed = true;
        } else if (deliveredAt !== key || delivered > visit.feed.length) {
            feed.replaceChildren();
            delivered = 0;
            deliveredAt = key;
        }
        kept = { key, feed, delivered };
        // The last widget: if you used it (chose something, or traded), it stays
        // where it is, spent, so nothing reflows; otherwise it's redrawn below.
        const old = feed.querySelector(':scope > li.widget:not(.spent)');
        if (old?.querySelector('.chosen, .used')) spend(old);
        else old?.remove();
        const history =
            loaded &&
            !resumed &&
            delivered === 0 &&
            !isNews(currentGame(), visit.id);
        const instant = history || (resumed && delivered >= visit.feed.length);
        // (Straight to the end of what was there already, then the new.)
        if (resumed) feed.lastElementChild?.scrollIntoView({ block: 'end' });
        while (delivered < visit.feed.length) {
            const item = visit.feed[delivered];
            const li = say(item, delivered, visit.feed);
            delivered++;
            kept.delivered = delivered;
            feed.append(li);
            if (history) continue;
            li.classList.add('arriving');
            li.scrollIntoView({ block: 'end', behavior: 'smooth' });
            await sleep(pause(item));
            if (mine !== run || gone) return;
        }
        const w = bubble('widget', widget);
        if (!instant) w.classList.add('arriving');
        feed.append(w);
        w.scrollIntoView({
            block: 'end',
            behavior: instant ? 'auto' : 'smooth',
        });
    };

    // Redraw from the server's visit.
    const show = async (visit, loaded = false) => {
        if (gone) return;
        const place = visit.space ? visit.id : visit.planet; // (what's in the header)
        if (place !== id) await enter(place, visit.space);
        drawn = shape(visit);
        const top = visit.stack.at(-1);
        const [widget, ship, universe, journal] = await Promise.all([
            WIDGETS[top.kind]({ id: visit.planet, goods, send, top, visit }),
            getShip(),
            getUniverse(),
            getJournal(),
        ]);
        if (gone) return;
        // The system's badges, as on the map (tap one for what it means).
        $('header .badges').replaceChildren(
            ...(visit.space
                ? []
                : badges(
                      universe.nodes[visit.planet],
                      ship,
                      journal.quests,
                  ).map(badgeEl)),
        );
        $('header .credits').innerHTML =
            `<span></span> – <span class="fuel"></span>`;
        $('header .credits span').textContent =
            `${ship.credits.toLocaleString()} cr`;
        $('header .credits .fuel').textContent =
            `${ship.fuel}/${ship.stats.effective.fuelCap} fuel`;
        // In a space fight the odds take the planet's place; in a firefight, the
        // combatants in turn order.
        // (Not until you've clicked through its alert.)
        const fighting = (kind) => top.kind === kind && top.phase !== 'alert';
        const fresh = $('.odds').hidden; // a fight just starting: no animation
        $('.planet').hidden = fighting('combat') || fighting('firefight');
        $('.odds').hidden = !fighting('combat');
        $('.fight').hidden = !fighting('firefight');
        // A firefight leaves the feed for its own screen.
        $('.visit').classList.toggle('fighting', fighting('firefight'));
        if (fighting('combat')) drawOdds($('.odds'), top, fresh);
        if (fighting('firefight')) drawFight($('.fight'), top, send);
        else $('.fight').replaceChildren();
        deliver(visit, widget, loaded);
        landed(); // (arrived from travelling: the new system's up)
    };
    // The stack as last drawn, to spot a stale screen (say, the visit moved on
    // in another tab): if an action fails and the server's stack differs,
    // redraw what's really there instead of reporting the error.
    let drawn = '';
    const shape = (visit) =>
        `${visit.planet}:${visit.stack.map((e) => e.kind).join('>')}`;
    // (Departing, or carrying on after an encounter: time passes on the way,
    // until there's somewhere to be; see travel.js.)
    // `wait`: cycles that pass doing it (say, repairs), on the clock.
    const send = async (body, { wait = 0 } = {}) => {
        try {
            const passing = wait && pass(wait);
            let v;
            try {
                v = await act(body);
            } catch (x) {
                landed();
                throw x;
            }
            await passing;
            if (!v.id && v.trip) v = await journey(v.trip);
            await show(v);
        } catch (x) {
            const now = await getVisit();
            if (shape(now) === drawn) throw x;
            await show(now);
        }
    };

    (async () => {
        let [visit, g] = await Promise.all([getVisit(), getGoods(), getShip()]); // (the ship: who's navigator)
        if (gone) return;
        goods = g;
        // On the way somewhere (say, the page was reloaded mid-trip): travel on.
        const travelling = !visit.id && visit.trip;
        if (travelling) visit = await journey(visit.trip);
        if (gone) return;
        show(visit, !travelling);
    })();

    return () => {
        gone = true;
        planet?.destroy();
    };
}

// The combat panel. Up top, a tug-of-war bar: the hunter's chance of winning
// (left) pressing against yours (right), so the boundary moves left as your
// odds improve. Then each ship's hull and critical systems. After a round,
// bars slide and numbers count to their new values over a second; a fresh
// fight (`instant`) just shows them.
const ENDED = { win: 'You won', lose: 'You lost', escape: 'You got away' };
const TWEEN = 1000; // ms; matches the CSS transitions

function drawOdds(el, { odds, me, them, phase, outcome }, instant) {
    if (!el.firstChild) {
        el.innerHTML = `
      <div class="tug"><span class="them"></span><span class="me"></span><b class="pt"></b><b class="pm"></b></div>
      <div class="tug-label"><span class="who-them"></span><span class="what"></span><span>You</span></div>
      ${['me', 'them']
          .map(
              (k) => `
        <div class="side ${k}">
          <div class="who"></div>
          <div class="bar"><span></span></div>
          <div class="nums"><span class="hull"></span> hull · <span class="crits"></span></div>
        </div>`,
          )
          .join('')}`;
    }
    const $ = (s) => el.querySelector(s);
    el.classList.toggle('instant', instant);
    el.classList.toggle('over', phase === 'over');
    el.dataset.outcome = phase === 'over' ? outcome : '';
    $('.who-them').textContent = them.name;
    $('.what').textContent =
        phase === 'over' ? ENDED[outcome] : 'chance to win';
    $('.tug .them').style.width = `${(1 - odds) * 100}%`;
    count($('.pt'), (1 - odds) * 100, (n) => `${Math.round(n)}%`, instant);
    count($('.pm'), odds * 100, (n) => `${Math.round(n)}%`, instant);
    for (const [k, s, name] of [
        ['me', me, 'You'],
        ['them', them, them.name],
    ]) {
        $(`.side.${k} .who`).textContent = name;
        $(`.side.${k} .bar > span`).style.width =
            `${(s.hull / s.maxHull) * 100}%`;
        count(
            $(`.side.${k} .hull`),
            s.hull,
            (n) => `${Math.round(n)}/${s.maxHull}`,
            instant,
        );
        $(`.side.${k} .crits`).textContent =
            '◆'.repeat(Math.max(0, s.crits)) +
            '◇'.repeat(s.maxCrits - Math.max(0, s.crits));
    }
}

// The thread as last drawn ({ key: 'game:visit', feed: its <ol>, delivered:
// how many feed items it shows }), so coming back to the System tab picks
// it up where it was, without redrawing it. (A reload starts over from
// the server's feed: what only the screen had, like spent widgets, is gone.)
let kept = null;

// Each speaker's name colour, as a chat app gives each person one: picked
// from a small palette by their name, so it's always the same.
const NAME_COLORS = [
    '#ff8a80',
    '#ffb74d',
    '#ffd54f',
    '#81c784',
    '#4dd0e1',
    '#7fb4ff',
    '#b39ddb',
    '#f48fb1',
];
function nameColor(name) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return NAME_COLORS[Math.abs(h) % NAME_COLORS.length];
}

// The firefight screen (it takes over from the feed): the enemy's cards in a
// carousel along the top, yours along the bottom, and between them what's
// happening. Each turn a wheel spins for whose it is (2 seconds; a tap skips
// it) and their card comes to the middle; then, for one of yours, the
// abilities you're offered (tap one, then a target card if it needs one,
// then confirm); then what happened, and Continue.
const ABILITIES = {
    drop: {
        name: 'Drop',
        help: 'Take a shot at someone in the open. It drops them, unless their luck holds.',
        pick: 'Choose who to drop.',
        go: (t) => `Drop ${t}`,
    },
    cover: {
        name: 'Take cover',
        help: "Get behind something. Nobody can drop you until you're flushed out.",
        go: () => 'Take cover',
    },
    flush: {
        name: 'Flush out',
        help: 'Drive someone out of cover, into the open.',
        pick: 'Choose who to flush out.',
        go: (t) => `Flush out ${t}`,
    },
    pin: {
        name: 'Pin',
        help: 'Keep someone in cover pinned down: they lose their next turn.',
        pick: 'Choose who to pin.',
        go: (t) => `Pin ${t}`,
    },
    drag: {
        name: 'Drag',
        help: "Pull a fallen ally to safety. They're out of the fight, but spared the worst of it.",
        pick: 'Choose who to drag to safety.',
        go: (t) => `Drag ${t} clear`,
    },
    rally: {
        name: 'Rally',
        help: 'Steady your side: its morale rises.',
        go: () => 'Rally',
    },
    order: {
        name: 'Order',
        help: 'Send someone in the open into cover.',
        pick: 'Choose who to send into cover.',
        go: (t) => `Order ${t} into cover`,
    },
    collect: {
        name: 'Collect yourself',
        help: "Take a breath. Your side's morale rises a little.",
        go: () => 'Collect yourself',
    },
};
const STATUS = (p) =>
    p.state === 'down'
        ? 'Down'
        : p.state === 'safe'
          ? 'Dragged clear'
          : p.pinned
            ? 'Pinned'
            : p.cover
              ? 'In cover'
              : 'In the open';
const SPIN = 2000;

function drawFight(el, top, send) {
    const { f, phase } = top;
    if (!el.firstChild) {
        const side = (cls, title) => `
      <div class="side ${cls}">
        <div class="side-head"><span>${title}</span><span class="morale">Morale <b></b><i><span></span></i></span></div>
        <div class="carousel"><button type="button" class="scroll back" aria-label="Scroll back">‹</button><div class="cards"></div><button type="button" class="scroll on" aria-label="Scroll on">›</button></div>
      </div>`;
        el.innerHTML = `${side('theirs', 'Them')}<div class="stage"></div>${side('ours', 'Your crew')}`;
        for (const c of el.querySelectorAll('.carousel')) {
            const cards = c.querySelector('.cards');
            c.querySelector('.back').onclick = () =>
                cards.scrollBy({ left: -160, behavior: 'smooth' });
            c.querySelector('.on').onclick = () =>
                cards.scrollBy({ left: 160, behavior: 'smooth' });
        }
        el._seq = 0; // the turn whose wheel has been spun
    }
    const byId = Object.fromEntries(f.people.map((p) => [p.id, p]));
    const stage = el.querySelector('.stage');
    let picked = null; // { ability, target } being chosen
    const option = () => f.options.find((o) => o.ability === picked?.ability);

    // The cards, and each side's morale.
    const cards = () => {
        for (const [cls, side] of [
            ['theirs', 'enemy'],
            ['ours', 'crew'],
        ]) {
            const box = el.querySelector(`.${cls}`);
            box.querySelector('.morale b').textContent = f.morale[side];
            box.querySelector('.morale i span').style.width =
                `${f.morale[side]}%`;
            const list = box.querySelector('.cards');
            const spun = el._seq === f.seq;
            list.replaceChildren(
                ...f.people
                    .filter((p) => p.side === side)
                    .map((p) => {
                        const card = document.createElement('div');
                        const now = spun && p.id === f.turn && phase !== 'over';
                        const targetable =
                            picked && option()?.targets?.includes(p.id);
                        card.className = `card ${p.state}${p.cover ? ' cover' : ''}${now ? ' now' : ''}${targetable ? ' target' : ''}${picked?.target === p.id ? ' picked' : ''}`;
                        card.dataset.id = p.id;
                        card.innerHTML = `${p.side === 'enemy' ? `<span class="foe">${enemyIcon}</span>` : ''}<b class="nm"></b><span class="ttl"></span><span class="st"></span><span class="luck"></span>`;
                        card.querySelector('.nm').append(
                            named(p.name, p.crewId),
                        );
                        card.querySelector('.ttl').textContent =
                            p.title ?? (p.leader ? 'Leader' : '');
                        card.querySelector('.st').textContent = STATUS(p);
                        if (p.maxLuck)
                            card.querySelector('.luck').textContent =
                                'Luck ' +
                                '◆'.repeat(p.luck) +
                                '◇'.repeat(p.maxLuck - p.luck);
                        if (targetable)
                            card.onclick = () => (
                                (picked.target = p.id),
                                cards(),
                                choosing()
                            );
                        return card;
                    }),
            );
        }
    };
    const center = (id) =>
        el.querySelector(`.card[data-id="${id}"]`)?.scrollIntoView({
            inline: 'center',
            block: 'nearest',
            behavior: 'smooth',
        });

    // One of yours to act: the abilities on offer, what the chosen one does,
    // and a button to do it (once it has its target).
    const choosing = () => {
        const me = byId[f.turn];
        // (Whose turn it is shows on their card. The help, the target prompt and
        // the button keep their space whether they're showing or not, so
        // choosing doesn't shift anything around.)
        stage.innerHTML = `<p class="failed"></p><div class="abilities"></div><p class="help"></p><p class="pick"></p><button type="button" class="confirm"></button><p class="error"></p>`;
        stage.querySelector('.failed').textContent = f.failed
            ? `${me.name} fails a grit check and is too scared to move.`
            : '';
        if (f.options.length === 1 && !picked)
            picked = { ability: f.options[0].ability };
        stage.querySelector('.abilities').replaceChildren(
            ...f.options.map((o) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = `ability${picked?.ability === o.ability ? ' on' : ''}`;
                b.textContent = ABILITIES[o.ability].name;
                b.onclick = () => {
                    picked = {
                        ability: o.ability,
                        target: o.targets?.length === 1 ? o.targets[0] : null,
                    };
                    cards();
                    choosing();
                };
                return b;
            }),
        );
        const confirm = stage.querySelector('.confirm');
        const pick = stage.querySelector('.pick');
        const o = option();
        pick.textContent = o?.targets ? ABILITIES[o.ability].pick : '\u00a0';
        if (!o) {
            stage.querySelector('.help').textContent = 'Choose what to do.';
            pick.classList.add('done');
            confirm.textContent = '\u00a0';
            confirm.classList.add('waiting');
            return;
        }
        const a = ABILITIES[o.ability];
        const needs = o.targets && !picked.target;
        stage.querySelector('.help').textContent = a.help;
        pick.classList.toggle('done', !needs);
        confirm.textContent = a.go(
            picked.target ? byId[picked.target].name : '',
        );
        confirm.disabled = !!needs;
        confirm.onclick = async () => {
            confirm.disabled = true;
            try {
                await send({
                    action: 'act',
                    ability: picked.ability,
                    target: picked.target,
                });
            } catch (x) {
                stage.querySelector('.error').textContent = x.message;
                confirm.disabled = false;
            }
        };
    };

    // What just happened, and Continue (or, at the end, the outcome).
    const result = () => {
        stage.innerHTML = `<div class="result"><h3></h3><p></p><button type="button" class="confirm">Continue</button><p class="error"></p></div>`;
        stage.querySelector('h3').textContent =
            phase === 'over' ? (f.over === 'crew' ? 'Victory' : 'Defeat') : '';
        stage.querySelector('h3').hidden = phase !== 'over';
        stage.querySelector('.result p').textContent = f.result;
        const b = stage.querySelector('.confirm');
        b.onclick = async () => {
            b.disabled = true;
            try {
                await send({ action: phase === 'over' ? 'close' : 'next' });
            } catch (x) {
                stage.querySelector('.error').textContent = x.message;
                b.disabled = false;
            }
        };
    };

    const settle = () => {
        el._seq = f.seq;
        cards();
        center(f.turn);
        if (phase === 'choose') choosing();
        else result();
    };

    cards();
    if (el._seq === f.seq) return settle();

    // A new turn: spin the wheel for whose it is. Slices by initiative, named;
    // it settles with the chosen one under the pointer at the top.
    const total = f.slices.reduce((n, s) => n + s.weight, 0);
    let at = 0;
    const arcs = f.slices.map((s) => {
        const from = (at / total) * 360,
            to = ((at += s.weight) / total) * 360;
        return { ...s, from, to, mid: (from + to) / 2 };
    });
    const pt = (deg, r) => [
        Math.sin((deg * Math.PI) / 180) * r,
        -Math.cos((deg * Math.PI) / 180) * r,
    ];
    const svgNS = 'http://www.w3.org/2000/svg';
    stage.innerHTML = `<div class="wheel"><svg viewBox="-110 -118 220 228"><g class="spin"></g><path class="pointer" d="M -9 -114 L 9 -114 L 0 -96 Z"/></svg><p class="dim">Whose turn? <span>(tap to skip)</span></p></div>`;
    const g = stage.querySelector('.spin');
    arcs.forEach((s, i) => {
        const [x1, y1] = pt(s.from, 100),
            [x2, y2] = pt(s.to, 100);
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute(
            'd',
            arcs.length === 1
                ? 'M 0 -100 A 100 100 0 1 1 -0.01 -100 Z'
                : `M 0 0 L ${x1} ${y1} A 100 100 0 ${s.to - s.from > 180 ? 1 : 0} 1 ${x2} ${y2} Z`,
        );
        path.setAttribute('class', `slice ${byId[s.id].side} n${i % 2}`);
        const [tx, ty] = pt(s.mid, 62);
        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute(
            'transform',
            `translate(${tx} ${ty}) rotate(${s.mid > 180 ? s.mid + 90 : s.mid - 90})`,
        );
        text.textContent = byId[s.id].name.split(' ')[0];
        g.append(path, text);
    });
    const chosen = arcs.find((s) => s.id === f.turn);
    const end = 360 * 4 - chosen.mid;
    g.style.transform = 'rotate(0deg)';
    let done = false;
    const finish = () => {
        if (done) return;
        done = true;
        settle();
    };
    requestAnimationFrame(() =>
        requestAnimationFrame(() => {
            g.style.transition = `transform ${SPIN}ms cubic-bezier(0.15, 0.6, 0.2, 1)`;
            g.style.transform = `rotate(${end}deg)`;
        }),
    );
    const timer = setTimeout(finish, SPIN + 250);
    stage.querySelector('.wheel').onclick = () => {
        clearTimeout(timer);
        finish();
    };
}

// Count an element's number from its last value to `to` over TWEEN ms.
function count(node, to, fmt, instant) {
    cancelAnimationFrame(node._raf);
    const from = instant || node._v == null ? to : node._v;
    const t0 = performance.now();
    const step = (t) => {
        const k = Math.min(1, (t - t0) / TWEEN);
        const e = 1 - (1 - k) ** 3; // ease out, like the CSS
        node._v = from + (to - from) * e;
        node.textContent = fmt(node._v);
        if (k < 1) node._raf = requestAnimationFrame(step);
    };
    step(t0);
}

// A widget of buttons, each sending its data-action (plus any other data-*).
// The one you pressed is `chosen` (see spend).
function choices(div, send) {
    div.onclick = async (e) => {
        const b = e.target.closest('button');
        const { action, ...data } = b?.dataset ?? {};
        if (!action) return;
        const was = [...div.querySelectorAll('button')].map((b) => b.disabled);
        div.querySelectorAll('button').forEach((b) => (b.disabled = true));
        b.classList.add('chosen');
        try {
            await send({ action, ...data });
        } catch (x) {
            b.classList.remove('chosen');
            div.querySelector('.error').textContent = x.message;
            div.querySelectorAll('button').forEach(
                (b, i) => (b.disabled = was[i]),
            );
        }
    };
    return div;
}

// A widget you've used, left in the feed: everything in it disabled (the
// choice you made, highlighted), any error gone.
function spend(li) {
    li.classList.add('spent');
    li.querySelectorAll('button, input, select, textarea').forEach(
        (el) => (el.disabled = true),
    );
    li.querySelectorAll('.error').forEach((el) => (el.textContent = ''));
    li.querySelectorAll('dialog[open]').forEach((d) => d.close());
}

// A fight about to start: one button to click through to it.
function alertButton(div, send, label) {
    div.innerHTML = `<button data-action="ready" class="alert"></button><p class="error"></p>`;
    div.querySelector('button').textContent = label;
    return choices(div, send);
}

// One widget per conversation kind. Each returns an element; `send` posts an
// action to the top conversation and redraws.
const WIDGETS = {
    // The root conversation: what to do at this planet.
    async menu({ send, top, visit }) {
        const ship = await getShip();
        const div = document.createElement('div');
        div.className = 'menu';
        div.innerHTML = `
      <div class="engage"></div>
      <button data-action="trade">Trade</button>
      <button data-action="leave">Shore Leave <span class="dim">${visit.lyingLow ? 'not here' : `${top.leaveCost} cr`}</span></button>
      ${visit.office ? '<button data-action="office" class="office"></button>' : ''}
      ${visit.shipyard ? '<button data-action="shipyard">Ship Yard...</button>' : ''}
      ${visit.shipyard && (ship.combat.wear || ship.combat.lostCrits) ? '<button data-action="repair">Repairs...</button>' : ''}
      ${visit.contacts ? '<button data-action="contacts">Local contacts...</button>' : ''}
      ${visit.trouble ? '<button data-action="trouble" class="trouble">We might be in trouble...</button>' : ''}
      <button data-action="depart" class="go"></button>
      <p class="error"></p>`;
        // Departing takes the next hop of the course laid in on the map.
        const c = visit.course;
        const depart = div.querySelector('.go');
        if (c) {
            depart.textContent = `Depart for ${c.nextName} `;
            depart.insertAdjacentHTML('beforeend', `<span class="dim"></span>`);
            depart.querySelector('.dim').textContent =
                `${c.fuel} fuel${c.hops > 1 ? ` · course to ${c.destName}` : ''}`;
            depart.disabled = ship.fuel < c.fuel;
        } else {
            depart.innerHTML =
                'Depart <span class="dim">lay in a course on the Nav map</span>';
            depart.disabled = true;
        }
        // What's going on here that you can get back into (quests register these).
        div.querySelector('.engage').replaceWith(
            ...(visit.engage ?? []).map((label, index) => {
                const b = document.createElement('button');
                Object.assign(b.dataset, { action: 'engage', index });
                b.className = 'engage';
                b.textContent = label;
                return b;
            }),
        );
        const office = div.querySelector('.office');
        if (office) office.textContent = `${visit.office} office...`;
        // Where you can't show your face, nothing that takes time.
        div.querySelector('[data-action="leave"]').disabled =
            visit.lyingLow || ship.credits < top.leaveCost;
        return choices(div, send);
    },

    // A crew member telling you something; one reply.
    async notice({ send, top }) {
        const div = document.createElement('div');
        div.className = 'menu';
        div.innerHTML = `<button data-action="ok"></button><p class="error"></p>`;
        div.querySelector('button').textContent = top.reply;
        return choices(div, send);
    },

    // Port control's done with you (see server/arrival.js): on to business.
    async arrival({ send }) {
        const div = document.createElement('div');
        div.className = 'menu';
        div.innerHTML = `<button data-action="ok">Let's get to business.</button><p class="error"></p>`;
        return choices(div, send);
    },

    // A lender who's caught you: pay double, or fight them and their mercs.
    async confront({ send, top }) {
        const ship = await getShip();
        const div = document.createElement('div');
        div.className = 'menu';
        div.innerHTML = `
      <button data-action="pay">Pay double <span class="dim">${(top.owed * 2).toLocaleString()} cr</span></button>
      <button data-action="fight">You'll get nothing from me <span class="dim">fight them</span></button>
      <p class="error"></p>`;
        div.querySelector('[data-action="pay"]').disabled =
            ship.credits < top.owed * 2;
        return choices(div, send);
    },

    // Boarded by a hunter who beat you in space: give up, or fight.
    async boarding({ send, top }) {
        const div = document.createElement('div');
        div.className = 'menu';
        div.innerHTML = `
      <button data-action="surrender">Stand down <span class="dim">lose the hold</span></button>
      <button data-action="repel">Repel boarders <span class="dim">fight 2–3 ${top.enemy === 'pirate' ? 'pirates' : 'hunters'}</span></button>
      <p class="error"></p>`;
        return choices(div, send);
    },

    // A firefight: its alert, then its own screen (see drawFight); nothing
    // more in the feed.
    async firefight({ send, top }) {
        const div = document.createElement('div');
        div.className = 'menu firefight';
        if (top.phase === 'alert')
            return alertButton(div, send, top.ready ?? 'Ready.');
        return div;
    },

    // A fight: keep at it, or try to get away. Once it's over, close it. A
    // bounty hunter talks first: pay them off (if you've the money), or don't.
    async combat({ send, top }) {
        const div = document.createElement('div');
        div.className = 'menu';
        if (top.phase === 'alert')
            return alertButton(div, send, top.ready ?? 'Ready.');
        const owed = `<span class="dim">${top.owed?.toLocaleString()} cr</span>`;
        if (top.phase === 'talk' || top.phase === 'offer') {
            const ship = await getShip();
            div.innerHTML =
                top.phase === 'talk'
                    ? `<button data-action="claim"></button><button data-action="refuse">You'll get nothing from me.</button>`
                    : `<button data-action="pay">Take it. ${owed}</button><button data-action="refuse">On second thought, no.</button>`;
            div.insertAdjacentHTML('beforeend', '<p class="error"></p>');
            const claim = div.querySelector('[data-action="claim"]');
            if (claim) {
                claim.textContent = top.them.talk.claim;
                claim.insertAdjacentHTML('beforeend', ` ${owed}`);
                claim.disabled = ship.credits < top.owed;
            }
            return choices(div, send);
        }
        div.innerHTML =
            top.phase === 'over'
                ? `<button data-action="close">Close</button><p class="error"></p>`
                : `
      <button data-action="fight">${top.phase === 'start' ? 'Fight' : 'Keep fighting'}</button>
      <button data-action="escape">Try to escape <span class="dim">${Math.round(top.escape * 100)}%</span></button>
      <p class="error"></p>`;
        return choices(div, send);
    },

    // Repairs at a ship yard (see server/repair.js): how much hull, and how
    // many critical systems, to restore; the time and cost of it; Accept
    // (time passes on the clock) or Back.
    async repair({ send, top }) {
        const ship = await getShip();
        const div = document.createElement('div');
        div.className = 'menu repair';
        div.innerHTML = `
      <label class="row"><span>Hull <b class="hull"></b></span><input type="range" name="hull" min="0" step="1" /></label>
      <label class="row"><span>Critical systems <b class="crits"></b></span><input type="range" name="crits" min="0" step="1" /></label>
      <p class="quote"></p>
      <button data-action="accept" class="go">Accept</button>
      <button data-action="back">Back</button>
      <p class="error"></p>`;
        const hull = div.querySelector('[name=hull]'),
            crits = div.querySelector('[name=crits]');
        hull.max = top.wear;
        crits.max = top.lostCrits;
        hull.value = top.wear; // (all of it, to start)
        crits.value = top.lostCrits;
        hull.closest('label').hidden = !top.wear;
        crits.closest('label').hidden = !top.lostCrits;
        const accept = div.querySelector('[data-action=accept]');
        const quote = () => {
            const h = +hull.value,
                c = +crits.value;
            const cycles = Math.ceil(
                h * top.rates.hull.cycles + c * top.rates.crit.cycles - 1e-9,
            );
            const cost = h * top.rates.hull.cost + c * top.rates.crit.cost;
            div.querySelector('.hull').textContent =
                `${top.hull} → ${top.hull + h}/${top.maxHull}`;
            div.querySelector('.crits').textContent =
                `${'◆'.repeat(top.crits)}${'◇'.repeat(top.maxCrits - top.crits)} → ${'◆'.repeat(top.crits + c)}${'◇'.repeat(top.maxCrits - top.crits - c)}`;
            div.querySelector('.quote').textContent =
                h || c
                    ? `${cycles} cycle${cycles === 1 ? '' : 's'} ashore · ${cost.toLocaleString()} cr`
                    : top.wear || top.lostCrits
                      ? 'Choose what to repair.'
                      : 'Nothing needs repairing.';
            accept.disabled = !(h || c) || cost > ship.credits;
            accept.dataset.hull = h;
            accept.dataset.crits = c;
            accept.dataset.cycles = cycles;
            return cycles;
        };
        hull.oninput = crits.oninput = quote;
        quote();
        // Accepting: time passes on the clock while it's done.
        choices(div, (body) =>
            send(body, {
                wait: body.action === 'accept' ? Number(body.cycles) : 0,
            }),
        );
        return div;
    },

    // Out in space, once an encounter's over: carry on.
    async drift({ send, visit }) {
        const div = document.createElement('div');
        div.className = 'menu';
        div.innerHTML = `<button data-action="continue" class="go"></button><p class="error"></p>`;
        div.querySelector('button').textContent =
            `Continue to ${visit.space.toName}`;
        return choices(div, send);
    },

    // A crew member's introduction to a contact, on a new ship's first dock.
    async intro(args) {
        return WIDGETS.notice(args);
    },

    // A ship yard: modules for sale, and the modules in your hold to sell.
    async shipyard({ send, top, goods }) {
        const ship = await getShip();
        const div = document.createElement('div');
        div.className = 'menu yard';
        const row = (action, data, good, price, note) => {
            const b = document.createElement('button');
            b.dataset.action = action;
            Object.assign(b.dataset, data);
            const m = goods[good].module;
            b.innerHTML = `<span class="what"><b></b><small></small></span><span class="dim"></span>`;
            b.querySelector('b').textContent = goods[good].name;
            b.querySelector('small').textContent =
                `Tier ${m.tier}${m.unique ? ' · Unique' : ''} · ${m.desc}`;
            b.querySelector('.dim').textContent = note;
            return b;
        };
        const head = (text) =>
            Object.assign(document.createElement('h4'), { textContent: text });
        div.append(head('For sale'));
        if (!top.stock.length)
            div.append(
                Object.assign(document.createElement('p'), {
                    className: 'none',
                    textContent: 'Sold out.',
                }),
            );
        top.stock.forEach((s, i) => {
            const b = row(
                'buy',
                { index: i },
                s.good,
                s.price,
                `${s.price.toLocaleString()} cr${s.qty > 1 ? ` · ${s.qty} left` : ''}`,
            );
            b.disabled = ship.credits < s.price;
            div.append(b);
        });
        div.append(head('Sell from your hold'));
        const mine = ship.holds
            .flatMap((h, hold) =>
                h.slots.map((st, slot) => ({ st, hold, slot })),
            )
            .filter(({ st }) => st && goods[st.good].module && !st.quest);
        if (!mine.length)
            div.append(
                Object.assign(document.createElement('p'), {
                    className: 'none',
                    textContent: 'No modules in the hold.',
                }),
            );
        for (const { st, hold, slot } of mine)
            div.append(
                row(
                    'sell',
                    { hold, slot },
                    st.good,
                    top.buys[st.good],
                    `+${top.buys[st.good].toLocaleString()} cr`,
                ),
            );
        div.insertAdjacentHTML(
            'beforeend',
            '<button data-action="back">Back</button><p class="error"></p>',
        );
        return choices(div, send);
    },

    // Stranded: contacts offering fuel cheaper than the stranger would. Take
    // one (they're then owed a favor), or find another way (the stranger).
    async favors({ send, top }) {
        const ship = await getShip();
        const div = document.createElement('div');
        div.className = 'menu';
        div.append(
            ...top.offers.map((f, i) => {
                const b = document.createElement('button');
                b.dataset.action = 'accept';
                b.dataset.index = i;
                b.innerHTML = `<span></span><span class="dim"></span>`;
                b.firstChild.textContent = `${f.name}: ${f.amount} Star Fuel`;
                b.lastChild.textContent = `${f.total.toLocaleString()} cr`;
                b.disabled = ship.credits < f.total;
                return b;
            }),
        );
        div.insertAdjacentHTML(
            'beforeend',
            `<button data-action="elsewhere">Find another way</button><p class="error"></p>`,
        );
        return choices(div, send);
    },

    // A plot's scene: its options, each maybe with a note (a price), greyed
    // out when you can't take it.
    async scene({ send, top }) {
        const div = document.createElement('div');
        div.className = 'menu';
        div.append(
            ...top.options.map((o, i) => {
                const b = document.createElement('button');
                b.dataset.action = 'choose';
                b.dataset.index = i;
                b.innerHTML = `<span></span>${o.note ? '<span class="dim"></span>' : ''}`;
                b.firstChild.textContent = o.label;
                if (o.note) b.lastChild.textContent = o.note;
                b.disabled = !o.enabled;
                return b;
            }),
        );
        div.insertAdjacentHTML('beforeend', '<p class="error"></p>');
        return choices(div, send);
    },

    // A faction office: the same shape as a scene (lines, then options).
    async factionOffice(args) {
        return WIDGETS.scene(args);
    },

    // Pick a local contact to talk to.
    async contacts({ send, top }) {
        const div = document.createElement('div');
        div.className = 'menu';
        div.append(
            ...top.list.map((c, i) => {
                const b = document.createElement('button');
                b.dataset.action = 'pick';
                b.dataset.index = i;
                b.textContent = `${c.crew}'s contact ${c.name}`;
                // What they do, and their traits (e.g. Owed a Favor), small, after the name.
                const notes = [c.position, ...(c.traits ?? [])].filter(Boolean);
                if (notes.length)
                    (b.insertAdjacentHTML(
                        'beforeend',
                        `<span class="dim"></span>`,
                    ),
                        b
                            .querySelector('.dim')
                            .append(rich(notes.join(' · '))));
                return b;
            }),
        );
        div.insertAdjacentHTML(
            'beforeend',
            `<button data-action="back">Back</button><p class="error"></p>`,
        );
        return choices(div, send);
    },

    // Talking to a contact: ask for work (then take it or not), or about rumors.
    async contact({ send, top }) {
        const div = document.createElement('div');
        div.className = 'menu';
        div.innerHTML =
            top.step === 'offer'
                ? `<button data-action="accept">Accept <span class="dim">${top.offer.pay.toLocaleString()} cr</span></button>
           <button data-action="decline">Decline</button>`
                : `<button data-action="work">Got any work?</button>
           <button data-action="rumor">Heard any rumors?</button>
           <button data-action="back">Back</button>`;
        div.insertAdjacentHTML('beforeend', '<p class="error"></p>');
        if (top.step === 'menu') {
            div.querySelector('[data-action="work"]').disabled = !top.canWork;
            div.querySelector('[data-action="rumor"]').disabled = !top.canRumor;
        }
        return choices(div, send);
    },

    // The lender collecting on a loan.
    async repay({ send, top }) {
        const ship = await getShip();
        const div = document.createElement('div');
        div.className = 'menu';
        div.innerHTML = `
      <button data-action="pay">Pay <span class="dim">${top.owed.toLocaleString()} cr</span></button>
      <button data-action="later">I need a little more time</button>
      <p class="error"></p>`;
        div.querySelector('[data-action="pay"]').disabled =
            ship.credits < top.owed;
        return choices(div, send);
    },

    // The stranded ship's fixer: buy their fuel, or borrow it.
    async fixer({ send, top }) {
        const ship = await getShip();
        const div = document.createElement('div');
        div.className = 'menu';
        div.innerHTML =
            top.step === 'sell'
                ? `<button data-action="buy">Buy ${top.amount} Star Fuel <span class="dim">${top.total.toLocaleString()} cr</span></button>
           <button data-action="refuse">Refuse</button>`
                : `<button data-action="borrow">Borrow ${top.amount} Star Fuel <span class="dim">owe ${top.total.toLocaleString()} cr</span></button>
           <button data-action="refuse">Walk away</button>`;
        div.innerHTML += '<p class="error"></p>';
        const buy = div.querySelector('[data-action="buy"]');
        if (buy) buy.disabled = ship.credits < top.total;
        return choices(div, send);
    },

    async trading({ id, goods, send }) {
        const [ship, { market }] = await Promise.all([
            getShip(),
            getPlanet(id),
        ]);
        const have = (good) =>
            // Consigned cargo (for a quest) isn't yours to sell.
            good === 'fuel'
                ? ship.fuel
                : ship.holds
                      .flatMap((h) => h.slots)
                      .reduce(
                          (n, st) =>
                              n + (st?.good === good && !st.quest ? st.qty : 0),
                          0,
                      );

        const form = document.createElement('form');
        form.className = 'market';
        // One line per good: name, price, stock ⇄ hold. Tapping a good shows its
        // amount stepper (positive buys, negative sells) in a fixed-height panel
        // under the list. Amounts persist per good; the Trade button shows the total.
        form.innerHTML = `
      <h3><span class="credits"></span><span class="dim">credits</span></h3>
      <div class="rows"></div>
      <div class="panel"><span class="hint">Select a commodity</span></div>
      <p class="error"></p>
      <div class="buttons"><button type="button" class="done">Done</button><button class="go" disabled>Trade</button></div>`;
        form.querySelector('.credits').textContent =
            ship.credits.toLocaleString();

        const signed = (n) =>
            n ? `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString()}` : '0';
        const tone = (n) => (n > 0 ? 'gain' : n < 0 ? 'loss' : '');

        const rows = market.map((m) => {
            const row = document.createElement('div');
            row.className = 'row';
            row.innerHTML = `
        <span class="name"></span>
        <span class="price"></span>
        <span class="stock"></span><span class="arrow">⇄</span><span class="have"></span>`;
            row.querySelector('.name').textContent = goods[m.good].name;
            // The price, and how far it is from the galactic average (above: green).
            const diff = m.price - m.avg;
            row.querySelector('.price').innerHTML =
                `<span></span>${diff ? `<span class="vs ${diff > 0 ? 'up' : 'down'}"></span>` : ''}`;
            row.querySelector('.price span').textContent = `$${m.price}`;
            if (diff)
                row.querySelector('.price .vs').textContent =
                    `(${diff > 0 ? '+' : '−'} $${Math.abs(diff)})`;
            // Can't buy more than the stock or sell more than you hold.
            // (Fuel: no more than the tanks hold.)
            const room =
                m.good === 'fuel'
                    ? Math.max(0, ship.stats.effective.fuelCap - ship.fuel)
                    : Infinity;
            const r = {
                m,
                qty: 0,
                row,
                held: have(m.good),
                max: Math.min(m.stock, room),
                min: -have(m.good),
            };
            row.onclick = () => select(r);
            return r;
        });
        form.querySelector('.rows').append(...rows.map((r) => r.row));

        // Clamp to stock and holdings. Raising an amount (buying more, selling
        // less) also stops at what you can afford with the rest of the order;
        // later changes elsewhere may push the total past it, which is fine.
        const setQty = (r, q) => {
            q = Math.max(r.min, Math.min(r.max, q));
            if (q > r.qty) {
                const rest = rows.reduce(
                    (n, x) => n + (x === r ? 0 : x.qty * x.m.price),
                    0,
                );
                q = Math.min(
                    q,
                    Math.max(
                        r.qty,
                        Math.floor((ship.credits - rest) / r.m.price),
                    ),
                );
                // ...and at what the holds can take, given the rest of the order.
                if (r.m.good !== 'fuel' && !fitsWith(r, q)) {
                    let lo = r.qty,
                        hi = q; // lo fits (it's where we are), hi doesn't
                    while (hi - lo > 1) {
                        const mid = (lo + hi) >> 1;
                        if (fitsWith(r, mid)) lo = mid;
                        else hi = mid;
                    }
                    q = lo;
                    const need = goods[r.m.good].needs;
                    toast(
                        `Need more ${need ? (SPACE[need] ?? need) : 'Cargo Space'}`,
                    );
                }
            }
            r.qty = q;
        };

        // What to call the space a good with `needs` goes in.
        const SPACE = {
            refrigerated: 'Refrigerated Storage',
            habitable: 'Habitable Space',
        };

        // Would the whole order fit in the holds with row r at q? The server's
        // way: sells first (taking from the smallest of your own stacks), then
        // buys (topping up your stacks of that good, then empty slots), each only
        // in holds the good can go in (see ship.js's fits).
        const fitsWith = (r, q) => {
            const holds = structuredClone(ship.holds);
            const fit = (h, g) =>
                goods[g].needs
                    ? h.tags.includes(goods[g].needs)
                    : !h.tags.length;
            const order = rows
                .map((x) => [x.m.good, x === r ? q : x.qty])
                .filter(([g, n]) => n && g !== 'fuel')
                .sort((a, b) => a[1] - b[1]);
            for (const [g, n] of order) {
                if (n < 0) {
                    let left = -n;
                    const mine = holds
                        .flatMap((h) => h.slots.map((st, i) => ({ h, i, st })))
                        .filter((x) => x.st?.good === g && !x.st.quest);
                    for (const x of mine.sort((a, b) => a.st.qty - b.st.qty)) {
                        const take = Math.min(left, x.st.qty);
                        x.st.qty -= take;
                        left -= take;
                        if (!x.st.qty) x.h.slots[x.i] = null;
                    }
                    continue;
                }
                let left = n;
                const { stack } = goods[g];
                for (const h of holds.filter((h) => fit(h, g)))
                    for (const st of h.slots)
                        if (
                            left &&
                            st?.good === g &&
                            !st.quest &&
                            st.qty < stack
                        ) {
                            const add = Math.min(left, stack - st.qty);
                            st.qty += add;
                            left -= add;
                        }
                for (const h of holds.filter((h) => fit(h, g)))
                    h.slots.forEach((st, i) => {
                        if (left && !st) {
                            const add = Math.min(left, stack);
                            h.slots[i] = { good: g, qty: add };
                            left -= add;
                        }
                    });
                if (left) return false;
            }
            return true;
        };

        const panel = form.querySelector('.panel');
        let selected = null;
        const select = (r) => {
            selected?.row.classList.remove('selected');
            selected = r;
            r.row.classList.add('selected');
            panel.innerHTML = `
        <span class="net"></span>
        <span class="stepper">
          <button type="button" data-d="-5">«</button><button type="button" data-d="-1">‹</button>
          <button type="button" class="amt"></button>
          <button type="button" data-d="1">›</button><button type="button" data-d="5">»</button>
        </span>`;
            update();
        };
        panel.onclick = (e) => {
            if (e.target.closest('.amt')) return openAmount();
            const d = Number(e.target.dataset.d);
            if (!d || !selected) return;
            setQty(selected, selected.qty + d);
            update();
        };

        // Tap the amount to type one in, then Buy or Sell. Clamped like the stepper.
        // The dialog sits beside the form, not in it: forms can't nest.
        const dialog = document.createElement('dialog');
        dialog.className = 'amount';
        dialog.innerHTML = `
      <form method="dialog">
        <h2></h2>
        <input type="number" min="0" inputmode="numeric" />
        <menu><button value="cancel">Cancel</button><button value="sell">Sell</button><button value="buy">Buy</button></menu>
      </form>`;
        const apply = (side) => {
            const n = Math.floor(
                Math.abs(Number(dialog.querySelector('input').value) || 0),
            );
            const sign =
                side === 'sell'
                    ? -1
                    : side === 'buy'
                      ? 1
                      : selected.qty < 0
                        ? -1
                        : 1;
            setQty(selected, sign * n);
            update();
        };
        dialog.querySelector('form').onsubmit = (e) => {
            if (e.submitter?.value !== 'cancel') apply(e.submitter?.value);
        };
        // Enter would "click" the first button (Cancel); instead apply in the current direction.
        dialog.querySelector('input').onkeydown = (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            apply();
            dialog.close();
        };
        const openAmount = () => {
            dialog.querySelector('h2').textContent =
                goods[selected.m.good].name;
            const input = dialog.querySelector('input');
            input.value = Math.abs(selected.qty) || '';
            dialog.showModal();
            input.focus();
            input.select();
        };

        const orders = () =>
            rows
                .filter((r) => r.qty)
                .map((r) => ({ good: r.m.good, qty: r.qty }));
        const go = form.querySelector('.go');
        const update = () => {
            // Stock and hold show where they'll end up if you trade.
            for (const r of rows) {
                r.row.querySelector('.stock').textContent = r.m.stock - r.qty;
                r.row.querySelector('.have').textContent = r.held + r.qty;
                const arrow = r.row.querySelector('.arrow');
                arrow.textContent = r.qty > 0 ? '→' : r.qty < 0 ? '←' : '⇄';
                arrow.className = `arrow ${r.qty > 0 ? 'buy' : r.qty < 0 ? 'sell' : ''}`;
            }
            if (selected) {
                const net = panel.querySelector('.net');
                net.textContent = signed(-selected.qty * selected.m.price);
                net.className = `net ${tone(-selected.qty)}`;
                panel.querySelector('.amt').textContent = Math.abs(
                    selected.qty,
                );
            }
            const total = -rows.reduce((n, r) => n + r.qty * r.m.price, 0);
            go.disabled = !orders().length;
            go.textContent = total ? `Trade ${signed(total)}` : 'Trade';
            go.className = `go ${tone(total)}`;
        };

        const submit = async (body) => {
            form.querySelectorAll('button').forEach(
                (el) => (el.disabled = true),
            );
            form.classList.add('used'); // (kept in the feed, spent; see spend)
            try {
                await send(body);
            } catch (x) {
                form.classList.remove('used');
                form.querySelector('.error').textContent = x.message;
                form.querySelectorAll('button').forEach(
                    (el) => (el.disabled = false),
                );
                update();
            }
        };
        form.querySelector('.done').onclick = () => submit({ action: 'done' });
        form.onsubmit = (e) => {
            e.preventDefault();
            if (orders().length) submit({ action: 'trade', orders: orders() });
        };
        update();
        const widget = document.createElement('div');
        widget.append(form, dialog);
        return widget;
    },
};
