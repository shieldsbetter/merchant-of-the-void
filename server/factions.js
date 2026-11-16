// A faction's office, on any of its worlds: one job offer per hop (and one
// job at a time), or a donation for reputation. Reputation per faction lives
// in world.reputation ({ faction index: number }).

import { TYPES } from './faction-types.js';
import { startPlot } from './plots.js';
import { makeOffer } from './plots/faction-job.js';

const DONATION = 500;
const DONATION_REP = 5;

const job = (world, f) =>
    world.quests.find((q) => q.plot === 'factionJob' && q.config.faction === f);

// What the office has to say and offer: { lines, options }. The offer is
// made once per hop (world.offers is cleared on a hop) and kept until then.
function office(world, top) {
    const f = top.faction;
    const fac = world.universe.factions[f];
    const who = `${fac.name} clerk`;
    const lines = [[who, TYPES[fac.type].greet]];
    const options = [];
    const active = job(world, f);
    if (active)
        lines.push([who, `You're already working for us: ${active.text}`]);
    else {
        world.offers[f] ??= makeOffer(world, f, world.node.id);
        const o = world.offers[f];
        if (o.taken)
            lines.push([
                who,
                "That's all we have for now. Come back after you've been somewhere.",
            ]);
        else {
            lines.push([who, `${o.text} Pays ${o.pay.toLocaleString()} cr.`]);
            options.push({
                label: 'Take the job.',
                note: `${o.pay.toLocaleString()} cr`,
                enabled: true,
                act: 'accept',
            });
        }
    }
    options.push({
        label: `Donate to the ${fac.name}.`,
        note: `${DONATION} cr`,
        enabled: world.ship.credits >= DONATION,
        act: 'donate',
    });
    options.push({ label: 'Leave.', enabled: true, act: 'leave' });
    return { lines, options, who };
}

export const factionOffice = {
    open(visit, world, top) {
        top.faction = world.node.faction;
        const o = office(world, top);
        for (const [who, text] of o.lines)
            visit.feed.push({ kind: 'npc', who, text });
        top.options = o.options.map(({ label, note, enabled, act }) => ({
            label,
            note,
            enabled,
            act,
        }));
    },
    act(visit, world, body) {
        const top = visit.stack.at(-1);
        const o = top.options?.[Number(body.index)];
        if (body.action !== 'choose' || !o) throw new Error('unknown action');
        if (!o.enabled) throw new Error("you can't do that now");
        const f = top.faction;
        const fac = world.universe.factions[f];
        if (o.act === 'accept') {
            const offer = world.offers[f];
            visit.feed.push({ kind: 'you', text: o.label });
            try {
                startPlot(world, visit, 'factionJob', { offer }); // throws if the cargo won't fit
            } catch (e) {
                visit.feed.pop();
                throw e;
            }
            offer.taken = true;
            return 'pop';
        }
        if (o.act === 'donate') {
            world.ship.credits -= DONATION;
            world.reputation[f] = (world.reputation[f] ?? 0) + DONATION_REP;
            visit.feed.push({ kind: 'you', text: o.label });
            visit.feed.push({
                kind: 'event',
                text: `−${DONATION} cr. Reputation with the ${fac.name} +${DONATION_REP}.`,
            });
            return 'pop';
        }
        visit.feed.push({ kind: 'you', text: o.label });
        return 'pop';
    },
};

// For the journal: each faction, its type, and where you stand.
export const publicFactions = (world) =>
    world.universe.factions.map((f, i) => ({
        name: f.name,
        type: TYPES[f.type].label,
        color: f.color,
        reputation: world.reputation[i] ?? 0,
    }));
