// Moab, Utah — a fantasy scooter park carved out of slickrock.
// The family's real stops are the stars: the Slickrock Bike Trail (white-dash loop over the
// sandstone domes), Corona Arch (launch THROUGH it) and Delicate Arch (standing on the rim of a
// giant natural skate bowl). Plus a fin drop, a slot-canyon gap, a slickrock handrail and a little
// wooden jump park, with the snowy La Sal Mountains, red mesas, Fisher Towers and Balanced Rock
// all around.
//
// Physics rule: every ride-able surface is built from smooth, low-frequency shapes (compact
// polynomial domes, cosine ramps, circular transitions). The only sharp edges are deliberate
// drops / lips, and those sit on the 1.2 m ground-mesh grid so the mesh matches the physics.
import * as THREE from 'three';
import { Heightfield, MAT } from './heightfield.js';
import { World, gridMesh, mat, sign, pipe, setSeed, rand } from './builder.js';
import { kicker, table, gapJump, quarter, rail, V } from './features.js';
import { Forest, banner, clouds } from './decor.js';

const PI = Math.PI;
const X0 = -210, SIZE = 420, CELL = 0.4;   // height grid (square, same origin in x and z)
const STEP = 1.2, TILE = 84;               // ground mesh: every 3rd grid node, 5 x 5 tiles
const EDGE = 22, EDGE_H = 24;              // cliff band rising at the map edge (outside the play area)
const PLAIN_Y = 19.5;                      // desert plain beyond the cliffs
const snap = c => Math.round((c - X0) / STEP) * STEP + X0; // onto the ground-mesh grid
const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);
const cosS = t => (1 - Math.cos(PI * clamp01(t))) / 2;      // smooth 0 → 1, flat at both ends
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const fadeOut = (d, w) => 1 - cosS(d / w);                    // 1 for d <= 0 → 0 for d >= w
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Very long, gentle swells under everything (wavelengths > 200 m, slope < 6°).
function base(x, z) {
  return 1.8 * Math.sin(x / 41 + 0.7) * Math.cos(z / 53 - 0.4)
    + 1.2 * Math.sin((x - z) / 67 + 1.1)
    + 0.8 * Math.cos((0.6 * x + z) / 38);
}

// ---------- colours ----------
// Terrain + arches use mat('slickrock'): its texture is orange (#d7884f) and gets multiplied by the
// vertex colour, so we hand it "wanted colour / texture colour" (in linear space).
const TEX_LIN = new THREE.Color(0xd7884f);
const _col = new THREE.Color();
function rockMul(r, g, b) {
  _col.setRGB(r, g, b, THREE.SRGBColorSpace);
  return [_col.r / TEX_LIN.r, _col.g / TEX_LIN.g, _col.b / TEX_LIN.b];
}
const LOW = [0.64, 0.28, 0.16], MID = [0.84, 0.47, 0.27], TOP = [0.95, 0.72, 0.52];
const SAND = [0.91, 0.66, 0.44], CLIFF = [0.62, 0.26, 0.15];

// ---------- smooth bumps ----------
// Compact "dome" kernel a*(1 - r²/R²)³ — looks like a Gaussian but is exactly zero (with zero
// slope and curvature) at its edge. Max slope = 0.70 * a / sigma.
function makeBlobs() {
  const list = [];
  const add = (x, z, a, sl, ss = sl, ang = 0) => list.push({ x, z, a, Rl: 2.45 * sl, Rs: 2.45 * ss, c: Math.cos(ang), s: Math.sin(ang) });
  return { list, add };
}
function rasterBlobs(list, nx, nz, out, sandy) {
  for (const b of list) {
    const R = Math.max(b.Rl, b.Rs);
    const i0 = Math.max(0, Math.floor((b.x - R - X0) / CELL)), i1 = Math.min(nx - 1, Math.ceil((b.x + R - X0) / CELL));
    const k0 = Math.max(0, Math.floor((b.z - R - X0) / CELL)), k1 = Math.min(nz - 1, Math.ceil((b.z + R - X0) / CELL));
    const il = 1 / (b.Rl * b.Rl), is = 1 / (b.Rs * b.Rs);
    for (let k = k0; k <= k1; k++) {
      const dz = X0 + k * CELL - b.z;
      for (let i = i0; i <= i1; i++) {
        const dx = X0 + i * CELL - b.x;
        const u = dx * b.c + dz * b.s, v = -dx * b.s + dz * b.c;
        const q = u * u * il + v * v * is;
        if (q >= 1) continue;
        const w = 1 - q, g = w * w * w;
        out[k * nx + i] += b.a * g;
        if (b.a < 0 && g > 0.5) sandy[k * nx + i] = 1; // sand collects in the bottom of hollows
      }
    }
  }
}

// smooth interpolation through [s, value] knots (cosine between knots)
function knots(tab) {
  return s => {
    if (s <= tab[0][0]) return tab[0][1];
    for (let i = 1; i < tab.length; i++) {
      if (s <= tab[i][0]) {
        const [s0, a] = tab[i - 1], [s1, b] = tab[i];
        return a + (b - a) * cosS((s - s0) / (s1 - s0));
      }
    }
    return tab[tab.length - 1][1];
  };
}

