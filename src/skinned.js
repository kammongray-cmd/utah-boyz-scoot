// The real Dane / Tucker models from the Utah Boyz game (rigged glb), posed on the scooter
// every frame with simple two-bone IK: feet on the deck, hands on the grips.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';
import { clone as skelClone } from '../vendor/jsm/utils/SkeletonUtils.js';

const cache = {};
export function loadRiderGlb(id) {
  if (!cache[id]) cache[id] = new GLTFLoader().loadAsync(`assets/${id}.glb`).then(g => {
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      const m = o.material;
      if (m && m.isMeshStandardMaterial) { m.metalness = 0; m.roughness = Math.max(0.65, m.roughness); }
    });
    return g;
  });
  return cache[id];
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

// rotate `bone` (about its own origin) so that `child`'s world position moves onto `target`
function aim(bone, child, target) {
  bone.getWorldPosition(_a);
  child.getWorldPosition(_b);
  _b.sub(_a).normalize();
  _c.copy(target).sub(_a).normalize();
  _q.setFromUnitVectors(_b, _c);
  bone.getWorldQuaternion(_q2);
  _q.multiply(_q2);
  bone.parent.getWorldQuaternion(_q2).invert();
  bone.quaternion.copy(_q2.multiply(_q));
  bone.updateMatrixWorld(true);
}

// rotate a bone by a world-space rotation
function turnWorld(bone, axis, angle) {
  _q.setFromAxisAngle(axis, angle);
  bone.getWorldQuaternion(_q2);
  _q.multiply(_q2);
  bone.parent.getWorldQuaternion(_q2).invert();
  bone.quaternion.copy(_q2.multiply(_q));
  bone.updateMatrixWorld(true);
}

function kneePoint(A, T, l1, l2, hint, out) {
  const d = new THREE.Vector3().subVectors(T, A);
  let len = d.length();
  const maxL = (l1 + l2) * 0.999;
  if (len > maxL) { d.multiplyScalar(maxL / len); len = maxL; }
  d.normalize();
  const a = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = hint.clone().addScaledVector(d, -hint.dot(d)).normalize();
  return out.copy(A).addScaledVector(d, a).addScaledVector(perp, h);
}

