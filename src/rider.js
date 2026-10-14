// Cartoon rider + pro scooter, built from primitives so every part can animate:
// tailwhip spins the deck around the stem, barspin spins the bars, whiplash rolls the deck,
// bri flip flips the whole scooter around the bars.
import * as THREE from 'three';
import { loadRiderGlb, SkinnedRider } from './skinned.js';

export const RIDERS = {
  dane: {
    name: 'Dane', number: '72', skin: 0xf0c39b, hair: 0x17120f,
    helmet: 0x141414, stripe: 0xf2b705, jersey: 0x161616, sleeve: 0x161616, accent: 0xf2b705,
    pants: 0x1b1b1b, shoes: 0x1d1d1d, sole: 0xf2b705, numberColor: '#f2b705',
  },
  tucker: {
    name: 'Tucker', number: '65', skin: 0xf6caa6, hair: 0xff6f12,
    helmet: 0xff6a00, stripe: 0x111111, jersey: 0xff6a00, sleeve: 0x141414, accent: 0x8cff1a,
    pants: 0x141414, shoes: 0x141414, sole: 0xff6a00, numberColor: '#ffffff',
  },
};

let gradient = null;
function toon(color) {
  if (!gradient) {
    const d = new Uint8Array([90, 170, 255]);
    gradient = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ color, gradientMap: gradient });
}
function metal(color, rough = 0.35) { return new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: rough }); }

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

class Limb { // capsule stretched between two points (local to parent)
  constructor(parent, r, material) {
    this.m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, 1, 10), material);
    this.m.castShadow = true;
    parent.add(this.m);
  }
  set(a, b) {
    _a.subVectors(b, a); const l = _a.length();
    this.m.position.copy(a).addScaledVector(_a, 0.5);
    this.m.scale.set(1, l, 1);
    if (l > 1e-5) this.m.quaternion.setFromUnitVectors(_up, _a.normalize());
  }
}

function ik(A, T, l1, l2, hint, out) { // two-bone: returns middle joint
  const d = new THREE.Vector3().subVectors(T, A);
  let len = d.length();
  const maxL = l1 + l2 - 1e-3;
  if (len > maxL) { d.multiplyScalar(maxL / len); len = maxL; }
  d.normalize();
  const a = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = hint.clone().addScaledVector(d, -hint.dot(d)).normalize();
  return out.copy(A).addScaledVector(d, a).addScaledVector(perp, h);
}

