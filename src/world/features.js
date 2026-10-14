// Skatepark building blocks. Each one stamps its riding surface into the world height grid,
// adds its mesh, and registers grind edges / jump assists.
// Placement: (x, z) = the toe of the ramp (where it meets the ground), rot = direction you ride UP it
// (world dir (cos rot, sin rot)).
import * as THREE from 'three';
import { Frame, MAT } from './heightfield.js';
import { extrudeProfile, profileAt, mat, pipe, gridMesh, tubeAlong, box } from './builder.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// circular transition from flat (u=0,h=0) up to height h on radius r
export function arc(r, h, n = 18, u0 = 0, h0 = 0) {
  const amax = Math.acos(1 - Math.min(h, r * 0.985) / r);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (amax * i) / n;
    pts.push([u0 + r * Math.sin(a), h0 + r * (1 - Math.cos(a))]);
  }
  return pts;
}
// mirror a rising profile so it falls (for landings / the far side of things)
export function mirror(pts, uEnd) { return pts.map(([u, h]) => [uEnd - u, h]).reverse(); }
function shift(pts, du) { return pts.map(([u, h]) => [u + du, h]); }

export function placeProfile(world, x, z, rot, profile, width, o = {}) {
  const f = new Frame(x, z, rot);
  const u0 = profile[0][0], u1 = profile[profile.length - 1][0];
  const hw = width / 2;
  const [a, b, c, d] = f.bounds(u0, u1, -hw, hw);
  const y0 = o.y ?? 0;
  world.hf.stamp((X, Z) => {
    const [u, v] = f.toLocal(X, Z);
    if (v < -hw || v > hw) return null;
    const h = profileAt(profile, u);
    return h === null ? null : h + y0;
  }, a, b, c, d, o.mode ?? 'max', o.hmat ?? MAT.WOOD);
  if (o.mesh !== false) {
    const m = extrudeProfile(profile, width, mat(o.top ?? 'skatelite'), mat(o.side ?? 'plywood'), { base: o.base ?? 0 });
    m.position.set(x, y0, z); m.rotation.y = -rot;
    world.add(m);
  }
  return f;
}

// metal edge you can grind + its visual pipe
export function coping(world, f, u, h, w, y0 = 0, kind = 'coping', r = 0.045) {
  const [ax, az] = f.toWorld(u, -w / 2), [bx, bz] = f.toWorld(u, w / 2);
  const a = V(ax, h + y0, az), b = V(bx, h + y0, bz);
  world.add(pipe(a, b, r, mat('steel')));
  world.rail(a, b, kind);
}

export function quarter(world, x, z, rot, { h = 2, r = 2.6, w = 6, deck = 2, top = 'skatelite', y = 0, cope = true } = {}) {
  const p = arc(r, h);
  const uL = p[p.length - 1][0];
  p.push([uL + deck, p[p.length - 1][1]]);
  const f = placeProfile(world, x, z, rot, p, w, { top, y });
  if (cope) coping(world, f, uL, p[p.length - 1][1], w, y);
  return { f, uLip: uL, len: uL + deck };
}

export function bank(world, x, z, rot, { h = 1.2, len = 3, w = 6, deck = 1.5, top = 'park', hmat = MAT.CONCRETE, y = 0 } = {}) {
  const p = [[0, 0], [len, h], [len + deck, h]];
  return placeProfile(world, x, z, rot, p, w, { top, side: top === 'park' ? 'concrete' : 'plywood', hmat, y });
}

export function kicker(world, x, z, rot, { h = 1, len = 2.2, w = 2.5, top = 'skatelite', y = 0 } = {}) {
  const r = (len * len + h * h) / (2 * h);
  const p = arc(r, h, 14);
  return placeProfile(world, x, z, rot, p, w, { top, y });
}

// up-ramp, flat table, landing. returns lip + sweet spot for a jump assist
export function table(world, x, z, rot, { h = 1.2, up = 3, top = 3, down = 4.5, w = 4, surf = 'skatelite', side = 'plywood', hmat = MAT.WOOD, assist = false, y = 0 } = {}) {
  const r = (up * up + h * h) / (2 * h);
  const p = arc(r, h, 14);
  const uL = p[p.length - 1][0];
  p.push([uL + top, h]);
  // landing: straight slope easing into the ground
  const n = 10;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const s = t < 0.75 ? t / 0.75 : 1;
    const hh = h * (1 - (t < 0.75 ? t * 0.85 / 0.75 : 0.85 + 0.15 * (1 - Math.pow(1 - (t - 0.75) / 0.25, 2))));
    p.push([uL + top + down * t, Math.max(0, hh)]);
    void s;
  }
  const f = placeProfile(world, x, z, rot, p, w, { top: surf, side, hmat, y });
  if (assist) {
    const [lx, lz] = f.toWorld(uL, 0), [tx, tz] = f.toWorld(uL + top + down * 0.35, 0);
    world.jump(lx, lz, rot, tx, tz, 3);
  }
  return f;
}

