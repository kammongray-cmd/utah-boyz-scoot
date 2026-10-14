// H.O.R.S.E. — pass-the-iPad trick battle.
// The setter lands any trick (spin/flip/whip combo); everyone else must land the exact same
// combo from the same spot. Miss = a letter. Spell HORSE and you're out. Last rider standing wins.
const WORD = 'HORSE';
const TURN_TIME = 35;

export class Horse {
  constructor(game) {
    this.g = game; this.active = false;
    this.cfg = {
      players: [
        { name: 'Dane', rider: 'dane', on: true },
        { name: 'Tucker', rider: 'tucker', on: true },
        { name: 'Dad', rider: 'dane', on: false },
        { name: 'Player 4', rider: 'tucker', on: false },
      ],
      world: 'woodward', spot: 'Jump Line',
    };
  }

  el(id) { return document.getElementById(id); }

  // ---------- setup screen ----------
  closeBtn(on) { const b = document.querySelector('#horse .close'); if (b) b.style.visibility = on ? 'visible' : 'hidden'; }

  openSetup() {
    this.closeBtn(true);
    this.g.show('horse');
    this.renderSetup();
  }
  closeSetup() { if (!this.active) this.g.show('title'); }

  renderSetup() {
    const c = this.cfg;
    const body = this.el('horse-body');
    const spots = {
      woodward: ['Jump Line', 'Start', 'Vert Ramp', 'Mini Ramp', 'Big Bowl', 'Street Plaza', 'Big Stairs', 'Mega Ramp', 'Spine', 'Foam Pit'],
      moab: ['Moab Start', 'Slickrock Trail', 'Corona Arch', 'Delicate Arch Bowl', 'Slot Canyon Gap', 'Fin Drop'],
    };
    body.innerHTML = `
      <p class="horse-msg" style="font-size:18px">Pick who's playing and where. Take turns on the iPad: the setter lands a trick, everyone else has to copy it. Miss and you get a letter!</p>
      <h3>Riders</h3>
      <div class="hp-row" id="hp-players"></div>
      <h3>Where</h3>
      <div class="hp-row" id="hp-world"></div>
      <div class="hp-row" id="hp-spots"></div>
      <div class="menu-buttons col" style="margin-top:14px"><button class="big" id="hp-start">🐴 START H.O.R.S.E.</button></div>`;
    const pl = this.el('hp-players');
    c.players.forEach((p, i) => {
      const d = document.createElement('div');
      d.className = 'hp-chip' + (p.on ? ' on' : '');
      if (i < 2) d.textContent = (p.on ? '✅ ' : '⬜ ') + p.name;
      else {
        d.innerHTML = `${p.on ? '✅' : '⬜'} <input value="${p.name}" maxlength="12">`;
        const inp = d.querySelector('input');
        inp.addEventListener('click', e => e.stopPropagation());
        inp.addEventListener('pointerdown', e => e.stopPropagation());
        inp.addEventListener('input', () => { p.name = inp.value || `Player ${i + 1}`; });
      }
      d.onclick = () => { p.on = !p.on; this.renderSetup(); };
      pl.appendChild(d);
    });
    const wl = this.el('hp-world');
    for (const [id, nm] of [['woodward', '🛹 Woodward'], ['moab', '🏜️ Moab']]) {
      const d = document.createElement('div');
      d.className = 'hp-chip' + (c.world === id ? ' on' : ''); d.textContent = nm;
      d.onclick = () => { c.world = id; c.spot = spots[id][0]; this.renderSetup(); };
      wl.appendChild(d);
    }
    const sl = this.el('hp-spots');
    for (const s of spots[c.world]) {
      const d = document.createElement('div');
      d.className = 'hp-chip' + (c.spot === s ? ' on' : ''); d.textContent = s;
      d.onclick = () => { c.spot = s; this.renderSetup(); };
      sl.appendChild(d);
    }
    this.el('hp-start').onclick = () => this.start();
  }

  // ---------- game flow ----------
  async start() {
    const players = this.cfg.players.filter(p => p.on).map(p => ({ name: p.name, rider: p.rider, letters: 0 }));
    if (players.length < 2) { this.g.toast('Pick at least 2 riders!'); return; }
    this.players = players;
    this.setter = 0;
    this.set = null;
    this.active = true;
    this.g.hide('horse');
    this.g.hide('title');
    const ok = await this.g.play(this.cfg.world, this.cfg.spot);
    if (!ok) { this.active = false; return; }
    this.spot = this.g.world.spots.find(s => s.name === this.cfg.spot) || this.g.world.spots[0];
    this.el('horse-bar').classList.remove('hidden');
    this.beginSetTurn();
  }

  alive() { return this.players.filter(p => p.letters < WORD.length); }

  beginSetTurn() {
    if (this.checkWinner()) return;
    while (this.players[this.setter].letters >= WORD.length) this.setter = (this.setter + 1) % this.players.length;
    this.set = null;
    this.queue = [];
    this.turn = { who: this.setter, phase: 'set' };
    this.passScreen(this.players[this.setter], `SET a trick!`, 'Land any trick — spins, flips, whips, combos. Everyone else has to copy it.');
  }

  beginMatchTurn() {
    if (!this.queue.length) { this.nextSetter(); return; }
    const who = this.queue.shift();
    this.turn = { who, phase: 'match' };
    this.passScreen(this.players[who], `Match: ${this.set.name}`, `Land the exact same trick. Miss and you get a letter!`);
  }

