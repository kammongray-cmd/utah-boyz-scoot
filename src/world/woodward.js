// Woodward Park City, scooter-ified and super-sized: mega ramp, vert ramp, mini ramp, bowls,
// street plaza, jump line, flow section, the Hangar foam pit and the big air bag,
// with the ski hill behind it.
import * as THREE from 'three';
import { Heightfield, MAT } from './heightfield.js';
import { World, gridMesh, mat, box, sign, setSeed, rand } from './builder.js';
import { arc, mirror, placeProfile, coping, quarter, bank, kicker, table, gapJump, halfpipe, spine, funbox, ledge, rail, stairs, bowl, foamPit, airbag, pyramid, polyRail, paint, V } from './features.js';
import { Forest, mountain, lightPole, banner, clouds } from './decor.js';

// transition of radius r up to `deg`, then straight at that angle until height H
export function rampUp(r, deg, H, n = 16) {
  const a = deg * Math.PI / 180;
  const hArc = r * (1 - Math.cos(a));
  const pts = arc(r, Math.min(hArc, H), n);
  if (H > hArc) {
    const [u, h] = pts[pts.length - 1];
    pts.push([u + (H - h) / Math.tan(a), H]);
  }
  return pts;
}
const shift = (p, du, dh = 0) => p.map(([u, h]) => [u + du, h + dh]);

