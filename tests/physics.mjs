import './stub.mjs';
import { buildWoodward } from '../src/world/woodward.js';
import { Player } from '../src/player.js';
import { SCOOTERS } from '../src/profile.js';

const t0 = Date.now();
const W = buildWoodward();
console.log('build ms', Date.now() - t0, 'rails', W.rails.length, 'meshes', W.group.children.length);
let tris = 0; W.group.traverse(o => { if (o.isMesh && o.geometry) { const g = o.geometry; const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3; tris += n * (o.isInstancedMesh ? o.count : 1); } });
console.log('triangles', Math.round(tris));

const mkInput = () => ({ time: 0, left: { x: 0, y: 0 }, right: { x: 0, y: 0, mag: 0, leftCenterAt: -1, strongSince: -1 }, holdTime: () => 0 });
let run = function (name, spot, secs, ctl) {
  const p = new Player(W, { ...SCOOTERS[0].stats }, () => true);
  const log = [];
  p.on.trick = r => log.push('TRICK ' + r.name + ' ' + r.pts);
  p.on.bail = r => log.push('BAIL ' + r);
  p.on.grindStart = () => log.push('GRIND start');
  const s = W.spots.find(x => x.name === spot);
  p.spawn(s.x, s.z, s.heading, s.speed);
  const inp = mkInput();
  let maxY = -99, maxSp = 0, airT = 0;
  const dt = 1 / 60;
  for (let i = 0; i < secs * 60; i++) {
    inp.time += dt;
    const ev = ctl ? ctl(i * dt, p, inp) || [] : [];
    p.update(dt, inp, ev);
    if (p.mode !== (p._lm || 'ground')) { log.push(`${(i*dt).toFixed(2)}s ${p._lm}->${p.mode} @(${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)},${p.pos.z.toFixed(1)}) v=(${p.vel.x.toFixed(1)},${p.vel.y.toFixed(1)},${p.vel.z.toFixed(1)})`); p._lm = p.mode; }
    maxY = Math.max(maxY, p.pos.y); maxSp = Math.max(maxSp, p.speed);
    if (p.mode === 'air') airT += dt;
  }
  console.log(`${name}: end (${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)},${p.pos.z.toFixed(1)}) mode=${p.mode} maxY=${maxY.toFixed(1)} maxSpeed=${maxSp.toFixed(1)} air=${airT.toFixed(1)}s`, '\n   ' + log.slice(0, 14).join('\n   '));
}
const only = process.argv[2];
const _run = run; run = (n, ...a) => (!only || n === only) && _run(n, ...a);
run('push flat', 'Start', 6, (t) => (Math.floor(t / 0.7) !== Math.floor((t - 1 / 60) / 0.7) ? [{ type: 'push' }] : []));
run('mega', 'Mega Ramp', 14, (t) => (t < 0.1 ? [{ type: 'push' }] : []));
run('vert', 'Vert Ramp', 10);
run('jumpline', 'Jump Line', 8);
run('airbag', 'Air Bag', 8, (t) => (t < 0.1 ? [{ type: 'push' }] : []));
run('foam', 'Foam Pit', 8, (t) => (t < 0.1 ? [{ type: 'push' }] : []));
run('bowl', 'Big Bowl', 8);
