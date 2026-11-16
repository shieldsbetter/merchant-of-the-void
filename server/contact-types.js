// Contacts' lives: a contact (a person; see people.js) has a type (what they
// do, as factions have types), and is always running an arc: a story about
// them, in stages, that you never see directly. What they ask of you (a
// mission; see missions.js) comes from the stage they're at, and how the
// mission ends moves the arc on. What's changed for them shows in their
// position, and their ledger: what you've done for them, or haven't.
//
// Missions end by named exits, in a few shapes (SHAPES). A stage asks for a
// shape (`need`), takes any mission of that shape, and says (`on`) where
// each exit leads: the next stage (`to`), or the end of the arc (`end`), with
// a ledger line, perhaps a new position, and what they say about it next
// time you talk (`says`); `regard`, how much it changes what they think of
// you (by default +1, or −1 for a failure; see REGARD); `move`: [lo, hi] hops, they move house first.
// An arc's endings carry `tags` (up, down, ruthless, decent, wronged): the
// next arc is one of those whose `after` shares a tag (and an arc without
// `after` is a first one), so where a story goes from an ending is a
// small pool, not a fixed sequel. Asking for work, they say the stage's `frame` (how
// things stand), its `bridge` (why this job helps), then the mission's pitch.
//
// Text is Mustache (see grammar.js), a list being a choice of one. It gets
// (see vars): {{name}} (them), {{here}} (their system), {{hereFaction}}
// ('' if no one's), {{oath}} and {{bye}} (how people talk there: faction-types.js's
// voice), their type's own (say {{shop}}), their arc's (say {{rival}}: a
// person; or {{branch}}: a system), and whatever a mission adds. An arc's
// people carry over to the next one (the rival who comes back).
import { TYPES as FACTION_TYPES } from './faction-types.js';
import { newPerson, refOf } from './people.js';
import { planetRef } from './refs.js';
import { say } from './grammar.js';
import { hops } from './plots/util.js';

const pick = (a) =>
    Array.isArray(a) ? a[Math.floor(Math.random() * a.length)] : a;

// Each shape's exits.
export const SHAPES = {
    'force-finesse': ['force', 'finesse', 'failure'],
    'pass-fail': ['success', 'failure'],
};

// How people talk where no faction rules.
const INDEPENDENT = {
    oath: ['Stars above', 'Cold void take it', 'Rust and ruin'],
    bye: ['Safe hops.', 'Mind the void.'],
};

// What a contact does. `about`: what's particular to this one (filled in
// when they're made); `position`: what they do, as their page says.
export const TYPES = {
    shopkeeper: {
        label: 'Shopkeeper',
        // {{shop}}, and {{shops}} for more than one.
        about: () => {
            const [shop, shops] = pick([
                ['parts shop', 'parts shops'],
                ['noodle stall', 'noodle stalls'],
                ['chandlery', 'chandleries'],
                ['pawnshop', 'pawnshops'],
                ['tea house', 'tea houses'],
                ["tailor's shop", "tailor's shops"],
                ['scrap yard', 'scrap yards'],
                ['spice stall', 'spice stalls'],
                ['repair bench', 'repair benches'],
                ['bathhouse', 'bathhouses'],
            ]);
            return { shop, shops };
        },
        position: 'Keeps a {{shop}}',
        arcs: [
            'squeezed',
            'branching',
            'shakedown',
            'reckoning',
            'comeback',
            'freshStart',
            'grudge',
        ],
    },
};

