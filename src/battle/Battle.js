// ============================================================
// IMPERO ROMANO — Orchestratore della battaglia.
// Setup 3D, ciclo di gioco, schieramento, pausa/tempo, abilità
// del generale, vittoria/sconfitta, risultati e progressione.
// ============================================================

import * as THREE from 'three';
import { Terrain } from './Terrain.js';
import { Sim } from './Sim.js';
import { EnemyAI } from './AI.js';
import { Objectives, describePrimary } from './Objectives.js';
import { Effects } from './Effects.js';
import { SoldierRenderer } from './Soldiers.js';
import { BattleInput } from './Input.js';
import { BattleHUD } from '../ui/BattleHUD.js';
import { Audio } from '../core/Audio.js';
import { Save, generalBonuses } from '../core/Save.js';
import { vetLevelFor, progressionCat, UNITS } from '../data/Units.js';
import { clamp } from '../core/RNG.js';

const QUALITY_SCALE = { bassa: 0.6, media: 0.85, alta: 1.0 };

export class Battle {
  constructor(mission, callbacks = {}) {
    this.mission = mission;
    this.callbacks = callbacks; // { onEnd(result), onAbandon(), onRestart(), onSettings() }
    this.quality = Save.settings.quality;
    this.state = 'deployment';
    this.paused = false;
    this.timeScale = 1;
    this.speeds = [0.5, 1, 2, 3];
    this.speedIdx = 1;
    this.selection = [];
    this.controlGroups = {};
    this.abilityCooldowns = { radunata: 0, carica: 0, marcia: 0 };
    this._raf = 0;
    this._lastT = 0;
    this._eventCursor = 0;
    this._ended = false;

    this._initThree();
    this._initWorld();
    this._initSim();
    this._initSpecial();

    this.input = new BattleInput(this);
    this.hud = new BattleHUD(this);
    this.input.focus(this.sim.playerGeneral.anchor.x, this.sim.playerGeneral.anchor.z - 20, 130);

    this.soldierRenderer.refreshColors(this.sim);
    this.onSelectionChanged();
    this.hud.enterDeployment();

    this._lastT = performance.now();
    const loop = (t) => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this._lastT) / 1000);
      this._lastT = t;
      this.frame(dt);
    };
    this._raf = requestAnimationFrame(loop);
  }

  // ---------- 3D ----------
  _initThree() {
    // Un solo renderer WebGL per tutta la sessione: i contesti non si ricreano
    // (evita perdita di contesto e blocchi del browser tra una battaglia e l'altra).
    const canvas = document.getElementById('game-canvas');
    if (!window.__imperoRenderer) {
      window.__imperoRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      canvas.addEventListener('webglcontextlost', (e) => e.preventDefault(), false);
    }
    this.renderer = window.__imperoRenderer;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality === 'alta' ? 2 : this.quality === 'media' ? 1.5 : 1));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = this.quality === 'alta';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 1, 1400);
    this._onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this._onResize);
  }

  _initWorld() {
    this.terrain = new Terrain(this.mission.terrain, this.quality);
    this.scene.add(this.terrain.group);
    const b = this.terrain.biome;
    this.scene.background = new THREE.Color(b.sky);
    this.scene.fog = new THREE.Fog(new THREE.Color(b.fog), 180, 620);

    const hemi = new THREE.HemisphereLight(0xdfe8f0, 0x6b6250, 1.15);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.0);
    sun.position.set(120, 180, 80);
    if (this.quality === 'alta') {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
      sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
      sun.shadow.camera.far = 600;
      sun.shadow.bias = -0.0005;
    }
    this.scene.add(sun);
    this.sun = sun;
  }

  _initSim() {
    const vet = {};
    for (const cat of ['heavy', 'light', 'missile', 'cav', 'special']) {
      vet[cat] = vetLevelFor(Save.data.xp[cat] || 0);
    }
    const general = generalBonuses(Save.data.general.level);
    this.sim = new Sim(this.mission, this.terrain, {
      scale: QUALITY_SCALE[this.quality] || 0.85,
      difficulty: Save.settings.difficulty,
      vet, general,
    });
    this.sim.fx = null; // settato dopo Effects
    this.sim.sfx = {
      clash: (i) => Audio.clash(i),
      arrowVolley: () => Audio.arrowVolley(),
      rout: () => Audio.rout(),
      rally: () => Audio.rally(),
      charge: () => Audio.charge(),
      generalDown: () => Audio.generalDown(),
      elephant: () => Audio.elephant(),
    };
    this.ai = new EnemyAI(this.sim, this.mission);
    this.objectives = new Objectives(this.sim, this.mission);
    this.effects = new Effects(this.scene, this.sim, this.camera);
    this.sim.fx = this.effects;
    this.soldierRenderer = new SoldierRenderer(this.scene, this.quality);
    for (const sq of this.sim.squads) this.soldierRenderer.addBanner(sq);
    this.sim.onReinforcement = (sq) => {
      this.soldierRenderer.addBanner(sq);
      this.soldierRenderer._colorDirty = true;
    };
  }

  _initSpecial() {
    const prim = this.mission.objectives.primary;
    const m = this.mission;
    // campo fortificato
    const campPos = prim.type === 'assault' ? prim.camp : prim.type === 'survive' && prim.then === 'assault' ? prim.camp : null;
    if (campPos) {
      const fac = m.enemy.faction;
      const color = fac === 'cartagine' ? 0x5e3a6e : fac === 'daci' ? 0x4c3520 : fac === 'egizi' ? 0xc9a227 : fac === 'parti' ? 0x8f2f2f : 0x6b5236;
      this.terrain.buildCamp(campPos.x, campPos.z, color);
    }
    // zone
    this.zones = [];
    const addZone = (z, color) => this.zones.push(this.terrain.buildZone(z, color));
    if (prim.type === 'defend') addZone(prim.zone, 0xd4af37);
    if (prim.type === 'capture' || prim.type === 'capture_then_retreat') addZone(prim.zone, 0xd4af37);
    if (prim.exit) addZone(prim.exit, 0x7fb3d5);
    if (prim.type === 'escort' && prim.path) {
      for (const wp of prim.path) addZone({ x: wp.x, z: wp.z, r: 5 }, 0x9a8a5a);
    }
    if (prim.type === 'cross') {
      // vessilli sulla riva da raggiungere
      for (let i = -3; i <= 3; i++) {
        addZone({ x: i * 30, z: prim.line.pos - 8, r: 3 }, 0x7fb3d5);
      }
    }
    // Alesia: esercito di soccorso a sud
    if (m.enemy.ai && m.enemy.ai.twoFronts && m.enemy.outerSpawn) {
      const sp = m.enemy.outerSpawn;
      let i = 0;
      for (const sq of this.sim.squads) {
        if (sq.side !== 1 || sq.role === 'defend' || sq.role === 'missile' || sq.isGeneral) continue;
        const nx = sp.x + (i - 4) * 18, nz = sp.z + (i % 2) * 14;
        const dx = nx - sq.anchor.x, dz = nz - sq.anchor.z;
        sq.anchor.x = nx; sq.anchor.z = nz;
        sq.facing = sq.targetFacing = Math.PI; // guarda verso nord (il campo romano)
        for (const s of sq.soldiers) { s.x += dx; s.z += dz; s.y = this.terrain.getHeight(s.x, s.z); s.facing = Math.PI; }
        sq.order = { kind: 'hold', x: nx, z: nz, target: null };
        i++;
      }
    }
    // zona di schieramento visibile
    const r = this.sim.deployRect;
    this.deployZone = this.terrain.buildZone({ x: r.x, z: r.z, r: Math.max(r.w, r.d) * 0.55 }, 0x9e2b25);
  }

  // ---------- stati ----------
  startBattle() {
    if (this.state !== 'deployment') return;
    this.state = 'running';
    this.deployZone.ring.visible = false;
    this.deployZone.disc.visible = false;
    this.deployZone.pole.visible = false;
    this.deployZone.flag.visible = false;
    this.hud.enterBattle();
    Audio.startBattleAmbience();
    Audio.horn();
    this.hud.message(`${this.mission.name} — la battaglia ha inizio!`, 'info');
  }

  togglePause() {
    if (this.state !== 'running') return;
    this.paused = !this.paused;
    this.hud.setPaused(this.paused);
    Audio.click();
  }

  cycleSpeed(dir) {
    if (this.state !== 'running') return;
    this.speedIdx = clamp(this.speedIdx + dir, 0, this.speeds.length - 1);
    this.timeScale = this.speeds[this.speedIdx];
    this.paused = false;
    this.hud.setPaused(false);
    this.hud.setSpeed(this.timeScale);
    Audio.click();
  }

  setSpeed(idx) {
    this.speedIdx = clamp(idx, 0, this.speeds.length - 1);
    this.timeScale = this.speeds[this.speedIdx];
    this.paused = false;
    this.hud.setPaused(false);
    this.hud.setSpeed(this.timeScale);
  }

  togglePauseMenu() {
    if (this.state === 'ended') return;
    this.hud.togglePauseMenu();
  }

  // ---------- abilità ----------
  useAbility(id) {
    if (this.state !== 'running') return;
    const bonuses = generalBonuses(Save.data.general.level);
    if (!bonuses.abilities.includes(id)) { this.hud.message('Abilità non ancora sbloccata (livello generale).', 'warn'); Audio.error(); return; }
    if (this.abilityCooldowns[id] > 0) { Audio.error(); return; }
    const g = this.sim.playerGeneral;
    if (!g || g.state === 'dead') { this.hud.message('Il generale è caduto: nessuna abilità disponibile.', 'bad'); return; }

    if (id === 'radunata') {
      this.abilityCooldowns.radunata = 45;
      const r2 = (bonuses.auraRadius * 2.2) ** 2;
      let n = 0;
      for (const sq of this.sim.squads) {
        if (sq.side !== 0 || sq.state === 'dead' || sq.state === 'gone') continue;
        const dx = sq.anchor.x - g.anchor.x, dz = sq.anchor.z - g.anchor.z;
        if (dx * dx + dz * dz > r2) continue;
        sq.morale = Math.min(sq.maxMorale, sq.morale + 32);
        if (sq.state === 'rout') {
          sq.state = 'fight';
          for (const s of sq.soldiers) if (s.state === 'rout') s.state = 'form';
          sq.order = { kind: 'hold', x: sq.anchor.x, z: sq.anchor.z, target: null };
        }
        n++;
      }
      this.hud.message(`Radunata! ${n} coorti ispirate dal generale.`, 'good');
      Audio.rally();
    } else if (id === 'carica') {
      this.abilityCooldowns.carica = 60;
      const targets = this.selection.length ? this.selection : this.sim.squads.filter((s) => s.side === 0 && s.type.mounted && s.state === 'fight');
      for (const sq of targets) {
        if (sq.side !== 0 || sq.state !== 'fight') continue;
        sq.chargeT = 6; sq.atkBoostT = 6; sq.speedBoostT = 4;
      }
      this.hud.message('Carica! Danno e velocità aumentati per le coorti scelte.', 'good');
      Audio.charge();
    } else if (id === 'marcia') {
      this.abilityCooldowns.marcia = 90;
      for (const sq of this.sim.squads) {
        if (sq.side === 0 && sq.state === 'fight') sq.speedBoostT = 10;
      }
      this.hud.message('Marcia forzata! Tutto l\'esercito accelera.', 'good');
      Audio.horn();
    }
    this.hud.refreshAbilities();
  }

  // ---------- selezione ----------
  onSelectionChanged() {
    this.selection = this.selection.filter((s) => s.state !== 'dead' && s.state !== 'gone' && s.aliveCount > 0);
    this.effects.setSelection(this.selection);
    this.soldierRenderer.setSelected(this.selection.map((s) => s.id));
    this.hud.refreshSelection();
  }

  // ---------- frame ----------
  frame(dt) {
    const simDt = (this.state === 'running' && !this.paused) ? dt * this.timeScale : 0;
    if (simDt > 0) {
      this.sim.update(simDt);
      this.ai.update(simDt);
      const status = this.objectives.update(simDt);
      for (const id in this.abilityCooldowns) this.abilityCooldowns[id] = Math.max(0, this.abilityCooldowns[id] - simDt);
      // polvere cariche cavalleria
      if (Math.random() < 0.15) {
        for (const sq of this.sim.squads) {
          if (sq.chargeT > 0 && sq.type.mounted && Math.random() < 0.3) this.effects.dust(sq.anchor.x, sq.anchor.z, 2);
        }
      }
      if (status === 'won' || status === 'lost') this._end(status === 'won');
    }
    this.input.update(dt);
    this.effects.update(simDt > 0 ? simDt : dt * 0.0001 + 0.0001);
    this.soldierRenderer.update(this.sim, this.camera, this.sim.time);
    this._drainEvents();
    this.hud.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _drainEvents() {
    while (this._eventCursor < this.sim.events.length) {
      const ev = this.sim.events[this._eventCursor++];
      this.hud.message(ev.text, ev.kind);
    }
  }

  _end(victory) {
    if (this._ended) return;
    this._ended = true;
    this.state = 'ended';
    const sim = this.sim;
    const secondaries = this.objectives.evaluateSecondaries(victory);
    const secDone = secondaries.filter((s) => s.done).length;
    const lossesFrac = sim.stats.losses[0] / Math.max(1, sim.initialCount[0]);
    const stars = victory ? 1 + Math.min(2, secDone) : 0;

    // XP per categoria in base alle coorti schierate
    const catCounts = {};
    for (const sq of sim.squads) {
      if (sq.side !== 0 || sq.isGeneral || sq.type.id === 'salmerie') continue;
      const cat = progressionCat(sq.type.id);
      catCounts[cat] = (catCounts[cat] || 0) + sq.n0;
    }
    const total = Object.values(catCounts).reduce((a, b) => a + b, 0) || 1;
    const xpBase = this.mission.rewards.xp * (victory ? 1 : 0.3) * (1 + secDone * 0.15);
    const xpByCat = {};
    for (const cat in catCounts) {
      xpByCat[cat] = Math.round(xpBase * (catCounts[cat] / total) * 1.6);
      Save.addCategoryXP(cat, xpByCat[cat]);
    }

    const result = {
      victory, stars,
      missionId: this.mission.id,
      losses: lossesFrac,
      lossesSoldiers: sim.stats.losses[0],
      kills: sim.stats.kills[0],
      saved: sim.stats.saved,
      time: sim.time,
      secondary: secondaries.map((s) => s.done),
      secondaries,
      xpByCat,
      xpGeneral: Math.round(30 + this.mission.rewards.xp * 0.12),
      loseReason: this.objectives.loseReason || '',
      routs: sim.stats.routs,
    };
    Save.completeMission(this.mission.id, result);
    if (victory) Audio.victory(); else Audio.defeat();
    setTimeout(() => { if (this.callbacks.onEnd) this.callbacks.onEnd(result); }, 1400);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.input.dispose();
    this.hud.dispose();
    this.effects.dispose();
    this.soldierRenderer.dispose();
    this.terrain.dispose();
    // il renderer è condiviso tra battaglie: non va distrutto
    this.scene.clear();
  }
}
