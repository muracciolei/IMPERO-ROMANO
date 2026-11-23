// ============================================================
// IMPERO ROMANO — Simulazione di battaglia.
// Coorti + soldati individuali: movimento in formazione, mischia,
// proiettili, morale, fatica, rotta e radunata, cariche, terrore
// degli elefanti, strutture assaltabili. Hash spaziale per collisioni.
// ============================================================

import { UNITS, FACTIONS, VET_LEVELS, progressionCat } from '../data/Units.js';
import { FORMATIONS, formationLayout } from '../data/Formations.js';
import { makeRNG, clamp, dist, dist2, angleTo, angleDiff, turnToward } from '../core/RNG.js';

const CELL = 4;
const STEP = 1 / 30;

export class Sim {
  constructor(mission, terrain, opts) {
    this.mission = mission;
    this.terrain = terrain;
    this.opts = opts; // { scale, difficulty, vet: {cat:lv}, general: bonuses, enemyGeneralLv }
    this.rng = makeRNG((mission.terrain.seed || 1) * 31 + 7);
    this.squads = [];
    this.soldiers = [];
    this.time = 0;
    this.acc = 0;
    this.events = [];
    this.stats = { kills: [0, 0], losses: [0, 0], saved: 0, escaped: 0, routs: [0, 0] };
    this.hash = new Map();
    this.fx = null;
    this.sfx = null;
    this.generalDown = [false, false];
    this.collapse = [false, false];
    this.retreatStage2 = false;
    this._mountCounter = 0; this._eleCounter = 0; this._cartCounter = 0;
    this._sqId = 0;
    this.initialCount = [0, 0];
    this.diffMul = opts.difficulty === 'facile' ? { enemyMorale: 0.85, enemyAtk: 0.85, ai: 0.8 }
      : opts.difficulty === 'leggendaria' ? { enemyMorale: 1.2, enemyAtk: 1.15, ai: 1.25 }
      : { enemyMorale: 1, enemyAtk: 1, ai: 1 };

    this._buildArmies();
  }

  // ---------------- creazione eserciti ----------------
  _makeSquad(side, faction, typeId, n, role, anchor, facing) {
    const type = UNITS[typeId];
    const scale = this.opts.scale;
    const count = Math.max(type.cat === 'elephant' ? 2 : 4, Math.round(n * scale));
    const formId = type.cat === 'phalanx' ? 'falange'
      : (type.mounted && type.cat !== 'chariot' && typeId !== 'salmerie') ? 'cavalleria'
      : (role === 'skirmish' || type.cat === 'missile') ? 'aperta'
      : (this.mission.player.startFormation && side === 0) ? this.mission.player.startFormation
      : 'linea';
    const form = FORMATIONS[formId];
    const layout = formationLayout(formId, count, type.mounted);
    const vetLv = side === 0 ? (this.opts.vet[progressionCat(typeId)] || 0) : 0;
    const vet = VET_LEVELS[vetLv];
    const isGeneral = typeId === 'generale';
    const desperate = side === 1 && this.mission.enemy.ai && this.mission.enemy.ai.desperate ? 16 : 0;
    const baseMorale = type.morale + desperate + (side === 0 ? vet.morale + (this.opts.general.moraleRegen || 0) : 8 * this.diffMul.enemyMorale);
    const squad = {
      id: this._sqId++, side, faction, type, role, isGeneral,
      n0: count, soldiers: [], aliveCount: count,
      anchor: { x: anchor.x, z: anchor.z },
      facing, targetFacing: facing,
      formation: formId, form, layout, width: layout.width, depth: layout.depth,
      order: { kind: 'hold', x: anchor.x, z: anchor.z, target: null, structure: null },
      morale: clamp(baseMorale, 0, 120), maxMorale: 100 + (side === 0 ? vet.morale : 10),
      fatigue: 0, state: 'fight', vetLv, vet,
      recentLosses: 0, recentKills: 0,
      chargeT: 0, chargeReady: true, movedDist: 0, lastEngageT: -99,
      speedBoostT: 0, atkBoostT: 0,
      routT: 0, aiTimer: this.rng() * 0.6, aiState: 'hold', holdFire: false,
      columnIdx: 0, convoyIdx: 0, savedCount: 0,
      kiteSide: this.rng() < 0.5 ? -1 : 1,
      rampage: false,
      banner: null,
    };
    this.squads.push(squad);

    for (let i = 0; i < count; i++) {
      const lx = layout.slots[i * 2], lz = layout.slots[i * 2 + 1];
      const wx = anchor.x + Math.cos(facing) * lx + Math.sin(facing) * lz;
      const wz = anchor.z - Math.sin(facing) * lx + Math.cos(facing) * lz;
      const hp = type.hp * (side === 0 ? vet.hp : 1) * (side === 1 ? (this.opts.enemyHpMul || 1) : 1);
      const s = {
        idx: this.soldiers.length, squad, type,
        x: wx, z: wz, y: this.terrain.getHeight(wx, wz),
        facing, hp, maxHp: hp,
        state: 'form', target: -1, targetStructure: null,
        cooldown: this.rng() * 0.8, shootCd: this.rng() * 1.5,
        ammo: type.missile ? type.missile.ammo : 0,
        walkPhase: this.rng() * 6, moving: false, attackT: 0, deadT: 0,
        colorVar: 0.86 + this.rng() * 0.28, colorVar2: 0.8 + this.rng() * 0.4,
        mountIdx: -1, cartIdx: -1, slotIdx: i,
        fleeX: 0, fleeZ: 0,
      };
      if (type.cat === 'elephant') s.mountIdx = this._eleCounter++;
      else if (type.mounted) {
        s.mountIdx = this._mountCounter++;
        if (type.cat === 'chariot' || typeId === 'salmerie') s.cartIdx = this._cartCounter++;
      }
      squad.soldiers.push(s);
      this.soldiers.push(s);
      this.initialCount[side]++;
    }
    return squad;
  }