// The arcs. `setup({ people, universe, p })`: the arc's own vars, when it
// starts: people by id, and systems as { planet: id }.
export const ARCS = {
    // A rival is muscling in on their trade. Help them fight dirty, hold on
    // quietly, or let them slip.
    squeezed: {
        setup: ({ people }) => ({ rival: newPerson(people).id }),
        start: 'pressed',
        stages: {
            pressed: {
                frame: [
                    '{{oath}}. {{rival}} opened a {{shop}} across the concourse, and {{rival}} has been undercutting me ever since. I need to stay in the game.',
                    "Since {{rival}} set up shop, half my regulars have wandered off. I can't let that stand.",
                    '{{rival}} is pricing me out, and I think {{rival}} is doing it at a loss just to see me close.',
                ],
                bridge: [
                    "I'll give you this one at a loss if it helps me get my edge back.",
                    "Every job I get done is one {{rival}} doesn't. Here's one.",
                    "I need people I can count on. This would show me you're one.",
                ],
                need: 'force-finesse',
                on: {
                    force: {
                        to: 'feud',
                        ledger: 'Hit back at {{rival}} on behalf of {{name}}.',
                        says: [
                            'Word got around about what you did. {{rival}} is furious. Good.',
                            "{{rival}} knows I've got friends now. That changes things.",
                        ],
                    },
                    finesse: {
                        to: 'steady',
                        ledger: 'Helped {{name}} hold on against {{rival}}, quietly.',
                        says: [
                            'That bought me some breathing room. Thank you.',
                            "Business is picking up again. {{rival}} hasn't noticed a thing.",
                        ],
                    },
                    failure: {
                        to: 'slipping',
                        ledger: 'Let {{name}} down when it mattered.',
                        says: [
                            'I was counting on you, Captain.',
                            "Well. That didn't help.",
                        ],
                    },
                },
            },
            feud: {
                frame: [
                    "{{rival}} has people hanging around outside the {{shop}} now. Let's finish this.",
                    "{{oath}}, someone put a brick through my window last night. We both know who. I'm done being polite.",
                ],
                bridge: [
                    "This one's tangled up in it. Do it right and {{rival}} feels it.",
                    "Here's something that'll show {{rival}} I'm not alone.",
                    "Help me with this and we'll see who blinks first.",
                ],
                need: 'force-finesse',
                on: {
                    force: {
                        end: true,
                        tags: ['up', 'ruthless'],
                        position: 'Keeps the only {{shop}} worth the name',
                        ledger: 'Drove {{rival}} out of business for {{name}}.',
                        says: [
                            "{{rival}} closed up shop and left on the next freighter. The street's mine. I won't forget it.",
                            "It's over. {{rival}} is gone. I owe you, Captain.",
                        ],
                    },
                    finesse: {
                        to: 'steady',
                        ledger: 'Talked {{name}} down from a feud with {{rival}}.',
                        says: [
                            "You were right. {{rival}} and I have... an understanding. It's quieter.",
                            "We're not friends, {{rival}} and I. But we're not at war.",
                        ],
                    },
                    failure: {
                        end: true,
                        tags: ['down', 'wronged'],
                        position: 'Lost the {{shop}}; scraping by',
                        ledger: "{{name}}'s {{shop}} was wrecked while you were off on {{name}}'s business.",
                        says: [
                            "They smashed the place up, Captain. It's gone. All of it.",
                            "The {{shop}}'s gone. {{rival}} won. I don't really want to talk about it.",
                        ],
                    },
                },
            },
            steady: {
                frame: [
                    "Things are steadier. If I could just get a little ahead, I'd open a second {{shop}}.",
                    '{{rival}} is still around, but business is holding. With a little help I could expand.',
                ],
                bridge: [
                    'This one would put me ahead.',
                    'Get this done and the new place is as good as open.',
                    "Pull this off for me and the expansion's on.",
                ],
                need: 'pass-fail',
                on: {
                    success: {
                        end: true,
                        tags: ['up', 'decent'],
                        position:
                            'Keeps two {{shops}}, and is looking at a third',
                        ledger: 'Helped {{name}} open a second {{shop}}.',
                        says: [
                            "Second {{shop}} opened last week! There's a little sign with your ship on it. Well, a ship.",
                            "We're doing well, Captain. Better than {{rival}}, anyway.",
                        ],
                    },
                    failure: {
                        to: 'slipping',
                        ledger: "Didn't come through for {{name}}.",
                        says: [
                            'That was going to be my edge. Oh well.',
                            "I'm back where I started, then.",
                        ],
                    },
                },
            },
            slipping: {
                frame: [
                    "{{oath}}. Customers keep drifting over to {{rival}}. One more bad month and I'm finished.",
                    "I'm behind on rent, Captain. If things don't turn around, {{rival}} wins without lifting a finger.",
                ],
                bridge: [
                    "I can't afford to botch this one.",
                    "If this goes wrong, I'm finished. Please.",
                    "This job is what's keeping the lights on.",
                ],
                need: 'pass-fail',
                on: {
                    success: {
                        to: 'steady',
                        ledger: 'Kept {{name}} afloat.',
                        says: [
                            "I'm afloat. Thanks to you.",
                            'Paid the rent. I can breathe again.',
                        ],
                    },
                    failure: {
                        end: true,
                        tags: ['down'],
                        position: 'Sold the {{shop}} to {{rival}}',
                        ledger: '{{name}} sold the {{shop}} to {{rival}}.',
                        says: [
                            'I sold up. To {{rival}}, of all people.',
                            "It's {{rival}}'s {{shop}} now. Funny how things go.",
                        ],
                    },
                },
            },
        },
    },

    // Doing well: a second place, on another world. The locals there may not
    // like it; the money may run out.
    branching: {
        after: ['up'],
        setup: ({ universe, p }) => ({
            branch: { planet: nearby(universe, p.planet, 1, 2) },
        }),
        start: 'saving',
        stages: {
            saving: {
                frame: [
                    'Business is good. Good enough that I keep looking at {{branch}}. A {{shop}} there would clean up.',
                    "I've been thinking bigger, Captain. {{branch}}. Nobody there does a decent {{shop}}.",
                ],
                bridge: [
                    'Every job like this puts a little more by for it.',
                    "This one's for the {{branch}} fund.",
                ],
                need: 'pass-fail',
                on: {
                    success: {
                        to: 'building',
                        ledger: 'Helped {{name}} save for a {{shop}} on {{branch}}.',
                        says: [
                            "I've signed a lease on {{branch}}. No going back now.",
                            'The {{branch}} place is happening!',
                        ],
                    },
                    failure: {
                        end: true,
                        tags: ['up'],
                        ledger: "{{name}}'s plans for {{branch}} fell through.",
                        says: [
                            "I've shelved {{branch}}. Maybe next year.",
                            'Not the right time for {{branch}}, it turns out.',
                        ],
                    },
                },
            },
            building: {
                frame: [
                    "The new place on {{branch}} is half built, and the traders there don't want me. Someone keeps 'losing' my permits.",
                    '{{oath}}. The {{branch}} locals are closing ranks against the newcomer.',
                ],
                bridge: [
                    'Help me with this and I can push through.',
                    'This job decides whether {{branch}} opens.',
                ],
                need: 'force-finesse',
                on: {
                    force: {
                        end: true,
                        tags: ['up', 'ruthless'],
                        position: 'Keeps {{shops}} on {{here}} and {{branch}}',
                        ledger: "Muscled {{name}}'s new {{shop}} into {{branch}}.",
                        says: [
                            '{{branch}} is open. The locals are learning to live with it.',
                            "We're open on {{branch}}. Nobody's 'losing' my permits any more.",
                        ],
                    },
                    finesse: {
                        end: true,
                        tags: ['up', 'decent'],
                        position: 'Keeps {{shops}} on {{here}} and {{branch}}',
                        ledger: 'Helped {{name}} win over the traders of {{branch}}.',
                        says: [
                            '{{branch}} is open, and the neighbours came to the opening!',
                            'You were right to go gently. {{branch}} has taken to me.',
                        ],
                    },
                    failure: {
                        to: 'overextended',
                        ledger: "Couldn't help {{name}} get the {{branch}} place open on time.",
                        says: [
                            "The {{branch}} place is open, technically. It's bleeding money.",
                            "We missed the season on {{branch}}. That's going to hurt.",
                        ],
                    },
                },
            },
            overextended: {
                frame: [
                    'The {{branch}} place is draining both shops, and the lenders have started calling.',
                    "{{oath}}. I bet everything on {{branch}}, and I'm losing.",
                ],
                bridge: [
                    "I can't afford to lose this one.",
                    'This might be what keeps the lenders off.',
                ],
                need: 'pass-fail',
                on: {
                    success: {
                        end: true,
                        tags: ['up'],
                        position:
                            'Keeps {{shops}} on {{here}} and {{branch}}, just about',
                        ledger: 'Kept the lenders off {{name}}.',
                        says: [
                            "We made it. Both places. I don't want to do that again.",
                            'The lenders are paid. I can sleep.',
                        ],
                    },
                    failure: {
                        end: true,
                        tags: ['down'],
                        position: 'Lost both {{shops}} to the lenders',
                        ledger: '{{name}} lost everything to the lenders over {{branch}}.',
                        says: [
                            'They took both places, Captain. Both.',
                            "It's all gone. {{branch}} was a mistake.",
                        ],
                    },
                },
            },
        },
    },

    // Doing well attracts attention: a boss wants a cut. Fight, pay, or both.
    shakedown: {
        after: ['up'],
        setup: ({ people }) => ({ rival: newPerson(people).id }), // (the boss)
        start: 'demand',
        stages: {
            demand: {
                frame: [
                    "{{rival}}'s people came by. They say a place doing as well as mine needs protecting. From them, I assume.",
                    "{{oath}}. There's a new boss on {{here}}, {{rival}}, and {{rival}} wants a cut of every {{shop}} on the row.",
                ],
                bridge: [
                    'I need money, and friends, and this job is both.',
                    'Whatever I decide about {{rival}}, I need this done.',
                ],
                need: 'force-finesse',
                on: {
                    force: {
                        to: 'war',
                        ledger: "Stood up to {{rival}}'s protection racket with {{name}}.",
                        says: [
                            'I told {{rival}} where to go. You gave me the nerve.',
                            "{{rival}}'s people stopped coming round. That won't last.",
                        ],
                    },
                    finesse: {
                        to: 'tribute',
                        ledger: 'Helped {{name}} find the money for {{rival}}.',
                        says: [
                            "I'm paying {{rival}}. It's the quiet way.",
                            "I pay {{rival}}, and nobody breaks anything. That's the deal.",
                        ],
                    },
                    failure: {
                        to: 'tribute',
                        ledger: "Wasn't there when {{rival}} came for {{name}}.",
                        says: [
                            "{{rival}} came back. I'm paying now. I didn't have a choice.",
                            "I'm paying {{rival}}. What else could I do?",
                        ],
                    },
                },
            },
            war: {
                frame: [
                    "{{rival}} took it personally. Someone's watching the {{shop}} day and night.",
                    "{{rival}}'s people broke two of my windows. It's war now, I suppose.",
                ],
                bridge: [
                    'This job is how I hit back.',
                    'Help me with this and {{rival}} will think twice.',
                ],
                need: 'force-finesse',
                on: {
                    force: {
                        end: true,
                        tags: ['up', 'ruthless'],
                        position: 'Keeps a {{shop}} nobody leans on',
                        ledger: "Broke {{rival}}'s hold on {{name}}'s street.",
                        says: [
                            "{{rival}}'s finished on {{here}}. The whole row's buying me drinks.",
                            "Nobody's paying {{rival}} any more. Because of us.",
                        ],
                    },
                    finesse: {
                        to: 'tribute',
                        ledger: 'Brokered a truce between {{name}} and {{rival}}.',
                        says: [
                            'A truce, then. I pay a little. Nobody gets hurt.',
                            "{{rival}} and I came to terms. I'm not happy, but I'm alive.",
                        ],
                    },
                    failure: {
                        end: true,
                        tags: ['down', 'wronged'],
                        position: 'Burned out by {{rival}}; scraping by',
                        ledger: "{{rival}} burned out {{name}}'s {{shop}}.",
                        says: [
                            'They burned it, Captain. With everything inside.',
                            "There's nothing left. {{rival}} made sure of it.",
                        ],
                    },
                },
            },
            tribute: {
                frame: [
                    "I'm paying {{rival}} every month now. It's eating me alive.",
                    "{{rival}} keeps raising the rate. I'm working to pay {{rival}}.",
                ],
                bridge: [
                    'This one keeps me ahead of the payments.',
                    "If I can't make this month, I don't know what {{rival}} will do.",
                ],
                need: 'pass-fail',
                on: {
                    success: {
                        end: true,
                        tags: ['up', 'decent'],
                        position:
                            'Keeps a {{shop}}, and pays {{rival}} to keep it',
                        ledger: "Helped {{name}} keep up with {{rival}}'s payments.",
                        says: [
                            "I've got enough put by to pay {{rival}} through the year. It's a way to live.",
                            "It's not freedom, but the {{shop}}'s doing fine.",
                        ],
                    },
                    failure: {
                        end: true,
                        tags: ['down', 'wronged'],
                        position: 'Lost the {{shop}} to {{rival}}',
                        ledger: '{{rival}} took the {{shop}} off {{name}} for missed payments.',
                        says: [
                            'I missed a payment. {{rival}} took the {{shop}}.',
                            '{{rival}} owns my {{shop}} now. I work the counter.',
                        ],
                    },
                },
            },
        },
    },

    // Played rough and won: the one they beat comes back, with friends.
    reckoning: {
        after: ['ruthless'],
        setup: ({ people, p }) => ({
            rival: p.arc?.vars.rival ?? newPerson(people).id,
        }),
        start: 'return',
        stages: {
            return: {
                frame: [
                    '{{rival}} is back. With money behind {{rival}} this time, and a grudge.',
                    '{{oath}}. Guess who stepped off a freighter yesterday? {{rival}}. With backers.',
                ],
                bridge: [
                    'I need this job to go right before {{rival}} moves.',
                    'Help me here and I can face {{rival}} properly.',
                ],
                need: 'force-finesse',
                on: {
                    force: {
                        end: true,
                        tags: ['up', 'ruthless'],
                        position:
                            'Keeps the only {{shop}} worth the name, still',
                        ledger: 'Saw {{rival}} off {{here}} a second time, for {{name}}.',
                        says: [
                            "{{rival}} won't be back a third time. I made sure.",
                            "Twice now. {{rival}}'s backers have written {{here}} off.",
                        ],
                    },
                    finesse: {
                        to: 'truce',
                        ledger: 'Got {{name}} and {{rival}} talking.',
                        says: [
                            "{{rival}} and I had a drink. A drink! I didn't throw it.",
                            "We're talking, {{rival}} and I. I don't know what that means yet.",
                        ],
                    },
                    failure: {
                        end: true,
                        tags: ['down', 'wronged'],
                        position: "Lost the {{shop}} to {{rival}}'s backers",
                        ledger: "{{rival}}'s backers bought the {{shop}} out from under {{name}}.",
                        says: [
                            "{{rival}}'s backers bought my landlord. I'm out.",
                            "{{rival}} won this round. It's {{rival}}'s {{shop}} now.",
                        ],
                    },
                },
            },
            truce: {
                frame: [
                    "{{rival}} wants to go in together. Partners. I don't trust it.",
                    "{{rival}}'s offering a partnership. It'd be good money. If it's real.",
                ],
                bridge: [
                    'I need to keep my end of things up while I find out.',
                    'This one keeps me honest with {{rival}}.',
                ],
                need: 'pass-fail',
                on: {
                    success: {
                        end: true,
                        tags: ['up', 'decent'],
                        position:
                            'Runs a {{shop}} with {{rival}}, of all people',
                        ledger: 'Helped {{name}} and {{rival}} go into business together.',
                        says: [
                            '{{rival}} and I are partners. Life is very strange.',
                            "It's real. {{rival}} and I. Biggest {{shop}} on {{here}}.",
                        ],
                    },
                    failure: {
                        end: true,
                        tags: ['down', 'wronged'],
                        position: 'Cheated out of the {{shop}} by {{rival}}',
                        ledger: '{{rival}} cheated {{name}} out of the {{shop}}.',
                        says: [
                            "It was a trap. {{rival}}'s name is on everything now.",
                            'I should have known. {{rival}} took it all.',
                        ],
                    },
                },
            },
        },
    },

    // Lost it all: start again, here, from a cart.
    comeback: {
        after: ['down'],
        setup: () => ({}),
        start: 'cart',
        stages: {
            cart: {
                frame: [
                    "I've got a cart and a few crates. It's a start. It's not much of one.",
                    "{{oath}}. Selling off a cart, at my age. Still, it's mine.",
                ],
                bridge: [
                    'Anything you can put my way helps.',
                    'This job would get me some real stock.',
                ],
                need: 'pass-fail',
                on: {
                    success: {
                        to: 'unit',
                        ledger: 'Helped {{name}} get back up.',
                        says: [
                            "The cart's doing all right! Better than all right.",
                            'People remember me. They come to the cart.',
                        ],
                    },
                    failure: {
                        end: true,
                        tags: ['down'],
                        position: "Works someone else's counter",
                        ledger: '{{name}} gave up the cart.',
                        says: [
                            "I gave up the cart. I'm working for someone else now.",
                            "It's fine. Someone else worries about the rent now.",
                        ],
                    },
                },
            },
            unit: {
                frame: [
                    "There's an empty unit down the row. If I can get it before anyone else, I'm back.",
                    "A unit's come up on the concourse. Three people want it. I want it more.",
                ],
                bridge: [
                    'This job decides who gets it.',
                    'Help me with this and the unit is mine.',
                ],
                need: 'force-finesse',
                on: {
                    force: {
                        end: true,
                        tags: ['up', 'ruthless'],
                        position:
                            "Keeps a {{shop}} again, and nobody's taking it this time",
                        ledger: 'Got {{name}} the unit, whatever it took.',
                        says: [
                            "The unit's mine. The others found somewhere else. Eventually.",
                            "I'm back. And I'm not losing it again.",
                        ],
                    },
                    finesse: {
                        end: true,
                        tags: ['up', 'decent'],
                        position: 'Keeps a {{shop}} again',
                        ledger: 'Helped {{name}} open a {{shop}} again.',
                        says: [
                            "I'm back, Captain! Come by. First one's on me.",
                            'A {{shop}} again. A real one.',
                        ],
                    },
                    failure: {
                        end: true,
                        tags: ['down'],
                        position: 'Still working the cart',
                        ledger: '{{name}} lost the unit to someone else.',
                        says: [
                            'Someone else got the unit. The cart it is.',
                            "Back to the cart. It's not so bad.",
                        ],
                    },
                },
            },
        },
    },

    // Lost it all: leave, and start again somewhere new.
    freshStart: {
        after: ['down'],
        setup: () => ({}),
        start: 'leaving',
        stages: {
            leaving: {
                frame: [
                    "There's nothing for me on {{here}} any more. I want out. I need the fare, and something to start with.",
                    "Everyone here knows what happened to me. I want to go somewhere they don't.",
                ],
                bridge: [
                    'A job like this would pay my way.',
                    "This one's my fare off {{here}}.",
                ],
                need: 'pass-fail',
                on: {
                    success: {
                        move: [1, 3],
                        to: 'settling',
                        position: 'Keeps a small {{shop}}, newly arrived',
                        ledger: 'Helped {{name}} start over on {{here}}.',
                        says: [
                            "I made it to {{here}}! It's a smaller {{shop}}, but it's mine.",
                            'Welcome to my new {{shop}}, Captain. {{here}} suits me.',
                        ],
                    },
                    failure: {
                        end: true,
                        tags: ['down'],
                        position: 'Stuck on {{here}}',
                        ledger: "{{name}} couldn't afford to leave {{here}}.",
                        says: [
                            "I'm not going anywhere, it seems.",
                            "The fare went on rent. I'm staying, then.",
                        ],
                    },
                },
            },
            settling: {
                frame: [
                    "The locals don't love an outsider setting up shop. I'm working on it.",
                    "{{oath}}. Turns out {{here}} has its own way of doing things, and I'm not it.",
                ],
                bridge: [
                    'This job would make me some friends here. Or enemies.',
                    'Help me put down roots.',
                ],
                need: 'force-finesse',
                on: {
                    force: {
                        end: true,
                        tags: ['up', 'ruthless'],
                        position:
                            "Keeps a {{shop}}, new in town and nobody's fool",
                        ledger: 'Helped {{name}} make a name on {{here}}, the hard way.',
                        says: [
                            'They know who I am on {{here}} now.',
                            'Nobody pushes the newcomer around any more.',
                        ],
                    },
                    finesse: {
                        end: true,
                        tags: ['up', 'decent'],
                        position: 'Keeps a {{shop}}, and has made friends',
                        ledger: 'Helped {{name}} find a place on {{here}}.',
                        says: [
                            "I've been invited to the traders' dinner. Me!",
                            '{{here}} is home now. I think it might be.',
                        ],
                    },
                    failure: {
                        end: true,
                        tags: ['down'],
                        position: 'Struggling as a newcomer',
                        ledger: "{{name}} couldn't find a footing on {{here}}.",
                        says: [
                            "It's hard here. Harder than I thought.",
                            "I don't think {{here}} wants me.",
                        ],
                    },
                },
            },
        },
    },

    // Wronged: they want the one who did it to pay.
    grudge: {
        after: ['wronged'],
        setup: ({ people, p }) => ({
            rival: p.arc?.vars.rival ?? newPerson(people).id,
        }),
        start: 'brooding',
        stages: {
            brooding: {
                frame: [
                    'I keep thinking about {{rival}}. I want to see {{rival}} lose something, for once.',
                    "{{oath}}. Every time I hear {{rival}}'s name I want to break something.",
                ],
                bridge: [
                    'This job puts me where I can hurt {{rival}}.',
                    'This one would give me something to work with.',
                ],
                need: 'force-finesse',
                on: {
                    force: {
                        to: 'revenge',
                        ledger: 'Helped {{name}} start on {{rival}}.',
                        says: [
                            "It's in motion. {{rival}} doesn't know yet.",
                            "{{rival}}'s got a surprise coming.",
                        ],
                    },
                    finesse: {
                        end: true,
                        tags: ['up', 'decent'],
                        position: 'Keeps a small {{shop}}, and has let it go',
                        ledger: 'Talked {{name}} out of a grudge against {{rival}}.',
                        says: [
                            "You were right. {{rival}} isn't worth it. I've opened a little {{shop}}.",
                            "I've let it go. I feel lighter. Strange.",
                        ],
                    },
                    failure: {
                        end: true,
                        tags: ['down'],
                        position: 'Eaten up by a grudge',
                        ledger: "{{name}} couldn't let go of {{rival}}.",
                        says: [
                            "I can't stop thinking about it. Leave me be.",
                            '{{rival}}. Always {{rival}}.',
                        ],
                    },
                },
            },
            revenge: {
                frame: [
                    "Everything's set. One more push and {{rival}} loses everything.",
                    "{{rival}}'s suppliers are wavering. One more push.",
                ],
                bridge: ['This is the push.', "Do this and it's finished."],
                need: 'force-finesse',
                on: {
                    force: {
                        end: true,
                        tags: ['up', 'ruthless'],
                        position: 'Took everything {{rival}} had',
                        ledger: 'Ruined {{rival}}, for {{name}}.',
                        says: [
                            "{{rival}}'s gone. Everything {{rival}} had is mine. I thought it'd feel better.",
                            "It's done. {{rival}} left {{here}} with one bag.",
                        ],
                    },
                    finesse: {
                        end: true,
                        tags: ['up', 'decent'],
                        position: 'Settled accounts with {{rival}}',
                        ledger: 'Got {{name}} a settlement from {{rival}}.',
                        says: [
                            "{{rival}} paid up. Every credit. We're square.",
                            "A settlement. It's not revenge, but it's fair.",
                        ],
                    },
                    failure: {
                        end: true,
                        tags: ['down', 'wronged'],
                        position: 'Ruined twice over by {{rival}}',
                        ledger: '{{rival}} saw {{name}} coming, and won again.',
                        says: [
                            '{{rival}} saw it coming. I have nothing left.',
                            'Twice. {{rival}} beat me twice.',
                        ],
                    },
                },
            },
        },
    },
};