export function buildWoodward() {
  setSeed(7);
  const hf = new Heightfield(-125, -115, 250, 230, 0.2, 0, MAT.GRASS);
  const W = new World('woodward', 'Woodward Park City', hf);
  W.sky = 0x7cc4ff; W.fog = [0xcfe8ff, 160, 520];
  // the park pad
  const PX = 112, PZ = 104;
  hf.stamp(() => 0, -PX, PX, -PZ, PZ, 'set', MAT.CONCRETE);

  // ---------------- MEGA RAMP (north edge, ride east) ----------------
  {
    const H = 15, z = -82, x0 = -110;
    const roll = rampUp(14, 40, H);
    const uR = roll[roll.length - 1][0];
    const p = [[0, H], [6, H], ...shift(mirror(roll, uR), 6).slice(1)];
    let u = 6 + uR + 10;
    const kick = shift(arc(12.4, 3.2, 16), u);
    p.push(...kick);
    const uLip = kick[kick.length - 1][0];
    p.push([uLip, 0]);
    u = uLip + 14;
    const LH = 4.5;
    p.push([u, 0], [u, LH], [u + 3, LH]);
    const land = rampUp(16, 30, LH);
    const uLand = land[land.length - 1][0];
    p.push(...shift(mirror(land, uLand), u + 3).slice(1));
    const uTarget = u + 3 + 4.5;
    u = u + 3 + uLand + 22;
    const q = shift(arc(8.5, 7, 22), u);
    p.push(...q);
    const uQ = q[q.length - 1][0];
    p.push([uQ + 3, q[q.length - 1][1]]);
    const f = placeProfile(W, x0, z, 0, p, 12, { top: 'skatelite' });
    coping(W, f, uQ, q[q.length - 1][1], 12);
    const [lx, lz] = f.toWorld(uLip, 0), [tx, tz] = f.toWorld(uTarget, 0);
    W.jump(lx, lz, 0, tx, tz, 5);
    // start tower dressing + signs
    const [sx, sz] = f.toWorld(3, 0);
    W.spot('Mega Ramp', sx, sz, 0, 0);
    const s = sign(['MEGA RAMP'], 12, 3, { bg: '#e63946', fg: '#fff', border: '#fff' });
    s.position.set(x0 + 3, H + 4, z - 6.2); W.add(s);
    for (const k of [-1, 1]) { // tower legs
      W.add(box(0.4, H + 4, 0.4, mat('darkmetal'), x0 + 0.3, (H + 4) / 2, z + k * 6));
      W.add(box(0.4, H + 4, 0.4, mat('darkmetal'), x0 + 5.7, (H + 4) / 2, z + k * 6));
    }
    W.add(box(6, 0.2, 12.4, mat('darkmetal'), x0 + 3, H + 4, z));
    for (let i = 0; i < 6; i++) { const fl = box(0.05, 1.4, 1.0, mat(i % 2 ? 0xffc23d : 0xe63946), x0 + 6 + uR + 10 + i * 18, 2.6, z - 6.6); W.add(fl); W.add(box(0.06, 3.3, 0.06, mat('darkmetal'), x0 + 6 + uR + 10 + i * 18, 1.65, z - 6.6 - 0.5)); }
    W.zones.push({ name: 'Mega Ramp', x: -45, z, r: 26 });
    W.zones.push({ name: 'Mega Ramp', x: -95, z, r: 18 });
  }

  // ---------------- VERT RAMP (west) ----------------
  {
    const cx = -80, cz = -32;
    const hp = halfpipe(W, cx, cz, 0, { h: 4, r: 4.6, flat: 7, w: 16, deck: 3 });
    W.spot('Vert Ramp', cx - 2, cz, 0, 11);
    W.zones.push({ name: 'Vert Ramp', x: cx, z: cz, r: 14 });
    const s = sign(['VERT'], 6, 2, { bg: '#1d3557', fg: '#ffc23d' });
    s.position.set(cx, 6.5, cz - 8.3); W.add(s);
    void hp;
  }
  // ---------------- MINI RAMP ----------------
  {
    const cx = -80, cz = 0;
    halfpipe(W, cx, cz, 0, { h: 1.7, r: 2.4, flat: 4, w: 9, deck: 2 });
    W.spot('Mini Ramp', cx, cz, 0, 4);
    W.zones.push({ name: 'Mini Ramp', x: cx, z: cz, r: 9 });
  }
  // ---------------- SPINE + QUARTERS (west flow) ----------------
  {
    spine(W, -80, 28, 0, { h: 2.2, r: 3, w: 10 });
    quarter(W, -92.5, 28, Math.PI, { h: 2.2, r: 3, w: 10, deck: 2 });
    quarter(W, -67.5, 28, 0, { h: 2.2, r: 3, w: 10, deck: 2 });
    W.spot('Spine', -73, 28, Math.PI, 5);
    W.zones.push({ name: 'Spine', x: -80, z: 28, r: 12 });
  }

  // ---------------- CENTRE FLOW SECTION ----------------
  {
    // spawn plaza faces north toward the jump line
    W.spot('Start', 0, 30, -Math.PI / 2, 0);
    // quarter pipes framing the flow area
    quarter(W, -40, -10, Math.PI, { h: 2.4, r: 3.2, w: 14, deck: 2.5 });
    quarter(W, 40, -10, 0, { h: 2.4, r: 3.2, w: 14, deck: 2.5 });
    funbox(W, -8, -10, 0, { h: 1.1, bankLen: 2.6, top: 5, w: 6, rail: true });
    kicker(W, -25, 3, Math.PI, { h: 1.0, len: 2.2, w: 2.5 });
    kicker(W, 25, 3, 0, { h: 1.0, len: 2.2, w: 2.5 });
    bank(W, -6, 12, Math.PI / 2, { h: 1.0, len: 2.4, w: 10, deck: 2, top: 'park' });
    // little hip: two banks at an angle
    bank(W, 18, -24, -Math.PI / 2 + 0.6, { h: 1.3, len: 3, w: 6, deck: 1.5, top: 'park' });
    bank(W, 26, -24, -Math.PI / 2 - 0.6, { h: 1.3, len: 3, w: 6, deck: 1.5, top: 'park' });
    W.zones.push({ name: 'Flow Section', x: 0, z: -5, r: 30 });
  }

  // ---------------- JUMP LINE (escalating table tops, east-west) ----------------
  {
    const z = -48;
    table(W, -60, z, 0, { h: 0.8, up: 2.2, top: 2.5, down: 3.5, w: 4, assist: true });
    table(W, -40, z, 0, { h: 1.3, up: 3.0, top: 3.5, down: 4.5, w: 4.5, assist: true });
    table(W, -16, z, 0, { h: 2.0, up: 4.0, top: 4.5, down: 6.0, w: 5, assist: true });
    gapJump(W, 12, z, 0, { h: 2.4, up: 4.5, gap: 7, landH: 2.4, deck: 1.2, down: 7, w: 5 });
    quarter(W, 46, z, 0, { h: 3, r: 3.6, w: 10, deck: 2 });
    W.spot('Jump Line', -75, z, 0, 7.5);
    W.zones.push({ name: 'Jump Line', x: -20, z, r: 42 });
    const s = sign(['JUMP LINE'], 8, 2, { bg: '#2a9d8f', fg: '#fff' });
    s.position.set(-70, 3, z - 3.5); W.add(s);
  }

  // ---------------- BOWLS (south-west) ----------------
  {
    bowl(W, -55, 62, { hx: 13, hz: 8, cr: 6, depth: 2.9, r: 3.3 });
    bowl(W, -25, 78, { hx: 7, hz: 6, cr: 4, depth: 1.8, r: 2.4 });
    W.spot('Big Bowl', -55, 55, 0, 3);
    W.spot('Little Bowl', -25, 74, 0, 2);
    W.zones.push({ name: 'Big Bowl', x: -55, z: 62, r: 14 });
    W.zones.push({ name: 'Little Bowl', x: -25, z: 78, r: 8 });
  }

  // ---------------- STREET PLAZA (south-east) ----------------
  {
    stairs(W, 30, 30, Math.PI / 2, { steps: 6, rise: 0.18, run: 0.38, w: 4.5, deck: 3 });
    stairs(W, 55, 26, Math.PI / 2, { steps: 10, rise: 0.17, run: 0.36, w: 5, deck: 3.5 });
    stairs(W, 82, 28, Math.PI / 2, { steps: 4, rise: 0.2, run: 0.4, w: 6, deck: 2.5, hubba: false });
    ledge(W, 25, 62, 0, { len: 9, h: 0.45 });
    ledge(W, 45, 70, 0, { len: 8, h: 0.6, w: 1.2, surf: 'park' });
    ledge(W, 66, 60, Math.PI / 2, { len: 7, h: 0.35, w: 3, kind: 'manual' });
    rail(W, V(30, 0.5, 82), V(44, 0.5, 82), { posts: 4 });
    rail(W, V(55, 0.42, 86), V(70, 0.42, 86), { posts: 4, material: 'redrail' });
    rail(W, V(80, 0.5, 70), V(95, 0.5, 70), { posts: 4 });
    funbox(W, 78, 82, 0, { h: 0.9, bankLen: 2.4, top: 4, w: 5, rail: true });
    bank(W, 100, 45, 0, { h: 1.6, len: 3.5, w: 12, deck: 2, top: 'park' });
    bank(W, 95, 92, -Math.PI / 2, { h: 1.2, len: 3, w: 10, deck: 2, top: 'park' });
    W.spot('Street Plaza', 40, 50, 0, 3);
    W.spot('Big Stairs', 55, 22, Math.PI / 2, 4);
    W.zones.push({ name: 'Street Plaza', x: 60, z: 60, r: 40 });
    for (const [x, z] of [[20, 45], [85, 50], [40, 95], [70, 40]]) lightPole(W, x, z);
  }

  // ---------------- THE HANGAR + FOAM PIT (north-east) ----------------
  {
    const x0 = 42, x1 = 108, z0 = -100, z1 = -58;
    const wallH = 7;
    const wallM = mat(0x2b2d33);
    const walls = [
      [x0, z0, x1, z0 + 0.6], [x0, z1 - 0.6, x1, z1], [x1 - 0.6, z0, x1, z1],
      [x0, z0, x0 + 0.6, z0 + 14], [x0, z1 - 14, x0 + 0.6, z1], // west wall with a big door in the middle
    ];
    for (const [ax, az, bx, bz] of walls) {
      hf.stamp(() => wallH, ax, bx, az, bz, 'max', MAT.CONCRETE);
      W.add(box(bx - ax, wallH, bz - az, wallM, (ax + bx) / 2, wallH / 2, (az + bz) / 2));
    }
    const s = sign(['THE HANGAR', 'WOODWARD PARK CITY'], 22, 5, { bg: '#111', fg: '#fff', border: '#ffc23d' });
    s.position.set((x0 + x1) / 2, wallH + 3, z1 + 0.4); W.add(s);
    // inside: roll-in deck, kicker into the foam pit, resi-style ramp
    const H = 4;
    const roll = rampUp(5, 35, H);
    const uR = roll[roll.length - 1][0];
    const p = [[0, H], [4, H], ...shift(mirror(roll, uR), 4).slice(1)];
    const u = 4 + uR + 6;
    const k = shift(arc(4.2, 1.6, 14), u);
    p.push(...k);
    placeProfile(W, 48, -79, 0, p, 6, { top: 'skatelite' });
    const lipU = k[k.length - 1][0];
    foamPit(W, 48 + lipU + 9, -79, { hx: 8, hz: 7, depth: 1.0 });
    W.spot('Foam Pit', 50, -79, 0, 0);
    // a second, bigger lane into the same pit from the north side
    const k2 = arc(6, 2.4, 14);
    placeProfile(W, 75, -94, Math.PI / 2, [[-8, 0], ...k2], 5, { top: 'skatelite' });
    W.spot('Foam Pit Big Kicker', 75, -99, Math.PI / 2, 8.5);
    W.zones.push({ name: 'The Hangar', x: 75, z: -79, r: 26 });
  }

  // ---------------- AIR BAG (east) ----------------
  {
    const H = 7, z = -32, x0 = 52;
    const roll = rampUp(8, 38, H);
    const uR = roll[roll.length - 1][0];
    const p = [[0, H], [4, H], ...shift(mirror(roll, uR), 4).slice(1)];
    const u = 4 + uR + 5;
    const k = shift(arc(6.5, 2.3, 14), u);
    p.push(...k);
    const f = placeProfile(W, x0, z, 0, p, 6, { top: 'skatelite' });
    const lipU = k[k.length - 1][0];
    const [bx, bz] = f.toWorld(lipU + 5, 0);
    airbag(W, bx, bz, 0, { len: 16, w: 12, h: 2.6 });
    W.spot('Air Bag', x0 + 2, z, 0, 0);
    W.zones.push({ name: 'Air Bag', x: x0 + 25, z, r: 18 });
    for (const k2 of [-1, 1]) {
      W.add(box(0.4, H, 0.4, mat('darkmetal'), x0 + 0.3, H / 2, z + k2 * 3));
      W.add(box(0.4, H, 0.4, mat('darkmetal'), x0 + 3.7, H / 2, z + k2 * 3));
    }
  }

  // ---------------- SOUTH PLAZA: pyramid, rainbow rail, kinked rails, euro gap ----------------
  {
    pyramid(W, 0, 70, { top: 7, bank: 3.2, h: 1.3 });
    // hubba rail down one face of the pyramid
    polyRail(W, [V(-1, 1.75, 66.5), V(-1, 1.75, 73.5)]);
    polyRail(W, [V(4.2, 1.75, 70), V(7.5, 0.45, 70), V(11, 0.45, 70)]);
    // rainbow rail
    const rb = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; rb.push(V(-14 + 16 * t, 0.45 + 1.1 * Math.sin(Math.PI * t), 92)); }
    polyRail(W, rb, { material: 'redrail' });
    // kinked rail down a bank-to-flat
    bank(W, 16, 96, Math.PI, { h: 1.2, len: 3, w: 6, deck: 1.5, top: 'park' });
    polyRail(W, [V(13, 1.65, 94), V(11.5, 1.65, 94), V(8, 0.55, 94), V(4, 0.55, 94)]);
    // euro gap: bank up to a ledge with a gap
    bank(W, -20, 55, 0, { h: 1.0, len: 2.5, w: 5, deck: 1, top: 'park' });
    ledge(W, -11, 55, 0, { len: 6, h: 1.0, w: 5, surf: 'park' });
    W.spot('Pyramid', 0, 52, Math.PI / 2, 5);
    W.spot('Rainbow Rail', -24, 92, 0, 6);
    W.zones.push({ name: 'Pyramid', x: 0, z: 70, r: 12 });
    W.zones.push({ name: 'Rainbow Rail', x: -6, z: 92, r: 10 });
  }
  // ---------------- BIG LAUNCH (kicker into a giant quarter) ----------------
  {
    kicker(W, -30, -30, 0, { h: 1.4, len: 3.0, w: 4 });
    quarter(W, -10, -30, 0, { h: 4.2, r: 4.8, w: 12, deck: 2.5 });
    W.spot('Big Launch', -48, -30, 0, 8.5);
    W.zones.push({ name: 'Big Launch', x: -18, z: -30, r: 14 });
  }
  // ---------------- painted floor zones ----------------
  paint(W, 15, 15, 108, 100, 0x9ea4ab);      // street plaza
  paint(W, -44, -22, 44, 8, 0x8fb8d8);       // flow section (Woodward blue)
  paint(W, -70, -54, 40, -42, 0xc9b28f);     // jump line lane
  paint(W, -100, -46, -60, 40, 0xb7c0c8);    // ramps
  paint(W, -16, 52, 16, 100, 0xd3c6b0);      // south plaza

  // ---------------- ground meshes ----------------
  const holeAt = (x, z) => W.holes.some(h => h.sdf(x, z) < 3);
  const pad = gridMesh((x, z) => (holeAt(x, z) ? null : 0), -PX, PX, -PZ, PZ, 1, mat('park'));
  W.add(pad);
  // concrete collar around every bowl / pit, a hair above the pad so they never flicker
  for (const h of W.holes) {
    const [x0, x1, z0, z1] = h.box;
    W.add(gridMesh((x, z) => { const d = h.sdf(x, z); return d > -0.02 && d < 4.2 ? 0.012 : null; }, x0 - 4.5, x1 + 4.5, z0 - 4.5, z1 + 4.5, 0.25, mat('park')));
  }
  // grass all around, with the park pad cut out (so the bowls show)
  const gs = new THREE.Shape([new THREE.Vector2(-700, -700), new THREE.Vector2(700, -700), new THREE.Vector2(700, 700), new THREE.Vector2(-700, 700)]);
  gs.holes.push(new THREE.Path([new THREE.Vector2(-PX + 0.5, -PZ + 0.5), new THREE.Vector2(-PX + 0.5, PZ - 0.5), new THREE.Vector2(PX - 0.5, PZ - 0.5), new THREE.Vector2(PX - 0.5, -PZ + 0.5)]));
  const gg = new THREE.ShapeGeometry(gs);
  const uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 7, uv.getY(i) / 7);
  const grass = new THREE.Mesh(gg, mat('grass'));
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.05; grass.receiveShadow = true;
  W.add(grass);
  // painted lines on the pad around areas
  // ---------------- scenery ----------------
  const forest = new Forest(W);
  for (let i = 0; i < 160; i++) {
    const side = (rand() * 4) | 0;
    let x, z;
    if (side === 0) { x = -124 + rand() * 248; z = -114 + rand() * 9; }
    else if (side === 1) { x = -124 + rand() * 248; z = 106 + rand() * 8; }
    else if (side === 2) { x = -124 + rand() * 10; z = -114 + rand() * 228; }
    else { x = 114 + rand() * 10; z = -114 + rand() * 228; }
    forest.pine(x, z, 0.8 + rand() * 0.7);
  }
  for (let i = 0; i < 260; i++) { // forest on the hillsides beyond
    const a = rand() * Math.PI * 2, d = 150 + rand() * 120;
    forest.pine(Math.cos(a) * d * 1.1, Math.sin(a) * d, 1 + rand() * 1.2, false);
  }
  forest.flush();
  // ski hill to the north with runs, mountains around
  mountain(W, 0, -480, 330, 260, 0x4f7a4f, { snow: 0.34, rough: 0.12, seg: 14 });
  mountain(W, -380, -360, 220, 200, 0x5b7f57, { snow: 0.3 });
  mountain(W, 380, -380, 240, 210, 0x56795a, { snow: 0.32 });
  mountain(W, -460, 100, 200, 140, 0x6b8a60);
  mountain(W, 470, 120, 210, 150, 0x6b8a60);
  mountain(W, 0, 470, 260, 120, 0x7a9468);
  // ski runs: white strips down the big hill
  for (const [x, w] of [[-60, 18], [10, 24], [80, 16]]) {
    const run = new THREE.Mesh(new THREE.PlaneGeometry(w, 300), mat(0xf4f8ff));
    run.position.set(x, 110, -330); run.rotation.x = -Math.PI / 2 + 0.68; W.add(run);
  }
  clouds(W, 14, 900, 120);
  // banners: family sponsors
  banner(W, 0, 44, 0, ['KBR', 'KYLE BALDWIN RACING'], { w: 10, h: 2.5, bg: '#ff8000', fg: '#111' });
  banner(W, -30, 44, 0, ['MOTO TOOLS', 'RACE DAY · PRACTICE DAY · EVERY DAY'], { w: 10, h: 2.5, bg: '#111', fg: '#ffc23d' });
  banner(W, 30, 44, 0, ['UTAH BOYZ', 'SCOOT TRIP'], { w: 10, h: 2.5, bg: '#1d3557', fg: '#fff' });
  for (const [x, z] of [[-20, 20], [20, 20], [-60, -20], [60, 10], [-40, 40], [0, -70]]) lightPole(W, x, z);
  return W;
}

