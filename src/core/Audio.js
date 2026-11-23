// ============================================================
// IMPERO ROMANO — Audio procedurale (Web Audio API).
// Nessun asset esterno: corni, clash, frecce, vento, fanfare.
// ============================================================

import { Save } from './Save.js';

class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null; this.musicGain = null; this.sfxGain = null;
    this.mode = null;
    this._lastClash = 0; this._lastArrow = 0; this._clashCount = 0;
    this._musicTimer = null; this._ambNodes = [];
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.master);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.musicGain.gain.value = Save.settings.musicVol * 0.5;
    this.sfxGain.gain.value = Save.settings.sfxVol;
  }

  // ---------- helpers ----------
  _env(gainNode, t0, a, peak, d, sustain = 0.0001) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.linearRampToValueAtTime(peak, t0 + a);
    g.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t0 + a + d);
  }

  _noiseBuffer() {
    if (this._nb) return this._nb;
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._nb = buf;
    return buf;
  }

  tone(freq, { type = 'sine', dur = 0.3, vol = 0.2, attack = 0.01, slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    const g = this.ctx.createGain();
    this._env(g, t0, attack, vol, dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t0); o.stop(t0 + dur + attack + 0.05);
  }

  noise({ dur = 0.2, vol = 0.2, freq = 1000, q = 1, type = 'bandpass', attack = 0.005, delay = 0, slide = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuffer(); src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    const g = this.ctx.createGain();
    this._env(g, t0, attack, vol, dur);
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t0); src.stop(t0 + dur + attack + 0.05);
  }

  // ---------- UI ----------
  click() { this.ensure(); this.tone(660, { type: 'triangle', dur: 0.07, vol: 0.12 }); this.tone(880, { type: 'triangle', dur: 0.05, vol: 0.08, delay: 0.03 }); }
  hover() { if (!this.ctx) return; this.tone(520, { type: 'sine', dur: 0.04, vol: 0.04 }); }
  confirm() { this.ensure(); this.tone(392, { type: 'triangle', dur: 0.12, vol: 0.15 }); this.tone(523, { type: 'triangle', dur: 0.16, vol: 0.15, delay: 0.08 }); }
  error() { this.ensure(); this.tone(180, { type: 'sawtooth', dur: 0.2, vol: 0.1, slide: -60 }); }

  // ---------- ordini ----------
  horn() { // corno di battaglia
    this.ensure(); if (!this.ctx) return;
    this.tone(196, { type: 'sawtooth', dur: 0.5, vol: 0.12, attack: 0.08 });
    this.tone(294, { type: 'sawtooth', dur: 0.45, vol: 0.1, attack: 0.08, delay: 0.12 });
    this.noise({ dur: 0.4, vol: 0.03, freq: 800, q: 2 });
  }
  moveOrder() { this.ensure(); this.tone(440, { type: 'triangle', dur: 0.08, vol: 0.1 }); this.tone(587, { type: 'triangle', dur: 0.09, vol: 0.09, delay: 0.05 }); }
  attackOrder() { this.ensure(); this.tone(220, { type: 'sawtooth', dur: 0.16, vol: 0.12, slide: 60 }); this.noise({ dur: 0.12, vol: 0.06, freq: 2000, q: 1.5 }); }
  formation() { this.ensure(); this.noise({ dur: 0.18, vol: 0.08, freq: 500, q: 1, slide: 300 }); this.tone(330, { type: 'triangle', dur: 0.1, vol: 0.08, delay: 0.05 }); }

  // ---------- battaglia ----------
  clash(intensity = 1) {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - this._lastClash < 90) return;
    this._lastClash = now;
    const v = 0.05 + Math.min(0.1, intensity * 0.02);
    this.noise({ dur: 0.09, vol: v, freq: 2400 + Math.random() * 1800, q: 2.5 });
    this.noise({ dur: 0.06, vol: v * 0.7, freq: 900 + Math.random() * 500, q: 3, delay: 0.02 });
    if (Math.random() < 0.3) this.tone(1400 + Math.random() * 900, { type: 'square', dur: 0.03, vol: v * 0.35 });
  }
  arrowVolley() {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - this._lastArrow < 250) return;
    this._lastArrow = now;
    this.noise({ dur: 0.3, vol: 0.05, freq: 1600, q: 0.8, slide: -900, attack: 0.05 });
  }
  elephant() { this.ensure(); this.tone(110, { type: 'sawtooth', dur: 0.7, vol: 0.14, slide: 70, attack: 0.1 }); this.tone(165, { type: 'sawtooth', dur: 0.6, vol: 0.1, slide: -50, delay: 0.15, attack: 0.1 }); }
  rout() { this.ensure(); this.noise({ dur: 0.6, vol: 0.08, freq: 700, q: 0.7, slide: -400, attack: 0.05 }); this.tone(300, { type: 'sawtooth', dur: 0.5, vol: 0.05, slide: -140 }); }
  rally() { this.ensure(); this.tone(294, { type: 'sawtooth', dur: 0.35, vol: 0.12, attack: 0.05 }); this.tone(392, { type: 'sawtooth', dur: 0.4, vol: 0.12, attack: 0.05, delay: 0.15 }); this.tone(494, { type: 'sawtooth', dur: 0.5, vol: 0.12, attack: 0.05, delay: 0.3 }); }
  charge() { this.ensure(); this.noise({ dur: 0.5, vol: 0.1, freq: 300, q: 0.6, slide: 500, attack: 0.1 }); this.tone(147, { type: 'sawtooth', dur: 0.5, vol: 0.1, attack: 0.08 }); }
  generalDown() { this.ensure(); this.tone(196, { type: 'sawtooth', dur: 0.8, vol: 0.14, slide: -80, attack: 0.02 }); this.tone(98, { type: 'sawtooth', dur: 1.2, vol: 0.12, slide: -30, delay: 0.3 }); }

  victory() {
    this.ensure(); if (!this.ctx) return;
    const seq = [262, 330, 392, 523, 392, 523, 659];
    seq.forEach((f, i) => {
      this.tone(f, { type: 'sawtooth', dur: 0.35, vol: 0.1, attack: 0.03, delay: i * 0.18 });
      this.tone(f / 2, { type: 'triangle', dur: 0.4, vol: 0.08, attack: 0.03, delay: i * 0.18 });
    });
    this.noise({ dur: 1.2, vol: 0.03, freq: 3000, q: 0.5, delay: 1.2 });
  }
  defeat() {
    this.ensure(); if (!this.ctx) return;
    [220, 196, 165, 110].forEach((f, i) => this.tone(f, { type: 'sawtooth', dur: 0.7, vol: 0.1, attack: 0.05, delay: i * 0.4 }));
  }
  conquest() { this.ensure(); [392, 523, 659, 784].forEach((f, i) => this.tone(f, { type: 'triangle', dur: 0.3, vol: 0.12, delay: i * 0.1 })); }

  // ---------- musica menu ----------
  startMenuMusic() {
    this.ensure(); if (!this.ctx || this.mode === 'menu') return;
    this.stopAll(); this.mode = 'menu';
    // Drone epico lento + arpeggi di "lira"
    const drone = this.ctx.createOscillator(); drone.type = 'sawtooth'; drone.frequency.value = 65.4;
    const drone2 = this.ctx.createOscillator(); drone2.type = 'sawtooth'; drone2.frequency.value = 98;
    const df = this.ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 220; df.Q.value = 0.6;
    const dg = this.ctx.createGain(); dg.gain.value = 0.10;
    drone.connect(df); drone2.connect(df); df.connect(dg); dg.connect(this.musicGain);
    drone.start(); drone2.start();
    this._ambNodes = [drone, drone2, dg];
    const scale = [261.6, 293.7, 329.6, 392, 440, 523.3]; // modo misolidio-ish
    const pluck = () => {
      if (this.mode !== 'menu' || !this.ctx) return;
      const f = scale[Math.floor(Math.random() * scale.length)] * (Math.random() < 0.3 ? 0.5 : 1);
      const t0 = this.ctx.currentTime;
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.07, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);
      o.connect(g); g.connect(this.musicGain);
      o.start(t0); o.stop(t0 + 2);
      this._musicTimer = setTimeout(pluck, 1400 + Math.random() * 2600);
    };
    this._musicTimer = setTimeout(pluck, 800);
  }

  // ---------- ambienza battaglia ----------
  startBattleAmbience() {
    this.ensure(); if (!this.ctx || this.mode === 'battle') return;
    this.stopAll(); this.mode = 'battle';
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuffer(); src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 0.4;
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.025;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.musicGain);
    src.start(); lfo.start();
    const drone = this.ctx.createOscillator(); drone.type = 'sawtooth'; drone.frequency.value = 55;
    const df = this.ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 130;
    const dg = this.ctx.createGain(); dg.gain.value = 0.05;
    drone.connect(df); df.connect(dg); dg.connect(this.musicGain); drone.start();
    this._ambNodes = [src, lfo, drone, g, dg];
  }

  stopAll() {
    if (this._musicTimer) { clearTimeout(this._musicTimer); this._musicTimer = null; }
    for (const n of this._ambNodes) { try { n.stop && n.stop(); } catch {} try { n.disconnect(); } catch {} }
    this._ambNodes = [];
    this.mode = null;
  }
}

export const Audio = new AudioManager();