// gap jump: kicker, empty gap, landing ramp (with jump assist)
export function gapJump(world, x, z, rot, { h = 1.6, up = 3.5, gap = 5, landH = 1.6, deck = 1, down = 6, w = 4, surf = 'skatelite', y = 0 } = {}) {
  const r = (up * up + h * h) / (2 * h);
  const k = arc(r, h, 14);
  const uL = k[k.length - 1][0];
  const f = placeProfile(world, x, z, rot, k, w, { top: surf, y });
  const u2 = uL + gap;
  const land = [[u2, 0], [u2, landH], [u2 + deck, landH]];
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    land.push([u2 + deck + down * t, landH * (1 - (t < 0.8 ? t * 0.9 / 0.8 : 0.9 + 0.1 * (1 - Math.pow(1 - (t - 0.8) / 0.2, 2))))]);
  }
  placeProfile(world, x, z, rot, land, w, { top: surf, y });
  const [lx, lz] = f.toWorld(uL, 0), [tx, tz] = f.toWorld(u2 + deck + down * 0.3, 0);
  world.jump(lx, lz, rot, tx, tz, 3.5);
  return f;
}

export function halfpipe(world, x, z, rot, { h = 3.4, r = 3.8, flat = 5, w = 10, deck = 2.5, top = 'skatelite', y = 0, cope = 'coping' } = {}) {
  // x,z = centre of the flat bottom. rot = across the pipe.
  const q = arc(r, h);
  const uL = q[q.length - 1][0];
  const hh = q[q.length - 1][1];
  const half = flat / 2;
  const right = shift(q, half); right.push([half + uL + deck, hh]);
  const left = mirror(shift(q, half), 0).map(([u, hv]) => [u, hv]); // mirrored around u=0
  left.unshift([-(half + uL + deck), hh]);
  const p = [...left, ...right];
  const f = placeProfile(world, x, z, rot, p, w, { top, y });
  if (cope) { coping(world, f, half + uL, hh, w, y, cope); coping(world, f, -(half + uL), hh, w, y, cope); }
  return { f, uL: half + uL, h: hh };
}

export function spine(world, x, z, rot, { h = 1.8, r = 2.4, w = 6, top = 'skatelite', y = 0 } = {}) {
  // x,z = the spine's peak line. rot = across.
  const q = arc(r, h);
  const uL = q[q.length - 1][0];
  const right = mirror(q, uL);                       // descending from peak at u=0 to toe at uL
  const left = mirror(right, 0);                     // rising from -uL to 0
  const p = [...left, ...right.slice(1)];
  const f = placeProfile(world, x, z, rot, p, w, { top, y });
  coping(world, f, 0, q[q.length - 1][1], w, y);
  return f;
}

// funbox: banks on both ends, flat top, optional rail along the top
export function funbox(world, x, z, rot, { h = 1, bankLen = 2.4, top = 4, w = 5, rail = true, y = 0, surf = 'park', hmat = MAT.CONCRETE } = {}) {
  const p = [[0, 0], [bankLen, h], [bankLen + top, h], [2 * bankLen + top, 0]];
  const f = placeProfile(world, x, z, rot, p, w, { top: surf, side: 'concrete', hmat, y });
  if (rail) {
    const L = 2 * bankLen + top;
    const [ax, az] = f.toWorld(0.4, 0), [bx, bz] = f.toWorld(L - 0.4, 0);
    // rail runs up the bank, along the top and down (kinked)
    const pts = [[0.6, 0.5], [bankLen, h + 0.5], [bankLen + top, h + 0.5], [L - 0.6, 0.5]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ux, uy] = pts[i], [vx, vy] = pts[i + 1];
      const [x1, z1] = f.toWorld(ux, 0), [x2, z2] = f.toWorld(vx, 0);
      const a = V(x1, uy + y, z1), b = V(x2, vy + y, z2);
      world.add(pipe(a, b, 0.035, mat('redrail')));
      world.rail(a, b, 'rail');
    }
    for (const [u, hy] of pts) { const [px, pz] = f.toWorld(u, 0); world.add(pipe(V(px, y + (u === 0.6 || u === L - 0.6 ? 0 : h), pz), V(px, hy + y, pz), 0.025, mat('darkmetal'))); }
    void ax; void az; void bx; void bz;
  }
  return f;
}

