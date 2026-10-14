// Utah Boyz: Scoot Trip — boot, game loop, menus, HUD, garage.
import * as THREE from 'three';
import { Input } from './input.js';
import { Player } from './player.js';
import { RiderModel, RIDERS } from './rider.js';
import { DroneCam, CAM_MODES } from './camera.js';
import { Profile, SCOOTERS, COLORS, PARTS } from './profile.js';
import { TRICKS, GRINDS } from './tricks.js';
import { Audio } from './audio.js';
import { buildWoodward } from './world/woodward.js';
import { mergeStatic } from './world/builder.js';
import { Horse } from './horse.js';
import { Challenges } from './challenges.js';

const $ = id => document.getElementById(id);
const profile = new Profile();
const audio = new Audio();
const challenges = new Challenges(profile, c => {
  toast(`🏆 Challenge done: ${c.text}  +${c.pts.toLocaleString()}`, 3000);
  audio.play('unlock');
  addPoints(c.pts);
});

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.6);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.3, 2000);
const hemi = new THREE.HemisphereLight(0xe3f3ff, 0x8d7b5c, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d6, 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const S = 32;
Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 220 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const cam = new DroneCam(camera);
cam.setMode(profile.data.camMode || 0);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const input = new Input($('touch'), $('ui'));

// ---------- game state ----------
const game = {
  state: 'title', world: null, worldId: null, player: null, rider: null, horse: null,
  profile, audio, input, cam, scene,
};
window.game = game;
const worldCache = {};

async function getWorld(id) {
  if (worldCache[id]) return worldCache[id];
  let w;
  if (id === 'woodward') w = buildWoodward();
  else { const m = await import('./world/moab.js'); w = m.buildMoab(); }
  const n0 = w.group.children.length;
  try { w.group = mergeStatic(w.group); } catch (e) { console.warn('merge failed', e); }
  console.log(`${id}: ${n0} meshes -> ${w.group.children.length} draw groups`);
  worldCache[id] = w;
  return w;
}

function startSpot(w) {
  return w.spots.find(s => s.name === 'Start' || s.name === 'Moab Start') || w.spots[0];
}

async function loadWorld(id, spotName = null) {
  show('loading');
  $('loading-text').textContent = id === 'moab' ? 'Hauling the scooters to Moab…' : 'Building Woodward…';
  await new Promise(r => setTimeout(r, 30));
  let w;
  try { w = await getWorld(id); }
  catch (err) { console.error(err); hide('loading'); toast('Could not build ' + id + ' 😬'); show('title'); return false; }
  if (game.world && game.world !== w) scene.remove(game.world.group);
  game.world = w; game.worldId = id;
  scene.add(w.group);
  scene.background = new THREE.Color(w.sky);
  scene.fog = new THREE.Fog(w.fog[0], w.fog[1], w.fog[2]);
  makePlayer();
  const s = (spotName && w.spots.find(x => x.name === spotName)) || startSpot(w);
  spawnAt(s);
  hide('loading');
  return true;
}

function makePlayer(riderId = profile.id) {
  const w = game.world;
  if (game.rider) scene.remove(game.rider.root);
  const rd = profile.data.riders[riderId];
  const sc = SCOOTERS.find(s => s.id === rd.scooter) || SCOOTERS[0];
  const p = new Player(w, { ...sc.stats }, id => !TRICKS[id] || rd.points >= TRICKS[id].unlock);
  p.on.sfx = (n, v) => audio.play(n, v);
  p.on.trick = onTrick;
  p.on.bail = onBail;
  p.on.popup = (text, pts) => { if (pts) addPoints(pts); smallPopup(text, pts); };
  p.on.locked = name => toast(`🔒 ${name} — keep scoring to unlock it!`);
  p.on.grindStart = g => { grindShown = g; };
  p.on.grindEnd = onGrindEnd;
  game.player = p;
  game.rider = new RiderModel(riderId, rd.colors);
  scene.add(game.rider.root);
}

// swap who is riding (H.O.R.S.E. turns) without moving
game.useRider = id => {
  const old = game.player;
  makePlayer(id);
  if (old) { game.player.spawn(old.pos.x, old.pos.z, old.heading); game.player.lastSpot = old.lastSpot; }
};

function spawnAt(s) {
  game.player.spawn(s.x, s.z, s.heading, s.speed || 0);
  game.player.lastSpot = s;
  cam.snap(game.player, game.world.hf);
}

// ---------- scoring ----------
let trickTimer = 0, grindShown = null;
function onTrick(res, info) {
  const chain = info.chain || 1;
  const mult = chain > 1 ? 1 + 0.25 * (Math.min(chain, 9) - 1) : 1;
  const pts = Math.round(res.pts * mult / 10) * 10;
  if (!res.name) return;
  showTrick(res.name, pts, chain > 1 ? `LINE x${mult.toFixed(2).replace(/0$/, '')}` : '');
  if (pts > 0) addPoints(pts);
  audio.play(pts >= 2500 ? 'big' : 'trick');
  game.horse?.onTrick(res, info);
  if (!game.horse?.active) challenges.event(game.worldId, { type: 'trick', zone: currentZone(), res, info });
  const r = profile.rider;
  if (pts > r.best) { r.best = pts; r.bestTrick = res.name; profile.save(); }
}
function onBail(reason, res) {
  showTrick(reason === 'hard' ? 'TOO HARD! BAIL!' : reason === 'sideways' ? 'SIDEWAYS! BAIL!' : 'BAIL!', 0, '', true);
  game.horse?.onBail(reason, res);
}
function onGrindEnd(g) {
  grindShown = null;
  const pts = Math.round(g.time * GRINDS[g.style].pts / 10) * 10;
  const where = g.kind === 'coping' ? ' (coping)' : g.kind === 'ledge' ? ' (ledge)' : '';
  showTrick(GRINDS[g.style].name + where, pts, '');
  addPoints(pts);
  game.horse?.onGrind(g, pts);
  if (!game.horse?.active) challenges.event(game.worldId, { type: 'grind', zone: currentZone(), grind: g });
}

function currentZone() {
  const p = game.player; let best = null, bd = 1e9;
  for (const z of game.world.zones) {
    const d = Math.hypot(p.pos.x - z.x, p.pos.z - z.z);
    if (d < z.r && d < bd) { bd = d; best = z; }
  }
  return best ? best.name : null;
}

function renderChallenges() {
  const box = $('chal-list'); if (!box || !game.world) return;
  const list = challenges.list(game.worldId);
  const n = list.filter(c => c.done).length;
  box.innerHTML = `<h3>🏆 Challenges — ${game.world.title} (${n}/${list.length})</h3>` + list.map(c =>
    `<div class="tr${c.done ? '' : ' locked'}"><span>${c.done ? '✅' : '⬜'} ${c.text}</span><span class="how">+${c.pts.toLocaleString()}</span></div>`).join('');
}

function addPoints(pts) {
  if (!pts) return;
  if (game.horse?.active) return; // HORSE games don't farm points
  const got = profile.add(pts);
  $('pts').textContent = profile.points.toLocaleString();
  for (const g of got) { toast('🎉 ' + g, 3200); audio.play('unlock'); }
  if (got.length) game.player.stats = { ...profile.scooter().stats };
}

function showTrick(name, pts, chainText, bail = false) {
  const t = $('trick'), p = $('trick-pts');
  t.textContent = name; t.className = 'show' + (bail ? ' bail' : '');
  void t.offsetWidth;
  p.textContent = pts ? '+' + pts.toLocaleString() : ''; p.className = pts ? 'show' : '';
  $('chain').textContent = chainText;
  trickTimer = 2.2;
}
function smallPopup(text, pts) {
  if (trickTimer > 0.6) return;
  showTrick(text, pts, '');
  trickTimer = 1.0;
}
let toastQ = [], toastBusy = false;
function toast(msg, ms = 2200) {
  toastQ.push([msg, ms]);
  if (toastBusy) return;
  const next = () => {
    const it = toastQ.shift();
    if (!it) { toastBusy = false; return; }
    toastBusy = true;
    const el = $('toast'); el.textContent = it[0]; el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); setTimeout(next, 380); }, it[1]);
  };
  next();
}
game.toast = toast;

