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
import { clamp, makeRNG } from '../core/RNG.js';

const QUALITY_SCALE = { bassa: 0.75, media: 1.1, alta: 1.5 };

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
    this.input.focus(this.sim.playerGeneral.anchor.x, this.sim.playerGeneral.anchor.z - 20, 98);

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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,
      window.matchMedia('(pointer: coarse)').matches ? 1.25 : (this.quality === 'alta' ? 2 : this.quality === 'media' ? 1.5 : 1)));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = this.quality === 'alta';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

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
    this.scene.fog = new THREE.Fog(new THREE.Color(b.fog), 220, 680);

    this._buildSky();

    const hemi = new THREE.HemisphereLight(0xd6e4f0, 0x574734, 0.62);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe6b8, 2.9);
    sun.position.set(140, 190, -90);
    sun.castShadow = this.quality === 'alta';
    sun.shadow.mapSize.set(this.quality === 'alta' ? 2048 : 1024, this.quality === 'alta' ? 2048 : 1024);
    sun.shadow.camera.left = -190; sun.shadow.camera.right = 190;
    sun.shadow.camera.top = 190; sun.shadow.camera.bottom = -190;
    sun.shadow.camera.far = 650;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.sun = sun;

    // alone dell'aura del generale: mostra il raggio di comando
    const auraR = 30;
    const auraGeo = new THREE.RingGeometry(auraR - 0.8, auraR, 72);
    auraGeo.rotateX(-Math.PI / 2);
    this.auraRing = new THREE.Mesh(auraGeo, new THREE.MeshBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    this.auraRing.renderOrder = 1;
    this.scene.add(this.auraRing);
  }

  _buildSky() {
    const geo = new THREE.SphereGeometry(950, 32, 18);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const top = new THREE.Color(0x3f6d94);
    const mid = new THREE.Color(0x9fc0ce);
    const horizon = new THREE.Color(this.terrain.biome.fog);
    const sunDir = new THREE.Vector3(0.55, 0.5, -0.35).normalize();
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i).normalize();
      const h = v.y;
      if (h > 0.18) tmp.copy(mid).lerp(top, Math.min(1, (h - 0.18) / 0.7));
      else tmp.copy(horizon).lerp(mid, Math.max(0, (h + 0.25) / 0.43));
      const sd = Math.max(0, v.dot(sunDir));
      const glow = Math.pow(sd, 18) * 0.55;
      tmp.r = Math.min(1, tmp.r + glow); tmp.g = Math.min(1, tmp.g + glow * 0.85); tmp.b = Math.min(1, tmp.b + glow * 0.5);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    dome.renderOrder = -10;
    this.scene.add(dome);
    this.skyDome = dome;

    // sole
    const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(22, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false }));
    sunMesh.position.copy(sunDir).multiplyScalar(760);
    this.scene.add(sunMesh);

    // nuvole: blob morbidi generati a procedura
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = 128;
    const cx = cvs.getContext('2d');
    const grad = cx.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = grad; cx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cvs);
    const cloudGeo = new THREE.PlaneGeometry(1, 1);
    const count = 26;
    const clouds = new THREE.InstancedMesh(cloudGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false, fog: false, side: THREE.DoubleSide }), count);
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const rng = makeRNG(this.mission.terrain.seed + 77);
    for (let i = 0; i < count; i++) {
      const ang = rng() * Math.PI * 2, dist = rng.range(180, 700);
      p.set(Math.sin(ang) * dist, rng.range(150, 290), Math.cos(ang) * dist);
      q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rng() * Math.PI));
      s.set(rng.range(70, 160), rng.range(30, 60), 1);
      m.compose(p, q, s);
      clouds.setMatrixAt(i, m);
    }
    clouds.instanceMatrix.needsUpdate = true;
    clouds.frustumCulled = false;
    this.scene.add(clouds);
    this.clouds = clouds;
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
    this.deployZone = this.terrain.buildDeployRect(r, 0x9e2b25);
  }

  // ---------- stati ----------
  startBattle() {
    if (this.state !== 'deployment') return;
    this.state = 'running';
    this.deployZone.group.visible = false;
    this.hud.enterBattle();
    Audio.startBattleAmbience();
    Audio.horn();
    this.hud.message(`${this.mission.name} — la battaglia ha inizio!`, 'info');
    if (this.mission.id === 'regillo' && Save.settings.showHints) {
      this.hud.message('ESERCITO: tocca 👑 Tutti per selezionare tutte le coorti', 'info');
      setTimeout(() => this.hud.message('ORDINE: scegli ⚔ Avanti e tocca il terreno per caricare', 'info'), 2600);
      setTimeout(() => this.hud.message('TATTICA: usa ▭ Selez. per scegliere gruppi e le formazioni in basso', 'info'), 5200);
    }
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
      // polvere: marcia e cariche
      if (Math.random() < 0.25) {
        for (const sq of this.sim.squads) {
          if (sq.state !== 'fight' || sq.aliveCount <= 0) continue;
          const moving = ['move', 'attack', 'attackmove'].includes(sq.order.kind);
          if (moving && Math.random() < 0.09) this.effects.dust(sq.anchor.x, sq.anchor.z, 1);
          if (sq.chargeT > 0 && sq.type.mounted && Math.random() < 0.3) this.effects.dust(sq.anchor.x, sq.anchor.z, 2);
        }
      }
      if (status === 'won' || status === 'lost') this._end(status === 'won');
    }
    this.input.update(dt);
    this.effects.update(simDt > 0 ? simDt : dt * 0.0001 + 0.0001);
    this.soldierRenderer.update(this.sim, this.camera, this.sim.time);
    this._updateAtmosphere(dt);
    this._drainEvents();
    this.hud.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  _updateAtmosphere(dt) {
    const g = this.sim.playerGeneral;
    if (this.auraRing) {
      this.auraRing.visible = !!(g && g.state !== 'dead' && g.state !== 'gone' && g.aliveCount > 0);
      if (this.auraRing.visible) {
        const r = generalBonuses(Save.data.general.level).auraRadius;
        this.auraRing.position.set(g.anchor.x, this.terrain.getHeight(g.anchor.x, g.anchor.z) + 0.35, g.anchor.z);
        this.auraRing.scale.setScalar(r / 30);
        this.auraRing.material.opacity = 0.16 + Math.sin(this.sim.time * 2) * 0.06;
      }
    }
    if (this.skyDome) this.skyDome.position.copy(this.camera.position);
    if (this.clouds) {
      this.clouds.position.x += dt * 0.8;
      if (this.clouds.position.x > 300) this.clouds.position.x = -300;
    }
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
