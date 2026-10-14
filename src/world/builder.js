// Mesh + material helpers shared by every world. Everything is procedural (no model files),
// so the whole game stays small enough to live offline on the iPad.
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';

// ---------- procedural textures ----------
const texCache = {};
function canvasTex(key, size, draw, repeat = 1) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.repeat.set(repeat, repeat);
  texCache[key] = t;
  return t;
}

let seed = 1;
export function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
export function setSeed(s) { seed = s; }

function speckle(g, s, base, spread, n, alpha = 0.25, rmax = 2) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    const l = Math.floor(spread * (rand() - 0.5));
    g.fillStyle = `rgba(${l > 0 ? 255 : 0},${l > 0 ? 255 : 0},${l > 0 ? 255 : 0},${Math.abs(l) / 255 * alpha * 4})`;
    g.fillRect(rand() * s, rand() * s, 1 + rand() * rmax, 1 + rand() * rmax);
  }
}

export const TEX = {
  concrete: () => canvasTex('concrete', 256, (g, s) => {
    speckle(g, s, '#c9c6bf', 60, 9000, 0.18);
    g.strokeStyle = 'rgba(0,0,0,0.10)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 1); g.lineTo(s, 1); g.moveTo(1, 0); g.lineTo(1, s); g.stroke(); // expansion joints
  }),
  park: () => canvasTex('park', 256, (g, s) => { // smooth painted park concrete
    speckle(g, s, '#b9bcc2', 40, 6000, 0.14);
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 1); g.lineTo(s, 1); g.moveTo(1, 0); g.lineTo(1, s); g.stroke();
  }),
  skatelite: () => canvasTex('skatelite', 256, (g, s) => {
    speckle(g, s, '#6a5a4e', 40, 5000, 0.22);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
    for (let y = 0; y < s; y += s / 2) { g.beginPath(); g.moveTo(0, y + 1); g.lineTo(s, y + 1); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let x = 16; x < s; x += 64) for (let y = 16; y < s; y += 64) g.fillRect(x, y, 3, 3); // screws
  }),
  plywood: () => canvasTex('plywood', 256, (g, s) => {
    g.fillStyle = '#d8b07a'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(120,70,20,${0.08 + rand() * 0.12})`; g.lineWidth = 1 + rand() * 2;
      const y = rand() * s; g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= s; x += 32) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 4);
      g.stroke();
    }
    g.strokeStyle = 'rgba(80,40,10,0.35)'; g.lineWidth = 3; g.strokeRect(0, 0, s, s);
  }),
  grass: () => canvasTex('grass', 256, (g, s) => {
    speckle(g, s, '#6aa548', 90, 12000, 0.25, 3);
  }),
  dirt: () => canvasTex('dirt', 256, (g, s) => {
    speckle(g, s, '#a8764a', 90, 12000, 0.3, 3);
  }),
  foam: () => canvasTex('foam', 128, (g, s) => {
    const cols = ['#ff4d6d', '#ffd23f', '#3ec1d3', '#7bd389', '#ff9f1c', '#9b5de5'];
    g.fillStyle = '#ffd23f'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 220; i++) {
      g.fillStyle = cols[(rand() * cols.length) | 0];
      g.save(); g.translate(rand() * s, rand() * s); g.rotate(rand() * 3);
      g.fillRect(-7, -7, 14, 14); g.restore();
    }
  }),
  slickrock: () => canvasTex('slickrock', 512, (g, s) => {
    g.fillStyle = '#d7884f'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) { // cross-bedding stripes
      g.strokeStyle = `rgba(${rand() > 0.5 ? '255,220,180' : '140,60,30'},${0.06 + rand() * 0.1})`;
      g.lineWidth = 2 + rand() * 8;
      const y = rand() * s; g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x * 0.012 + i) * 18);
      g.stroke();
    }
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '60,20,0'},0.06)`;
      g.fillRect(rand() * s, rand() * s, 2, 2);
    }
    for (let i = 0; i < 40; i++) { // dark varnish pits
      g.fillStyle = 'rgba(90,40,20,0.18)';
      g.beginPath(); g.arc(rand() * s, rand() * s, 2 + rand() * 6, 0, 7); g.fill();
    }
  }),
  sand: () => canvasTex('sand', 256, (g, s) => { speckle(g, s, '#e2a66e', 70, 9000, 0.22); }),
  stripes: (key, a, b, n = 8) => canvasTex('stripes' + key, 128, (g, s) => {
    for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * s / n, 0, s / n, s); }
  }),
};

