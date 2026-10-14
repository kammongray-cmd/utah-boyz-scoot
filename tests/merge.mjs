import './stub.mjs';
import { buildWoodward } from '../src/world/woodward.js';
import { mergeStatic } from '../src/world/builder.js';
const W = buildWoodward();
const n0 = W.group.children.length;
const t = Date.now();
const g = mergeStatic(W.group);
let tris = 0; g.traverse(o => { if (o.isMesh) { const gg = o.geometry; tris += (gg.index ? gg.index.count : gg.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
console.log('meshes', n0, '->', g.children.length, 'merge ms', Date.now() - t, 'tris', Math.round(tris));