  _buildArmies() {
    const m = this.mission;
    const half = this.terrain.half;
    const pDeploy = m.player.deploy || { x: 0, z: half * 0.62, w: 190, d: 60 };
    const eDeploy = m.enemy.deploy || { x: 0, z: -half * 0.62, w: 190, d: 60 };

    const place = (list, side, rect, faction, generalName) => {
      const forward = side === 0 ? -1 : 1;
      const facing = side === 0 ? Math.PI : 0;
      const groups = { front: [], skirm: [], missile: [], cavL: [], cavR: [], reserve: [], convoy: [], column: [], general: [] };
      for (const s of list) {
        const t = UNITS[s.t];
        if (s.role === 'convoy') groups.convoy.push(s);
        else if (s.role === 'column') groups.column.push(s);
        else if (s.role === 'skirmish') groups.skirm.push(s);
        else if (s.role === 'missile') groups.missile.push(s);
        else if (s.role === 'flankL') groups.cavL.push(s);
        else if (s.role === 'flankR') groups.cavR.push(s);
        else if (s.role === 'reserve') groups.reserve.push(s);
        else groups.front.push(s);
      }
      const rowZ = (off) => rect.z + forward * off;
      const placeRow = (arr, z, spread = 1) => {
        if (!arr.length) return;
        const widths = arr.map((s) => {
          const t = UNITS[s.t];
          const n = Math.round(s.n * this.opts.scale);
          return Math.max(8, Math.sqrt(n) * (t.mounted ? 3.4 : 2.2));
        });
        const total = widths.reduce((a, b) => a + b, 0) + (arr.length - 1) * 8 * spread;
        let x = rect.x - total / 2;
        arr.forEach((s, i) => {
          const ax = x + widths[i] / 2;
          this._makeSquad(side, faction, s.t, s.n, s.role || 'line', { x: ax, z }, facing);
          x += widths[i] + 8 * spread;
        });
      };
      placeRow(groups.front, rowZ(rect.d * 0.18));
      placeRow(groups.skirm, rowZ(rect.d * 0.42));
      placeRow(groups.missile, rowZ(-rect.d * 0.1));
      placeRow(groups.reserve, rowZ(-rect.d * 0.38));
      // cavalleria ai lati
      const cavPlace = (arr, sign) => {
        arr.forEach((s, i) => {
          this._makeSquad(side, faction, s.t, s.n, s.role, { x: rect.x + sign * (rect.w / 2 + 14 + i * 16), z: rowZ(rect.d * 0.1) }, facing);
        });
      };
      cavPlace(groups.cavL, -1); cavPlace(groups.cavR, 1);
      // convoglio al centro, protetto
      groups.convoy.forEach((s, i) => {
        this._makeSquad(side, faction, s.t, s.n, 'convoy', { x: rect.x + (i - (groups.convoy.length - 1) / 2) * 12, z: rowZ(-rect.d * 0.25) }, facing);
      });
      // colonna in marcia (imboscate)
      if (groups.column.length && m.enemy.columnPath) {
        const path = m.enemy.columnPath;
        groups.column.forEach((s, i) => {
          const p = path[0];
          const sq = this._makeSquad(side, faction, s.t, s.n, 'column', { x: p.x + (i % 2 ? 6 : -6), z: p.z + i * 14 }, Math.atan2(path[1].x - p.x, path[1].z - p.z));
          sq.columnIdx = 0;
          sq.order = { kind: 'column', x: path[0].x, z: path[0].z, target: null };
        });
      }
      // generale
      const g = this._makeSquad(side, faction, 'generale', side === 0 ? 10 : 10, 'general', { x: rect.x, z: rowZ(-rect.d * 0.3) }, facing);
      g.generalName = generalName;
      return g;
    };

    this.playerGeneral = place(m.player.squads, 0, pDeploy, 'roma', m.player.general);
    this.enemyGeneral = place(m.enemy.squads, 1, eDeploy, m.enemy.faction, m.enemy.general);

    // schieramento iniziale: tutti tengono la posizione
    for (const sq of this.squads) {
      if (sq.side === 0 && sq.role !== 'convoy') sq.order = { kind: 'hold', x: sq.anchor.x, z: sq.anchor.z, target: null };
    }
    this.deployRect = pDeploy;
  }

  // ---------------- API ordini ----------------
  setFormation(squad, formId) {
    if (squad.type.cat === 'phalanx') formId = 'falange';
    if (squad.type.cat === 'elephant' || squad.type.id === 'salmerie') formId = 'linea';
    if (squad.formation === formId) return;
    squad.formation = formId;
    squad.form = FORMATIONS[formId];
    squad.layout = formationLayout(formId, squad.n0, squad.type.mounted);
    squad.width = squad.layout.width; squad.depth = squad.layout.depth;
  }

  orderMove(squad, x, z) {
    const p = this.terrain.clampToBounds({ x, z });
    squad.order = { kind: 'move', x: p.x, z: p.z, target: null, structure: null };
    if (squad.state === 'rout') return; // in rotta non obbedisce
  }
  orderAttack(squad, targetSquad) {
    if (squad.state === 'rout') return;
    squad.order = { kind: 'attack', x: targetSquad.anchor.x, z: targetSquad.anchor.z, target: targetSquad, structure: null };
    squad.chargeReady = true;
  }
  orderAttackStructure(squad, structure) {
    if (squad.state === 'rout') return;
    squad.order = { kind: 'structure', x: structure.x, z: structure.z, target: null, structure };
  }
  orderAttackMove(squad, x, z) {
    const p = this.terrain.clampToBounds({ x, z });
    squad.order = { kind: 'attackmove', x: p.x, z: p.z, target: null, structure: null };
  }
  orderHold(squad) {
    squad.order = { kind: 'hold', x: squad.anchor.x, z: squad.anchor.z, target: null, structure: null };
  }
  orderRetreat(squad) {
    const exit = this.mission.objectives.primary.exit;
    const half = this.terrain.half;
    const tx = exit ? exit.x : squad.anchor.x * 0.6;
    const tz = exit ? exit.z : (squad.side === 0 ? half - 12 : -half + 12);
    squad.order = { kind: 'move', x: tx, z: tz, target: null, structure: null };
  }

