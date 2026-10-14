// Scooter trick catalogue, unlock levels, scoring and naming.
// Air controls (right thumb): hold LEFT/RIGHT = spin, hold DOWN = backflip, hold UP = front flip,
// diagonal FLICKS = scooter tricks (flick again mid-trick for a double).

export const FLICK_TRICKS = {
  // diagonal sector -> trick id
  downleft: 'tailwhip',
  downright: 'barspin',
  upleft: 'whiplash',
  upright: 'briflip',
};

export const TRICKS = {
  tailwhip: { name: 'Tailwhip', short: 'Whip', dur: 0.42, pts: 400, unlock: 0, flick: '↙ flick' },
  barspin: { name: 'Barspin', short: 'Barspin', dur: 0.32, pts: 300, unlock: 0, flick: '↘ flick' },
  whiplash: { name: 'Whiplash', short: 'Whiplash', dur: 0.5, pts: 700, unlock: 6000, flick: '↖ flick' },
  briflip: { name: 'Bri Flip', short: 'Bri', dur: 0.6, pts: 1000, unlock: 18000, flick: '↗ flick' },
  backflip: { name: 'Backflip', dur: 0, pts: 1000, unlock: 0, flick: 'hold ↓' },
  frontflip: { name: 'Front Flip', dur: 0, pts: 1300, unlock: 3000, flick: 'hold ↑' },
  double: { name: 'Doubles (flick twice)', dur: 0, pts: 0, unlock: 10000, flick: 'flick twice' },
};

export const SPIN_PTS = { 180: 150, 360: 400, 540: 800, 720: 1400, 900: 2200, 1080: 3200, 1260: 4400, 1440: 6000 };

const NUM = ['', '', 'Double ', 'Triple ', 'Quad ', 'Quint '];

// Turn an air's raw rotations into a list of landed parts.
// air = { spin (rad), flip (rad), tricks: [{id, count}] , time, height }
export function scoreAir(air) {
  const parts = [];
  let pts = 0;
  const spinDeg = Math.abs(air.spin) * 180 / Math.PI;
  const spin = Math.floor((spinDeg + 35) / 180) * 180;
  const flipRev = Math.floor((Math.abs(air.flip) * 180 / Math.PI + 70) / 360);
  if (spin >= 180) {
    const p = SPIN_PTS[Math.min(spin, 1440)] ?? 6000;
    parts.push({ key: 'spin' + spin, name: String(spin), pts: p });
  }
  if (flipRev >= 1) {
    const front = air.flip > 0;
    const base = front ? 'Front Flip' : 'Backflip';
    parts.push({ key: (front ? 'front' : 'back') + flipRev, name: NUM[Math.min(flipRev, 5)] + base, pts: (front ? 1300 : 1000) * flipRev * (flipRev > 1 ? 1.4 : 1) });
  }
  for (const t of air.tricks) {
    const d = TRICKS[t.id];
    parts.push({ key: t.id + t.count, name: NUM[Math.min(t.count, 5)] + d.name, pts: d.pts * t.count * (t.count > 1 ? 1.5 : 1) });
  }
  if (parts.length > 1) pts = parts.reduce((s, p) => s + p.pts, 0) * (1 + 0.5 * (parts.length - 1));
  else pts = parts.reduce((s, p) => s + p.pts, 0);
  // air time and height bonus
  const airBonus = Math.max(0, Math.round((air.time - 0.6) * 200 / 50) * 50) + Math.max(0, Math.round((air.height - 1.5) * 40 / 10) * 10);
  let name = parts.map(p => p.name).join(' ');
  if (!parts.length) {
    if (air.time > 1.6 || air.height > 4) name = 'Big Air';
    else if (air.time > 0.7) name = 'Air';
    else name = '';
  }
  pts = Math.round((pts + airBonus) / 10) * 10;
  return { parts, name, pts, key: parts.map(p => p.key).sort().join('+'), time: air.time, height: air.height };
}

export const GRINDS = {
  feeble: { name: 'Feeble Grind', pts: 260 },
  smith: { name: 'Smith Grind', pts: 300 },
  nose: { name: 'Nose Grind', pts: 320 },
  crooked: { name: 'Crooked Grind', pts: 300 },
};