// grindable ledge / box (edges are grind rails)
export function ledge(world, x, z, rot, { len = 6, h = 0.45, w = 0.9, surf = 'park', side = 'concrete', y = 0, kind = 'ledge', bothEdges = true } = {}) {
  const p = [[0, h], [len, h]];
  const f = placeProfile(world, x, z, rot, p, w, { top: surf, side, hmat: MAT.CONCRETE, y });
  for (const s of bothEdges ? [-1, 1] : [1]) {
    const [ax, az] = f.toWorld(0.05, s * w / 2), [bx, bz] = f.toWorld(len - 0.05, s * w / 2);
    const a = V(ax, h + y, az), b = V(bx, h + y, bz);
    world.add(pipe(a, b, 0.025, mat('steel'), 6));
    world.rail(a, b, kind);
  }
  return f;
}

// flat or sloped rail on posts
export function rail(world, a, b, { kind = 'rail', material = 'rail', posts = 3 } = {}) {
  world.add(pipe(a, b, 0.04, mat(material)));
  world.rail(a, b, kind);
  for (let i = 0; i < posts; i++) {
    const t = posts === 1 ? 0.5 : 0.08 + (0.84 * i) / (posts - 1);
    const p = a.clone().lerp(b, t);
    const g = world.hf.height(p.x, p.z);
    world.add(pipe(V(p.x, g, p.z), p, 0.03, mat('darkmetal'), 6));
  }
}

// stair set going DOWN in +u: top deck at (x,z), steps, landing pad. Returns frame.
export function stairs(world, x, z, rot, { steps = 6, rise = 0.18, run = 0.36, w = 4, deck = 3, y = 0, handrail = true, hubba = true, bank: withBank = true } = {}) {
  const H = steps * rise;
  const p = [];
  if (withBank) p.push([-4.5, 0], [0, H]); else p.push([0, H]);
  p.push([deck, H]);
  for (let i = 0; i < steps; i++) {
    const u = deck + i * run, hh = H - (i + 1) * rise;
    p.push([u, hh + rise], [u, hh], [u + run, hh]);
  }
  const f = placeProfile(world, x, z, rot, p, w, { top: 'park', side: 'concrete', hmat: MAT.CONCRETE, y });
  const uEnd = deck + steps * run;
  if (handrail) {
    const [ax, az] = f.toWorld(deck - 0.1, w / 2 - 0.25), [bx, bz] = f.toWorld(uEnd + 0.2, w / 2 - 0.25);
    rail(world, V(ax, H + 0.85 + y, az), V(bx, 0.85 - rise * 0.5 + y + 0.0, bz), { posts: 3 });
  }
  if (hubba) { // sloped ledge beside the stairs
    const hp = [[deck - 0.6, H + 0.4], [deck, H + 0.4], [uEnd, 0.4], [uEnd + 0.5, 0.4]];
    const [hx0, hz0] = f.toWorld(0, -(w / 2 + 0.35));
    placeProfile(world, hx0, hz0, rot, hp, 0.7, { top: 'park', side: 'concrete', hmat: MAT.CONCRETE, y });
    const [ax, az] = f.toWorld(deck, -(w / 2 + 0.7)), [bx, bz] = f.toWorld(uEnd, -(w / 2 + 0.7));
    world.rail(V(ax, H + 0.4 + y, az), V(bx, 0.4 + y, bz), 'ledge');
  }
  return f;
}

// rounded-rectangle concrete bowl dug into the ground
export function bowl(world, cx, cz, { hx = 9, hz = 6, cr = 4, depth = 2.6, r = 3 } = {}) {
  const sdf = (x, z, ax = hx, az = hz, rr = cr) => {
    const qx = Math.abs(x - cx) - ax + rr, qz = Math.abs(z - cz) - az + rr;
    return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - rr;
  };
  const wall = (e, dep, rad) => { // e = distance inside the rim
    const ux = Math.sqrt(Math.max(0, rad * rad - (rad - Math.min(dep, rad * 0.985)) ** 2));
    if (e >= ux) return -dep;
    const t = ux - e;
    return -dep + rad - Math.sqrt(Math.max(0, rad * rad - t * t));
  };
  const fn = (x, z) => {
    const s = sdf(x, z);
    if (s > 0) return s < 0.3 ? 0 : null;
    return wall(-s, depth, r);
  };
  world.hf.stamp((x, z) => (sdf(x, z) > 0 ? null : fn(x, z)), cx - hx - 1, cx + hx + 1, cz - hz - 1, cz + hz + 1, 'set', MAT.CONCRETE);
  const m = gridMesh(fn, cx - hx - 2, cx + hx + 2, cz - hz - 2, cz + hz + 2, 0.25, mat('park'), null, 0.25);
  world.add(m);
  // coping around the rim (grindable, joined segments)
  const pts = [];
  const N = 96;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    // walk the rounded rect perimeter by marching a ray from the centre
    const dx = Math.cos(a), dz = Math.sin(a);
    let lo = 0, hi = Math.max(hx, hz) * 2;
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (sdf(cx + dx * mid, cz + dz * mid) < 0) lo = mid; else hi = mid; }
    pts.push(V(cx + dx * lo, 0.02, cz + dz * lo));
  }
  world.add(tubeAlong(pts, 0.05, mat('steel'), true));
  for (let i = 0; i < N; i++) world.rail(pts[i], pts[(i + 1) % N], 'coping');
  world.holes.push({ sdf: (x, z) => sdf(x, z), box: [cx - hx, cx + hx, cz - hz, cz + hz] });
  return { sdf };
}