// ---------- natural arch mesh ----------
// Sweeps an irregular elliptical cross-section along a semi-ellipse whose legs go straight
// down into the ground. (cx, cy, cz) = centre of the opening at ground level; rot = direction
// of the span (leg to leg). Mesh only — you can ride and fly under it.
function archMesh({ cx, cy, cz, rot, as, hc, thick, depth, lean = 0, sink = 6, seg = 80, ring = 16, palette, seed = 0 }) {
  const T = knots(thick), Wd = knots(depth);
  const pts = []; // [a, y, s]
  const nl = 4;
  for (let i = 0; i < nl; i++) pts.push([-as, -sink * (1 - i / nl), 0]);
  for (let i = 0; i <= seg; i++) { const s = i / seg, th = PI * (1 - s); pts.push([as * Math.cos(th), hc * Math.sin(th), s]); }
  for (let i = 1; i <= nl; i++) pts.push([as, -sink * i / nl, 1]);
  const A = new THREE.Vector3(Math.cos(rot), 0, Math.sin(rot)), B = new THREE.Vector3(-Math.sin(rot), 0, Math.cos(rot));
  const pos = [], col = [], uv = [], idx = [];
  const n = pts.length, top = hc + T(0.5) / 2;
  let arcLen = 0;
  for (let j = 0; j < n; j++) {
    const p = pts[j], pa = pts[Math.max(0, j - 1)], pb = pts[Math.min(n - 1, j + 1)];
    let ta = pb[0] - pa[0], ty = pb[1] - pa[1];
    const tl = Math.hypot(ta, ty); ta /= tl; ty /= tl;
    const na = -ty, ny = ta; // in-plane normal pointing away from the opening
    if (j > 0) arcLen += Math.hypot(p[0] - pts[j - 1][0], p[1] - pts[j - 1][1]);
    const s = p[2], th = T(s) / 2, wd = Wd(s) / 2;
    const leanOff = lean * Math.pow(Math.max(0, p[1]) / hc, 2);
    for (let r = 0; r <= ring; r++) {
      const ph = (r / ring) * PI * 2;
      const wob = 1 + 0.09 * Math.sin(2 * ph + s * 17 + seed) + 0.06 * Math.sin(3 * ph - s * 29 + 1.3 + seed) + 0.04 * Math.sin(5 * ph + s * 41);
      const ca = Math.cos(ph) * th * wob, cb = Math.sin(ph) * wd * wob;
      const la = p[0] + na * ca, ly = p[1] + ny * ca;
      const x = cx + A.x * la + B.x * (cb + leanOff), z = cz + A.z * la + B.z * (cb + leanOff), y = cy + ly;
      pos.push(x, y, z);
      uv.push(arcLen / 5, r / ring * 3);
      const hy = clamp01(ly / top);
      let c = hy < 0.55 ? mix3(palette[0], palette[1], hy / 0.55) : mix3(palette[1], palette[2], (hy - 0.55) / 0.45);
      const st = 1 + 0.07 * Math.sin(ly * 1.9 + seed) + 0.03 * Math.sin(ly * 5.3);
      c = rockMul(c[0] * st, c[1] * st, c[2] * st);
      col.push(c[0], c[1], c[2]);
    }
  }
  const rl = ring + 1;
  for (let j = 0; j < n - 1; j++) {
    for (let r = 0; r < ring; r++) {
      const a = j * rl + r, b = a + 1, c = a + rl, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure the normals face outward (winding depends on the frame)
  const nAttr = g.attributes.normal, P = g.attributes.position;
  const mid = Math.floor(n / 2) * rl;
  const cxm = pts[Math.floor(n / 2)];
  const ox = cx + A.x * cxm[0], oy = cy + cxm[1], oz = cz + A.z * cxm[0];
  const dx = P.getX(mid) - ox, dy = P.getY(mid) - oy, dz = P.getZ(mid) - oz;
  if (dx * nAttr.getX(mid) + dy * nAttr.getY(mid) + dz * nAttr.getZ(mid) < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.setIndex(idx); g.computeVertexNormals();
  }
  const m = new THREE.Mesh(g, mat('slickrock'));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---------- merged scenery rock (one draw call) ----------
class RockPile {
  constructor() { this.pos = []; this.col = []; }
  // geo: indexed geometry centred on the origin. Radial wobble is a function of the vertex's
  // angle + height so duplicated seam / cap vertices move together (no cracks).
  add(geo, x, y, z, hex, { wob = 0.15, seed = rand() * 10, band = 0.08, rotY = rand() * PI * 2, sx = 1, sy = 1, sz = 1 } = {}) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      const a = Math.atan2(pz, px);
      const k = 1 + wob * (0.5 * Math.sin(3 * a + seed + py * 0.07) + 0.3 * Math.sin(7 * a + 2 * seed) + 0.2 * Math.sin(11 * a + py * 0.2));
      p.setXYZ(i, px * k, py, pz * k);
    }
    const g = geo.index ? geo.toNonIndexed() : geo;
    const q = g.attributes.position;
    const c0 = new THREE.Color(hex);
    const cr = Math.cos(rotY), sr = Math.sin(rotY);
    for (let i = 0; i < q.count; i++) {
      const lx = q.getX(i) * sx, ly = q.getY(i) * sy, lz = q.getZ(i) * sz;
      this.pos.push(x + lx * cr - lz * sr, y + ly, z + lx * sr + lz * cr);
      const f = 1 + band * Math.sin(ly * 0.45 + seed) + band * 0.5 * Math.sin(ly * 1.3);
      this.col.push(c0.r * f, c0.g * f, c0.b * f);
    }
  }
  mesh(fog = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog }));
    m.castShadow = false; m.receiveShadow = false;
    return m;
  }
}