function numberTexture(num, color, bg) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
  g.font = '900 84px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = '#000'; g.strokeText(num, 64, 70);
  g.fillStyle = color; g.fillText(num, 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class RiderModel {
  constructor(riderId, colors) {
    const R = RIDERS[riderId];
    this.R = R;
    this.root = new THREE.Group();
    this.inner = new THREE.Group();   // bail tumbles rotate this
    this.inner.scale.setScalar(1.45); // a bit bigger than life so you can see him from the drone
    this.root.add(this.inner);
    this.crouch = 0.2; this.t = 0;
    this.buildScooter(colors);
    this.buildBody(R);
    this.skin = null;
    loadRiderGlb(riderId).then(g => {
      this.skin = new SkinnedRider(g, this.inner, R.helmet, R.stripe);
      this.body.visible = false;
    }).catch(e => console.warn('rider model', e));
  }

  buildScooter(c) {
    this.scooterMats = {
      deck: metal(c.deck, 0.4), bars: metal(c.bars, 0.3), wheel: toon(0x222222),
      core: metal(c.wheels, 0.3), grip: toon(c.grips), tape: toon(0x111111),
    };
    const M = this.scooterMats;
    const HX = 0.30, GY = 0.80;
    this.GX = HX; this.GY = GY;
    // bri flip pivot sits at the grips
    this.briPivot = new THREE.Group(); this.briPivot.position.set(HX, GY, 0);
    this.inner.add(this.briPivot);
    const off = new THREE.Group(); off.position.set(-HX, -GY, 0); this.briPivot.add(off);
    this.gripMk = [-0.23, 0.23].map(z => { const o = new THREE.Object3D(); o.position.set(HX + 0.01, GY + 0.02, z); off.add(o); return o; });
    // front: barspin turns this around the stem
    this.front = new THREE.Group(); this.front.position.set(HX, 0, 0); off.add(this.front);
    const wheel = (parent, x) => {
      const w = new THREE.Group(); w.position.set(x, 0.065, 0);
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.02, 8, 18), M.wheel);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), M.core);
      core.rotation.x = Math.PI / 2;
      w.add(tire, core); tire.castShadow = true; parent.add(w);
      return w;
    };
    this.wheelF = wheel(this.front, 0.035);
    const fork = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.06), M.bars); fork.position.set(0.02, 0.13, 0); this.front.add(fork);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 8), M.bars); stem.position.set(0, 0.5, 0); this.front.add(stem);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.56, 8), M.bars); bar.rotation.x = Math.PI / 2; bar.position.set(0, GY, 0); this.front.add(bar);
    for (const z of [-0.23, 0.23]) {
      const g = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.11, 8), M.grip); g.rotation.x = Math.PI / 2; g.position.set(0, GY, z); this.front.add(g);
    }
    const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8), M.deck); clamp.position.set(0, 0.24, 0); this.front.add(clamp);
    [stem, bar, fork, clamp].forEach(m => (m.castShadow = true));
    // deck: tailwhip spins deckPivot (around the stem), whiplash rolls deckRoll
    this.deckPivot = new THREE.Group(); this.deckPivot.position.set(HX, 0, 0); off.add(this.deckPivot);
    this.deckRoll = new THREE.Group(); this.deckRoll.position.set(-0.28, 0.1, 0); this.deckPivot.add(this.deckRoll);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.035, 0.12), M.deck); deck.castShadow = true;
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.004, 0.11), M.tape); tape.position.y = 0.019;
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.05), M.deck); neck.position.set(0.25, 0.03, 0); neck.rotation.z = 0.5;
    const fender = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.06), M.bars); fender.position.set(-0.26, 0.03, 0); fender.rotation.z = -0.3;
    this.deckRoll.add(deck, tape, neck, fender);
    this.wheelR = wheel(this.deckRoll, -0.27); this.wheelR.position.y = -0.035;
  }

  setScooterColors(c) {
    const M = this.scooterMats;
    M.deck.color.set(c.deck); M.bars.color.set(c.bars); M.core.color.set(c.wheels); M.grip.color.set(c.grips);
  }

  buildBody(R) {
    const body = this.body = new THREE.Group();
    this.inner.add(body);
    const skin = toon(R.skin), jersey = toon(R.jersey), sleeve = toon(R.sleeve), pants = toon(R.pants), shoe = toon(R.shoes);
    const helmetM = toon(R.helmet), stripeM = toon(R.stripe), hairM = toon(R.hair), accent = toon(R.accent);
    this.thighs = [new Limb(body, 0.065, pants), new Limb(body, 0.065, pants)];
    this.shins = [new Limb(body, 0.055, pants), new Limb(body, 0.055, pants)];
    this.upper = [new Limb(body, 0.05, sleeve), new Limb(body, 0.05, sleeve)];
    this.fore = [new Limb(body, 0.042, sleeve), new Limb(body, 0.042, sleeve)];
    this.cuffs = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), accent); body.add(m); return m; });
    this.hands = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), toon(0x222222)); body.add(m); return m; });
    this.feet = [0, 1].map(() => {
      const g = new THREE.Group();
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.09), shoe); s.position.set(0.04, 0.035, 0); s.castShadow = true;
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.02, 0.095), toon(R.sole)); sole.position.set(0.04, 0.005, 0);
      g.add(s, sole); body.add(g); return g;
    });
    this.knees = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 8), pants); body.add(m); return m; });
    // torso
    this.torso = new THREE.Group(); body.add(this.torso);
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.24, 6, 12), jersey); chest.castShadow = true; chest.position.y = 0.2;
    chest.scale.set(1, 1, 1.15);
    this.torso.add(chest);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.157, 0.157, 0.05, 14, 1, true), accent); stripe.position.y = 0.17; stripe.scale.set(1, 1, 1.15);
    this.torso.add(stripe);
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ map: numberTexture(R.number, R.numberColor, '#' + new THREE.Color(R.jersey).getHexString()), transparent: false }));
    num.position.set(-0.155, 0.27, 0); num.rotation.y = -Math.PI / 2; this.torso.add(num);
    // head + helmet
    this.head = new THREE.Group(); this.torso.add(this.head); this.head.position.set(0.04, 0.5, 0);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), skin); face.castShadow = true; this.head.add(face);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.168, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), helmetM);
    helmet.position.set(-0.015, 0.025, 0); helmet.castShadow = true; this.head.add(helmet);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.018, 6, 24, Math.PI), stripeM);
    band.rotation.set(0, Math.PI / 2, 0); band.position.set(-0.015, 0.025, 0); this.head.add(band);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.22), helmetM); brim.position.set(0.15, 0.06, 0); brim.rotation.z = -0.25; this.head.add(brim);
    for (const z of [-0.05, 0.05]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), toon(0x111111)); eye.position.set(0.128, 0.0, z); this.head.add(eye);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); glint.position.set(0.146, 0.01, z + 0.006); this.head.add(glint);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 4, 10, Math.PI), toon(0x8a2c1c)); smile.position.set(0.13, -0.055, 0); smile.rotation.set(Math.PI / 2, Math.PI / 2, 0); smile.rotation.order = 'YXZ'; this.head.add(smile);
    // hair tufts sticking out under the helmet
    const tufts = [[-0.13, -0.04, 0], [-0.11, -0.07, 0.08], [-0.11, -0.07, -0.08], [-0.03, -0.05, 0.15], [-0.03, -0.05, -0.15], [-0.15, 0.0, 0.05], [-0.15, 0.0, -0.05]];
    for (const [x, y, z] of tufts) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.11, 6), hairM);
      t.position.set(x, y, z); t.lookAt(x * 3, y * 3 - 0.1, z * 3); t.rotateX(Math.PI / 2); this.head.add(t);
    }
  }

  update(p, dt) {
    this.t += dt;
    // spin/flip around the rider's middle in the air, around the wheels on the ground
    const CM = 0.95;
    _a.set(0, CM, 0).applyQuaternion(p.quat);
    const k = p.mode === 'air' ? p.airBlend : 0;
    _b.set(0, CM, 0);
    this.root.position.copy(p.pos).add(_a.lerp(_b, k));
    this.inner.position.y = -CM;
    this.root.quaternion.copy(p.quat);
    // ---- tricks on the scooter ----
    let whip = 0, bar = 0, lash = 0, bri = 0, deckBusy = false;
    if (p.mode === 'air' && p.air) {
      for (const t of p.air.tricks) {
        const a = t.angle * t.dir;
        if (t.id === 'tailwhip') whip += a;
        else if (t.id === 'barspin') bar += a;
        else if (t.id === 'whiplash') lash += a;
        else if (t.id === 'briflip') bri += t.angle;
        if (t.angle < t.target && t.id !== 'barspin') deckBusy = true;
      }
    }
    this.deckPivot.rotation.y = whip;
    this.front.rotation.y = bar;
    this.deckRoll.rotation.x = lash;
    this.briPivot.rotation.z = -bri;
    // wheels roll
    const roll = (p.mode === 'ground' ? p.speed : 0) * dt / 0.065;
    this.wheelF.rotation.z -= roll; this.wheelR.rotation.z -= roll;

    // ---- body pose ----
    let crouch = 0.15, feetUp = 0, armsOut = 0, lean = 0;
    if (p.mode === 'ground') crouch = 0.15 + p.charge * 0.6 + p.land * 0.5 + Math.min(0.15, p.speed * 0.01);
    else if (p.mode === 'air') { crouch = 0.45; if (deckBusy) feetUp = 1; }
    else if (p.mode === 'grind') crouch = 0.45;
    else if (p.mode === 'bail' || p.mode === 'soft') { armsOut = 1; crouch = 0.3; }
    this.crouch += (crouch - this.crouch) * Math.min(1, dt * 12);
    this.feetUp = (this.feetUp ?? 0) + (feetUp - (this.feetUp ?? 0)) * Math.min(1, dt * 20);
    const c = this.crouch, fu = this.feetUp;
    lean = p.mode === 'ground' ? p.steer * 0.1 : 0;

    const hip = new THREE.Vector3(-0.05 - c * 0.08, 0.80 - c * 0.24, 0);
    const shoulder = new THREE.Vector3(0.06 + c * 0.1, 1.17 - c * 0.3, lean);
    // torso from hip to shoulder
    this.torso.position.copy(hip);
    _b.subVectors(shoulder, hip).normalize();
    this.torso.quaternion.setFromUnitVectors(_up, _b);
    this.head.rotation.z = -_b.x * 0.6;
    // feet on the deck (or kicking / tucked)
    const deckY = 0.13;
    const footF = new THREE.Vector3(0.08, deckY + fu * 0.3, -0.04);
    const footB = new THREE.Vector3(-0.14, deckY + fu * 0.34, 0.05);
    if (p.kick > 0) { // back foot pushes along the ground
      const ph = 1 - p.kick;
      const s = Math.sin(ph * Math.PI);
      footB.set(-0.05 - 0.45 * s, 0.03 + 0.12 * Math.max(0, Math.cos(ph * Math.PI * 2 - 0.5)) * (ph > 0.5 ? 1 : 0.2), 0.16);
    }
    const thigh = 0.36, shin = 0.34;
    for (let i = 0; i < 2; i++) {
      const foot = i === 0 ? footF : footB;
      const h = hip.clone().add(new THREE.Vector3(0, -0.04, i === 0 ? -0.08 : 0.08));
      const knee = ik(h, foot, thigh, shin, new THREE.Vector3(1, 0.1, i === 0 ? -0.1 : 0.1), new THREE.Vector3());
      this.thighs[i].set(h, knee); this.shins[i].set(knee, foot);
      this.knees[i].position.copy(knee);
      this.feet[i].position.copy(foot).add(new THREE.Vector3(-0.03, -0.035, 0));
    }
    // hands on the grips (they travel with a bri flip / barspin), arms out in a bail
    const up = 0.5, fore = 0.45;
    for (let i = 0; i < 2; i++) {
      const z = i === 0 ? -0.23 : 0.23;
      const sh = shoulder.clone().add(new THREE.Vector3(-0.02, -0.04, i === 0 ? -0.17 : 0.17));
      let hand = new THREE.Vector3(this.GX, this.GY, z);
      if (bar) hand.set(this.GX + Math.sin(bar) * z * -1 * 0.0, this.GY, z); // hands let go during barspin (stay put)
      if (bri) { // follow the grips around the bri flip pivot (they are the pivot, so stay)
      }
      if (armsOut) hand = sh.clone().add(new THREE.Vector3(0.1, 0.35, z * 1.8));
      const elbow = ik(sh, hand, up, fore, new THREE.Vector3(-0.6, -1, z * 2), new THREE.Vector3());
      this.upper[i].set(sh, elbow); this.fore[i].set(elbow, hand);
      this.hands[i].position.copy(hand);
      this.cuffs[i].position.lerpVectors(elbow, hand, 0.82);
    }
    // ---- the real rigged rider (once loaded) ----
    if (this.skin) {
      this.root.updateMatrixWorld(true);
      const fh = this.skin.footH;
      const fF = new THREE.Vector3(0.1, 0.13 + fh + fu * 0.3, -0.06);
      const fB = new THREE.Vector3(-0.14, 0.13 + fh + fu * 0.34, 0.06);
      if (p.kick > 0) {
        const ph = 1 - p.kick, s2 = Math.sin(ph * Math.PI);
        fB.set(-0.05 - 0.42 * s2, fh + 0.1 * Math.max(0, Math.sin(ph * Math.PI * 2)), 0.15);
      }
      const hands = this.gripMk.map(m => this.inner.worldToLocal(m.getWorldPosition(new THREE.Vector3())));
      if (armsOut) { hands[0].set(0.2, 1.3, -0.45); hands[1].set(0.2, 1.3, 0.45); }
      this.skin.pose({ crouch: c, lean, footF: fF, footB: fB, handL: hands[0], handR: hands[1] });
    }
    // ---- bail tumble ----
    if (p.mode === 'bail') {
      const t = p.bailT;
      const k = Math.min(1, t * 2.2);
      this.inner.rotation.set(k * 1.4 + Math.sin(t * 9) * 0.15 * (1 - k), 0, k * 1.2);
      this.inner.position.y = -CM + 0.25 * (1 - k);
    } else {
      this.inner.rotation.set(0, 0, 0);
      this.inner.position.y = -CM + (p.mode === 'soft' ? -0.2 : 0);
    }
  }
}