// Every stage's exits are its shape's.
for (const [k, arc] of Object.entries(ARCS))
    for (const [s, st] of Object.entries(arc.stages))
        for (const [exit, t] of Object.entries(st.on)) {
            if (!SHAPES[st.need].includes(exit))
                throw new Error(
                    `arc ${k}, stage ${s}: ${exit} isn't a ${st.need} exit`,
                );
            if (t.end ? !t.tags?.length : !arc.stages[t.to])
                throw new Error(
                    `arc ${k}, stage ${s}, ${exit}: an ending needs tags; otherwise a stage to go to`,
                );
        }

// A system `lo` to `hi` hops from `from`.
function nearby(universe, from, lo, hi) {
    const d = hops(universe, from, hi);
    return pick([...d.keys()].filter((id) => d.get(id) >= lo));
}

// What a contact thinks of you (p.regard, a number moved by their arcs'
// transitions): at each level's `at` and up, a label (shown with their
// traits) and what their ordinary courier jobs pay, as a multiple.
export const REGARD = [
    { at: 2, label: 'Trusts You', pay: 1.25, ledger: 'Came to trust you.' },
    { at: 4, label: 'Loyal', pay: 1.6, ledger: 'Became loyal to you.' },
    { at: 7, label: 'Devoted', pay: 2, ledger: 'Would do anything for you.' },
];
export const regardOf = (p) =>
    REGARD.findLast((r) => (p.regard ?? 0) >= r.at) ?? null;

