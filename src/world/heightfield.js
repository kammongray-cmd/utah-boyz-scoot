// Ride-able ground for one world: a height grid (metres) plus a surface-material grid.
// Every ramp, bowl and rock is "stamped" into it; the scooter physics only ever reads this.

export const MAT = { CONCRETE: 0, WOOD: 1, DIRT: 2, FOAM: 3, ROCK: 4, BAG: 5, GRASS: 6, STEEL: 7 };

export class Heightfield {
  constructor(x0, z0, width, depth, cell, base = 0, baseMat = MAT.CONCRETE) {
    this.x0 = x0; this.z0 = z0; this.cell = cell;
    this.nx = Math.ceil(width / cell) + 1;
    this.nz = Math.ceil(depth / cell) + 1;
    this.x1 = x0 + (this.nx - 1) * cell;
    this.z1 = z0 + (this.nz - 1) * cell;
    this.h = new Float32Array(this.nx * this.nz).fill(base);
    this.mat = new Uint8Array(this.nx * this.nz).fill(baseMat);
    this.outside = -50; // height off the edge of the map
  }

  // fn(x, z) -> height or null (not covered). mode 'max' raises, 'set' overwrites (bowls, pits).
  stamp(fn, minX, maxX, minZ, maxZ, mode = 'max', mat = MAT.CONCRETE, matFn = null) {
    const c = this.cell;
    const i0 = Math.max(0, Math.floor((minX - this.x0) / c));
    const i1 = Math.min(this.nx - 1, Math.ceil((maxX - this.x0) / c));
    const k0 = Math.max(0, Math.floor((minZ - this.z0) / c));
    const k1 = Math.min(this.nz - 1, Math.ceil((maxZ - this.z0) / c));
    for (let k = k0; k <= k1; k++) {
      const z = this.z0 + k * c;
      for (let i = i0; i <= i1; i++) {
        const x = this.x0 + i * c;
        const v = fn(x, z);
        if (v === null || v === undefined || Number.isNaN(v)) continue;
        const idx = k * this.nx + i;
        if (mode === 'set' || v > this.h[idx]) {
          this.h[idx] = v;
          this.mat[idx] = matFn ? matFn(x, z, v) : mat;
        }
      }
    }
  }

  // Bilinear height.
  height(x, z) {
    const fx = (x - this.x0) / this.cell, fz = (z - this.z0) / this.cell;
    if (fx < 0 || fz < 0 || fx >= this.nx - 1 || fz >= this.nz - 1) return this.outside;
    const i = fx | 0, k = fz | 0, tx = fx - i, tz = fz - k;
    const n = this.nx, a = k * n + i, H = this.h;
    const h0 = H[a] + (H[a + 1] - H[a]) * tx;
    const h1 = H[a + n] + (H[a + n + 1] - H[a + n]) * tx;
    return h0 + (h1 - h0) * tz;
  }

  normal(x, z, out) {
    const e = this.cell;
    const dx = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    const dz = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    const l = Math.hypot(dx, 1, dz);
    out.x = -dx / l; out.y = 1 / l; out.z = -dz / l;
    return out;
  }

  material(x, z) {
    const i = Math.round((x - this.x0) / this.cell), k = Math.round((z - this.z0) / this.cell);
    if (i < 0 || k < 0 || i >= this.nx || k >= this.nz) return MAT.CONCRETE;
    return this.mat[k * this.nx + i];
  }

  inside(x, z, margin = 0) {
    return x > this.x0 + margin && x < this.x1 - margin && z > this.z0 + margin && z < this.z1 - margin;
  }
}

// Local frame of a placed feature. +u = forward (world dir (cos r, sin r)), +v = sideways.
export class Frame {
  constructor(x, z, rot = 0) { this.x = x; this.z = z; this.r = rot; this.c = Math.cos(rot); this.s = Math.sin(rot); }
  toLocal(x, z) { const dx = x - this.x, dz = z - this.z; return [dx * this.c + dz * this.s, -dx * this.s + dz * this.c]; }
  toWorld(u, v) { return [this.x + u * this.c - v * this.s, this.z + u * this.s + v * this.c]; }
  // world-space bounding box of a local rect
  bounds(u0, u1, v0, v1) {
    const pts = [this.toWorld(u0, v0), this.toWorld(u1, v0), this.toWorld(u0, v1), this.toWorld(u1, v1)];
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    return [Math.min(...xs) - 0.5, Math.max(...xs) + 0.5, Math.min(...zs) - 0.5, Math.max(...zs) + 0.5];
  }
}