// foam pit: a sunken pool of foam cubes, soft landing
export function foamPit(world, cx, cz, { hx = 5, hz = 4, depth = 1.0 } = {}) {
  const fn = (x, z) => (Math.abs(x - cx) <= hx && Math.abs(z - cz) <= hz ? -depth : null);
  world.hf.stamp(fn, cx - hx, cx + hx, cz - hz, cz + hz, 'set', MAT.FOAM);
  const top = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, 0.4, hz * 2), mat('foam'));
  top.position.set(cx, -depth - 0.1, cz); top.receiveShadow = true;
  world.add(top);
  // padded walls (inside the pit and a lip around it)
  const pad = mat(0x1f3c88);
  world.add(box(hx * 2, depth + 0.1, 0.12, pad, cx, -depth / 2, cz - hz + 0.06));
  world.add(box(hx * 2, depth + 0.1, 0.12, pad, cx, -depth / 2, cz + hz - 0.06));
  world.add(box(0.12, depth + 0.1, hz * 2, pad, cx - hx + 0.06, -depth / 2, cz));
  world.add(box(0.12, depth + 0.1, hz * 2, pad, cx + hx - 0.06, -depth / 2, cz));
  world.add(box(hx * 2 + 0.6, 0.25, 0.3, pad, cx, 0.12, cz - hz - 0.15));
  world.add(box(hx * 2 + 0.6, 0.25, 0.3, pad, cx, 0.12, cz + hz + 0.15));
  world.add(box(0.3, 0.25, hz * 2, pad, cx - hx - 0.15, 0.12, cz));
  world.add(box(0.3, 0.25, hz * 2, pad, cx + hx + 0.15, 0.12, cz));
  world.holes.push({ sdf: (x, z) => Math.max(Math.abs(x - cx) - hx, Math.abs(z - cz) - hz), box: [cx - hx, cx + hx, cz - hz, cz + hz] });
}

// big inflatable landing bag
export function airbag(world, x, z, rot, { len = 12, w = 9, h = 2.4 } = {}) {
  const p = [[0, 0], [0.8, h * 0.7], [2, h], [len - 1.5, h], [len, 0]];
  placeProfile(world, x, z, rot, p, w, { top: 'bag', side: 'bag', hmat: MAT.BAG });
}

export { V };

// four-sided pyramid / funbox with a flat top (x,z = centre)
export function pyramid(world, cx, cz, { top = 6, bank = 3, h = 1.2, surf = 'park' } = {}) {
  const ht = top / 2, R = ht + bank;
  const fn = (x, z) => {
    const d = Math.max(Math.abs(x - cx), Math.abs(z - cz));
    if (d > R) return null;
    if (d <= ht) return h;
    return h * (R - d) / bank;
  };
  world.hf.stamp(fn, cx - R, cx + R, cz - R, cz + R, 'max', MAT.CONCRETE);
  const m = gridMesh(fn, cx - R, cx + R, cz - R, cz + R, 0.25, mat(surf));
  world.add(m);
  // painted edges where banks meet the top
  for (const [ax, az, bx, bz] of [[-ht, -ht, ht, -ht], [ht, -ht, ht, ht], [ht, ht, -ht, ht], [-ht, ht, -ht, -ht]]) {
    world.add(pipe(V(cx + ax, h + 0.01, cz + az), V(cx + bx, h + 0.01, cz + bz), 0.035, mat('steel'), 6));
  }
}

// rail following a list of points (kinks / rainbow); segments join so grinds carry through
export function polyRail(world, pts, { material = 'rail', posts = true } = {}) {
  for (let i = 0; i < pts.length - 1; i++) {
    world.add(pipe(pts[i], pts[i + 1], 0.04, mat(material)));
    world.rail(pts[i], pts[i + 1], 'rail');
  }
  if (posts) for (const p of [pts[0], pts[pts.length - 1], pts[(pts.length / 2) | 0]]) {
    const g = world.hf.height(p.x, p.z);
    world.add(pipe(V(p.x, g, p.z), p, 0.03, mat('darkmetal'), 6));
  }
}

// painted floor area (pure decoration)
export function paint(world, x0, z0, x1, z1, color, y = 0.01) {
  const pm = new THREE.MeshLambertMaterial({ color, map: mat('park').map, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), pm);
  m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true;
  world.add(m);
}