// ---------- screens ----------
const SCREENS = ['title', 'garage', 'spots', 'pause', 'help', 'horse', 'loading'];
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
function anyOverlay() { return SCREENS.some(s => !$(s).classList.contains('hidden')); }
game.show = show; game.hide = hide;

function renderRiders() {
  const box = $('riders'); box.innerHTML = '';
  for (const id of ['dane', 'tucker']) {
    const r = RIDERS[id], d = profile.data.riders[id];
    const c = document.createElement('button');
    c.className = 'rider-card' + (profile.id === id ? ' sel' : '');
    const col = '#' + new THREE.Color(r.helmet).getHexString(), num = '#' + new THREE.Color(r.stripe).getHexString();
    c.innerHTML = `<div class="badge" style="background:${col};color:${num}">${r.number}</div><div class="nm">${r.name} #${r.number}</div><div class="pp">★ ${d.points.toLocaleString()}</div>`;
    c.onclick = () => { audio.unlock(); audio.play('click'); profile.id = id; renderRiders(); };
    box.appendChild(c);
  }
}

async function play(worldId, spot) {
  hide('title');
  const ok = await loadWorld(worldId, spot);
  if (!ok) return;
  game.state = 'play';
  show('hud');
  $('pts').textContent = profile.points.toLocaleString();
  if (!profile.data.seenHelp) { profile.data.seenHelp = true; profile.save(); show('help'); }
  hintTimer = 0;
  $('hint-l').classList.remove('fade'); $('hint-r').classList.remove('fade');
  return true;
}
game.play = play;
game.spawnAt = spawnAt;