// Make person `p` a contact of `type`, starting an arc.
export function becomes(p, type, people) {
    const t = TYPES[type];
    p.type = type;
    p.about = t.about();
    p.position = say(t.position, p.about);
    p.arcsDone ??= [];
    startArc(p, { people });
}

// Their next arc, if there is one: one they haven't had that can follow an
// ending with `tags` (none: a first arc). Its people carry over from the
// last arc's.
function startArc(p, { people, universe }, tags) {
    const next = TYPES[p.type].arcs.filter(
        (k) =>
            !p.arcsDone.includes(k) &&
            (tags
                ? ARCS[k].after?.some((t) => tags.includes(t))
                : !ARCS[k].after),
    );
    if (!next.length) return void (p.arc = null);
    const kind = pick(next);
    p.arc = {
        kind,
        stage: ARCS[kind].start,
        vars: { ...p.arc?.vars, ...ARCS[kind].setup({ people, universe, p }) },
    };
}

// The vars their text gets, plus `extra`.
export function vars(world, p, extra = {}) {
    const node = world.universe.nodes[p.planet];
    const faction =
        node.faction == null ? null : world.universe.factions[node.faction];
    const voice = faction ? FACTION_TYPES[faction.type].voice : INDEPENDENT;
    const arcVars = Object.fromEntries(
        Object.entries(p.arc?.vars ?? {}).map(([k, x]) => [
            k,
            x?.planet != null
                ? planetRef(world.universe.nodes[x.planet])
                : refOf(world.people, x),
        ]),
    );
    return {
        name: refOf(world.people, p.id),
        here: planetRef(node),
        hereFaction: faction?.name ?? '',
        oath: pick(voice.oath),
        bye: pick(voice.bye),
        ...p.about,
        ...arcVars,
        ...extra,
    };
}

