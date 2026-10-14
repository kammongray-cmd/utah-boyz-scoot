// Tiny synthesized sound kit (no audio files): wheel roll, grind, pop, land, whoosh, bail, dings.
export class Audio {
  constructor() { this.ctx = null; this.on = true; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.7; this.master.connect(c.destination);
    // white noise buffer
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // looping roll + grind beds
    const bed = (type, freq, q) => {
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      return { f, g };
    };
    this.roll = bed('lowpass', 500, 0.8);
    this.grindBed = bed('bandpass', 2600, 6);
  }

  // per-frame: wheel noise follows speed
  update(player) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const sp = player.mode === 'ground' ? Math.min(1, player.speed / 12) : 0;
    this.roll.g.gain.setTargetAtTime(sp * 0.22, t, 0.05);
    this.roll.f.frequency.setTargetAtTime(250 + sp * 900, t, 0.05);
    const gr = player.mode === 'grind' ? 0.16 : 0;
    this.grindBed.g.gain.setTargetAtTime(gr, t, 0.03);
  }

  burst(dur, type, freq, gain, q = 1, sweepTo = null) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  tone(freq, dur, gain, type = 'sine', when = 0, slideTo = null) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }

  play(name, v = 1) {
    if (!this.ctx || !this.on) return;
    switch (name) {
      case 'push': this.burst(0.18, 'lowpass', 900, 0.35, 0.7); break;
      case 'pop': this.burst(0.05, 'highpass', 1500, 0.6); this.tone(160, 0.1, 0.35, 'triangle', 0, 70); break;
      case 'land': this.tone(90, 0.18, 0.25 + 0.5 * v, 'sine', 0, 45); this.burst(0.12, 'lowpass', 700, 0.3 + 0.4 * v); break;
      case 'whoosh': this.burst(0.28, 'bandpass', 600, 0.35, 1.5, 2400); break;
      case 'bonk': this.tone(120, 0.12, 0.4, 'square', 0, 60); break;
      case 'bail': this.burst(0.5, 'lowpass', 1400, 0.7, 0.8, 200); this.tone(200, 0.3, 0.3, 'sawtooth', 0.05, 60); break;
      case 'foam': this.burst(0.45, 'lowpass', 500, 0.6, 0.5, 120); break;
      case 'grind': this.burst(0.08, 'highpass', 3000, 0.4); break;
      case 'grindStop': break;
      case 'trick': this.tone(660, 0.12, 0.25, 'triangle'); this.tone(990, 0.18, 0.25, 'triangle', 0.08); break;
      case 'big': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 0.22, 'triangle', i * 0.07)); break;
      case 'unlock': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.3, 0.25, 'square', i * 0.09)); break;
      case 'letter': this.tone(300, 0.35, 0.35, 'sawtooth', 0, 120); break;
      case 'click': this.tone(880, 0.05, 0.15, 'square'); break;
    }
  }
}