document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
  audio.unlock(); audio.play('click');
  const go = b.dataset.go;
  if (go === 'garage') { renderGarage(); show('garage'); }
  else if (go === 'horse') { game.horse.openSetup(); }
  else play(go);
}));
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
  audio.play('click');
  const scr = b.closest('.screen');
  scr.classList.add('hidden');
  if (scr.id === 'horse') game.horse.closeSetup();
}));
$('howto').onclick = e => { e.preventDefault(); show('help'); };
$('btn-menu').onclick = () => { audio.play('click'); input.releaseAll(); renderChallenges(); show('pause'); };
$('btn-spots').onclick = () => { audio.play('click'); input.releaseAll(); renderSpots(); show('spots'); };
$('btn-cam').onclick = () => {
  audio.play('click');
  cam.setMode(cam.mode + 1); profile.data.camMode = cam.mode; profile.save();
  toast('🎥 ' + CAM_MODES[cam.mode].name, 900);
};
$('btn-reset').onclick = () => { audio.play('click'); game.player.respawn(); cam.snap(game.player, game.world.hf); };
$('p-resume').onclick = () => hide('pause');
$('p-garage').onclick = () => { renderGarage(); show('garage'); };
$('p-help').onclick = () => show('help');
$('p-quit').onclick = () => {
  hide('pause'); hide('hud'); game.state = 'title';
  if (game.horse.active) game.horse.quit();
  renderRiders(); show('title');
};

function renderSpots() {
  const list = $('spot-list'); list.innerHTML = '';
  for (const s of game.world.spots) {
    const b = document.createElement('button'); b.textContent = s.name;
    b.onclick = () => { audio.play('click'); hide('spots'); spawnAt(s); };
    list.appendChild(b);
  }
  const other = document.createElement('button');
  other.textContent = game.worldId === 'moab' ? '🛹 Go to Woodward' : '🏜️ Go to Moab';
  other.style.background = '#5a3a10';
  other.onclick = async () => { hide('spots'); await loadWorld(game.worldId === 'moab' ? 'woodward' : 'moab'); };
  if (!game.horse.active) list.appendChild(other);
}

