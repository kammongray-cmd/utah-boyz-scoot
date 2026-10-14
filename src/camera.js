// Drone-style chase camera: high and behind, turns with you on flat ground, holds still on
// ramps and in the air (so halfpipes and spins don't whip the view around).
import * as THREE from 'three';

export const CAM_MODES = [
  { name: 'Drone', d: 8, h: 6.5, fov: 55 },
  { name: 'High Drone', d: 12, h: 13, fov: 55 },
  { name: 'Low Chase', d: 6.2, h: 3.4, fov: 62 },
];

const _d = new THREE.Vector3(), _l = new THREE.Vector3();

export class DroneCam {
  constructor(camera) {
    this.c = camera; this.yaw = 0; this.mode = 0;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.lift = 0;
  }
  setMode(m) { this.mode = m % CAM_MODES.length; this.c.fov = CAM_MODES[this.mode].fov; this.c.updateProjectionMatrix(); }

  desired(p, hf, out) {
    const M = CAM_MODES[this.mode];
    const a = this.yaw - 0.32; // a little off to one side: a 3/4 drone shot shows tricks better
    const dx = Math.cos(a), dz = Math.sin(a);
    out.set(p.pos.x - dx * (M.d + this.lift * 0.6), p.pos.y + M.h + this.lift, p.pos.z - dz * (M.d + this.lift * 0.6));
    const g = hf.height(out.x, out.z);
    if (out.y < g + 2) out.y = g + 2;
    return out;
  }

  snap(p, hf) {
    this.yaw = p.travelHeading(); this.lift = 0;
    this.desired(p, hf, this.pos);
    this.look.copy(p.pos); this.look.x += Math.cos(this.yaw) * 3; this.look.z += Math.sin(this.yaw) * 3;
    this.c.position.copy(this.pos); this.c.lookAt(this.look);
  }

  update(dt, p, hf) {
    // which way should the drone face?
    const flat = p.n.y > 0.965;
    let follow = 0;
    if ((p.mode === 'ground' && flat) || p.mode === 'grind') follow = p.speed > 1.2 ? 2.4 : 0.8;
    if (follow) {
      const target = p.speed > 1.2 ? p.travelHeading() : p.heading;
      const diff = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
      this.yaw += THREE.MathUtils.clamp(diff * Math.min(1, dt * 2.2), -follow * dt, follow * dt);
    }
    // pull up and back on big airs so you can see the landing
    let lift = 0;
    if (p.mode === 'air' && p.air) lift = THREE.MathUtils.clamp((p.pos.y - p.air.startY) * 0.35 + p.air.t * 0.8, 0, 9);
    this.lift += (lift - this.lift) * Math.min(1, dt * (lift > this.lift ? 1.5 : 0.8));
    this.desired(p, hf, _d);
    const k = 1 - Math.exp(-dt * (p.mode === 'air' ? 3.5 : 6));
    this.pos.lerp(_d, k);
    const g = hf.height(this.pos.x, this.pos.z);
    if (this.pos.y < g + 1.5) this.pos.y = g + 1.5;
    // look a little ahead of the rider so you can see what's coming
    _l.copy(p.pos); _l.y += 0.8;
    _l.x += Math.cos(this.yaw) * 3; _l.z += Math.sin(this.yaw) * 3;
    this.look.lerp(_l, 1 - Math.exp(-dt * 12));
    this.c.position.copy(this.pos);
    this.c.lookAt(this.look);
  }
}
