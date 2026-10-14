// Scooter physics + trick state. The rider is a point on the ground with a heading;
// on the ground they follow the height grid, in the air they fly ballistically and
// the right thumb spins, flips and flicks tricks.
import * as THREE from 'three';
import { MAT } from './world/heightfield.js';
import { TRICKS, FLICK_TRICKS, scoreAir, GRINDS } from './tricks.js';

export const G = 10.2;
const SUBSTEPS = 4;
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);

const FRICTION = { [MAT.CONCRETE]: 0.010, [MAT.WOOD]: 0.014, [MAT.STEEL]: 0.010, [MAT.ROCK]: 0.018, [MAT.DIRT]: 0.07, [MAT.GRASS]: 0.16, [MAT.FOAM]: 3, [MAT.BAG]: 1.5 };

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _z = new THREE.Vector3();

function wrapPi(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

export class Player {
  constructor(world, stats, isUnlocked) {
    this.world = world;
    this.stats = stats;           // {pushSpeed, pushPower, pop, spin, flip, trick, turn}
    this.isUnlocked = isUnlocked; // id -> bool
    this.on = {};                 // callbacks: trick, bail, grind, land, sfx, popup
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.n = new THREE.Vector3(0, 1, 0);
    this.heading = 0;
    this.mode = 'ground';
    this.charge = 0; this.charging = false;
    this.kick = 0;                // push animation timer (1 -> 0)
    this.land = 0;                // landing squash timer
    this.revert = 0;              // visual yaw offset after a revert
    this.fakieTime = 0;
    this.air = null; this.grind = null;
    this.bailT = 0; this.softT = 0;
    this.safe = { x: 0, z: 0, heading: 0 };
    this.safeTimer = 0;
    this.groundTime = 0;
    this.lastLandAt = -99; this.chain = 0; this.clock = 0;
    this.quat = new THREE.Quaternion();
    this.airBlend = 0;
    this.basePitch = 0;
    this.steer = 0;
    this.speed = 0;
    this.lastSpot = null;
  }

  emit(name, ...a) { this.on[name]?.(...a); }

  spawn(x, z, heading, speed = 0) {
    const hf = this.world.hf;
    this.pos.set(x, hf.height(x, z), z);
    this.heading = heading;
    this.vel.set(Math.cos(heading) * speed, 0, Math.sin(heading) * speed);
    this.mode = 'ground'; this.air = null; this.grind = null;
    this.charge = 0; this.charging = false; this.bailT = 0; this.softT = 0;
    this.fakieTime = 0; this.groundTime = 0; this.revert = 0;
    hf.normal(x, z, this.n);
    this.safe = { x, z, heading };
    this.chain = 0;
    this.quat.copy(this.groundQuat());
  }

  respawn() {
    const s = this.safe;
    this.spawn(s.x, s.z, s.heading, 0);
  }

  // ---------- per-frame ----------
  update(dt, input, events) {
    this.clock += dt;
    const R = input.right, L = input.left;
    for (const e of events) {
      if (e.type === 'push') this.push(e.auto);
      else if (e.type === 'flick' && e.diag) this.flick(e.dir);
    }
    // right stick: pull down to load, let go / flick up to pop
    if (this.mode === 'ground' || this.mode === 'grind') {
      if (R.y > 0.45) { this.charging = true; this.charge = Math.min(1, this.charge + dt * 4); }
      else if (this.charging) { this.charging = false; this.pop(this.charge, R.y < -0.4); this.charge = 0; }
    } else { this.charging = false; this.charge = 0; }

    // quick steering: small thumb moves already turn, full turn at ~2/3 of the stick
    this.steer = Math.abs(L.x) > 0.08 ? Math.sign(L.x) * Math.min(1, (Math.abs(L.x) - 0.04) * 1.6) : 0;
    this.brake = L.y > 0.5 ? L.y : 0;

    if (this.mode === 'air') this.airControls(dt, input);

    const h = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) {
      switch (this.mode) {
        case 'ground': this.groundStep(h); break;
        case 'air': this.airStep(h); break;
        case 'grind': this.grindStep(h); break;
        case 'bail': this.bailStep(h); break;
        case 'soft': this.softStep(h); break;
      }
    }
    if (this.mode === 'bail') { this.bailT += dt; if (this.bailT > 1.9) this.respawn(); }
    if (this.mode === 'soft') {
      this.softT += dt;
      if (this.softT > 1.5) { // climb out and go back to the top of that ramp
        const s = this.lastSpot;
        if (s && Math.hypot(s.x - this.pos.x, s.z - this.pos.z) < 60) this.spawn(s.x, s.z, s.heading, s.speed || 0);
        else this.respawn();
      }
    }
    if (this.mode === 'grind') this.grind.time += dt;

    this.kick = Math.max(0, this.kick - dt / 0.45);
    this.land = Math.max(0, this.land - dt / 0.3);
    this.revert *= Math.exp(-dt * 10);
    this.speed = this.vel.length();
    this.colliders();
    this.bounds();
    if (this.pos.y < this.world.hf.outside + 5) this.respawn();

    // remember safe ground to come back to after a bail
    if (this.mode === 'ground') {
      this.groundTime += dt;
      this.safeTimer += dt;
      const m = this.world.hf.material(this.pos.x, this.pos.z);
      if (this.safeTimer > 0.4 && this.n.y > 0.985 && this.groundTime > 0.6 && m !== MAT.FOAM && m !== MAT.BAG) {
        this.safeTimer = 0;
        this.safe = { x: this.pos.x, z: this.pos.z, heading: this.travelHeading() };
      }
      // rolling backwards for a bit -> revert (spin back to forward)
      const along = this.vel.dot(this.forward(_f));
      if (along < -1.2) this.fakieTime += dt; else this.fakieTime = 0;
      if (this.fakieTime > 0.55 || (along < -0.3 && this.speed < 1.2 && this.fakieTime > 0.2)) {
        this.heading += Math.PI; this.revert -= Math.PI; this.fakieTime = 0;
        if (this.speed > 2.5) this.emit('popup', 'Revert', 50);
      }
    } else this.groundTime = 0;
    this.updateQuat(dt);
  }

  forward(out) { // heading projected on the ground plane
    out.set(Math.cos(this.heading), 0, Math.sin(this.heading));
    out.addScaledVector(this.n, -out.dot(this.n)).normalize();
    return out;
  }
  travelHeading() {
    const v = this.vel; if (Math.hypot(v.x, v.z) < 0.5) return this.heading;
    return Math.atan2(v.z, v.x);
  }

  push(auto) {
    if (this.mode !== 'ground' || this.kick > 0.45) return;
    const f = this.forward(_f);
    let along = this.vel.dot(f);
    if (along < -0.5) { this.heading += Math.PI; this.revert -= Math.PI; this.forward(f); along = -along; }
    const room = Math.max(0, 1 - along / this.stats.pushSpeed);
    if (room <= 0.02 && auto) return;
    this.vel.addScaledVector(f, this.stats.pushPower * room + 0.15);
    this.kick = 1;
    this.emit('sfx', 'push');
  }

  pop(charge, flickUp) {
    if (this.mode === 'grind') {
      const g = this.grind;
      this.endGrind();
      this.vel.copy(g.d).multiplyScalar(g.s);
      this.vel.y += 3.6 * this.stats.pop;
      this.takeoff(true);
      this.emit('sfx', 'pop');
      return;
    }
    const p = (3.0 + 1.7 * charge) * this.stats.pop * (flickUp ? 1.08 : 1);
    _t.copy(this.n).add(UP).normalize();
    // boost: popping on the lip of a ramp while going up it
    const onRamp = this.n.y < 0.97 && this.vel.y > 1.0;
    this.vel.addScaledVector(_t, p);
    if (onRamp) { this.vel.multiplyScalar(1.1); this.emit('popup', 'Boost!', 50); }
    this.takeoff(true);
    this.emit('sfx', 'pop');
  }

  flick(dir) {
    const id = FLICK_TRICKS[dir];
    if (!id) return;
    if (this.mode !== 'air' || this.air.t < 0.04) return;
    if (!this.isUnlocked(id)) { this.emit('locked', TRICKS[id].name); return; }
    const a = this.air;
    const cur = a.tricks.find(t => t.id === id && t.angle < t.target - 0.4);
    if (cur) {
      if (!this.isUnlocked('double')) return;
      cur.target += TAU; cur.count++;
      return;
    }
    a.tricks.push({ id, count: 1, angle: 0, target: TAU, dir: dir.includes('left') ? -1 : 1 });
    this.emit('sfx', 'whoosh');
  }

  // ---------- modes ----------
  takeoff(popped = false) {
    const launchN = this.n.clone();
    this.mode = 'air';
    const f = this.forward(_f);
    this.air = {
      t: 0, spin: 0, flip: 0, spinVel: 0, flipVel: 0, tricks: [], startY: this.pos.y, maxY: this.pos.y,
      gScale: 1, popped, launchN, inputT: null,
    };
    this.basePitch = Math.asin(THREE.MathUtils.clamp(f.y, -1, 1));
    // vert ramps: send the rider straight up so they drop back into the ramp
    let wallN = launchN;
    const vh0 = Math.hypot(this.vel.x, this.vel.z);
    if (launchN.y >= 0.5 && this.vel.y > 1.2 * vh0 && vh0 > 0.05) { // left the wall just past the coping: look back at it
      const bx = this.pos.x - this.vel.x / vh0 * 0.3, bz = this.pos.z - this.vel.z / vh0 * 0.3;
      const nb = this.world.hf.normal(bx, bz, new THREE.Vector3());
      if (nb.y < 0.6) wallN = nb;
    }
    if (wallN.y < 0.5) {
      const nh = _t.set(wallN.x, 0, wallN.z).normalize();
      const d = this.vel.x * nh.x + this.vel.z * nh.z;
      if (d < 0) { this.vel.x -= nh.x * d; this.vel.z -= nh.z * d; }
      this.vel.x += nh.x * 0.35; this.vel.z += nh.z * 0.35;
      this.air.vert = true;
    }
    // jump assist: big jumps pull you onto the landing sweet spot
    for (const j of this.world.jumps) {
      const dx = this.pos.x - j.x, dz = this.pos.z - j.z;
      if (dx * dx + dz * dz > j.r * j.r) continue;
      const vh = this.vel.x * j.dx + this.vel.z * j.dz;
      if (vh < 3) continue;
      const D = (j.tx - this.pos.x) * j.dx + (j.tz - this.pos.z) * j.dz;
      if (D < 2) continue;
      const tt = D / vh;
      const ty = this.world.hf.height(j.tx, j.tz);
      const gNeed = 2 * (this.pos.y + this.vel.y * tt - ty) / (tt * tt);
      this.air.gScale = THREE.MathUtils.clamp(gNeed / G, 0.55, 2.2);
      break;
    }
  }

  airControls(dt, input) {
    const a = this.air, R = input.right;
    if (a.inputT === null) a.inputT = input.time;
    // a hold only counts if the thumb pressed it after takeoff (so the pop itself never spins you)
    const fresh = R.leftCenterAt >= a.inputT - 0.04;
    const held = input.holdTime(R) > 0.12 && fresh;
    let spinT = 0, flipT = 0;
    if (held) {
      const ax = Math.abs(R.x), ay = Math.abs(R.y);
      if (ax > 0.35) spinT = Math.sign(R.x) * Math.min(1, (ax - 0.25) / 0.6) * this.stats.spin * Math.PI / 180;
      if (ay > 0.45) {
        const front = R.y < 0;
        if (!front || this.isUnlocked('frontflip')) flipT = (front ? 1 : -1) * Math.min(1, (ay - 0.35) / 0.55) * this.stats.flip * Math.PI / 180;
      }
    }
    a.spinVel += (spinT - a.spinVel) * Math.min(1, dt * 14);
    a.flipVel += (flipT - a.flipVel) * Math.min(1, dt * 14);
    a.spin += a.spinVel * dt;
    a.flip += a.flipVel * dt;
    // let go: settle toward the nearest clean landing angle
    if (!spinT) { const tgt = Math.round(a.spin / Math.PI) * Math.PI; a.spin += THREE.MathUtils.clamp(tgt - a.spin, -2.6 * dt, 2.6 * dt); }
    if (!flipT) { const tgt = Math.round(a.flip / TAU) * TAU; a.flip += THREE.MathUtils.clamp(tgt - a.flip, -2.2 * dt, 2.2 * dt); }
    for (const t of a.tricks) {
      const d = TRICKS[t.id].dur / this.stats.trick;
      t.angle = Math.min(t.target, t.angle + TAU / d * dt);
    }
    a.t += dt;
    a.maxY = Math.max(a.maxY, this.pos.y);
    // base pitch follows the flight path (nose up going up, nose down coming down)
    const vh = Math.hypot(this.vel.x, this.vel.z);
    const fx = Math.cos(this.heading), fz = Math.sin(this.heading);
    const facing = Math.sign(this.vel.x * fx + this.vel.z * fz) || 1;
    const target = Math.atan2(this.vel.y * facing, Math.max(vh, 3.5)) * (a.vert ? 1 : 0.8);
    this.basePitch += (target - this.basePitch) * Math.min(1, dt * 5);
  }

  groundStep(dt) {
    const hf = this.world.hf, p = this.pos, v = this.vel;
    hf.normal(p.x, p.z, this.n);
    const n = this.n;
    const f = this.forward(_f);
    const along = v.dot(f);
    const sp = v.length();
    // steering (reversed when rolling backwards so left is always "my left")
    const dirSign = along < -0.3 ? -1 : 1;
    const turn = THREE.MathUtils.lerp(3.8, 2.4, Math.min(1, sp / 16)) * this.stats.turn;
    this.heading += this.steer * turn * dt * dirSign;
    this.forward(f);
    // gravity (the ground pushes back below, so on a slope only the downhill part is left)
    v.y -= G * dt;
    // friction + drag + brake
    const mat = hf.material(p.x, p.z);
    const fr = FRICTION[mat] ?? 0.012;
    const drag = fr * G + 0.0009 * sp * sp + this.brake * 6;
    if (sp > 1e-3) v.multiplyScalar(Math.max(0, sp - drag * dt) / sp);
    // auto-pump: dropping down a transition gives a little speed (like a real rider pumping)
    if (n.y < 0.96 && n.y > 0.2 && v.y < -0.5 && sp < 11.5) v.multiplyScalar(1 + 1.3 * dt / Math.max(sp, 1));
    // wheels grip: kill sideways slide
    const a2 = v.dot(f);
    _v.copy(v).addScaledVector(f, -a2);
    const side = _v.addScaledVector(n, -_v.dot(n));
    v.addScaledVector(side, -(1 - Math.exp(-11 * dt)));
    if (mat === MAT.FOAM || mat === MAT.BAG) { this.goSoft(); return; }

    // move and follow the ground
    const ox = p.x, oz = p.z, oy = p.y, ony = n.y;
    p.addScaledVector(v, dt);
    const h = hf.height(p.x, p.z);
    hf.normal(p.x, p.z, _n);
    // walls: the slope gets suddenly steep (box side, kicker back) -> bonk
    if (_n.y < 0.55 && ony - _n.y > 0.25 && v.dot(_n) < 0 && h > oy + 0.05) {
      this.wallHit(ox, oz, oy, _n);
      return;
    }
    // ballistic between contacts: if the ground falls away faster than gravity pulls you down
    // (a ramp lip, the top of a quarter), you're airborne
    const gap = p.y - h;
    if (gap > 0.06) {
      this.takeoff(false);
      return;
    }
    n.copy(_n);
    if (gap <= 0) {
      p.y = h;
      const into = v.dot(n);
      if (into < 0) v.addScaledVector(n, -into);
    }
  }

  wallHit(ox, oz, oy, wn) {
    const p = this.pos, v = this.vel;
    p.x = ox; p.z = oz; p.y = Math.max(oy, this.world.hf.height(ox, oz));
    _t.set(wn.x, 0, wn.z).normalize();
    const d = v.x * _t.x + v.z * _t.z;
    if (d < 0) {
      if (-d > 7.5) { this.bail('wall'); return; }
      v.x -= _t.x * d * 1.25; v.z -= _t.z * d * 1.25;
      if (-d > 2) this.emit('sfx', 'bonk');
    }
  }

  airStep(dt) {
    const hf = this.world.hf, p = this.pos, v = this.vel, a = this.air;
    v.y -= G * a.gScale * dt;
    const ox = p.x, oz = p.z, oy = p.y;
    p.addScaledVector(v, dt);
    // grinds
    if (a.t > 0.08 && this.tryGrind()) return;
    const h = hf.height(p.x, p.z);
    if (p.y > h) return;
    hf.normal(p.x, p.z, _n);
    if (_n.y < 0.5 && oy < h - 0.3 && v.dot(_n) < 0) { // hit the side of something
      p.x = ox; p.z = oz;
      _t.set(_n.x, 0, _n.z).normalize();
      const d = v.x * _t.x + v.z * _t.z;
      if (d < 0) { v.x -= _t.x * d * 1.2; v.z -= _t.z * d * 1.2; }
      if (-d > 8) this.bail('wall');
      return;
    }
    p.y = h;
    this.n.copy(_n);
    this.touchdown();
  }

  touchdown() {
    const a = this.air, v = this.vel, n = this.n;
    const mat = this.world.hf.material(this.pos.x, this.pos.z);
    const soft = mat === MAT.FOAM || mat === MAT.BAG;
    const impact = -v.dot(n);
    v.addScaledVector(n, -v.dot(n));
    const res = scoreAir({ spin: a.spin, flip: a.flip, tricks: a.tricks.map(t => ({ id: t.id, count: Math.round(t.target / TAU) })), time: a.t, height: a.maxY - a.startY });
    // was it clean?
    let fail = null;
    const flipErr = Math.abs(wrapPi(a.flip));
    if (flipErr > 1.15) fail = 'flip';
    for (const t of a.tricks) if (t.target - t.angle > TAU * 0.3) fail = 'trick';
    const vt = Math.hypot(v.x, v.z);
    const facing = this.heading + a.spin;
    let fakie = false;
    if (vt > 2.2 && Math.hypot(v.x, v.y, v.z) > 2.2) {
      const th = Math.atan2(v.z, v.x);
      const d = Math.abs(wrapPi(facing - th));
      if (d > 1.0 && d < Math.PI - 1.0) fail = fail || 'sideways';
      fakie = d >= Math.PI - 1.0;
      this.heading = fakie ? th + Math.PI : th;
    } else this.heading = facing;
    if (impact > 15.5 && !soft) fail = fail || 'hard';
    this.air = null;
    if (soft) {
      this.goSoft();
      if (res.parts.length || res.name) this.emit('trick', res, { soft: true, chain: 1 });
      return;
    }
    if (fail) { this.bail(fail, res); return; }
    this.mode = 'ground';
    this.land = Math.min(1, 0.3 + impact / 8);
    this.revert = 0;
    if (fakie) { this.revert = 0; }
    // chain lines: land again within 5s
    if (res.pts > 0) {
      this.chain = this.clock - this.lastLandAt < 5 ? this.chain + 1 : 1;
      this.lastLandAt = this.clock;
      if (fakie) { res.pts += 100; res.name += ' (Fakie)'; }
      this.emit('trick', res, { chain: this.chain });
    }
    this.emit('sfx', 'land', Math.min(1, impact / 8));
  }

  tryGrind() {
    const p = this.pos, v = this.vel;
    const vh = Math.hypot(v.x, v.z);
    if (vh < 1.5) return false;
    for (const r of this.world.rails) {
      const ax = r.a.x, az = r.a.z, bx = r.b.x, bz = r.b.z;
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
      let t = ((p.x - ax) * dx + (p.z - az) * dz) / L2;
      if (t < 0.02 || t > 0.98) continue;
      const cx = ax + dx * t, cz = az + dz * t;
      const dist = Math.hypot(p.x - cx, p.z - cz);
      if (dist > 0.42) continue;
      const ry = r.a.y + (r.b.y - r.a.y) * t;
      const dy = p.y - ry;
      if (dy < -0.3 || dy > 0.32) continue;
      if (v.y > 0.8) continue;
      const L = Math.sqrt(L2);
      const align = (v.x * dx + v.z * dz) / (vh * L);
      if (Math.abs(align) < 0.55) continue;
      // lock on
      const d = new THREE.Vector3().subVectors(r.b, r.a);
      const len = d.length(); d.normalize();
      const s = v.dot(d);
      const a = this.air;
      this.air = null;
      // a grind in the middle of tricks: they need to be done
      if (a && (a.tricks.some(tr => tr.target - tr.angle > TAU * 0.3) || Math.abs(wrapPi(a.flip)) > 1.2)) { this.air = a; return false; }
      this.mode = 'grind';
      const kind = r.kind;
      this.grind = { r, d, len, t: t, s, time: 0, kind, style: this.grindStyle(), pts: 0 };
      this.heading = Math.atan2(d.z * Math.sign(s), d.x * Math.sign(s));
      p.set(cx, ry, cz);
      this.emit('sfx', 'grind');
      this.emit('grindStart', this.grind);
      return true;
    }
    return false;
  }

  grindStyle() {
    return 'feeble';
  }

  grindStep(dt) {
    const g = this.grind, p = this.pos;
    g.s += -G * g.d.y * dt;
    g.s *= 1 - 0.22 * dt;
    g.t += g.s * dt / g.len;
    if (g.t > 1 || g.t < 0) {
      // continue onto a joined segment (bowl coping, kinked rails)
      const end = g.t > 1 ? g.r.b : g.r.a;
      const next = this.world.rails.find(r => r !== g.r && (r.a.distanceTo(end) < 0.15 || r.b.distanceTo(end) < 0.15));
      if (next) {
        const fromA = next.a.distanceTo(end) < 0.15;
        const d = new THREE.Vector3().subVectors(next.b, next.a); const len = d.length(); d.normalize();
        const dirNow = g.d.clone().multiplyScalar(Math.sign(g.s));
        const s = Math.abs(g.s) * (fromA ? 1 : -1);
        if (d.dot(dirNow) * Math.sign(s) > 0.3) {
          g.r = next; g.d = d; g.len = len; g.t = fromA ? 0 : 1; g.s = s;
          return;
        }
      }
      this.endGrind();
      this.vel.copy(g.d).multiplyScalar(g.s);
      this.vel.y += 1.2;
      this.takeoff(false);
      return;
    }
    if (Math.abs(g.s) < 0.6) { // ran out of speed: hop off
      this.endGrind(); this.vel.set(0, 1, 0); this.takeoff(false); return;
    }
    p.copy(g.r.a).addScaledVector(g.d, g.t * g.len);
    this.vel.copy(g.d).multiplyScalar(g.s);
    this.heading = Math.atan2(g.d.z * Math.sign(g.s), g.d.x * Math.sign(g.s));
    this.n.set(0, 1, 0);
  }

  endGrind() {
    const g = this.grind;
    if (!g) return;
    this.grind = null;
    if (g.time > 0.15) this.emit('grindEnd', g);
    this.emit('sfx', 'grindStop');
  }

  goSoft() {
    this.mode = 'soft'; this.softT = 0; this.air = null;
    this.emit('sfx', 'foam');
  }
  softStep(dt) {
    const p = this.pos, v = this.vel;
    v.multiplyScalar(Math.exp(-dt * 4));
    p.addScaledVector(v, dt);
    const h = this.world.hf.height(p.x, p.z);
    p.y += (h - 0.35 - p.y) * Math.min(1, dt * 6);
  }

  bail(reason, res) {
    if (this.mode === 'grind') this.endGrind();
    this.mode = 'bail'; this.bailT = 0;
    this.bailInfo = { reason, spin: this.air?.spin ?? 0, flip: this.air?.flip ?? 0 };
    this.air = null; this.chain = 0;
    this.emit('bail', reason, res);
    this.emit('sfx', 'bail');
  }
  bailStep(dt) {
    const p = this.pos, v = this.vel, hf = this.world.hf;
    v.y -= G * dt;
    p.addScaledVector(v, dt);
    const h = hf.height(p.x, p.z);
    if (p.y < h) {
      p.y = h;
      hf.normal(p.x, p.z, this.n);
      const into = v.dot(this.n);
      if (into < 0) v.addScaledVector(this.n, -into * 1.3);
      v.multiplyScalar(Math.exp(-dt * 3.5));
    }
  }

  colliders() {
    const p = this.pos;
    for (const c of this.world.colliders) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const r = c.r + 0.3;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r || p.y > c.top) continue;
      const d = Math.sqrt(d2) || 0.01;
      const nx = dx / d, nz = dz / d;
      p.x = c.x + nx * r; p.z = c.z + nz * r;
      const vin = this.vel.x * nx + this.vel.z * nz;
      if (vin < 0) {
        this.vel.x -= nx * vin * 1.2; this.vel.z -= nz * vin * 1.2;
        if (-vin > 6 && this.mode !== 'bail') this.bail('crash');
        else if (-vin > 1.5) this.emit('sfx', 'bonk');
      }
    }
  }

  bounds() {
    const hf = this.world.hf, p = this.pos, v = this.vel, m = 2;
    if (p.x < hf.x0 + m) { p.x = hf.x0 + m; v.x = Math.abs(v.x) * 0.3; }
    if (p.x > hf.x1 - m) { p.x = hf.x1 - m; v.x = -Math.abs(v.x) * 0.3; }
    if (p.z < hf.z0 + m) { p.z = hf.z0 + m; v.z = Math.abs(v.z) * 0.3; }
    if (p.z > hf.z1 - m) { p.z = hf.z1 - m; v.z = -Math.abs(v.z) * 0.3; }
  }

  // ---------- orientation for the model ----------
  groundQuat() {
    const f = this.forward(_f);
    _z.crossVectors(f, this.n).normalize();
    const y = _t.crossVectors(_z, f).normalize();
    _m.makeBasis(f, y, _z);
    return _q.setFromRotationMatrix(_m);
  }

  updateQuat(dt) {
    if (this.mode === 'air') {
      const a = this.air;
      const yaw = this.heading + a.spin;
      const q = new THREE.Quaternion().setFromAxisAngle(UP, -yaw);
      const qp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.basePitch - a.flip);
      q.multiply(qp);
      this.airBlend = Math.min(1, this.airBlend + dt * 8);
      if (this.airBlend < 1) this.quat.slerp(q, this.airBlend); else this.quat.copy(q);
    } else if (this.mode === 'bail') {
      // tumble handled by the rider model
    } else {
      this.airBlend = 0;
      const gq = this.groundQuat();
      const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -this.steer * Math.min(1, this.speed / 6) * 0.22);
      const rv = new THREE.Quaternion().setFromAxisAngle(UP, -this.revert);
      const target = rv.multiply(gq).multiply(roll);
      this.quat.slerp(target, Math.min(1, dt * 18));
    }
  }
}
