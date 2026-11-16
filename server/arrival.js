// Arriving in a system: a short exchange with port control (three beats:
// they hail, your navigator answers, they welcome you), then "Let's get to
// business." Only then does the arrival happen: anything the crew has to
// say, whatever was waiting for you, and the arrival event (see game.js).
// The exchange comes from a pool: the generic ones anywhere, and a
// faction's own (by its type) more often in its systems.

import { say } from './grammar.js';
import { planetRef, says } from './refs.js';

// Each: [port control, your navigator, port control]. grammar.js templates
// with {{system}}, {{ship}}, {{bearing}}, {{berth}}.
const GENERIC = [
    [
        'Warpship at bearing {{bearing}}, this is {{system}} Control. Transmit identification.',
        "This is {{ship}}. We're transmitting now.",
        'Roger, {{ship}}. Identification received. Welcome to {{system}}.',
    ],
    [
        'Vessel on approach, this is {{system}} Control. Identify yourself.',
        'Control, this is {{ship}}, requesting a berth.',
        "{{ship}}, you're cleared for berth {{berth}}. Welcome to {{system}}.",
    ],
    [
        'Incoming warpship, {{system}} Control. State your name and business.',
        '{{ship}}, here to trade.',
        'Copy, {{ship}}. Mind the traffic, and welcome to {{system}}.',
    ],
    [
        '{{system}} Control to warpship at bearing {{bearing}}. Who are we talking to?',
        '{{ship}}. Transmitting our ident now.',
        "Got it, {{ship}}. Berth {{berth}}'s yours. Welcome to {{system}}.",
    ],
];
const BY_TYPE = {
    theocracy: [
        [
            'Peace be with you, travellers. {{system}} Control asks your name.',
            'This is {{ship}}, and we come in peace.',
            'Be welcome, {{ship}}. May your time on {{system}} be blessed.',
        ],
        [
            'Vessel at bearing {{bearing}}, the Faithful of {{system}} greet you. Who comes?',
            '{{ship}}, seeking a berth and a market.',
            'Berth {{berth}} is open to you, {{ship}}. Walk gently on {{system}}.',
        ],
    ],
    mercantile: [
        [
            '{{system}} Control. Warpship on approach, transmit registry and manifest.',
            '{{ship}}. Registry and manifest transmitting.',
            'Received, {{ship}}. Port speed is posted. Welcome to {{system}}, and good trading.',
        ],
        [
            'Warpship at bearing {{bearing}}, {{system}} Exchange Control. Buying or selling?',
            '{{ship}}. Bit of both, if the prices are right.',
            "That's the spirit, {{ship}}. Berth {{berth}}. Welcome to {{system}}.",
        ],
    ],
    anarchist: [
        [
            'You there, warpship. Who are you, and who sent you?',
            '{{ship}}. Nobody sent us.',
            'Good answer. Welcome to {{system}}. Mind your manners.',
        ],
        [
            "Warpship at bearing {{bearing}}. This is whoever's on the radio at {{system}}. Name?",
            'This is {{ship}}.',
            'Never heard of you. Come on in, {{ship}}. Berth {{berth}}, or anywhere that looks empty.',
        ],
    ],
    technocratic: [
        [
            'Warpship at bearing {{bearing}}: {{system}} Traffic Directorate. Submit Form 12-A, identification, within thirty seconds.',
            '{{ship}}, submitting Form 12-A now.',
            'Form 12-A received and stamped, {{ship}}. Proceed to berth {{berth}}. Welcome to {{system}}.',
        ],
        [
            '{{system}} Traffic Directorate. Unregistered approach detected. Identify.',
            'This is {{ship}}. Transmitting identification and approach plan.',
            'Approach plan approved, {{ship}}. Deviation will be noted. Welcome to {{system}}.',
        ],
    ],
    technologist: [
        [
            'Oh! A ship! {{system}} Control here. Hello! Who are you?',
            'This is {{ship}}. Hello to you too.',
            'Wonderful! Welcome to {{system}}, {{ship}}! Do say hi to the lab if you get a chance!',
        ],
        [
            'Warpship at bearing {{bearing}}, {{system}} Control. Quick question, are your sensors calibrated? Never mind. Who are you?',
            '{{ship}}. Our sensors are fine, thanks.',
            "Shame, we'd have loved to look at them. Berth {{berth}}, {{ship}}. Welcome to {{system}}!",
        ],
    ],
};

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// The exchange for arriving at `node`: feed lines. `navigator`: who answers
// (a crew member, or null: the captain, which is you).
export function hail(node, universe, ship, navigator) {
    const type =
        node.faction == null ? null : universe.factions[node.faction].type;
    const own = BY_TYPE[type] ?? [];
    const beats = pick([...GENERIC, ...own, ...own]);
    const vars = {
        system: planetRef(node),
        ship: ship.name,
        bearing: String(Math.floor(Math.random() * 360)).padStart(3, '0'),
        berth: `${pick('ABCDEFG'.split(''))}${1 + Math.floor(Math.random() * 24)}`,
    };
    const [hailed, answer, welcome] = beats.map((t) => say(t, vars, true));
    const control = `${node.name} Control`;
    return [
        { kind: 'npc', who: control, text: hailed },
        navigator ? says(navigator, answer) : { kind: 'you', text: answer },
        { kind: 'npc', who: control, text: welcome },
    ];
}

// The conversation: one button, and then you've arrived. Entry: { lines }
// (the crew's, to say once you have). Departing has to wait for it.
export const arrival = {
    blocking: 'Port control is still waiting on you.',
    act(visit, world, body) {
        if (body.action !== 'ok') throw new Error('unknown action');
        const top = visit.stack.pop();
        visit.feed.push(
            { kind: 'you', text: "Let's get to business." },
            ...(top.lines ?? []),
        );
        world.arrived(visit);
    },
};