  nextSetter() {
    this.setter = (this.setter + 1) % this.players.length;
    this.beginSetTurn();
  }

  passScreen(p, title, sub) {
    this.waiting = true;
    this.g.input.releaseAll();
    this.el('horse-bar').innerHTML = '';
    this.closeBtn(false);
    this.g.show('horse');
    const body = this.el('horse-body');
    body.innerHTML = `
      <div class="horse-msg">📱 Pass the iPad to<span class="who">${p.name}</span>${title}<br><small style="opacity:.8;font-size:17px">${sub}</small></div>
      ${this.scoreboardHtml()}
      <div class="menu-buttons col"><button class="big" id="hp-go">GO! (${TURN_TIME}s)</button><button class="big alt" id="hp-quit">Quit H.O.R.S.E.</button></div>`;
    this.el('hp-go').onclick = () => {
      this.g.hide('horse');
      this.waiting = false;
      this.g.useRider(p.rider);
      this.g.spawnAt(this.spot);
      this.timer = TURN_TIME;
      this.resolved = false;
    };
    this.el('hp-quit').onclick = () => { this.quit(); this.g.hide('horse'); this.g.hide('hud'); this.g.state = 'title'; this.g.show('title'); };
  }

  scoreboardHtml() {
    return `<div class="scoreboard">${this.players.map((p, i) => {
      const lt = WORD.split('').map((ch, k) => (k < p.letters ? ch : `<span class="dim">${ch}</span>`)).join('');
      const out = p.letters >= WORD.length;
      return `<div class="${out ? 'out' : ''}"><span>${i === this.setter ? '⭐ ' : ''}${p.name}${out ? ' (out)' : ''}</span><span class="letters">${lt}</span></div>`;
    }).join('')}</div>`;
  }

  resolve(kind, text) {
    if (this.resolved || this.waiting) return;
    this.resolved = true;
    const t = this.turn, p = this.players[t.who];
    if (t.phase === 'set') {
      if (kind === 'set') {
        this.g.toast(`🐴 ${p.name} set: ${text}`, 2000);
        this.queue = this.alive().map(x => this.players.indexOf(x)).filter(i => i !== t.who);
        setTimeout(() => this.beginMatchTurn(), 1600);
      } else {
        this.g.toast(`${p.name} didn't set a trick — next setter!`, 2000);
        setTimeout(() => this.nextSetter(), 1600);
      }
    } else {
      if (kind === 'match') { this.g.toast(`✅ ${p.name} matched it!`, 1800); this.g.audio.play('big'); }
      else {
        p.letters++;
        this.g.audio.play('letter');
        const word = WORD.slice(0, p.letters);
        this.g.toast(`❌ ${p.name} gets a letter: ${word}${p.letters >= WORD.length ? ' — OUT!' : ''}`, 2200);
      }
      setTimeout(() => { if (!this.checkWinner()) this.beginMatchTurn(); }, 1800);
    }
  }

  checkWinner() {
    const a = this.alive();
    if (a.length > 1) return false;
    this.waiting = true;
    const w = a[0];
    this.el('horse-bar').innerHTML = '';
    this.closeBtn(false);
    this.g.show('horse');
    this.g.audio.play('unlock');
    this.el('horse-body').innerHTML = `
      <div class="horse-msg">🏆<span class="who">${w ? w.name : 'Nobody'} WINS!</span>H.O.R.S.E. champion</div>
      ${this.scoreboardHtml()}
      <div class="menu-buttons col"><button class="big" id="hp-again">PLAY AGAIN</button><button class="big alt" id="hp-done">FREE RIDE</button></div>`;
    this.el('hp-again').onclick = () => { this.players.forEach(p => (p.letters = 0)); this.setter = 0; this.g.hide('horse'); this.beginSetTurn(); };
    this.el('hp-done').onclick = () => { this.quit(); this.g.hide('horse'); };
    return true;
  }

  // ---------- hooks from the game ----------
  onTrick(res) {
    if (!this.active || this.waiting || this.resolved) return;
    if (!res.parts.length) return; // plain airs don't count
    if (this.turn.phase === 'set') { this.set = { key: res.key, name: res.name.replace(' (Fakie)', '') }; this.resolve('set', this.set.name); }
    else this.resolve(res.key === this.set.key ? 'match' : 'miss');
  }
  onBail() {
    if (!this.active || this.waiting || this.resolved) return;
    setTimeout(() => this.resolve('miss'), 900);
  }
  onGrind() { /* grinds don't count in H.O.R.S.E. */ }

  update(dt) {
    if (!this.active) return;
    const bar = this.el('horse-bar');
    if (this.waiting || !this.turn) { bar.innerHTML = ''; return; }
    if (!this.resolved) this.timer -= dt;
    const p = this.players[this.turn.who];
    const tt = Math.max(0, Math.ceil(this.timer));
    bar.innerHTML = this.turn.phase === 'set'
      ? `🐴 ${p.name}: <span class="set">SET a trick</span> · ${tt}s`
      : `🐴 ${p.name}: match <span class="set">${this.set.name}</span> · ${tt}s`;
    if (this.timer <= 0 && !this.resolved) this.resolve('miss');
  }

  quit() {
    this.active = false; this.waiting = false; this.turn = null;
    this.el('horse-bar').classList.add('hidden');
    this.g.useRider(this.g.profile.id);
  }
}
