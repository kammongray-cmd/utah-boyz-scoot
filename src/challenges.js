// Challenges: goals around each park that pay bonus points (saved per rider).
// check(e) gets {type:'trick'|'grind', zone, res, info, grind}
const has = (res, id) => res && res.parts.some(p => p.key.startsWith(id));
const spinAtLeast = (res, deg) => res && res.parts.some(p => p.key.startsWith('spin') && parseInt(p.key.slice(4), 10) >= deg);

export const CHALLENGES = {
  woodward: [
    { id: 'w-first', text: 'Land your first trick', pts: 300, check: e => e.type === 'trick' && e.res.parts.length > 0 },
    { id: 'w-mega', text: 'Clear the Mega Ramp gap', pts: 2500, check: e => e.type === 'trick' && e.zone === 'Mega Ramp' && e.res.time > 1.5 && !e.info.soft },
    { id: 'w-megatrick', text: 'Land a trick over the Mega Ramp gap', pts: 5000, check: e => e.type === 'trick' && e.zone === 'Mega Ramp' && e.res.time > 1.5 && e.res.parts.length > 0 },
    { id: 'w-back', text: 'Land a backflip', pts: 1500, check: e => e.type === 'trick' && has(e.res, 'back') },
    { id: 'w-360', text: 'Land a 360', pts: 800, check: e => e.type === 'trick' && spinAtLeast(e.res, 360) },
    { id: 'w-vert540', text: 'Land a 540 on the Vert Ramp', pts: 3000, check: e => e.type === 'trick' && e.zone === 'Vert Ramp' && spinAtLeast(e.res, 540) },
    { id: 'w-rainbow', text: 'Grind the Rainbow Rail', pts: 800, check: e => e.type === 'grind' && e.zone === 'Rainbow Rail' },
    { id: 'w-grind3', text: 'Grind for 3 seconds', pts: 1500, check: e => e.type === 'grind' && e.grind.time >= 3 },
    { id: 'w-coping', text: 'Grind the coping in a bowl', pts: 1200, check: e => e.type === 'grind' && e.grind.kind === 'coping' && /Bowl/.test(e.zone || '') },
    { id: 'w-foam', text: 'Tailwhip into the foam pit', pts: 1000, check: e => e.type === 'trick' && e.info.soft && e.zone === 'The Hangar' && has(e.res, 'tailwhip') },
    { id: 'w-bag', text: 'Flip onto the Air Bag', pts: 1500, check: e => e.type === 'trick' && e.info.soft && e.zone === 'Air Bag' && (has(e.res, 'back') || has(e.res, 'front')) },
    { id: 'w-combo', text: 'Land a 3-trick combo', pts: 2500, check: e => e.type === 'trick' && e.res.parts.length >= 3 },
    { id: 'w-double', text: 'Land a Double Tailwhip', pts: 3000, check: e => e.type === 'trick' && e.res.parts.some(p => p.key === 'tailwhip2') },
    { id: 'w-line', text: 'Land 4 tricks in a row (LINE x1.75)', pts: 2500, check: e => e.type === 'trick' && e.info.chain >= 4 },
  ],
  moab: [
    { id: 'm-first', text: 'Land a trick on the slickrock', pts: 500, check: e => e.type === 'trick' && e.res.parts.length > 0 },
    { id: 'm-corona', text: 'Fly through Corona Arch', pts: 3000, check: e => e.type === 'trick' && /Corona/.test(e.zone || '') && e.res.time > 1.0 },
    { id: 'm-coronatrick', text: 'Trick through Corona Arch', pts: 5000, check: e => e.type === 'trick' && /Corona/.test(e.zone || '') && e.res.time > 1.0 && e.res.parts.length > 0 },
    { id: 'm-delicate', text: 'Land a trick in the Delicate Arch bowl', pts: 2000, check: e => e.type === 'trick' && /Delicate/.test(e.zone || '') && e.res.parts.length > 0 },
    { id: 'm-slot', text: 'Clear the Slot Canyon Gap', pts: 2500, check: e => e.type === 'trick' && /Slot/.test(e.zone || '') && e.res.time > 1.0 },
    { id: 'm-fin', text: 'Backflip off the Fin Drop', pts: 3000, check: e => e.type === 'trick' && /Fin/.test(e.zone || '') && has(e.res, 'back') },
    { id: 'm-trail', text: 'Land a 360 on the Slickrock Trail', pts: 1500, check: e => e.type === 'trick' && /Slickrock/.test(e.zone || '') && spinAtLeast(e.res, 360) },
    { id: 'm-grind', text: 'Grind a rail in Moab', pts: 1000, check: e => e.type === 'grind' },
  ],
};

export class Challenges {
  constructor(profile, onDone) { this.profile = profile; this.onDone = onDone; }
  done(id) { return !!(this.profile.rider.challenges || {})[id]; }
  event(worldId, e) {
    const list = CHALLENGES[worldId] || [];
    for (const c of list) {
      if (this.done(c.id)) continue;
      let ok = false;
      try { ok = c.check(e); } catch (_) { ok = false; }
      if (!ok) continue;
      const r = this.profile.rider;
      r.challenges = r.challenges || {};
      r.challenges[c.id] = true;
      this.profile.save();
      this.onDone(c);
    }
  }
  list(worldId) { return (CHALLENGES[worldId] || []).map(c => ({ ...c, done: this.done(c.id) })); }
}
