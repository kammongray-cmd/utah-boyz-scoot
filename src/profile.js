// Save data (per rider) + everything you can unlock with points.
import { TRICKS } from './tricks.js';

const KEY = 'ubscoot.v1';

export const SCOOTERS = [
  { id: 'starter', name: 'Starter Pro', unlock: 0, stats: { pushSpeed: 7.6, pushPower: 1.9, pop: 1.0, spin: 540, flip: 430, trick: 1.0, turn: 1.0 } },
  { id: 'street', name: 'Street Pro', unlock: 4000, stats: { pushSpeed: 8.3, pushPower: 2.1, pop: 1.07, spin: 610, flip: 470, trick: 1.12, turn: 1.05 } },
  { id: 'park', name: 'Park Shredder', unlock: 15000, stats: { pushSpeed: 9.0, pushPower: 2.3, pop: 1.13, spin: 680, flip: 520, trick: 1.25, turn: 1.1 } },
  { id: 'mega', name: 'Mega Ripper', unlock: 40000, stats: { pushSpeed: 9.8, pushPower: 2.5, pop: 1.2, spin: 760, flip: 580, trick: 1.38, turn: 1.12 } },
  { id: 'gold', name: 'Gold Grom', unlock: 100000, stats: { pushSpeed: 10.5, pushPower: 2.7, pop: 1.28, spin: 860, flip: 650, trick: 1.52, turn: 1.15 } },
];

export const COLORS = [
  { id: 'black', hex: '#1b1b1b', unlock: 0 },
  { id: 'white', hex: '#f2f2f2', unlock: 0 },
  { id: 'gold', hex: '#f2b705', unlock: 0 },
  { id: 'orange', hex: '#ff6a00', unlock: 0 },
  { id: 'red', hex: '#e63946', unlock: 1500 },
  { id: 'blue', hex: '#1e6bff', unlock: 1500 },
  { id: 'lime', hex: '#8cff1a', unlock: 5000 },
  { id: 'purple', hex: '#8f4bff', unlock: 5000 },
  { id: 'pink', hex: '#ff4fb4', unlock: 9000 },
  { id: 'teal', hex: '#18c9b6', unlock: 9000 },
  { id: 'chrome', hex: '#d9dde3', unlock: 14000 },
  { id: 'neon', hex: '#39ff14', unlock: 25000 },
  { id: 'sky', hex: '#7df9ff', unlock: 35000 },
  { id: 'redrock', hex: '#c8552b', unlock: 50000 },
];

export const PARTS = ['deck', 'bars', 'wheels', 'grips'];

const DEFAULTS = {
  dane: { deck: '#1b1b1b', bars: '#f2b705', wheels: '#f2b705', grips: '#1b1b1b' },
  tucker: { deck: '#ff6a00', bars: '#1b1b1b', wheels: '#ff6a00', grips: '#1b1b1b' },
};

function fresh() {
  const r = id => ({ points: 0, best: 0, bestTrick: '', scooter: 'starter', colors: { ...DEFAULTS[id] } });
  return { current: 'dane', riders: { dane: r('dane'), tucker: r('tucker') }, seenHelp: false, camMode: 0 };
}

export class Profile {
  constructor() {
    this.data = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this.data = { ...fresh(), ...d };
        for (const id of ['dane', 'tucker']) this.data.riders[id] = { ...fresh().riders[id], ...(d.riders?.[id] || {}) };
      }
    } catch (_) { /* private mode / blocked storage: play without saving */ }
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (_) { /* ignore */ } }
  get id() { return this.data.current; }
  set id(v) { this.data.current = v; this.save(); }
  get rider() { return this.data.riders[this.data.current]; }
  get points() { return this.rider.points; }
  scooter() { return SCOOTERS.find(s => s.id === this.rider.scooter) || SCOOTERS[0]; }

  // add points; returns list of newly unlocked things
  add(pts) {
    const before = this.rider.points;
    this.rider.points += pts;
    const after = this.rider.points;
    this.save();
    const got = [];
    for (const s of SCOOTERS) if (s.unlock > before && s.unlock <= after) got.push(`New scooter: ${s.name}!`);
    for (const t of Object.values(TRICKS)) if (t.unlock > before && t.unlock <= after) got.push(`New trick: ${t.name} (${t.flick})`);
    const cols = COLORS.filter(c => c.unlock > before && c.unlock <= after);
    if (cols.length) got.push(`New color${cols.length > 1 ? 's' : ''} in the Garage!`);
    return got;
  }
  isUnlocked(trickId) { const t = TRICKS[trickId]; return !t || this.rider.points >= t.unlock; }
}