  pushEvent(text, kind = 'info') {
    this.events.push({ text, kind, t: this.time });
    if (this.events.length > 40) this.events.shift();
  }

  // ---------------- hash spaziale ----------------
  _key(cx, cz) { return cx * 4096 + cz; }
  rebuildHash() {
    this.hash.clear();
    for (const s of this.soldiers) {
      if (s.state === 'dead' || s.state === 'saved' || s.state === 'escaped') continue;
      const k = this._key(Math.floor(s.x / CELL), Math.floor(s.z / CELL));
      let arr = this.hash.get(k);
      if (!arr) { arr = []; this.hash.set(k, arr); }
      arr.push(s);
    }
  }
  query(x, z, r, out) {
    out.length = 0;
    const c0x = Math.floor((x - r) / CELL), c1x = Math.floor((x + r) / CELL);
    const c0z = Math.floor((z - r) / CELL), c1z = Math.floor((z + r) / CELL);
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
      const arr = this.hash.get(this._key(cx, cz));
      if (arr) for (const s of arr) out.push(s);
    }
    return out;
  }

  nearestEnemySoldier(s, r, preferSquad = null) {
    const buf = this._qbuf || (this._qbuf = []);
    this.query(s.x, s.z, r, buf);
    let best = null, bestD = r * r;
    for (const o of buf) {
      if ((o.squad.side === s.squad.side && !s.squad.rampage) || o.state === 'dead' || o.state === 'saved' || o.state === 'escaped') continue;
      if (preferSquad && o.squad !== preferSquad && best) continue;
      const d = dist2(s.x, s.z, o.x, o.z);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  // ---------------- tick ----------------
  update(dtRaw) {
    this.acc += Math.min(dtRaw, 0.12);
    let steps = 0;
    while (this.acc >= STEP && steps < 6) {
      this.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === 6) this.acc = 0;
  }

  step(dt) {
    this.time += dt;
    this.rebuildHash();
    for (const sq of this.squads) this.updateSquad(sq, dt);
    for (const s of this.soldiers) this.updateSoldier(s, dt);
    this._checkCollapse();
  }

  squadSpeed(sq) {
    const t = sq.type;
    let sp = t.spd * sq.form.speed;
    sp *= 1 - sq.fatigue / 220;
    if (sq.speedBoostT > 0) sp *= 1.45;
    if (sq.state === 'rout') sp *= 1.25;
    if (sq.side === 0 && this._nearGeneral(sq, 0)) sp *= this.opts.general.speedBonus;
    const slope = this.terrain.getSlope(sq.anchor.x, sq.anchor.z);
    sp /= 1 + slope * 1.1;
    if (this.terrain.isForest(sq.anchor.x, sq.anchor.z)) sp *= 0.78;
    if (this.terrain.inWater(sq.anchor.x, sq.anchor.z)) sp *= 0.42;
    if (t.cat === 'phalanx' && slope > 0.3) sp *= 0.6;
    return sp;
  }

  _nearGeneral(sq, side) {
    const g = side === 0 ? this.playerGeneral : this.enemyGeneral;
    if (!g || g.state === 'dead' || g.state === 'rout') return false;
    return dist2(sq.anchor.x, sq.anchor.z, g.anchor.x, g.anchor.z) < this.opts.general.auraRadius ** 2;
  }

  updateSquad(sq, dt) {
    if (sq.state === 'dead' || sq.state === 'gone') return;
    sq.recentLosses *= Math.exp(-dt / 4);
    sq.recentKills *= Math.exp(-dt / 4);
    if (sq.chargeT > 0) sq.chargeT -= dt;
    if (sq.speedBoostT > 0) sq.speedBoostT -= dt;
    if (sq.atkBoostT > 0) sq.atkBoostT -= dt;

    // ---- obiettivi di movimento a livello coorte ----
    const o = sq.order;
    let tx = sq.anchor.x, tz = sq.anchor.z, moving = false;
    const speed = this.squadSpeed(sq);

    if (sq.state === 'rout') {
      // fuga verso il proprio bordo / uscita
      const exit = this.mission.objectives.primary.exit;
      const half = this.terrain.half;
      tx = exit && sq.side === 0 ? exit.x : sq.anchor.x + (sq.anchor.x > 0 ? 20 : -20);
      tz = exit && sq.side === 0 ? exit.z : (sq.side === 0 ? half - 8 : -half + 8);
      moving = true;
      sq.routT += dt;
    } else if (sq.role === 'convoy' && sq.side === 0) {
      const path = this.mission.objectives.primary.path;
      if (path) {
        const wp = path[Math.min(sq.convoyIdx, path.length - 1)];
        tx = wp.x; tz = wp.z; moving = true;
        if (dist(sq.anchor.x, sq.anchor.z, wp.x, wp.z) < 8) sq.convoyIdx++;
        const exit = this.mission.objectives.primary.exit;
        if (exit && dist(sq.anchor.x, sq.anchor.z, exit.x, exit.z) < exit.r) this._saveSquad(sq, 'saved');
      }
    } else if (o.kind === 'column') {
      const path = this.mission.enemy.columnPath;
      const wp = path[Math.min(sq.columnIdx, path.length - 1)];
      tx = wp.x; tz = wp.z; moving = true;
      if (dist(sq.anchor.x, sq.anchor.z, wp.x, wp.z) < 10) sq.columnIdx++;
      if (sq.columnIdx >= path.length) this._saveSquad(sq, 'escaped');
      // se sotto attacco, la colonna si ferma a combattere
      if (sq.recentLosses > 2 || sq.morale < sq.maxMorale * 0.6) {
        sq.order = { kind: 'hold', x: sq.anchor.x, z: sq.anchor.z, target: null };
        sq.role = 'line';
      }
    } else if (o.kind === 'move' || o.kind === 'attackmove') {
      tx = o.x; tz = o.z; moving = true;
      if (dist(sq.anchor.x, sq.anchor.z, tx, tz) < 2.5) {
        sq.order = { kind: 'hold', x: sq.anchor.x, z: sq.anchor.z, target: null };
        moving = false;
      }
      if (o.kind === 'attackmove') {
        const enemy = this._nearestEnemySquad(sq, 20);
        if (enemy) { sq.order = { kind: 'attack', x: enemy.anchor.x, z: enemy.anchor.z, target: enemy, structure: null }; sq.chargeReady = true; }
      }
    } else if (o.kind === 'attack' && o.target) {
      const t = o.target;
      if (t.state === 'dead' || t.state === 'gone') {
        sq.order = { kind: 'hold', x: sq.anchor.x, z: sq.anchor.z, target: null };
      } else {
        const d = dist(sq.anchor.x, sq.anchor.z, t.anchor.x, t.anchor.z);
        // le coorti devono arrivare a contatto: le prime file sono a metà profondità
        const engage = sq.type.missile && sq.type.weapon === 'bow' ? sq.type.missile.range * 0.7 : 2.5;
        if (d > engage) { tx = t.anchor.x; tz = t.anchor.z; moving = true; }
        else {
          // carica di cavalleria
          if (sq.chargeReady && sq.movedDist > 10 && (sq.type.mounted || sq.form.charge > 1.2)) {
            sq.chargeT = 3.5; sq.chargeReady = false; sq.lastEngageT = this.time;
            if (sq.side === 0 && this.sfx) this.sfx.charge();
          }
          if (sq.type.kite) {
            // tiro partico / numida: mantieni le distanze
            const keep = sq.type.cat === 'horseArcher' ? 32 : 14;
            if (d < keep) { tx = sq.anchor.x + (sq.anchor.x - t.anchor.x); tz = sq.anchor.z + (sq.anchor.z - t.anchor.z); moving = true; }
          }
        }
        sq.targetFacing = angleTo(sq.anchor.x, sq.anchor.z, t.anchor.x, t.anchor.z);
      }
    } else if (o.kind === 'structure' && o.structure) {
      const st = o.structure;
      if (st.destroyed) {
        const next = this.terrain.structures.find((s) => s.objective && !s.destroyed);
        if (next) this.orderAttackStructure(sq, next);
        else sq.order = { kind: 'hold', x: sq.anchor.x, z: sq.anchor.z, target: null };
      } else {
        const d = dist(sq.anchor.x, sq.anchor.z, st.x, st.z);
        if (d > st.radius + 3) { tx = st.x; tz = st.z; moving = true; }
      }
    } else if (o.kind === 'hold') {
      // fronte verso il nemico più vicino
      const enemy = this._nearestEnemySquad(sq, 26);
      if (enemy) sq.targetFacing = angleTo(sq.anchor.x, sq.anchor.z, enemy.anchor.x, enemy.anchor.z);
    }

    if (moving) {
      const d = dist(sq.anchor.x, sq.anchor.z, tx, tz);
      if (d > 0.5) {
        const step = Math.min(d, speed * dt);
        const nx = sq.anchor.x + ((tx - sq.anchor.x) / d) * step;
        const nz = sq.anchor.z + ((tz - sq.anchor.z) / d) * step;
        this.terrain.clampToBounds(sq.anchor, 10);
        sq.movedDist += step;
        sq.anchor.x = nx; sq.anchor.z = nz;
        sq.targetFacing = angleTo(sq.anchor.x, sq.anchor.z, tx, tz);
        sq.fatigue = clamp(sq.fatigue + dt * (sq.type.mounted ? 1.6 : 2.3), 0, 100);
      }
    } else {
      sq.movedDist = Math.max(0, sq.movedDist - dt * 6);
      sq.fatigue = clamp(sq.fatigue - dt * 3.2, 0, 100);
    }
    if (sq.chargeT > 0) sq.fatigue = clamp(sq.fatigue + dt * 2, 0, 100);

    // orientamento
    const turnRate = sq.type.cat === 'phalanx' ? 0.7 : sq.type.mounted ? 2.4 : 1.7;
    sq.facing = turnToward(sq.facing, sq.targetFacing, turnRate * dt);

    // ---- morale ----
    this._updateMorale(sq, dt);

    // ---- fatica in mischia ----
    let engaged = 0;
    for (const s of sq.soldiers) if (s.state === 'melee') engaged++;
    if (engaged > 0) sq.fatigue = clamp(sq.fatigue + dt * 2.6 * (engaged / sq.n0), 0, 100);

    // ---- stato coorte ----
    sq.aliveCount = 0;
    for (const s of sq.soldiers) if (s.state !== 'dead' && s.state !== 'saved' && s.state !== 'escaped') sq.aliveCount++;
    if (sq.aliveCount <= 0 && sq.state !== 'gone') {
      const wasGeneral = sq.isGeneral;
      sq.state = 'dead';
      if (wasGeneral && !this.generalDown[sq.side]) {
        this.generalDown[sq.side] = true;
        this.pushEvent(sq.side === 0 ? `Il generale ${sq.generalName} è caduto!` : `Il generale nemico ${sq.generalName} è caduto!`, sq.side === 0 ? 'bad' : 'good');
        if (this.sfx) this.sfx.generalDown();
        for (const other of this.squads) if (other.side === sq.side && other.state === 'fight') other.morale -= 24;
      }
    }

    // elefante impazzito
    if (sq.type.cat === 'elephant' && !sq.rampage) {
      let hp = 0, max = 0;
      for (const s of sq.soldiers) { hp += Math.max(0, s.hp); max += s.maxHp; }
      if (hp < max * 0.3) {
        sq.rampage = true;
        this.pushEvent('Un elefante ferito impazzisce e travolge chiunque!', 'warn');
        if (this.sfx) this.sfx.elephant();
      }
    }
  }

  _saveSquad(sq, state) {
    for (const s of sq.soldiers) {
      if (s.state !== 'dead') {
        s.state = state;
        if (state === 'saved') this.stats.saved++;
        else this.stats.escaped++;
      }
    }
    sq.state = 'gone';
    sq.aliveCount = 0;
    if (state === 'saved') this.pushEvent('Il convoglio è in salvo!', 'good');
    else this.pushEvent('Una colonna nemica è sfilata via!', 'warn');
  }

  _nearestEnemySquad(sq, r) {
    let best = null, bestD = r * r;
    for (const other of this.squads) {
      if (other.side === sq.side || other.state === 'dead' || other.state === 'gone') continue;
      if (other.type.id === 'salmerie' && sq.side === 1 && this.mission.enemy.ai && this.mission.enemy.ai.raid) {
        // razziatori: preferiscono il convoglio
        const d = dist2(sq.anchor.x, sq.anchor.z, other.anchor.x, other.anchor.z) * 0.35;
        if (d < bestD) { bestD = d; best = other; }
        continue;
      }
      const d = dist2(sq.anchor.x, sq.anchor.z, other.anchor.x, other.anchor.z);
      if (d < bestD) { bestD = d; best = other; }
    }
    return best;
  }

  _updateMorale(sq, dt) {
    if (sq.state === 'dead' || sq.state === 'gone') return;
    const form = sq.form;
    let delta = 0;
    const engaged = sq.soldiers.some((s) => s.state === 'melee');

    // recupero base
    delta += engaged ? 0.4 : 1.6;
    if (sq.side === 0 && this._nearGeneral(sq, 0)) delta += this.opts.general.moraleRegen;
    if (sq.side === 1 && this._nearGeneral(sq, 1)) delta += 2.2;
    if (sq.state === 'rout' && !engaged) delta += 3.5;

    // perdite recenti
    delta -= sq.recentLosses * (3.2 / sq.type.disc);
    // vittoria nella mischia
    if (sq.recentKills > sq.recentLosses * 1.25 + 0.5) delta += 2.2;

    // fianchi e accerchiamento (campionamento attorno all'ancora)
    const buf = this._mbuf || (this._mbuf = []);
    this.query(sq.anchor.x, sq.anchor.z, 11, buf);
    let rear = 0, total = 0;
    const quads = [false, false, false, false];
    for (const o of buf) {
      if (o.squad.side === sq.side || o.state === 'dead') continue;
      const d2v = dist2(sq.anchor.x, sq.anchor.z, o.x, o.z);
      if (d2v > 121) continue;
      total++;
      const ang = angleTo(sq.anchor.x, sq.anchor.z, o.x, o.z);
      const rel = Math.abs(angleDiff(sq.facing, ang));
      if (rel > 1.85) rear++;
      const q = Math.floor(((ang + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2));
      quads[q] = true;
    }
    if (rear > 2) delta -= 3.6 * form.flank * Math.min(1, rear / 9);
    if (quads.filter(Boolean).length >= 3 && total > 6) delta -= 5.5;
    if (sq.type.cat === 'phalanx' && rear > 2) delta -= 4; // falange aggirata: panico

    // alleati in rotta vicini
    let routers = 0;
    for (const other of this.squads) {
      if (other.side === sq.side && other.state === 'rout' && dist2(sq.anchor.x, sq.anchor.z, other.anchor.x, other.anchor.z) < 900) routers++;
    }
    delta -= Math.min(8, routers * 2.6);

    // terrore degli elefanti
    for (const other of this.squads) {
      if (other.type.cat !== 'elephant' || other.state === 'dead' || other.state === 'gone') continue;
      if (other.side === sq.side && !other.rampage) continue;
      if (dist2(sq.anchor.x, sq.anchor.z, other.anchor.x, other.anchor.z) < 260) {
        const resist = (sq.type.cat === 'missile' || sq.type.cat === 'javelin') ? 0.3 : 1;
        delta -= 7.5 * resist;
      }
    }

    // terreno elevato: sicurezza
    const hHere = this.terrain.getHeight(sq.anchor.x, sq.anchor.z);
    const hAround = (this.terrain.getHeight(sq.anchor.x + 12, sq.anchor.z) + this.terrain.getHeight(sq.anchor.x - 12, sq.anchor.z) + this.terrain.getHeight(sq.anchor.x, sq.anchor.z + 12) + this.terrain.getHeight(sq.anchor.x, sq.anchor.z - 12)) / 4;
    if (hHere > hAround + 2.5) delta += 1.2;

    // disciplina: resistenza alla rotta
    const routThreshold = 20 + sq.type.disc * 7;
    sq.morale = clamp(sq.morale + delta * dt, 0, sq.maxMorale);

    if (sq.state === 'fight' && sq.morale < routThreshold && !sq.isGeneral) {
      const p = dt * (0.35 + (routThreshold - sq.morale) * 0.05);
      if (this.rng() < p) {
        sq.state = 'rout'; sq.routT = 0;
        this.stats.routs[sq.side]++;
        for (const s of sq.soldiers) if (s.state !== 'dead') { s.state = 'rout'; s.target = -1; }
        this.pushEvent(sq.side === 0 ? `${sq.type.name}: la coorte si sbanda!` : `${sq.type.name} nemici in rotta!`, sq.side === 0 ? 'bad' : 'good');
        if (this.sfx) this.sfx.rout();
      }
    } else if (sq.state === 'rout' && sq.morale > 48 && sq.routT > 4) {
      sq.state = 'fight';
      for (const s of sq.soldiers) if (s.state === 'rout') { s.state = 'form'; s.target = -1; }
      sq.order = { kind: 'hold', x: sq.anchor.x, z: sq.anchor.z, target: null };
      this.pushEvent(sq.side === 0 ? `${sq.type.name}: la coorte si raduna!` : `I ${sq.type.name} nemici si radunano.`, sq.side === 0 ? 'good' : 'warn');
      if (this.sfx && sq.side === 0) this.sfx.rally();
    }
  }

  // ---------------- soldati ----------------
  updateSoldier(s, dt) {
    const sq = s.squad;
    if (s.state === 'dead') { s.deadT += dt; return; }
    if (s.state === 'saved' || s.state === 'escaped') return;
    if (sq.state === 'dead' || sq.state === 'gone') { s.state = 'dead'; s.deadT = 0.5; return; }
    if (s.attackT > 0) s.attackT -= dt;
    if (s.cooldown > 0) s.cooldown -= dt;
    if (s.shootCd > 0) s.shootCd -= dt;

    const t = s.type;
    const fatigueMul = 1 - sq.fatigue / 260;
    let speed = t.spd * fatigueMul;
    if (sq.speedBoostT > 0) speed *= 1.4;
    let goalX = s.x, goalZ = s.z;
    let wantMove = false;
    s.moving = false;

    // ---- rotta ----
    if (s.state === 'rout' || sq.state === 'rout') {
      s.state = 'rout';
      const half = this.terrain.half;
      const exit = this.mission.objectives.primary.exit;
      const ex = exit && sq.side === 0 ? exit.x : (s.x > 0 ? half - 6 : -half + 6);
      const ez = exit && sq.side === 0 ? exit.z : (sq.side === 0 ? half - 6 : -half + 6);
      goalX = ex + (s.idx % 7 - 3) * 3; goalZ = ez;
      wantMove = true;
      speed *= 1.2;
      this._moveSoldier(s, goalX, goalZ, speed, dt, true);
      return;
    }

    // ---- tiro ----
    const isShooter = t.missile && (t.weapon === 'bow' || t.weapon === 'javelin' || t.missile.kind === 'stone' || t.missile.kind === 'pilum');
    if (isShooter && s.ammo > 0 && s.shootCd <= 0 && !sq.holdFire) {
      const range = t.missile.range;
      let targetSquad = null;
      if (sq.order.kind === 'attack' && sq.order.target && sq.order.target.side !== sq.side) targetSquad = sq.order.target;
      if (!targetSquad) {
        let bestD = range * range;
        for (const other of this.squads) {
          if (other.side === sq.side || other.state === 'dead' || other.state === 'gone') continue;
          if (sq.rampage && other === sq) continue;
          const d = dist2(s.x, s.z, other.anchor.x, other.anchor.z);
          const eff = d - other.width * other.width * 0.2;
          if (eff < bestD) { bestD = eff; targetSquad = other; }
        }
      }
      if (targetSquad) {
        const d = dist(s.x, s.z, targetSquad.anchor.x, targetSquad.anchor.z);
        if (d < range + targetSquad.width * 0.4) {
          // bersaglio: soldato vivo casuale della coorte
          const alive = targetSquad.soldiers.filter((o) => o.state !== 'dead' && o.state !== 'saved' && o.state !== 'escaped');
          if (alive.length) {
            const victim = alive[Math.floor(this.rng() * alive.length)];
            const dmg = this._missileDamage(s, victim);
            if (this.fx) this.fx.spawnArrow(s, victim, dmg, t.missile.kind);
            s.ammo--;
            s.shootCd = t.missile.reload * (1 + sq.fatigue / 150) * (0.85 + this.rng() * 0.3);
            s.attackT = 0.28;
            s.facing = angleTo(s.x, s.z, victim.x, victim.z);
            if (this.sfx) this.sfx.arrowVolley();
          }
        }
      }
    }

    // ---- mischia ----
    let meleeTarget = null;
    const reach = 1.65 + t.size * 0.35;
    if (s.target >= 0) {
      const o = this.soldiers[s.target];
      if (o && o.state !== 'dead' && o.state !== 'saved' && o.state !== 'escaped' && (o.squad.side !== sq.side || sq.rampage) && dist2(s.x, s.z, o.x, o.z) < 12) meleeTarget = o;
      else s.target = -1;
    }
    if (!meleeTarget && t.weapon !== 'bow') {
      const prefer = sq.order.kind === 'attack' ? sq.order.target : null;
      meleeTarget = this.nearestEnemySoldier(s, sq.rampage ? 5 : 3.4, prefer);
      if (meleeTarget) s.target = meleeTarget.idx;
    }
    // strutture
    let structTarget = null;
    if (sq.order.kind === 'structure' && sq.order.structure && !sq.order.structure.destroyed) {
      const st = sq.order.structure;
      if (dist2(s.x, s.z, st.x, st.z) < (st.radius + 2.2) ** 2) structTarget = st;
    } else if (this.mission.objectives.primary.type === 'assault' && sq.side === 0 && !meleeTarget) {
      for (const st of this.terrain.structures) {
        if (!st.destroyed && st.side !== 0 && dist2(s.x, s.z, st.x, st.z) < (st.radius + 1.8) ** 2) { structTarget = st; break; }
      }
    }

    if (meleeTarget) {
      s.state = 'melee';
      const d = dist(s.x, s.z, meleeTarget.x, meleeTarget.z);
      s.facing = turnToward(s.facing, angleTo(s.x, s.z, meleeTarget.x, meleeTarget.z), 6 * dt);
      if (d > reach) {
        goalX = meleeTarget.x; goalZ = meleeTarget.z; wantMove = true;
        speed *= 0.95;
      } else if (s.cooldown <= 0) {
        s.cooldown = 1.0 + this.rng() * 0.35;
        s.attackT = 0.28;
        this._meleeHit(s, meleeTarget);
      }
    } else if (structTarget) {
      s.state = 'melee';
      s.facing = turnToward(s.facing, angleTo(s.x, s.z, structTarget.x, structTarget.z), 6 * dt);
      if (s.cooldown <= 0) {
        s.cooldown = 1.1;
        s.attackT = 0.28;
        structTarget.hp -= t.atk * 0.9 * (sq.form.atk || 1);
        if (this.sfx) this.sfx.clash(0.5);
        if (structTarget.hp <= 0 && !structTarget.destroyed) {
          structTarget.destroyed = true;
          structTarget.mesh.scale.y = 0.15;
          structTarget.mesh.rotation.z = (this.rng() - 0.5) * 0.3;
          const idx = this.terrain.obstacles.findIndex((ob) => ob.s === structTarget);
          if (idx >= 0) this.terrain.obstacles.splice(idx, 1);
          this.pushEvent(structTarget.kind === 'command' ? 'La tenda del comando nemico è distrutta!' : 'Una struttura del campo è distrutta.', 'good');
          if (this.fx) this.fx.dust(structTarget.x, structTarget.z, 8);
        }
      }
    } else {
      // ---- movimento verso lo slot in formazione ----
      if (s.state !== 'rout') s.state = isShooter && s.ammo > 0 && sq.order.kind !== 'attack' ? 'shoot' : 'form';
      const lx = sq.layout.slots[s.slotIdx * 2], lz = sq.layout.slots[s.slotIdx * 2 + 1];
      const cos = Math.cos(sq.facing), sin = Math.sin(sq.facing);
      goalX = sq.anchor.x + cos * lx + sin * lz;
      goalZ = sq.anchor.z - sin * lx + cos * lz;
      const dGoal = dist(s.x, s.z, goalX, goalZ);
      if (dGoal > 0.6) { wantMove = true; speed *= sq.form.speed; }
      // kite individuale (arcieri a cavallo / numidi)
      if (t.kite) {
        const near = this.nearestEnemySoldier(s, t.cat === 'horseArcher' ? 26 : 13);
        if (near) {
          const away = angleTo(near.x, near.z, s.x, s.z);
          goalX = s.x + Math.sin(away) * 12; goalZ = s.z + Math.cos(away) * 12;
          wantMove = true;
        }
      }
      s.facing = turnToward(s.facing, sq.facing, 4 * dt);
    }

    if (wantMove) this._moveSoldier(s, goalX, goalZ, speed, dt, false);
    else {
      // separazione leggera da fermo
      this._separate(s, dt);
    }

    // uscita / salvataggio (missioni di ritirata)
    const prim = this.mission.objectives.primary;
    if (prim.type === 'retreat' || prim.type === 'capture_then_retreat') {
      if (prim.exit && sq.side === 0 && (prim.type === 'retreat' || this.retreatStage2)) {
        if (dist2(s.x, s.z, prim.exit.x, prim.exit.z) < prim.exit.r * prim.exit.r) {
          s.state = 'saved'; this.stats.saved++;
          sq.aliveCount = Math.max(0, sq.aliveCount - 1);
        }
      }
    }
  }

  _moveSoldier(s, gx, gz, speed, dt, fleeing) {
    const t = s.type;
    let dx = gx - s.x, dz = gz - s.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.05) return;
    dx /= d; dz /= d;

    // separazione + ostacoli
    const buf = this._sbuf || (this._sbuf = []);
    this.query(s.x, s.z, 1.4, buf);
    let px = 0, pz = 0;
    for (const o of buf) {
      if (o === s || o.state === 'dead') continue;
      const ox = s.x - o.x, oz = s.z - o.z;
      const od2 = ox * ox + oz * oz;
      const minD = (t.size + o.type.size) * 0.42;
      if (od2 < minD * minD && od2 > 0.0001) {
        const od = Math.sqrt(od2);
        const push = (minD - od) / minD;
        px += (ox / od) * push; pz += (oz / od) * push;
      }
    }
    for (const ob of this.terrain.obstacles) {
      const ox = s.x - ob.x, oz = s.z - ob.z;
      const rr = ob.r + t.size * 0.4;
      const od2 = ox * ox + oz * oz;
      if (od2 < rr * rr && od2 > 0.0001) {
        const od = Math.sqrt(od2);
        const push = (rr - od) / rr * 2.2;
        px += (ox / od) * push; pz += (oz / od) * push;
      }
    }

    let vx = dx + px * 1.6, vz = dz + pz * 1.6;
    const vl = Math.sqrt(vx * vx + vz * vz) || 1;
    vx /= vl; vz /= vl;

    // terreno
    let sp = speed;
    const slope = this.terrain.getSlope(s.x, s.z);
    sp /= 1 + slope * 0.9;
    if (this.terrain.inWater(s.x, s.z)) sp *= 0.4;
    else if (this.terrain.isForest(s.x, s.z)) sp *= 0.82;
    if (t.cat === 'phalanx' && slope > 0.3) sp *= 0.65;

    const step = Math.min(sp * dt, d);
    s.x += vx * step; s.z += vz * step;
    this.terrain.clampToBounds(s, 6);
    s.y = this.terrain.getHeight(s.x, s.z);
    s.walkPhase += sp * dt * 2.6;
    s.moving = true;
    if (!fleeing && s.state === 'form') s.facing = turnToward(s.facing, Math.atan2(vx, vz), 5 * dt);
    else if (fleeing) s.facing = Math.atan2(vx, vz);
  }

  _separate(s, dt) {
    const buf = this._sbuf2 || (this._sbuf2 = []);
    this.query(s.x, s.z, 1.0, buf);
    let px = 0, pz = 0;
    for (const o of buf) {
      if (o === s || o.state === 'dead') continue;
      const ox = s.x - o.x, oz = s.z - o.z;
      const od2 = ox * ox + oz * oz;
      const minD = (s.type.size + o.type.size) * 0.4;
      if (od2 < minD * minD && od2 > 0.0001) {
        const od = Math.sqrt(od2);
        px += (ox / od) * (minD - od); pz += (oz / od) * (minD - od);
      }
    }
    if (px || pz) {
      s.x += px * dt * 4; s.z += pz * dt * 4;
      s.y = this.terrain.getHeight(s.x, s.z);
    }
  }

  // ---------------- danni ----------------
  _meleeHit(a, d) {
    const as = a.squad, ds = d.squad;
    let atk = a.type.atk * as.form.atk * 1.4;
    if (as.side === 0) atk *= as.vet.atk * (this._nearGeneral(as, 0) ? this.opts.general.meleeBonus : 1);
    else atk *= this.diffMul.enemyAtk;
    atk *= 1 - as.fatigue / 260;
    if (as.chargeT > 0) atk *= a.type.charge * as.form.charge * 0.75;
    if (as.atkBoostT > 0) atk *= 1.3;
    if (ds.state === 'rout') atk *= 1.5;

    // fianco
    const angFromDef = angleTo(d.x, d.z, a.x, a.z);
    const rel = Math.abs(angleDiff(d.facing, angFromDef));
    let flank = 1;
    if (rel > 1.9) flank = a.type.mounted ? 1.6 : 1.3;
    // elevazione
    const elev = a.y > d.y + 1.4 ? 1.15 : 1;

    let def = d.type.def * ds.form.def;
    if (ds.type.cat === 'phalanx') {
      if (rel < 1.0) def *= 1.5;
      if (this.terrain.getSlope(d.x, d.z) > 0.3) def *= 0.5; // falange rotta dal terreno
    }
    if (this.terrain.inWater(d.x, d.z)) def *= 0.7;
    def = Math.max(0, def - a.type.pierce);

    const dmg = Math.max(1, atk * flank * elev * (0.85 + this.rng() * 0.3) - def * 0.42);
    d.hp -= dmg;
    if (this.sfx) this.sfx.clash(as.chargeT > 0 ? 2 : 1);
    if (this.fx && this.rng() < 0.3) this.fx.blood(d.x, d.z, d.y + 1);
    if (d.hp <= 0) this._kill(d, a);
  }

  _missileDamage(shooter, victim) {
    const vs = victim.squad;
    let dmg = shooter.type.missile.dmg * 1.18;
    if (shooter.squad.side === 0) dmg *= shooter.squad.vet.atk;
    else dmg *= this.diffMul.enemyAtk;
    let mul = vs.form.missileDef;
    if (victim.type.shield && vs.formation !== 'testudo') mul *= 0.78;
    if (this.terrain.isForest(victim.x, victim.z)) mul *= 0.6;
    if (vs.state === 'rout') mul *= 1.2;
    return Math.max(1, dmg * mul * (0.85 + this.rng() * 0.3) - victim.type.def * 0.12);
  }

  applyMissileHit(victim, dmg) {
    if (victim.state === 'dead' || victim.state === 'saved' || victim.state === 'escaped') return;
    victim.hp -= dmg;
    if (this.fx && this.rng() < 0.25) this.fx.blood(victim.x, victim.z, victim.y + 1);
    if (victim.hp <= 0) this._kill(victim, null);
  }

  _kill(d, killer) {
    if (d.state === 'dead') return;
    d.state = 'dead'; d.deadT = 0; d.target = -1;
    d.squad.recentLosses += 1;
    d.squad.morale -= 1.6 / d.type.disc;
    this.stats.losses[d.squad.side]++;
    if (killer) {
      killer.squad.recentKills += 1;
      this.stats.kills[killer.squad.side]++;
    } else {
      this.stats.kills[1 - d.squad.side]++;
    }
    if (d.squad.isGeneral) d.squad.morale = 0;
  }

  _checkCollapse() {
    for (const side of [0, 1]) {
      if (this.collapse[side]) continue;
      let hp = 0, max = 0, fighting = 0, total = 0;
      for (const sq of this.squads) {
        if (sq.side !== side || sq.type.id === 'salmerie') continue;
        if (sq.state === 'gone' || sq.aliveCount <= 0) continue;
        total++;
        if (sq.state === 'fight') fighting++;
        for (const s of sq.soldiers) {
          if (s.state === 'dead' || s.state === 'saved' || s.state === 'escaped') continue;
          hp += Math.max(0, s.hp); max += s.maxHp;
        }
      }
      if (max <= 0 || total <= 0) continue; // tutti in salvo o usciti: nessun collasso
      const strength = hp / max;
      if (total > 0 && (strength < 0.16 || (fighting === 0 && strength < 0.4))) {
        this.collapse[side] = true;
        this.pushEvent(side === 0 ? 'L\'esercito romano è collassato!' : 'L\'esercito nemico è collassato!', side === 0 ? 'bad' : 'good');
      }
    }
  }

  armyStrength(side) {
    let hp = 0, max = 0;
    for (const sq of this.squads) {
      if (sq.side !== side || sq.state === 'gone') continue;
      for (const s of sq.soldiers) {
        if (s.state === 'saved' || s.state === 'escaped') continue;
        hp += Math.max(0, s.hp); max += s.maxHp;
      }
    }
    return max > 0 ? hp / max : 0;
  }

  aliveSoldiers(side) {
    let n = 0;
    for (const s of this.soldiers) if (s.squad.side === side && s.state !== 'dead' && s.state !== 'saved' && s.state !== 'escaped') n++;
    return n;
  }

  // Rinforzi del giocatore (missioni di sopravvivenza).
  spawnReinforcements(spec) {
    const spawn = spec.spawn;
    const facing = Math.PI;
    spec.squads.forEach((s, i) => {
      const sq = this._makeSquad(0, 'roma', s.t, s.n, s.role || 'line', { x: spawn.x + (i - (spec.squads.length - 1) / 2) * 16, z: spawn.z + (i % 2) * 10 }, facing);
      const enemy = this._nearestEnemySquad(sq, 500);
      if (enemy) this.orderAttackMove(sq, enemy.anchor.x, enemy.anchor.z);
      if (this.onReinforcement) this.onReinforcement(sq);
    });
  }
}