// ---------- materials ----------
const matCache = {};
export function mat(name) {
  if (matCache[name]) return matCache[name];
  let m;
  switch (name) {
    case 'concrete': m = new THREE.MeshLambertMaterial({ map: TEX.concrete() }); break;
    case 'park': m = new THREE.MeshLambertMaterial({ map: TEX.park() }); break;
    case 'skatelite': m = new THREE.MeshLambertMaterial({ map: TEX.skatelite() }); break;
    case 'plywood': m = new THREE.MeshLambertMaterial({ map: TEX.plywood() }); break;
    case 'grass': m = new THREE.MeshLambertMaterial({ map: TEX.grass() }); break;
    case 'dirt': m = new THREE.MeshLambertMaterial({ map: TEX.dirt() }); break;
    case 'foam': m = new THREE.MeshLambertMaterial({ map: TEX.foam() }); break;
    case 'slickrock': m = new THREE.MeshLambertMaterial({ map: TEX.slickrock(), vertexColors: true }); break;
    case 'sand': m = new THREE.MeshLambertMaterial({ map: TEX.sand() }); break;
    case 'steel': m = new THREE.MeshStandardMaterial({ color: 0xd9dde3, metalness: 0.8, roughness: 0.3 }); break;
    case 'rail': m = new THREE.MeshStandardMaterial({ color: 0xffc23d, metalness: 0.5, roughness: 0.35 }); break;
    case 'redrail': m = new THREE.MeshStandardMaterial({ color: 0xe63946, metalness: 0.4, roughness: 0.4 }); break;
    case 'darkmetal': m = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.6, roughness: 0.5 }); break;
    case 'bag': m = new THREE.MeshLambertMaterial({ color: 0x1e88e5 }); break;
    case 'white': m = new THREE.MeshLambertMaterial({ color: 0xffffff }); break;
    default: m = new THREE.MeshLambertMaterial({ color: name });
  }
  matCache[name] = m;
  return m;
}

// ---------- geometry ----------
// Profile = [[u, h], ...] increasing u (equal u = vertical wall). Returns height at u (or null).
export function profileAt(p, u) {
  if (u < p[0][0] || u > p[p.length - 1][0]) return null;
  let lo = 0, hi = p.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m][0] <= u) lo = m; else hi = m; }
  const a = p[lo], b = p[hi];
  if (b[0] === a[0]) return Math.max(a[1], b[1]);
  return a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]);
}