// ---------- garage ----------
function renderGarage() {
  const r = profile.rider, pts = r.points;
  const sc = $('scooters'); sc.innerHTML = '';
  const max = SCOOTERS[SCOOTERS.length - 1].stats;
  for (const s of SCOOTERS) {
    const locked = pts < s.unlock;
    const d = document.createElement('div');
    d.className = 'sc' + (r.scooter === s.id ? ' sel' : '') + (locked ? ' locked' : '');
    const bar = (lab, v, m) => `<div class="st">${lab}</div><div class="bar"><i style="width:${Math.round(v / m * 100)}%"></i></div>`;
    d.innerHTML = `<div class="bars"><div class="nm">${locked ? '🔒 ' : ''}${s.name}</div>${locked ? `<div class="st">Unlocks at ★ ${s.unlock.toLocaleString()}</div>` : ''}
      ${bar('Speed', s.stats.pushSpeed, max.pushSpeed)}${bar('Pop', s.stats.pop, max.pop)}${bar('Spin', s.stats.spin, max.spin)}${bar('Trick speed', s.stats.trick, max.trick)}</div>`;
    if (!locked) d.onclick = () => {
      audio.play('click'); r.scooter = s.id;
      if (s.id === 'gold') r.colors = { deck: '#f2b705', bars: '#f2b705', wheels: '#f2f2f2', grips: '#1b1b1b' };
      profile.save();
      if (game.player) { game.player.stats = { ...s.stats }; game.rider.setScooterColors(r.colors); }
      renderGarage();
    };
    sc.appendChild(d);
  }
  const co = $('colors'); co.innerHTML = '';
  for (const part of PARTS) {
    const row = document.createElement('div'); row.className = 'crow';
    row.innerHTML = `<div class="lab">${part[0].toUpperCase() + part.slice(1)}</div>`;
    for (const c of COLORS) {
      const locked = pts < c.unlock;
      const s = document.createElement('button');
      s.className = 'sw' + (r.colors[part] === c.hex ? ' sel' : '') + (locked ? ' locked' : '');
      s.style.background = c.hex;
      s.title = locked ? `Unlocks at ${c.unlock}` : c.id;
      s.onclick = () => {
        if (locked) { toast(`🔒 Unlocks at ★ ${c.unlock.toLocaleString()}`); return; }
        audio.play('click'); r.colors[part] = c.hex; profile.save();
        game.rider?.setScooterColors(r.colors); renderGarage();
      };
      row.appendChild(s);
    }
    co.appendChild(row);
  }
  const tl = $('tricklist'); tl.innerHTML = '';
  for (const [id, t] of Object.entries(TRICKS)) {
    const locked = pts < t.unlock;
    const d = document.createElement('div'); d.className = 'tr' + (locked ? ' locked' : '');
    d.innerHTML = `<span>${locked ? '🔒 ' : ''}${t.name}${locked ? ` <small>(★ ${t.unlock.toLocaleString()})</small>` : ''}</span><span class="how">${t.flick}</span>`;
    tl.appendChild(d);
    void id;
  }
}

// ---------- HUD bits ----------
let hintTimer = 0, zoneTimer = 0;
function updateHud(dt) {
  if (trickTimer > 0) {
    trickTimer -= dt;
    if (trickTimer <= 0) { $('trick').className = ''; $('trick-pts').className = ''; $('chain').textContent = ''; }
  }
  const p = game.player;
  if (p.mode === 'grind' && p.grind) {
    $('grind').textContent = `${GRINDS[p.grind.style].name}  +${Math.round(p.grind.time * GRINDS[p.grind.style].pts / 10) * 10}`;
  } else $('grind').textContent = '';
  hintTimer += dt;
  if (hintTimer > 25) { $('hint-l').classList.add('fade'); $('hint-r').classList.add('fade'); }
  zoneTimer -= dt;
  if (zoneTimer < 0) {
    zoneTimer = 0.5;
    let best = null, bd = 1e9;
    for (const z of game.world.zones) {
      const d = Math.hypot(p.pos.x - z.x, p.pos.z - z.z);
      if (d < z.r && d < bd) { bd = d; best = z; }
    }
    $('hud-zone').textContent = (game.world.title) + (best ? ' · ' + best.name : '');
  }
}

// ---------- loop ----------
let last = performance.now();
let perfT = 0, perfN = 0, perfSum = 0, perfChecks = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  tick(dt);
}
// one game step + render (tests call this directly)
function tick(dt, render = true) {
  input.update(dt);
  const events = input.take();
  const paused = anyOverlay();
  if (game.state === 'play' && game.player && !paused) {
    const p = game.player;
    p.update(dt, input, events);
    game.rider.update(p, dt);
    cam.update(dt, p, game.world.hf);
    audio.update(p);
    updateHud(dt);
    game.horse.update(dt);
    sun.position.set(p.pos.x + 40, p.pos.y + 80, p.pos.z + 25);
    sun.target.position.copy(p.pos);
    // adaptive quality: drop resolution if the iPad is struggling
    perfT += dt; perfSum += dt; perfN++;
    if (perfT > 3 && perfChecks < 3) {
      const avg = perfSum / perfN;
      if (avg > 1 / 45 && pixelRatio > 1) {
        pixelRatio = Math.max(1, pixelRatio - 0.35);
        renderer.setPixelRatio(pixelRatio);
        perfChecks++;
      }
      perfT = 0; perfSum = 0; perfN = 0;
    }
  } else if (game.player) audio.update({ mode: 'paused', speed: 0 });
  if (game.world && render) renderer.render(scene, camera);
}

game.tick = (secs, dt = 1 / 60) => { for (let t = 0; t < secs; t += dt) tick(dt, t + dt >= secs); };
game.horse = new Horse(game);
renderRiders();
requestAnimationFrame(frame);
document.addEventListener('pointerdown', () => audio.unlock(), { once: false });

// offline support
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.match(/^(localhost|127\.)/)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
