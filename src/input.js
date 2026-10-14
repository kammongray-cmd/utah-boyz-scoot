// Two floating thumb sticks: touch anywhere on the left half = push/steer stick,
// anywhere on the right half = trick stick. Also keyboard (testing) and Xbox/PS controllers.

const DIAG_HALF = 27 * Math.PI / 180; // half-width of the diagonal flick sectors

function sectorOf(x, y) {
  const a = Math.atan2(y, x); // y is DOWN-positive (screen)
  const names = ['right', 'downright', 'down', 'downleft', 'left', 'upleft', 'up', 'upright'];
  // diagonals get a wider window so flicks are easy to hit
  for (let i = 1; i < 8; i += 2) {
    const c = (i * Math.PI) / 4; const ang = i < 4 ? c : c - 2 * Math.PI;
    let d = a - ang; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) <= DIAG_HALF) return names[i];
  }
  const idx = ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4;
  return ['right', 'down', 'left', 'up'][idx];
}

class Stick {
  constructor() {
    this.x = 0; this.y = 0; this.mag = 0;
    this.pointer = null; this.ox = 0; this.oy = 0;
    this.leftCenterAt = 0;   // time (s) the stick last left the dead zone
    this.flickArmed = false;
    this.strongSince = -1;   // time magnitude went > 0.5 (for "hold" actions)
  }
  set(x, y) {
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    this.x = x; this.y = y; this.mag = Math.min(1, m);
  }
}

