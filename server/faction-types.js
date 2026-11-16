// Faction types: each universe's three factions get three different ones.
// A type gives a faction its naming vocabulary, how it greets you, how its
// people talk (voice: oaths and goodbyes, for contacts; see contact-types.js), and its
// portfolio of jobs (see factions.js): some of deliver, survey and bounty,
// each with its own goods and words.
//
// Job text functions get `j`: { faction, dest, what (a delivery's parcels,
// in words: see goods.js), n, pay } as it applies (names, not ids). A
// delivery is one of the faction type's own parcels (goods.js's PARCELS).
export const TYPES = {
    theocracy: {
        label: 'Benign Theocracy',
        adj: ['Serene', 'Radiant', 'Gentle', 'Holy', 'Merciful', 'Luminous'],
        noun: [
            'Communion',
            'Synod',
            'Sanctum',
            'Covenant',
            'Fellowship',
            'Choir',
        ],
        greet: 'Peace be with you, traveller. There is always work for willing hands.',
        voice: {
            oath: ['Mercy keep us', 'By the Choir', 'Saints preserve me'],
            bye: ['Go gently.', 'Walk in the light, Captain.'],
        },
        jobs: {
            deliver: {
                text: (j) =>
                    `Carry ${j.what} of the ${j.faction} to the shrine on ${j.dest}.`,
            },
            survey: {
                text: (j) =>
                    `Carry the word of the ${j.faction} to ${j.n} unbelieving worlds: ${j.dest}.`,
            },
        },
    },
    mercantile: {
        label: 'Mercantile Confederation',
        adj: ['Gilded', 'Free', 'Golden', 'United', 'Prosperous', 'Open'],
        noun: [
            'Exchange',
            'Combine',
            'League',
            'Consortium',
            'Concord',
            'Compact',
        ],
        greet: 'Ah, a trader. Good. We always have contracts for those who deliver.',
        voice: {
            oath: [
                'Bad for business',
                'Margins, Captain, margins',
                'Not on my ledger',
            ],
            bye: ['Pleasure doing business.', 'May your books balance.'],
        },
        jobs: {
            deliver: {
                text: (j) =>
                    `Contract: deliver ${j.what} for the ${j.faction} to ${j.dest}.`,
            },
            survey: {
                text: (j) =>
                    `Survey the markets of ${j.n} independent worlds for the ${j.faction}: ${j.dest}.`,
            },
        },
    },
    anarchist: {
        label: 'Post-Piratical Anarchism',
        adj: ['Free', 'Black', 'Red', 'Unbound', 'Wild', 'Rising'],
        noun: [
            'Fleet',
            'Brotherhood',
            'Commune',
            'Collective',
            'Crews',
            'Accord',
        ],
        greet: 'No masters here, friend. But we help those who help us.',
        voice: {
            oath: ['Hell and vacuum', 'Burn them all', 'No masters'],
            bye: ['Fly free.', "Don't get caught."],
        },
        jobs: {
            deliver: {
                text: (j) =>
                    `Run ${j.what} for the ${j.faction} to ${j.dest}. No questions.`,
            },
            bounty: {
                text: (j) =>
                    `A would-be warlord's crew is squatting on ${j.dest}. The ${j.faction} wants them gone.`,
            },
        },
    },
    technocratic: {
        label: 'Technocratic Bureaucracy',
        adj: ['Central', 'Unified', 'Ordered', 'Grand', 'Standing', 'Federal'],
        noun: [
            'Directorate',
            'Ministry',
            'Bureau',
            'Administration',
            'Authority',
            'Secretariat',
        ],
        greet: 'State your business. Approved contractors may apply for open tasks below.',
        voice: {
            oath: [
                'Most irregular',
                'Per regulation, unacceptable',
                'This needs a form',
            ],
            bye: ['Your file is noted.', 'Proceed, Captain.'],
        },
        jobs: {
            deliver: {
                text: (j) =>
                    `Form 7-B: transport ${j.what} for the ${j.faction} to ${j.dest}.`,
            },
            survey: {
                text: (j) =>
                    `Census task: record ${j.n} unregistered worlds for the ${j.faction}: ${j.dest}.`,
            },
        },
    },
    technologist: {
        label: 'Wide-eyed Technologists',
        adj: ['Bright', 'New', 'Curious', 'Brilliant', 'Restless', 'Dawning'],
        noun: [
            'Institute',
            'Initiative',
            'Academy',
            'Laboratory',
            'Society',
            'Collective',
        ],
        greet: 'Oh! A ship! Are you busy? We have SO many experiments that need a ship.',
        voice: {
            oath: [
                "Isn't that wild",
                'Oh, fascinating, in a bad way',
                'Data says no',
            ],
            bye: ['Ping me!', 'Stay curious!'],
        },
        jobs: {
            survey: {
                text: (j) =>
                    `Take sensor readings for the ${j.faction} at ${j.n} unexplored worlds: ${j.dest}.`,
            },
            deliver: {
                text: (j) =>
                    `Rush ${j.what} for the ${j.faction} to the lab on ${j.dest}.`,
            },
            bounty: {
                text: (j) =>
                    `Data thieves stole the ${j.faction}'s research and fled to ${j.dest}. Get it back!`,
            },
        },
    },
};