// Extrude a profile across width w (v from -w/2..w/2) → mesh in the local frame
// (local u → x, v → z, height → y). groups: 0 = riding surface, 1 = side walls.
export function extrudeProfile(p, w, topMat, sideMat, opts = {}) {
  const pos = [], nor = [], uv = [], groupTop = [], groupSide = [];
  const hw = w / 2;
  const base = opts.base ?? 0;
  // segment normals in the (u,h) plane
  const segN = [];
  for (let i = 0; i < p.length - 1; i++) {
    const du = p[i + 1][0] - p[i][0], dh = p[i + 1][1] - p[i][1];
    const l = Math.hypot(du, dh) || 1;
    segN.push([-dh / l, du / l]);
  }
  const ptN = (i, seg) => { // smooth normal at point i if the neighbouring segment bends gently
    const other = seg === i ? i - 1 : i;
    const a = segN[seg], b = segN[other];
    if (!b || a[0] * b[0] + a[1] * b[1] < 0.82) return a;
    const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y);
    return [x / l, y / l];
  };
  let arc = 0;
  const tile = opts.tile ?? 2;
  for (let i = 0; i < p.length - 1; i++) {
    const [u0, h0] = p[i], [u1, h1] = p[i + 1];
    const segLen = Math.hypot(u1 - u0, h1 - h0);
    if (segLen < 1e-6) continue;
    if (h0 <= base + 0.002 && h1 <= base + 0.002) { arc += segLen; continue; } // flat on the ground: the ground mesh already draws it
    const n0 = ptN(i, i), n1 = ptN(i + 1, i);
    const a0 = arc / tile, a1 = (arc + segLen) / tile;
    arc += segLen;
    const quad = [
      [u0, h0, -hw, n0, a0, 0], [u0, h0, hw, n0, a0, w / tile], [u1, h1, hw, n1, a1, w / tile],
      [u0, h0, -hw, n0, a0, 0], [u1, h1, hw, n1, a1, w / tile], [u1, h1, -hw, n1, a1, 0],
    ];
    for (const [x, y, z, n, s, t] of quad) { pos.push(x, y, z); nor.push(n[0], n[1], 0); uv.push(s, t); }
  }
  const topCount = pos.length / 3;
  // side walls
  for (const side of [-1, 1]) {
    for (let i = 0; i < p.length - 1; i++) {
      const [u0, h0] = p[i], [u1, h1] = p[i + 1];
      if (h0 <= base + 1e-4 && h1 <= base + 1e-4) continue;
      if (u1 === u0) continue;
      const z = side * hw;
      const tri = side > 0
        ? [[u0, base], [u1, base], [u1, h1], [u0, base], [u1, h1], [u0, h0]]
        : [[u0, base], [u1, h1], [u1, base], [u0, base], [u0, h0], [u1, h1]];
      for (const [x, y] of tri) { pos.push(x, y, z); nor.push(0, 0, side); uv.push(x / tile, y / tile); }
    }
  }
  // end walls (front at first point, back at last point) when they stand up
  const ends = [[p[0], -1], [p[p.length - 1], 1]];
  for (const [[u, h], dir] of ends) {
    if (h <= base + 1e-3) continue;
    const tri = dir < 0
      ? [[-hw, base], [hw, base], [hw, h], [-hw, base], [hw, h], [-hw, h]]
      : [[-hw, base], [hw, h], [hw, base], [-hw, base], [-hw, h], [hw, h]];
    for (const [z, y] of tri) { pos.push(u, y, z); nor.push(dir, 0, 0); uv.push(z / tile, y / tile); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.addGroup(0, topCount, 0);
  g.addGroup(topCount, pos.length / 3 - topCount, 1);
  const m = new THREE.Mesh(g, [topMat, sideMat]);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Height-function grid mesh (bowls, terrain). fn(x,z) -> h or null. World coordinates.
export function gridMesh(fn, x0, x1, z0, z1, step, material, colorFn = null, uvScale = 0.25) {
  const nx = Math.max(2, Math.round((x1 - x0) / step) + 1), nz = Math.max(2, Math.round((z1 - z0) / step) + 1);
  const sx = (x1 - x0) / (nx - 1), sz = (z1 - z0) / (nz - 1);
  const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
  const col = colorFn ? new Float32Array(nx * nz * 3) : null;
  const valid = new Uint8Array(nx * nz);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * sx, z = z0 + k * sz, idx = k * nx + i;
    const h = fn(x, z);
    valid[idx] = h === null || h === undefined || Number.isNaN(h) ? 0 : 1;
    pos[idx * 3] = x; pos[idx * 3 + 1] = valid[idx] ? h : 0; pos[idx * 3 + 2] = z;
    uv[idx * 2] = x * uvScale; uv[idx * 2 + 1] = z * uvScale;
    if (col) { const c = colorFn(x, z, h); col[idx * 3] = c[0]; col[idx * 3 + 1] = c[1]; col[idx * 3 + 2] = c[2]; }
  }
  const index = [];
  for (let k = 0; k < nz - 1; k++) for (let i = 0; i < nx - 1; i++) {
    const a = k * nx + i, b = a + 1, c = a + nx, d = c + 1;
    if (valid[a] && valid[c] && valid[b]) index.push(a, c, b);
    if (valid[b] && valid[c] && valid[d]) index.push(b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true; m.castShadow = true;
  return m;
}

const _up = new THREE.Vector3(0, 1, 0);
// Straight round bar between two world points.
export function pipe(a, b, r, material, radial = 10) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, radial, 1);
  const m = new THREE.Mesh(g, material);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(_up, d.normalize());
  m.castShadow = true;
  return m;
}

// Smooth tube through many world points (coping on bowls).
export function tubeAlong(points, r, material, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.1);
  const g = new THREE.TubeGeometry(curve, Math.max(8, points.length * 2), r, 8, closed);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  return m;
}