export class Input {
  constructor(el, ui) {
    this.el = el; this.ui = ui;
    this.left = new Stick(); this.right = new Stick();
    this.events = [];
    this.time = 0;
    this.radius = 62;
    this.keys = new Set();
    this.enabled = true;
    this.inject = null; // tests: {left:[x,y], right:[x,y]}
    this.ringL = this.makeRing('L'); this.ringR = this.makeRing('R');

    el.addEventListener('pointerdown', e => this.down(e), { passive: false });
    window.addEventListener('pointermove', e => this.move(e), { passive: false });
    window.addEventListener('pointerup', e => this.up(e));
    window.addEventListener('pointercancel', e => this.up(e));
    window.addEventListener('keydown', e => { this.keys.add(e.code); this.keyEvent(e.code); });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    // stop iOS from scrolling / zooming / long-press menus while playing
    el.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    el.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  makeRing(side) {
    const r = document.createElement('div'); r.className = 'stick-ring ' + side;
    const k = document.createElement('div'); k.className = 'stick-knob'; r.appendChild(k);
    this.ui.appendChild(r);
    return { r, k };
  }

  down(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const leftSide = e.clientX < window.innerWidth / 2;
    const s = leftSide ? this.left : this.right;
    if (s.pointer !== null) return;
    s.pointer = e.pointerId; s.ox = e.clientX; s.oy = e.clientY; s.set(0, 0);
    const ring = leftSide ? this.ringL : this.ringR;
    ring.r.style.display = 'block';
    ring.r.style.left = (e.clientX - this.radius) + 'px'; ring.r.style.top = (e.clientY - this.radius) + 'px';
    ring.k.style.transform = 'translate(0px,0px)';
    try { this.el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  }
  move(e) {
    for (const [s, ring] of [[this.left, this.ringL], [this.right, this.ringR]]) {
      if (s.pointer !== e.pointerId) continue;
      e.preventDefault();
      let dx = e.clientX - s.ox, dy = e.clientY - s.oy;
      const d = Math.hypot(dx, dy), R = this.radius;
      if (d > R * 1.6) { // drag the stick base along so the thumb never "runs off" it
        const k = (d - R * 1.6) / d; s.ox += dx * k; s.oy += dy * k;
        dx = e.clientX - s.ox; dy = e.clientY - s.oy;
        ring.r.style.left = (s.ox - R) + 'px'; ring.r.style.top = (s.oy - R) + 'px';
      }
      s.set(dx / R, dy / R);
      ring.k.style.transform = `translate(${s.x * R}px,${s.y * R}px)`;
    }
  }
  up(e) {
    for (const [s, ring] of [[this.left, this.ringL], [this.right, this.ringR]]) {
      if (s.pointer !== e.pointerId) continue;
      s.pointer = null; s.set(0, 0);
      ring.r.style.display = 'none';
    }
  }
  releaseAll() {
    for (const [s, ring] of [[this.left, this.ringL], [this.right, this.ringR]]) { s.pointer = null; s.set(0, 0); ring.r.style.display = 'none'; }
  }

  keyEvent(code) {
    const map = { KeyZ: 'downleft', KeyC: 'downright', KeyQ: 'upleft', KeyE: 'upright' };
    if (map[code]) this.events.push({ type: 'flick', dir: map[code], diag: true });
    if (code === 'KeyW') this.events.push({ type: 'push' });
  }

  // Call once per frame before the game reads sticks.
  update(dt) {
    this.time += dt;
    const t = this.time;
    const L = this.left, Rt = this.right;
    // keyboard + gamepad feed the sticks when no finger is on them
    let lx = 0, ly = 0, rx = 0, ry = 0, kb = false, padPush = false, padBrake = false;
    const k = this.keys;
    if (k.has('KeyA')) { lx -= 1; kb = true; } if (k.has('KeyD')) { lx += 1; kb = true; }
    if (k.has('KeyS')) { ly += 1; kb = true; } if (k.has('KeyW')) { ly -= 0.0; kb = true; }
    if (k.has('ArrowLeft')) { rx -= 1; kb = true; } if (k.has('ArrowRight')) { rx += 1; kb = true; }
    if (k.has('ArrowUp')) { ry -= 1; kb = true; } if (k.has('ArrowDown') || k.has('Space')) { ry += 1; kb = true; }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const dz = v => (Math.abs(v) < 0.15 ? 0 : v);
      if (Math.abs(p.axes[0]) > 0.15 || Math.abs(p.axes[1]) > 0.15) { lx = dz(p.axes[0]); ly = dz(p.axes[1]); kb = true; }
      if (Math.abs(p.axes[2]) > 0.15 || Math.abs(p.axes[3]) > 0.15) { rx = dz(p.axes[2]); ry = dz(p.axes[3]); kb = true; }
      if (p.buttons[0]?.pressed || p.buttons[7]?.pressed) padPush = true;
      if (p.buttons[1]?.pressed || p.buttons[6]?.pressed) padBrake = true;
      if (p.buttons[2]?.pressed) { ry = 1; kb = true; } // X = crouch / pop on release
      break;
    }
    if (padPush && !this._padPush) this.events.push({ type: 'push' });
    this._padPush = padPush;
    if (padBrake) { ly = Math.max(ly, 0.8); kb = true; }
    if (this.inject) { [lx, ly] = this.inject.left || [0, 0]; [rx, ry] = this.inject.right || [0, 0]; kb = true; }
    if (L.pointer === null && kb) L.set(lx, ly);
    if (Rt.pointer === null && kb) Rt.set(rx, ry);
    if (L.pointer === null && !kb) L.set(0, 0);
    if (Rt.pointer === null && !kb) Rt.set(0, 0);

    // right stick: flicks + hold timing
    for (const s of [L, Rt]) {
      if (s.mag < 0.25) { s.flickArmed = true; s.leftCenterAt = -1; s.strongSince = -1; }
      else if (s.leftCenterAt < 0) s.leftCenterAt = t;
      if (s.mag > 0.5 && s.strongSince < 0) s.strongSince = t;
      if (s.mag < 0.5) s.strongSince = -1;
      if (s.flickArmed && s.mag > 0.72 && s.leftCenterAt >= 0) {
        s.flickArmed = false;
        if (t - s.leftCenterAt < 0.24) {
          const dir = sectorOf(s.x, s.y);
          this.events.push({ type: s === Rt ? 'flick' : 'lflick', dir, diag: dir.length > 5 });
        }
      }
    }
    // left stick flicked up = kick push
    const lUp = L.y < -0.45;
    if (lUp && !this._lUp) { this.events.push({ type: 'push' }); this._lastAutoPush = t; }
    if (lUp && t - (this._lastAutoPush ?? 0) > 0.4) { this.events.push({ type: 'push', auto: true }); this._lastAutoPush = t; }
    this._lUp = lUp;
  }

  // Seconds the right stick has been held strongly (0 if not).
  holdTime(s) { return s.strongSince < 0 ? 0 : this.time - s.strongSince; }

  take() { const e = this.events; this.events = []; return e; }
}
