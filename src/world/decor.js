// Scenery: trees, mountains, lights, banners. Cheap shared geometries so the iPad stays smooth.
import * as THREE from 'three';
import { mat, rand, sign, box, pipe } from './builder.js';

const geo = {
  trunk: new THREE.CylinderGeometry(0.15, 0.22, 1, 6),
  cone: new THREE.ConeGeometry(1, 1, 8),
  ball: new THREE.IcosahedronGeometry(1, 1),
};
const toonish = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const M = {
  trunk: toonish(0x6b4a2f), pine: toonish(0x2f6b3a), pine2: toonish(0x3d7f45), leaf: toonish(0x6aa84f),
  juniper: toonish(0x5f7f4a), sage: toonish(0x9aae8a), snow: toonish(0xffffff),
};

// Instanced forests: collect positions, then flush once.
export class Forest {
  constructor(world) { this.world = world; this.pines = []; this.junipers = []; this.sage = []; }
  pine(x, z, s = 1, collide = true) {
    this.pines.push([x, this.world.hf.height(x, z), z, s]);
    if (collide) this.world.collider(x, z, 0.35 * s, this.world.hf.height(x, z) + 6 * s);
  }
  juniper(x, z, s = 1, collide = true) {
    this.junipers.push([x, this.world.hf.height(x, z), z, s]);
    if (collide) this.world.collider(x, z, 0.5 * s, this.world.hf.height(x, z) + 2 * s);
  }
  bush(x, z, s = 1) { this.sage.push([x, this.world.hf.height(x, z), z, s]); }
  flush() {
    const d = new THREE.Object3D();
    const inst = (g, m, list, fn) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(g, m, list.length);
      list.forEach((p, i) => { fn(d, p); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
      im.castShadow = true; im.receiveShadow = false;
      this.world.add(im);
    };
    inst(geo.trunk, M.trunk, this.pines, (o, [x, y, z, s]) => { o.position.set(x, y + 0.6 * s, z); o.scale.set(s, 1.2 * s, s); o.rotation.set(0, 0, 0); });
    inst(geo.cone, M.pine, this.pines, (o, [x, y, z, s]) => { o.position.set(x, y + 2.4 * s, z); o.scale.set(1.5 * s, 3.2 * s, 1.5 * s); });
    inst(geo.cone, M.pine2, this.pines, (o, [x, y, z, s]) => { o.position.set(x, y + 4.0 * s, z); o.scale.set(1.05 * s, 2.4 * s, 1.05 * s); });
    inst(geo.trunk, M.trunk, this.junipers, (o, [x, y, z, s]) => { o.position.set(x, y + 0.4 * s, z); o.scale.set(s, 0.8 * s, s); });
    inst(geo.ball, M.juniper, this.junipers, (o, [x, y, z, s]) => { o.position.set(x, y + 1.3 * s, z); o.scale.set(1.2 * s, 1 * s, 1.1 * s); o.rotation.set(0, x, 0); });
    inst(geo.ball, M.sage, this.sage, (o, [x, y, z, s]) => { o.position.set(x, y + 0.25 * s, z); o.scale.set(0.6 * s, 0.4 * s, 0.6 * s); });
  }
}

// Backdrop mountain (not ride-able). Optional snow cap and ski runs.
export function mountain(world, x, z, r, h, color = 0x5d7a5a, { snow = 0, runs = 0, rough = 0.25, seg = 9 } = {}) {
  const g = new THREE.ConeGeometry(r, h, seg, 4);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < h / 2 - 0.01 && y > -h / 2 + 0.01) {
      const k = 1 + (rand() - 0.5) * rough;
      pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); pos.setY(i, y + (rand() - 0.5) * h * 0.06);
    }
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, toonish(color));
  m.position.set(x, h / 2 - 1, z);
  world.add(m);
  if (snow) {
    const sg = new THREE.ConeGeometry(r * snow, h * snow, seg, 1);
    const s = new THREE.Mesh(sg, M.snow);
    s.position.set(x, h - 1 - (h * snow) / 2 + 0.3, z);
    s.scale.set(1.04, 1, 1.04);
    world.add(s);
  }
  return m;
}

export function lightPole(world, x, z, h = 9) {
  const y = world.hf.height(x, z);
  world.add(pipe(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + h, z), 0.12, mat('darkmetal'), 6));
  world.add(box(1.4, 0.3, 0.6, mat(0xfff6c8), x, y + h, z));
  world.collider(x, z, 0.2, y + h);
}

export function banner(world, x, z, rot, lines, { w = 8, h = 2, bg = '#ff8000', fg = '#111', y = 1.2, poles = true } = {}) {
  const gy = world.hf.height(x, z);
  const s = sign(lines, w, h, { bg, fg, w: 1024, h: 256, size: 150 });
  s.position.set(x, gy + y + h / 2, z); s.rotation.y = rot;
  world.add(s);
  if (poles) {
    const dx = Math.cos(rot) * w / 2, dz = -Math.sin(rot) * w / 2;
    for (const k of [-1, 1]) {
      world.add(pipe(new THREE.Vector3(x + dx * k, gy, z + dz * k), new THREE.Vector3(x + dx * k, gy + y + h, z + dz * k), 0.06, mat('darkmetal'), 6));
    }
  }
  return s;
}

export function clouds(world, n, spread, y0) {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const g = geo.ball;
  for (let i = 0; i < n; i++) {
    const c = new THREE.Group();
    const cx = (rand() - 0.5) * spread, cz = (rand() - 0.5) * spread;
    for (let k = 0; k < 5; k++) {
      const b = new THREE.Mesh(g, m);
      b.position.set((k - 2) * 6 + rand() * 3, rand() * 3, rand() * 5);
      b.scale.setScalar(5 + rand() * 4);
      c.add(b);
    }
    c.position.set(cx, y0 + rand() * 20, cz);
    world.add(c);
  }
}