export class SkinnedRider {
  // parent: the group in "scooter space" (+x forward, +y up, -z = rider's left)
  constructor(gltf, parent, helmetColor, stripeColor) {
    this.obj = skelClone(gltf.scene);
    this.obj.rotation.y = -Math.PI / 2; // model faces -z, scooter faces +x
    parent.add(this.obj);
    this.space = parent;
    this.obj.traverse(o => {
      if (o.isMesh && (o.name === 'Body' || o.name === 'Helmet' || o.name === 'Hair')) o.visible = false; // casual clothes, skate helmet over the hair
      if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; }
    });
    const B = this.B = {};
    this.obj.traverse(o => { if (o.isBone) B[o.name] = o; });
    this.rest = new Map();
    this.obj.traverse(o => { if (o.isBone) this.rest.set(o, [o.position.clone(), o.quaternion.clone()]); });
    this.obj.updateMatrixWorld(true);
    // bone lengths (world units at build time are scooter-space units, parent scale aside)
    const len = (a, b) => B[a].getWorldPosition(new THREE.Vector3()).distanceTo(B[b].getWorldPosition(new THREE.Vector3()));
    const s = this.space.getWorldScale(new THREE.Vector3()).x;
    this.L = {
      thigh: len('thigh_L', 'shin_L') / s, shin: len('shin_L', 'foot_L') / s,
      upper: len('upperarm_L', 'forearm_L') / s, fore: len('forearm_L', 'hand_L') / s,
    };
    this.hipH = this.space.worldToLocal(B.hips.getWorldPosition(new THREE.Vector3())).y;
    this.footH = this.space.worldToLocal(B.foot_L.getWorldPosition(new THREE.Vector3())).y;
    // skate helmet on the head bone
    const hm = new THREE.MeshStandardMaterial({ color: helmetColor, roughness: 0.35, metalness: 0.1 });
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.158, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hm);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.159, 0.014, 6, 28, Math.PI), new THREE.MeshStandardMaterial({ color: stripeColor, roughness: 0.4 }));
    stripe.rotation.y = Math.PI / 2;
    const hg = new THREE.Group(); hg.add(helmet, stripe);
    helmet.scale.set(1.12, 1.0, 1.0); stripe.scale.set(1.12, 1, 1);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 20, 1, false, -0.9, 1.8), hm); brim.position.set(0.02, 0.005, 0); brim.rotation.y = Math.PI / 2; hg.add(brim);
    this.helmet = hg;
    helmet.castShadow = true;
    // fit it in the standing rest pose (head upright), then parent it to the head bone
    const headW = B.head.getWorldPosition(new THREE.Vector3());
    const centerL = this.space.worldToLocal(headW).add(new THREE.Vector3(-0.012, 0.125, 0));
    const helmetW = new THREE.Matrix4().multiplyMatrices(this.space.matrixWorld, new THREE.Matrix4().makeTranslation(centerL.x, centerL.y, centerL.z));
    const local = new THREE.Matrix4().copy(B.head.matrixWorld).invert().multiply(helmetW);
    local.decompose(hg.position, hg.quaternion, hg.scale);
    B.head.add(hg);
  }

  // targets are in scooter space. pose = {crouch, lean, feetUp, kick, armsOut, handsL, handsR, footF, footB}
  pose(p) {
    const B = this.B, sp = this.space;
    for (const [bone, [pos, q]] of this.rest) { bone.position.copy(pos); bone.quaternion.copy(q); }
    this.obj.updateMatrixWorld(true);
    const W = v => sp.localToWorld(v.clone());
    const axisZ = new THREE.Vector3(0, 0, 1).transformDirection(sp.matrixWorld);
    const axisX = new THREE.Vector3(1, 0, 0).transformDirection(sp.matrixWorld);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(sp.matrixWorld);
    // hips: lower + shift back with the crouch
    const hipT = new THREE.Vector3(-0.05 - p.crouch * 0.07, 0.13 + this.hipH - 0.05 - p.crouch * 0.24, 0);
    const hipNow = sp.worldToLocal(B.hips.getWorldPosition(new THREE.Vector3()));
    const delta = W(hipT).sub(W(hipNow));
    const hp = B.hips.parent.worldToLocal(B.hips.getWorldPosition(new THREE.Vector3()).add(delta));
    B.hips.position.copy(hp);
    // a slight sideways stance + forward lean through the spine
    turnWorld(B.hips, up, -0.25);
    const lean = 0.22 + p.crouch * 0.45;
    turnWorld(B.spine1, axisZ, -lean * 0.5);
    turnWorld(B.spine2, axisZ, -lean * 0.3);
    turnWorld(B.spine3, up, 0.2);
    turnWorld(B.spine1, axisX, p.lean * 0.4);
    turnWorld(B.neck, axisZ, lean * 0.45);
    turnWorld(B.head, axisZ, lean * 0.3);
    // legs
    const legs = [['thigh_L', 'shin_L', 'foot_L', 'toe_L', p.footF, -1], ['thigh_R', 'shin_R', 'foot_R', 'toe_R', p.footB, 1]];
    for (const [th, sh, ft, toe, target, side] of legs) {
      const T = W(target);
      const A = B[th].getWorldPosition(new THREE.Vector3());
      const s = sp.getWorldScale(_a).x;
      const hint = axisX.clone().multiplyScalar(1).addScaledVector(axisZ, side * 0.15);
      const K = kneePoint(A, T, this.L.thigh * s, this.L.shin * s, hint, new THREE.Vector3());
      aim(B[th], B[sh], K);
      aim(B[sh], B[ft], T);
      // foot flat-ish, toes forward
      const toeT = T.clone().addScaledVector(axisX, 0.12 * s).addScaledVector(up, -0.03 * s);
      aim(B[ft], B[toe], toeT);
    }
    // arms
    const arms = [['upperarm_L', 'forearm_L', 'hand_L', p.handL, -1], ['upperarm_R', 'forearm_R', 'hand_R', p.handR, 1]];
    for (const [ua, fa, hd, target, side] of arms) {
      const T = W(target);
      const A = B[ua].getWorldPosition(new THREE.Vector3());
      const s = sp.getWorldScale(_a).x;
      const hint = axisX.clone().multiplyScalar(-0.6).addScaledVector(up, -1).addScaledVector(axisZ, side * 1.2);
      const E = kneePoint(A, T, this.L.upper * s, this.L.fore * s, hint, new THREE.Vector3());
      aim(B[ua], B[fa], E);
      aim(B[fa], B[hd], T);
    }
  }
}