// =====================================================================================
export function buildMoab() {
  setSeed(23);
  const hf = new Heightfield(X0, X0, SIZE, SIZE, CELL, 0, MAT.ROCK);
  const W = new World('moab', 'Moab', hf);
  W.sky = 0x4f9fe6; W.fog = [0xcfe0ee, 180, 600];
  const NX = hf.nx, NZ = hf.nz, X1 = hf.x1, Z1 = hf.z1;
  const spots = {};

  // ---------------- Slickrock Bike Trail path (west third) ----------------
  // a lollipop like the real one: spur from the trailhead, then a big loop over the domes
  const LC = [-115, -5];
  const ctrl = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2;
    const rx = i === 0 ? 50 : 50 + (rand() - 0.5) * 14, rz = 104 + (rand() - 0.5) * 18;
    ctrl.push(new THREE.Vector3(LC[0] + rx * Math.cos(a), 0, LC[1] + rz * Math.sin(a)));
  }
  const loop = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal');
  loop.arcLengthDivisions = 3000;
  const junction = ctrl[0];
  const spur = new THREE.CatmullRomCurve3([V(-27, 0, 5), V(-40, 0, 4), V(-53, 0, 0.5), junction.clone()], false, 'centripetal');
  spur.arcLengthDivisions = 600;
  const sampleCurve = (curve, spacing) => {
    const L = curve.getLength(), n = Math.max(2, Math.round(L / spacing)), out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = curve.getPointAt(t), d = curve.getTangentAt(t);
      out.push({ x: p.x, z: p.z, tx: d.x, tz: d.z, s: t * L });
    }
    return out;
  };
  const loopPts = sampleCurve(loop, 0.4), spurPts = sampleCurve(spur, 0.4);
  const trailPts = [...spurPts, ...loopPts];
  W.trail = trailPts.map(p => [p.x, p.z]); // (used by tests / debugging)
  const nearTrail = (x, z, d) => {
    const d2 = d * d;
    for (let i = 0; i < trailPts.length; i += 4) { const p = trailPts[i]; const dx = p.x - x, dz = p.z - z; if (dx * dx + dz * dz < d2) return true; }
    return false;
  };

  // ---------------- rough footprints of the built areas (keep random stuff out) ----------------
  const BUSY = [
    [-44, 4, -19, 29],      // start pad
    [-4, 70, -14, 14],      // handrail slab
    [-55, 55, 18, 152],     // slot canyon bench
    [25, 190, 102, 178],    // corona strip
    [-42, 22, -165, -16],   // fin drop
    [35, 155, -152, -68],   // delicate bowl bench
    [82, 166, -34, 50],     // jump park
  ];
  const busy = (x, z, m = 0) => BUSY.some(([a, b, c, d]) => x > a - m && x < b + m && z > c - m && z < d + m);

  // ---------------- domes, whalebacks, fins, hollows ----------------
  const { list: blobs, add: blob } = makeBlobs();
  // along the trail: rolling domes right on the line, rollers across it, sandy hollows beside it
  {
    let next = 8, n = 0;
    for (const p of loopPts) {
      if (p.s < next) continue;
      next = p.s + 22 + rand() * 10; n++;
      const nx = -p.tz, nz = p.tx;
      if (n % 4 === 0) { // roller: whaleback lying across the trail
        blob(p.x, p.z, 2.4 + rand() * 0.8, 6.5, 16, Math.atan2(nz, nx));
      } else {
        const o = (rand() - 0.5) * 10, sg = 8 + rand() * 5;
        blob(p.x + nx * o, p.z + nz * o, sg * (0.25 + rand() * 0.17), sg);
      }
      if (n % 3 === 1) {
        const side = rand() < 0.5 ? -1 : 1, o = side * (16 + rand() * 6), sg = 7 + rand() * 3;
        blob(p.x + nx * o, p.z + nz * o, -(1.8 + rand() * 1.4), sg);
      }
    }
  }
  // off-trail slickrock: domes, long whalebacks and a few fins
  for (let i = 0; i < 38; i++) {
    const x = -178 + rand() * 120, z = -176 + rand() * 352;
    if (z > 128 && x > -165 && x < -82) continue; // practice-loop rolls live there
    const sg = 8 + rand() * 7;
    if (rand() < 0.3) { const ss = 6 + rand() * 3; blob(x, z, ss * (0.38 + rand() * 0.12), ss * (2.2 + rand() * 1.2), ss, rand() * PI); }
    else blob(x, z, sg * (0.25 + rand() * 0.2), sg);
  }
  for (const [x, z, ang] of [[-160, -60, 0.4], [-95, 60, -0.9], [-150, 95, 1.2]]) blob(x, z, 3.4, 22, 4.6, ang);
  for (let i = 0; i < 6; i++) blob(-170 + rand() * 105, -160 + rand() * 300, -(2 + rand() * 1.5), 7 + rand() * 4); // sandy hollows
  // the Practice Loop: a cluster of steep rolls south of the main loop
  const practice = [[-138, 150, 6.2, 6.6], [-117, 160, 5.6, 6.0], [-98, 146, 6.0, 6.8], [-126, 175, 4.6, 5.4]];
  for (const [x, z, a, sg] of practice) blob(x, z, a, sg);
  blob(-108, 168, -2.2, 6); // sandy pocket between them
  // gentle swells across the rest of the map
  for (let i = 0; i < 60 && blobs.length < 200; i++) {
    const x = -50 + rand() * 236, z = -186 + rand() * 372;
    if (busy(x, z, 10)) continue;
    const sg = 9 + rand() * 7;
    blob(x, z, sg * (0.12 + rand() * 0.14), sg);
  }
  const dome = new Float32Array(NX * NZ), sandy = new Uint8Array(NX * NZ);
  rasterBlobs(blobs, NX, NZ, dome, sandy);
  // soft-limit where domes pile up (keeps stacks from turning into steep mountains; smooth)
  for (let i = 0; i < dome.length; i++) { const d = dome[i]; dome[i] = d > 0 ? 7 * Math.tanh(d / 7) : -4 * Math.tanh(-d / 4); }
  const preH = (x, z) => { // base + domes (before the built areas), bilinear
    const fx = (x - X0) / CELL, fz = (z - X0) / CELL, i = Math.floor(fx), k = Math.floor(fz), tx = fx - i, tz = fz - k;
    const a = k * NX + i;
    const d = dome[a] * (1 - tx) * (1 - tz) + dome[a + 1] * tx * (1 - tz) + dome[a + NX] * (1 - tx) * tz + dome[a + NX + 1] * tx * tz;
    return base(x, z) + d;
  };

  // ---------------- built areas: each one blends its own shape into the rock ----------------
  const zones = [];
  const cur = { mat: MAT.ROCK };
  const zone = (x0, x1, z0, z1, fn) => zones.push({ x0, x1, z0, z1, fn });
  const pad = (cx, cz, r, blend, href) => {
    const R = r + blend;
    zone(cx - R, cx + R, cz - R, cz + R, (x, z, h) => {
      const m = fadeOut(Math.hypot(x - cx, z - cz) - r, blend);
      if (m <= 0) return h;
      if (m > 0.5) cur.mat = MAT.ROCK;
      return h + (href - h) * m;
    });
  };

  // ----- DELICATE ARCH BOWL (north-east): a stadium-shaped slickrock bowl in a raised bench -----
  // shallow mellow end in the west (roll in / roll out), deep vert end in the east under the arch
  const BX0 = 80, BX1 = 110, BZ = -110, BR = 17;
  const Hb = base(95, BZ) + 2.5;
  const bowlDepth = (e, t) => { // e = distance inside the rim
    const k = smooth(0.1, 0.75, t);
    const D = 4 + 3.4 * k, th = (40 + 32 * k) * PI / 180, rc = 6 - 5.75 * k;
    const sn = Math.sin(th), cs = Math.cos(th);
    const r = D / (1 - cs) - rc, ec = rc * sn;
    if (e < ec) return -(rc - Math.sqrt(rc * rc - e * e));       // rounded (or sharp) lip
    const ew = ec + r * sn;
    if (e < ew) { const q = ew - e; return -D + r - Math.sqrt(r * r - q * q); } // transition
    return -D;                                                   // flat bottom
  };
  const bowlSdf = (x, z) => { const t = clamp01((x - BX0) / (BX1 - BX0)); return [Math.hypot(x - (BX0 + t * (BX1 - BX0)), z - BZ) - BR, t]; };
  const MOUND = [45, BZ]; // drop-in knoll on the west rim (extra speed for the vert end)
  zone(BX0 - BR - 34, BX1 + BR + 27, BZ - BR - 27, BZ + BR + 27, (x, z, h) => {
    const [sd, t] = bowlSdf(x, z);
    const Hr = Hb - 2.2 * smooth(BX0 - BR - 8, BX1 + BR + 8, x); // rim drops 2 m toward the vert end (≈2°)
    if (sd > 0) {
      const m = fadeOut(sd - 8, 18);
      const k = fadeOut(Math.hypot(x - MOUND[0], z - MOUND[1]) - 4, 13);
      if (m <= 0 && k <= 0) return h;
      if (m > 0.5 || k > 0.5) cur.mat = MAT.ROCK;
      const y = h + (Hr - h) * m;
      return y + (Hb + 4 - y) * k;
    }
    cur.mat = MAT.ROCK;
    return Hr + bowlDepth(-sd, t);
  });

  // ----- FIN DROP (north-centre): ride up a long sandstone fin and drop off its end -----
  const FX = snap(-10), FZ = snap(-84); // u = FZ - z (ride toward -z), v = x - FX
  const Fref = base(FX, FZ - 10);
  const finP = u => {
    if (u < -50) return 0;
    if (u < -20) return 6.5 * cosS((u + 50) / 30);          // up the spine (≤ 19°)
    if (u <= 0) return 6.5;                                 // flat top
    if (u < 2.4) return 6.5 - 4.5 * (u / 2.4);              // the drop (62°, on the mesh grid)
    if (u < 22.4) return 2 - 8.5 * cosS((u - 2.4) / 20);    // landing transition (≤ 34°)
    if (u < 40) return -6.5;
    if (u < 62) return -6.5 + 6.5 * cosS((u - 40) / 22);
    return 0;
  };
  zone(FX - 32, FX + 32, FZ - 78, FZ + 66, (x, z, h) => {
    const u = FZ - z, v = Math.abs(x - FX);
    const wc = u < 0 ? 4 : 4 + 10 * cosS(u / 14);
    const ml = fadeOut(v - wc, 14);
    if (ml <= 0) return h;
    const mu = u < -50 ? fadeOut(-50 - u, 15) : u > 62 ? fadeOut(u - 62, 15) : 1;
    const m = ml * mu;
    if (m <= 0) return h;
    if (m > 0.5) cur.mat = MAT.ROCK;
    return h + (Fref + finP(u) - h) * m;
  });

  // ----- CORONA ARCH (south-east): bench roll-in → rock kicker → THROUGH the arch → landing -----
  const CX = snap(61), CZ = 140; // u = x - CX, v = z - CZ
  const Cref = base(CX + 50, CZ);
  const KR = 14.4, KL = 7.2, KH = KR - Math.sqrt(KR * KR - KL * KL); // 30° rock kicker, 1.93 m
  const corP = u => {
    if (u < -30) return 0;
    if (u < 0) return 9 * cosS((u + 30) / 30);              // ramp up onto the bench (≤ 25°)
    if (u <= 14) return 9;                                  // the bench (start here)
    if (u < 32) return 9 - 9 * cosS((u - 14) / 18);         // roll-in (≤ 38°)
    if (u < 64) return 0;
    if (u < 86) return -6 * cosS((u - 64) / 22);            // landing (≤ 23°)
    if (u < 100) return -6;
    if (u < 118) return -6 + 6 * cosS((u - 100) / 18);
    return 0;
  };
  const corKick = u => {
    if (u < 39.6 || u > 49.2) return 0;
    if (u <= 46.8) { const q = u - 39.6; return KR - Math.sqrt(KR * KR - q * q); }
    return KH * (1 - (u - 46.8) / 2.4);                     // back of the kicker
  };
  zone(CX - 45, CX + 133, CZ - 36, CZ + 36, (x, z, h) => {
    const u = x - CX, v = Math.abs(z - CZ);
    const ml = fadeOut(v - 13, 22);
    if (ml <= 0) return h;
    const mu = u < -30 ? fadeOut(-30 - u, 15) : u > 118 ? fadeOut(u - 118, 15) : 1;
    const m = ml * mu;
    if (m <= 0) return h;
    if (m > 0.5) cur.mat = MAT.ROCK;
    return h + (Cref + corP(u) - h) * m + corKick(u) * fadeOut(v - 3, 4);
  });

  // ----- SLOT CANYON GAP (south-centre): kicker over a narrow, deep crack -----
  const SX = 0, SZ = snap(66); // u = z - SZ (ride toward +z), v = x - SX
  const Sref = base(SX, SZ);
  const SKR = 6 / Math.sin(25 * PI / 180), SKH = SKR - Math.sqrt(SKR * SKR - 36); // 25° kicker, 1.33 m
  const slotKick = u => {
    if (u < 0 || u > 8.4) return 0;
    if (u <= 6) return SKR - Math.sqrt(SKR * SKR - u * u);
    return SKH * (1 - (u - 6) / 2.4);
  };
  const crackF = u => (u <= 6 || u >= 13.2 ? 0 : u < 8.4 ? (u - 6) / 2.4 : u <= 10.8 ? 1 : 1 - (u - 10.8) / 2.4);
  const crackD = v => 8 * (1 - cosS((v - 22) / 16));          // floor rises out at both ends
  const slotLand = u => {
    if (u < 8.4) return 0;
    if (u < 10.8) return -0.6 * (u - 8.4) / 2.4;
    if (u < 15) return -0.6;
    if (u < 33) return -0.6 - 4 * cosS((u - 15) / 18);       // landing (≤ 20°)
    if (u < 45) return -4.6;
    if (u < 63) return -4.6 + 4.6 * cosS((u - 45) / 18);
    return 0;
  };
  // start deck 3 m up, rolling down to the kicker (so even the starter scooter clears the gap)
  const slotDeck = u => (u < -20 ? 3 : u < -4 ? 3 - 3 * cosS((u + 20) / 16) : 0);
  zone(SX - 56, SX + 56, SZ - 48, SZ + 86, (x, z, h) => {
    const u = z - SZ, v = Math.abs(x - SX);
    const m = fadeOut(v - 40, 15) * (u < -32 ? fadeOut(-32 - u, 15) : u > 70 ? fadeOut(u - 70, 15) : 1);
    if (m <= 0) return h;
    if (m > 0.5) cur.mat = MAT.ROCK;
    let y = h + (Sref + slotDeck(u) * fadeOut(v - 8, 12) - h) * m;
    const f = crackF(u);
    if (f > 0 && v < 38) { y -= crackD(v) * f; if (f > 0.99 && v < 30) cur.mat = MAT.DIRT; }
    y += slotKick(u) * fadeOut(v - 2.5, 3) + slotLand(u) * fadeOut(v - 12, 12);
    return y;
  });

  // ----- HANDRAIL SLAB (centre): a raised slickrock ledge sloping east with a rail on its edge -----
  const HX = 20, HZ = 0; // u = x - HX, v = z - HZ
  const Href = base(HX + 15, HZ);
  const slabP = u => (u < -14 ? 0 : u < -2 ? 4 * cosS((u + 14) / 12) : u <= 4 ? 4 : u < 40 ? 4 - 4 * cosS((u - 4) / 36) : 0);
  zone(HX - 25, HX + 51, HZ - 13, HZ + 13, (x, z, h) => {
    const u = x - HX, v = Math.abs(z - HZ);
    const m = fadeOut(v - 5, 7) * (u < -14 ? fadeOut(-14 - u, 10) : u > 40 ? fadeOut(u - 40, 10) : 1);
    if (m <= 0) return h;
    if (m > 0.5) cur.mat = MAT.ROCK;
    return h + (Href + slabP(u) - h) * m;
  });

  // ----- pads: flat rock for the start, jump park and trail spots -----
  const JX = 124, JZ = 8, Jref = base(JX, JZ) + 0.5;
  pad(JX, JZ, 28, 14, Jref);
  const START = [-20, 5];
  pad(START[0], START[1], 10, 14, base(START[0], START[1]));
  const trailSpot = loopPts.find(p => p.s > 12);
  pad(trailSpot.x, trailSpot.z, 4, 10, preH(trailSpot.x, trailSpot.z));
  const PSPOT = [-158, 138];
  pad(PSPOT[0], PSPOT[1], 4, 9, preH(PSPOT[0], PSPOT[1]));

  // ----- natural lip rocks on the trail (small kicker with a drop behind it) -----
  {
    const R = 5 / Math.sin(22 * PI / 180), HK = R - Math.sqrt(R * R - 25);
    let last = -1e9, count = 0;
    for (const p of loopPts) {
      if (count >= 4 || p.s - last < 60 || p.s < 40 || p.s > loop.getLength() - 30) continue;
      const alongX = Math.abs(p.tx) >= 0.97, alongZ = Math.abs(p.tz) >= 0.97;
      if (!alongX && !alongZ) continue;
      const e = 0.6, gx = (preH(p.x + e, p.z) - preH(p.x - e, p.z)) / (2 * e), gz = (preH(p.x, p.z + e) - preH(p.x, p.z - e)) / (2 * e);
      if (Math.hypot(gx, gz) > 0.15) continue;
      last = p.s; count++;
      // lip line sits on the ground-mesh grid, faces the way the trail runs
      const dir = (alongX ? p.tx : p.tz) > 0 ? 1 : -1;
      const la = snap(alongX ? p.x : p.z), lc = alongX ? p.z : p.x;
      W.lipRocks = (W.lipRocks || []).concat([[alongX ? la : lc, alongX ? lc : la, alongX ? 'x' : 'z', dir]]);
      const bx = alongX ? [la - 12, la + 12, lc - 8, lc + 8] : [lc - 8, lc + 8, la - 12, la + 12];
      zone(bx[0], bx[1], bx[2], bx[3], (x, z, h) => {
        const u = ((alongX ? x : z) - la) * dir;
        if (u < -5 || u > 10) return h;
        const ml = fadeOut(Math.abs((alongX ? z : x) - lc) - 3, 4);
        if (ml <= 0) return h;
        let add;
        if (u <= 0) { const q = u + 5; add = R - Math.sqrt(R * R - q * q); }  // 22° rock kicker
        else if (u <= 2.4) add = HK - (HK + 0.4) * (u / 2.4);                // little drop
        else add = -0.4 * (1 - cosS((u - 2.4) / 7.6));                       // run-out
        if (ml > 0.5) cur.mat = MAT.ROCK;
        return h + add * ml;
      });
    }
  }

  // ---------------- stamp the whole landscape ----------------
  const terrain = (x, z) => {
    const i = Math.round((x - X0) / CELL), k = Math.round((z - X0) / CELL), idx = k * NX + i;
    cur.mat = sandy[idx] ? MAT.DIRT : MAT.ROCK;
    let h = base(x, z) + dome[idx];
    for (const zn of zones) if (x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) h = zn.fn(x, z, h);
    const d = Math.min(x - X0, X1 - x, z - X0, Z1 - z);
    if (d < EDGE) { const e = (EDGE - d) / EDGE; h += EDGE_H * e * e; cur.mat = MAT.ROCK; } // the cliffs that close the map
    return h;
  };
  hf.stamp(terrain, X0, X1, X0, Z1, 'set', MAT.ROCK, () => cur.mat);

  // ---------------- ground meshes (sampled straight from the height grid) ----------------
  const groundColor = (x, z, h) => {
    if (h === null || h === undefined) return [0, 0, 0];
    const rel = h - base(x, z);
    let c;
    if (hf.material(x, z) === MAT.DIRT) c = SAND;
    else { const t = clamp01((rel + 5) / 13); c = t < 0.5 ? mix3(LOW, MID, t * 2) : mix3(MID, TOP, t * 2 - 1); }
    const d = Math.min(x - X0, X1 - x, z - X0, Z1 - z);
    if (d < EDGE) c = mix3(c, CLIFF, clamp01((EDGE - d) / EDGE * 1.4));
    const st = 1 + 0.06 * Math.sin(h * 1.7) + 0.035 * Math.sin(h * 4.1 + x * 0.05); // bedding stripes
    return rockMul(c[0] * st, c[1] * st, c[2] * st);
  };
  const _n = new THREE.Vector3();
  const useGridNormals = m => { // same normals as the physics (no seams between tiles)
    const P = m.geometry.attributes.position, N = m.geometry.attributes.normal;
    for (let i = 0; i < P.count; i++) { hf.normal(P.getX(i), P.getZ(i), _n); N.setXYZ(i, _n.x, _n.y, _n.z); }
    N.needsUpdate = true;
    m.geometry.computeBoundingSphere();
  };
  // the bowl gets a full-resolution mesh (sharp vert lip); the big tiles leave a hole for it
  const FINE = { x0: snap(BX0 - BR - 8), x1: snap(BX1 + BR + 9.5), z0: snap(BZ - BR - 7.5), z1: snap(BZ + BR + 7.5) };
  const inFine = (x, z) => x > FINE.x0 + 0.01 && x < FINE.x1 - 0.01 && z > FINE.z0 + 0.01 && z < FINE.z1 - 0.01;
  const rockMat = mat('slickrock');
  for (let tz = X0; tz < Z1 - 1; tz += TILE) {
    for (let tx = X0; tx < X1 - 1; tx += TILE) {
      const m = gridMesh((x, z) => (inFine(x, z) ? null : hf.height(x, z)), tx, tx + TILE, tz, tz + TILE, STEP, rockMat, groundColor, 0.15);
      useGridNormals(m);
      W.add(m);
    }
  }
  {
    const m = gridMesh((x, z) => hf.height(x, z), FINE.x0, FINE.x1, FINE.z0, FINE.z1, CELL, rockMat, groundColor, 0.15);
    useGridNormals(m);
    W.add(m);
  }
  // height of the rendered ground mesh (same triangle split as gridMesh)
  const meshH = (x, z) => {
    const fx = (x - X0) / STEP, fz = (z - X0) / STEP, i = Math.floor(fx), k = Math.floor(fz), a = fx - i, b = fz - k;
    const g = (ii, kk) => hf.height(X0 + ii * STEP, X0 + kk * STEP);
    if (a + b <= 1) { const h0 = g(i, k); return h0 + (g(i + 1, k) - h0) * a + (g(i, k + 1) - h0) * b; }
    const h3 = g(i + 1, k + 1); return h3 + (g(i, k + 1) - h3) * (1 - a) + (g(i + 1, k) - h3) * (1 - b);
  };
  const visH = (x, z) => Math.max(meshH(x, z), hf.height(x, z));

  // ---------------- the white trail dashes ----------------
  {
    const list = [];
    const addDashes = (pts, every) => { let next = 1; for (const p of pts) if (p.s >= next) { list.push(p); next = p.s + every; } };
    addDashes(spurPts, 2.5); addDashes(loopPts, 2.5);
    const geo = new THREE.PlaneGeometry(0.42, 0.14).rotateX(-PI / 2);
    const dm = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x555555, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const im = new THREE.InstancedMesh(geo, dm, list.length);
    const mtx = new THREE.Matrix4(), t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3();
    list.forEach((p, i) => {
      hf.normal(p.x, p.z, n);
      t.set(p.tx, 0, p.tz).addScaledVector(n, -(p.tx * n.x + p.tz * n.z)).normalize();
      b.crossVectors(t, n);
      mtx.makeBasis(t, n, b);
      mtx.setPosition(p.x, visH(p.x, p.z) + 0.035, p.z);
      im.setMatrixAt(i, mtx);
    });
    im.receiveShadow = true;
    W.add(im);
  }

  // ---------------- arches ----------------
  // CORONA ARCH: big thin span over the flat between the kicker and the landing
  {
    const ax = CX + 60, az = CZ, as = 15;
    const cy = Math.min(hf.height(ax, az - as), hf.height(ax, az + as));
    W.add(archMesh({
      cx: ax, cy, cz: az, rot: PI / 2, as, hc: 19, seed: 1.7,
      thick: [[0, 6.5], [0.1, 3.6], [0.25, 2.8], [0.5, 2.5], [0.75, 2.8], [0.9, 3.8], [1, 7]],
      depth: [[0, 7], [0.12, 4], [0.5, 3.1], [0.88, 4.2], [1, 8]],
      palette: [[0.70, 0.31, 0.17], [0.85, 0.46, 0.26], [0.93, 0.62, 0.42]],
    }));
    W.collider(ax, az - as, 3.2, cy + 11);
    W.collider(ax, az + as, 3.4, cy + 11);
    W.jump(CX + 46.8, CZ, 0, CX + 72, CZ, 4.5);
    spots.corona = ['Corona Arch', CX + 4, CZ, 0, 3];
    W.zones.push({ name: 'Corona Arch', x: CX + 55, z: CZ, r: 60 });
  }
  // DELICATE ARCH: standing on the east rim of the bowl, legs pinched near the base, leaning a bit
  {
    const ax = BX1 + BR + 4, az = BZ, as = 6.3;
    const cy = Math.min(hf.height(ax, az - as), hf.height(ax, az + as));
    W.add(archMesh({
      cx: ax, cy, cz: az, rot: PI / 2, as, hc: 14.2, lean: 0.7, seed: 4.1,
      thick: [[0, 3.0], [0.05, 1.8], [0.12, 2.0], [0.25, 2.8], [0.4, 3.9], [0.5, 4.3], [0.62, 3.8], [0.8, 2.9], [0.92, 2.9], [1, 3.4]],
      depth: [[0, 2.8], [0.06, 2.2], [0.3, 3.0], [0.5, 3.6], [0.75, 3.0], [1, 3.2]],
      palette: [[0.72, 0.33, 0.18], [0.88, 0.50, 0.30], [0.95, 0.74, 0.56]],
    }));
    W.collider(ax, az - as, 1.6, cy + 8);
    W.collider(ax, az + as, 1.7, cy + 8);
    spots.delicate = ['Delicate Arch Bowl', MOUND[0], BZ, 0, 3];
    W.zones.push({ name: 'Delicate Arch Bowl', x: (BX0 + BX1) / 2, z: BZ, r: 62 });
  }

  // ---------------- the other built areas: jumps, rails, spots ----------------
  W.jump(SX, SZ + 6, PI / 2, SX, SZ + 20, 3.5);
  spots.slot = ['Slot Canyon Gap', SX, SZ - 28, PI / 2, 4];
  W.zones.push({ name: 'Slot Canyon Gap', x: SX, z: SZ + 8, r: 46 });

  W.jump(FX, FZ, -PI / 2, FX, FZ - 11, 3.5);
  spots.fin = ['Fin Drop', FX, FZ + 17, -PI / 2, 5];
  W.zones.push({ name: 'Fin Drop', x: FX, z: FZ - 5, r: 42 });

  { // handrail down the slab edge (kinked to follow the rock)
    const us = [6, 14, 22, 30, 38], rv = 4.3;
    const pts = us.map(u => V(HX + u, Href + slabP(u) + 0.7, HZ + rv));
    for (let i = 0; i < pts.length - 1; i++) rail(W, pts[i], pts[i + 1], { posts: 2, material: 'rail' });
    spots.rail = ['Handrail', HX - 1.5, HZ + rv, 0, 4.5];
    W.zones.push({ name: 'Slickrock Handrail', x: HX + 18, z: HZ, r: 22 });
  }

  { // little wooden jump park on a flat slab of rock
    const y = Jref;
    table(W, 108, 0, 0, { h: 1.4, up: 3.2, top: 3.5, down: 5, w: 4.5, assist: true, y });
    gapJump(W, 106, 16, 0, { h: 1.7, up: 4, gap: 6, landH: 1.7, deck: 1.2, down: 7, w: 4.5, y });
    kicker(W, 128, 0, 0, { h: 1.0, len: 2.4, w: 3, y });
    kicker(W, 130, 16, 0, { h: 1.2, len: 2.6, w: 3, y });
    table(W, 140, 8, PI, { h: 1.0, up: 2.5, top: 2.5, down: 3.5, w: 4, assist: true, y });
    quarter(W, 146, 8, 0, { h: 2.6, r: 3.4, w: 16, deck: 2, y, top: 'plywood' });
    spots.jump = ['Jump Park', 100, 0, 0, 6];
    W.zones.push({ name: 'Jump Park', x: JX, z: JZ, r: 32 });
  }

  spots.trail = ['Slickrock Trail', trailSpot.x, trailSpot.z, Math.atan2(trailSpot.tz, trailSpot.tx), 4];
  W.zones.push({ name: 'Slickrock Trail', x: LC[0], z: LC[1], r: 95 });
  spots.practice = ['Practice Loop', PSPOT[0], PSPOT[1], Math.atan2(150 - PSPOT[1], -138 - PSPOT[0]), 3];
  W.zones.push({ name: 'Practice Loop', x: -120, z: 158, r: 34 });
  W.zones.push({ name: 'Trailhead', x: START[0], z: START[1], r: 14 });

  // spawn first, then the rest
  W.spot('Moab Start', START[0], START[1], PI, 0);
  for (const k of ['trail', 'corona', 'delicate', 'slot', 'fin', 'rail', 'jump', 'practice']) W.spot(...spots[k]);

  // ---------------- signs ----------------
  const woodSign = (x, z, rot, lines, w = 5, h = 2.2, post = 1.4) => {
    const y = hf.height(x, z);
    const s = sign(lines, w, h, { bg: '#6b4226', fg: '#f6e7c8', border: '#f6e7c8', w: 640, h: 280, size: 76 });
    s.position.set(x, y + post + h / 2, z); s.rotation.y = rot;
    W.add(s);
    const dx = Math.cos(rot) * (w / 2 - 0.3), dz = -Math.sin(rot) * (w / 2 - 0.3);
    for (const k of [-1, 1]) {
      const px = x + dx * k, pz = z + dz * k;
      W.add(pipe(V(px, hf.height(px, pz) - 0.2, pz), V(px, y + post + h, pz), 0.09, mat(0x5a3a22), 6));
    }
  };
  banner(W, -34, 3.5, PI / 2, ['SLICKROCK', 'MOAB · UTAH BOYZ'], { w: 9, h: 2.2, y: 2.8, bg: '#b5441b', fg: '#fff' });
  woodSign(-29, -6, PI / 2, ['SLICKROCK', 'FOLLOW THE WHITE DASHES']);
  woodSign(CX + 9, CZ - 9, -PI / 2, ['CORONA ARCH', 'SEND IT THROUGH!']);
  woodSign(MOUND[0] - 6, BZ - 9, -PI / 2, ['DELICATE ARCH', 'BOWL']);
  woodSign(SX + 7, SZ - 30, PI, ['SLOT CANYON', 'GAP']);
  woodSign(FX + 8, FZ + 22, 0, ['FIN DROP', 'BIG DROP AHEAD']);

  // ---------------- junipers, sagebrush, boulders ----------------
  const forest = new Forest(W);
  const boulders = [];
  const nrm = new THREE.Vector3();
  const spotList = W.spots;
  const nearSpot = (x, z, d) => spotList.some(s => Math.hypot(s.x - x, s.z - z) < d);
  const okFor = (x, z, trailGap, flat) => {
    if (Math.abs(x) > 186 || Math.abs(z) > 186) return false;
    hf.normal(x, z, nrm);
    if (nrm.y < flat) return false;
    if (nearSpot(x, z, 12)) return false;
    if (trailGap > 0 && nearTrail(x, z, trailGap)) return false;
    return true;
  };
  for (let i = 0, n = 0; i < 900 && n < 150; i++) {
    const x = -186 + rand() * 372, z = -186 + rand() * 372;
    if (busy(x, z, 2) || !okFor(x, z, 5, 0.93)) continue;
    forest.juniper(x, z, 0.7 + rand() * 0.8); n++;
  }
  // a few junipers framing the built areas (off the riding lines)
  for (const [x, z] of [[CX + 2, CZ + 24], [CX + 20, CZ - 25], [BX0 - 30, BZ + 26], [BX1 + 30, BZ - 28], [FX - 26, FZ + 30], [FX + 24, FZ - 40], [SX - 46, SZ + 10], [SX + 45, SZ + 30], [JX + 10, JZ + 38]]) {
    if (okFor(x, z, 0, 0.9)) forest.juniper(x, z, 1 + rand() * 0.5);
  }
  for (let i = 0, n = 0; i < 1600 && n < 380; i++) {
    const x = -186 + rand() * 372, z = -186 + rand() * 372;
    if (busy(x, z, 0)) continue;
    if (!okFor(x, z, 1.5, 0.9)) continue;
    const sandyHere = hf.material(x, z) === MAT.DIRT;
    if (!sandyHere && rand() < 0.35) continue;
    forest.bush(x, z, 0.8 + rand() * 1.1); n++;
  }
  forest.flush();
  for (let i = 0, n = 0; i < 600 && n < 45; i++) {
    const x = -186 + rand() * 372, z = -186 + rand() * 372;
    if (busy(x, z, 4) || !okFor(x, z, 6, 0.9)) continue;
    const s = 0.6 + rand() * 1.4;
    boulders.push([x, hf.height(x, z), z, s]);
    W.collider(x, z, s * 0.85, hf.height(x, z) + s * 1.1);
    n++;
  }
  {
    const g = new THREE.IcosahedronGeometry(1, 0);
    const im = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0xb8653c, flatShading: true }), boulders.length);
    const o = new THREE.Object3D();
    boulders.forEach(([x, y, z, s], i) => {
      o.position.set(x, y + s * 0.35, z); o.scale.set(s * 1.2, s * 0.8, s); o.rotation.set(rand(), rand() * 6, rand());
      o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    });
    im.castShadow = true;
    W.add(im);
  }

  // ---------------- beyond the cliffs: desert plain, mesas, towers, Balanced Rock ----------------
  {
    const s = new THREE.Shape([new THREE.Vector2(-1700, -1700), new THREE.Vector2(1700, -1700), new THREE.Vector2(1700, 1700), new THREE.Vector2(-1700, 1700)]);
    const e = 209.6;
    s.holes.push(new THREE.Path([new THREE.Vector2(-e, -e), new THREE.Vector2(-e, e), new THREE.Vector2(e, e), new THREE.Vector2(e, -e)]));
    const g = new THREE.ShapeGeometry(s).rotateX(-PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xc27a4c }));
    m.position.y = PLAIN_Y; m.receiveShadow = false;
    W.add(m);
  }
  const pile = new RockPile();
  const outside = (x, z, r) => Math.abs(x) - r > 214 || Math.abs(z) - r > 214;
  const MESA_COLS = [0xb4552f, 0xa94b2a, 0xc2643a, 0x9e4428, 0xb85e36];
  for (let i = 0, n = 0; i < 80 && n < 18; i++) {
    const a = rand() * PI * 2, d = 255 + rand() * 120;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const butte = rand() < 0.35;
    const r = butte ? 12 + rand() * 10 : 26 + rand() * 30, h = butte ? 50 + rand() * 45 : 32 + rand() * 50;
    if (!outside(x, z, r * 1.6)) continue;
    if (x > 230 && z < -150 && z > -320) continue; // keep the Fisher Towers clear
    const c = MESA_COLS[(rand() * MESA_COLS.length) | 0];
    pile.add(new THREE.CylinderGeometry(r * (butte ? 0.78 : 0.9), r, h, butte ? 8 : 11, 3), x, PLAIN_Y - 2 + h / 2, z, c, { wob: 0.18 });
    pile.add(new THREE.CylinderGeometry(r * 1.02, r * 1.6, h * 0.28, butte ? 8 : 11, 1), x, PLAIN_Y - 2 + h * 0.14, z, 0xc98058, { wob: 0.12 });
    n++;
  }
  // Fisher Towers: a cluster of tall, knobbly dark-red spires (north-east)
  for (let i = 0; i < 8; i++) {
    const x = 265 + rand() * 70, z = -250 + rand() * 80, h = 55 + rand() * 60, r = 4 + rand() * 5;
    pile.add(new THREE.CylinderGeometry(r * 0.35, r, h, 7, 6), x, PLAIN_Y - 2 + h / 2, z, 0x7a3523, { wob: 0.3, band: 0.15 });
  }
  pile.add(new THREE.CylinderGeometry(30, 46, 30, 10, 2), 300, PLAIN_Y + 13, -205, 0x8e3f27, { wob: 0.2 }); // their fin
  // Balanced Rock (east of the Delicate bowl, beyond the cliffs)
  pile.add(new THREE.CylinderGeometry(4.5, 7.5, 30, 9, 3), 238, PLAIN_Y - 2 + 15, -96, 0xa84a2a, { wob: 0.12 });
  pile.add(new THREE.CylinderGeometry(9, 14, 8, 10, 1), 238, PLAIN_Y + 2, -96, 0xc98058, { wob: 0.1 });
  pile.add(new THREE.IcosahedronGeometry(1, 1), 238, PLAIN_Y - 2 + 30 + 7, -96, 0xb85e36, { wob: 0.08, sx: 11, sy: 8, sz: 9 });
  W.add(pile.mesh(true));

  // La Sal Mountains: big, snowy, hazy-blue peaks to the east / south-east (no fog so they read)
  {
    const sal = new RockPile();
    const peaks = [[470, 70, 165, 290], [520, -40, 140, 240], [445, 205, 150, 255], [560, 165, 125, 215], [400, 330, 125, 175], [600, 300, 140, 200]];
    for (const [x, z, r, h] of peaks) {
      const g = new THREE.ConeGeometry(r, h, 14, 6);
      const p = g.attributes.position, sd = rand() * 10;
      for (let i = 0; i < p.count; i++) { // craggy, using angle-based noise so seams stay closed
        const px = p.getX(i), py = p.getY(i), pz = p.getZ(i), a = Math.atan2(pz, px);
        const k = 1 + 0.16 * Math.sin(4 * a + sd + py * 0.02) + 0.08 * Math.sin(9 * a + 2 * sd);
        p.setXYZ(i, px * k, py + (py < h / 2 - 1 && py > -h / 2 + 1 ? Math.sin(5 * a + sd) * h * 0.04 : 0), pz * k);
      }
      const ng = g.toNonIndexed(), q = ng.attributes.position;
      const rock = new THREE.Color(0x7d8aa6), haze = new THREE.Color(0xa7b3c4), snow = new THREE.Color(0xf3f7fc);
      for (let i = 0; i < q.count; i += 3) { // colour per face: snow above a wavy snowline
        const fy = (q.getY(i) + q.getY(i + 1) + q.getY(i + 2)) / 3 + h / 2;
        const fa = Math.atan2(q.getZ(i) + q.getZ(i + 1) + q.getZ(i + 2), q.getX(i) + q.getX(i + 1) + q.getX(i + 2));
        const snowLine = h * (0.5 + 0.08 * Math.sin(5 * fa + sd));
        const c = fy > snowLine ? snow : fy < h * 0.25 ? haze : rock;
        for (let k = 0; k < 3; k++) {
          sal.pos.push(x + q.getX(i + k), q.getY(i + k) + h / 2 + 5, z + q.getZ(i + k));
          sal.col.push(c.r, c.g, c.b);
        }
      }
    }
    W.add(sal.mesh(false));
  }
  clouds(W, 7, 900, 150);
  return W;
}