export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Text sign texture.
export function textTexture(lines, opts = {}) {
  const w = opts.w ?? 512, h = opts.h ?? 256;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = opts.bg ?? '#111'; g.fillRect(0, 0, w, h);
  if (opts.border) { g.strokeStyle = opts.border; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12); }
  g.fillStyle = opts.fg ?? '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((t, i) => {
    const size = (opts.size ?? 110) * (i === 0 ? 1 : 0.55);
    g.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
    g.fillText(t, w / 2, h * (i + 0.5) / n + (n > 1 && i === 0 ? h * 0.06 : 0));
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function sign(lines, w, h, opts = {}) {
  const tex = textTexture(lines, opts);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  return m;
}

// One world: ride-able ground, meshes, grind rails, jump assists, colliders, teleport spots.
export class World {
  constructor(id, title, hf) {
    this.id = id; this.title = title; this.hf = hf;
    this.group = new THREE.Group();
    this.rails = [];     // {a: Vector3, b: Vector3, kind}
    this.jumps = [];     // {x, z, dir:[dx,dz], tx, tz, ty, r}
    this.colliders = []; // {x, z, r, top}
    this.spots = [];     // {name, x, z, heading, speed}
    this.zones = [];     // {name, x, z, r} - for "you're at the ..." labels
    this.holes = [];     // {sdf} - recessed areas the flat ground mesh must leave open
    this.sky = 0x8ec9ff; this.fog = [0xbfe3ff, 120, 420];
  }
  add(o) { this.group.add(o); return o; }
  rail(a, b, kind = 'rail') { this.rails.push({ a, b, kind }); }
  spot(name, x, z, heading, speed = 0) { this.spots.push({ name, x, z, heading, speed }); }
  jump(x, z, dirAngle, tx, tz, r = 3) {
    this.jumps.push({ x, z, dx: Math.cos(dirAngle), dz: Math.sin(dirAngle), tx, tz, r });
  }
  collider(x, z, r, top = 99) { this.colliders.push({ x, z, r, top }); }
}

// Merge every static mesh in a world into one mesh per material (huge draw-call saving on iPad).
// Signs / textured one-offs keep their own material but still get merged per material.
export function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map(); // material -> {mat, geos[], cast}
  const keep = [];
  const add = (material, geo, cast) => {
    let b = buckets.get(material);
    if (!b) { b = { mat: material, geos: [], cast: false }; buckets.set(material, b); }
    b.geos.push(geo); b.cast = b.cast || cast;
  };
  const attrsOf = g => Object.keys(g.attributes).sort().join(',');
  group.traverse(o => {
    if (!o.isMesh) return;
    if (o.isInstancedMesh || o.userData.keep || (o.material && !Array.isArray(o.material) && o.material.transparent)) { keep.push(o); return; }
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (Array.isArray(o.material)) {
      for (const gr of g.groups) {
        const sub = new THREE.BufferGeometry();
        for (const [k, a] of Object.entries(g.attributes)) {
          sub.setAttribute(k, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
        }
        add(o.material[gr.materialIndex], sub, o.castShadow);
      }
    } else add(o.material, g, o.castShadow);
  });
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    // only merge geometries with matching attribute sets
    const sets = new Map();
    for (const g of b.geos) { const k = attrsOf(g); if (!sets.has(k)) sets.set(k, []); sets.get(k).push(g); }
    for (const list of sets.values()) {
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, b.mat);
      m.castShadow = b.cast; m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      out.add(m);
    }
  }
  for (const o of keep) { o.updateMatrixWorld(true); const mw = o.matrixWorld.clone(); o.parent.remove(o); mw.decompose(o.position, o.quaternion, o.scale); out.add(o); }
  return out;
}