// Text for them (one of a list), filled.
export const render = (world, p, text, extra) =>
    say(pick(text), vars(world, p, extra));

// What their arc has them asking for now: a stage's framing line, to say
// before a mission's pitch, and the shape it needs.
export function stage(p) {
    if (!p.arc) return null;
    return ARCS[p.arc.kind].stages[p.arc.stage];
}

// A mission of theirs ended by `exit`: the ledger, maybe a new position,
// what they'll say next time, and the arc moves on (or ends, and the next
// starts).
export function advance(world, p, exit) {
    const st = stage(p);
    const t = st?.on[exit];
    if (!t) return;
    if (t.move) p.planet = nearby(world.universe, p.planet, ...t.move);
    const v = vars(world, p); // (after any move: {{here}} is where they are now)
    (p.ledger ??= []).push({
        cycle: world.cycle,
        text: say(pick(t.ledger), v),
    });
    const was = regardOf(p);
    p.regard = (p.regard ?? 0) + (t.regard ?? (exit === 'failure' ? -1 : 1));
    const now = regardOf(p);
    if (now && now !== was && now.at > (was?.at ?? 0))
        p.ledger.push({ cycle: world.cycle, text: now.ledger });
    if (t.position) p.position = say(pick(t.position), v);
    p.news = say(pick(t.says), v);
    if (t.end) {
        p.arcsDone.push(p.arc.kind);
        startArc(p, world, t.tags);
    } else p.arc.stage = t.to;
}
