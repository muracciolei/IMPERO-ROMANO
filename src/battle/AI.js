// ============================================================
// IMPERO ROMANO — IA del comandante nemico.
// Difesa posizioni, attacco quando in vantaggio, ritirata quando
// in inferiorità, cavalleria che aggira, protezione degli arcieri,
// riserve impegnate al momento giusto, reazione alle formazioni.
// ============================================================

import { dist, dist2, clamp } from '../core/RNG.js';

export class EnemyAI {
  constructor(sim, mission) {
    this.sim = sim;
    this.mission = mission;
    this.cfg = mission.enemy.ai || {};
    this.aggression = (this.cfg.aggression ?? 0.6) * sim.diffMul.ai;
    this.timer = 1.2;
    this.battleT = 0;
    this.ambushTriggered = !this.cfg.ambush;
    this.waveIdx = 0;
    this.waveTimer = 30;
    this.outerSpawned = false;
    this.defensiveSpots = new Map();
    this._initDefensiveSpots();
  }

  _initDefensiveSpots() {
    // punti elevati vicini allo schieramento per chi difende
    for (const sq of this.sim.squads) {
      if (sq.side !== 1) continue;
      if (sq.role === 'defend' || this.cfg.defend) {
        let best = { x: sq.anchor.x, z: sq.anchor.z }, bestH = this.sim.terrain.getHeight(sq.anchor.x, sq.anchor.z);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const x = sq.anchor.x + Math.sin(a) * 18, z = sq.anchor.z + Math.cos(a) * 18;
          const h = this.sim.terrain.getHeight(x, z);
          if (h > bestH + 1.5 && this.sim.terrain.inBounds(x, z, 20)) { bestH = h; best = { x, z }; }
        }
        this.defensiveSpots.set(sq.id, best);
      }
    }
  }

  playerInfo() {
    const sim = this.sim;
    let cx = 0, cz = 0, n = 0, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    let missile = null, general = null, weakest = null, testudoCount = 0, engagedCount = 0;
    for (const sq of sim.squads) {
      if (sq.side !== 0 || sq.state === 'dead' || sq.state === 'gone' || sq.aliveCount <= 0) continue;
      if (sq.type.id === 'salmerie') continue;
      cx += sq.anchor.x; cz += sq.anchor.z; n++;
      minX = Math.min(minX, sq.anchor.x - sq.width / 2); maxX = Math.max(maxX, sq.anchor.x + sq.width / 2);
      minZ = Math.min(minZ, sq.anchor.z); maxZ = Math.max(maxZ, sq.anchor.z);
      if (sq.type.cat === 'missile' && !missile) missile = sq;
      if (sq.isGeneral) general = sq;
      if (sq.formation === 'testudo') testudoCount++;
      if (sq.order.kind === 'attack' || sq.order.kind === 'attackmove') engagedCount++;
      if (!weakest || sq.aliveCount / sq.n0 < weakest.aliveCount / weakest.n0) weakest = sq;
    }
    if (n === 0) return null;
    return { cx: cx / n, cz: cz / n, n, minX, maxX, minZ, maxZ, missile, general, weakest, testudoCount, engagedCount, width: maxX - minX };
  }

  ownInfo() {
    let lineMorale = 0, lineN = 0, cx = 0, cz = 0, n = 0;
    for (const sq of this.sim.squads) {
      if (sq.side !== 1 || sq.state === 'dead' || sq.state === 'gone' || sq.aliveCount <= 0) continue;
      cx += sq.anchor.x; cz += sq.anchor.z; n++;
      if (sq.role === 'line' || sq.role === 'defend') { lineMorale += sq.morale; lineN++; }
    }
    return { cx: n ? cx / n : 0, cz: n ? cz / n : 0, n, lineMorale: lineN ? lineMorale / lineN : 100 };
  }

  update(dt) {
    this.battleT += dt;
    this.timer -= dt;

    // imboscata: scatta quando il giocatore è vicino o dopo un po'
    if (!this.ambushTriggered) {
      const pi = this.playerInfo();
      if (pi) {
        for (const sq of this.sim.squads) {
          if (sq.side === 1 && sq.state === 'fight' && dist2(sq.anchor.x, sq.anchor.z, pi.cx, pi.cz) < 70 * 70) {
            this.ambushTriggered = true;
            this.sim.pushEvent('Imboscata! Il nemico attacca da ogni lato!', 'bad');
            break;
          }
        }
        if (this.battleT > 14) this.ambushTriggered = true;
      }
    }

    // ondate (Milazzo): riserve impegnate in sequenza
    if (this.cfg.waves) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.waveTimer = 42;
        const reserves = this.sim.squads.filter((s) => s.side === 1 && s.role === 'reserve' && s.state === 'fight' && s.aiState !== 'committed');
        if (reserves.length) {
          const sq = reserves[0];
          sq.aiState = 'committed';
          this.sim.pushEvent('Una nuova ondata cartaginese sbarca!', 'warn');
        }
      }
    }

    if (this.timer > 0) return;
    this.timer = 0.55 / clamp(this.sim.diffMul.ai, 0.6, 1.5) + Math.random() * 0.25;

    const pi = this.playerInfo();
    const oi = this.ownInfo();
    if (!pi) return;
    const pStr = this.sim.armyStrength(0);
    const eStr = this.sim.armyStrength(1);
    const ratio = eStr / Math.max(0.05, pStr);
    const sim = this.sim;

    for (const sq of sim.squads) {
      if (sq.side !== 1 || sq.state !== 'fight' || sq.aliveCount <= 0) continue;
      if (sq.role === 'column' || sq.role === 'convoy') continue;
      sq.aiTimer -= 0.6;
      if (sq.aiTimer > 0) continue;
      sq.aiTimer = Math.random() * 0.4;

      // ritirata organizzata se il morale è basso
      if (sq.morale < 30 && !sq.isGeneral && sq.aiState !== 'retreating') {
        sq.aiState = 'retreating';
        const half = sim.terrain.half;
        sim.orderMove(sq, sq.anchor.x * 0.7, -half + 16);
        continue;
      }
      if (sq.aiState === 'retreating') {
        if (sq.morale > 58) { sq.aiState = 'hold'; }
        else continue;
      }

      const t = sq.type;

      // ---- GENERALE: resta dietro la linea ----
      if (sq.isGeneral) {
        const threat = this._nearestPlayerSquad(sq, 24);
        if (threat) {
          sim.orderMove(sq, oi.cx * 0.4 + sq.anchor.x * 0.6, Math.min(sq.anchor.z - 14, -sim.terrain.half * 0.45));
        } else if (dist2(sq.anchor.x, sq.anchor.z, oi.cx, oi.cz - 20) > 400) {
          sim.orderMove(sq, oi.cx, oi.cz - 18);
        } else sim.orderHold(sq);
        continue;
      }

      // ---- ARCIERI / FROMBOLIERI: dietro la linea, fuggono se minacciati ----
      if (t.cat === 'missile') {
        const threat = this._nearestPlayerSquad(sq, 20);
        if (threat) {
          const awayX = sq.anchor.x + (sq.anchor.x - threat.anchor.x) * 0.8;
          const awayZ = Math.min(-sim.terrain.half * 0.35, sq.anchor.z - 16);
          sim.orderMove(sq, awayX, awayZ);
        } else {
          const spotZ = Math.min(oi.cz - 16, pi.cz - 34);
          if (dist2(sq.anchor.x, sq.anchor.z, pi.cx, spotZ) > 220) sim.orderMove(sq, pi.cx + (sq.anchor.x - oi.cx) * 0.7, spotZ);
          else sim.orderHold(sq);
        }
        // non sprecare frecce contro la testuggine
        sq.holdFire = pi.testudoCount > pi.n * 0.5;
        continue;
      }

      // ---- SCHERMAGLIATORI / KITE: molestano e si sottraggono ----
      if (sq.role === 'skirmish' || t.kite) {
        const target = this._nearestPlayerSquad(sq, 600) || pi.weakest;
        if (target) sim.orderAttack(sq, target);
        continue;
      }

      // ---- CAVALLERIA: aggira e carica le retrovie ----
      if (t.mounted && (sq.role === 'flankL' || sq.role === 'flankR')) {
        this._cavalryLogic(sq, pi, oi, ratio);
        continue;
      }

      // ---- RISERVE ----
      if (sq.role === 'reserve' && sq.aiState !== 'committed') {
        const commit = pStr < 0.6 || oi.lineMorale < 46 || (this.battleT > 100 && this.aggression > 0.7) || ratio > 1.5;
        if (commit && this.ambushTriggered) {
          sq.aiState = 'committed';
          sim.pushEvent('Il nemico impegna le riserve!', 'warn');
        } else { sim.orderHold(sq); continue; }
      }

      // ---- DIFENSORI ----
      if (sq.role === 'defend' || (this.cfg.defend && sq.role === 'line')) {
        const spot = this.defensiveSpots.get(sq.id);
        const sortie = pStr < 0.42 || ratio > 1.7 || (this.cfg.twoFronts && this.battleT > 40);
        if (sortie && this.ambushTriggered) {
          const target = pi.weakest || pi.missile;
          if (target) sim.orderAttackMove(sq, target.anchor.x, target.anchor.z);
        } else if (spot && dist2(sq.anchor.x, sq.anchor.z, spot.x, spot.z) > 36) {
          sim.orderMove(sq, spot.x, spot.z);
        } else {
          sim.orderHold(sq);
          if (sq.formation !== 'difensiva' && t.cat !== 'phalanx' && !t.mounted) sim.setFormation(sq, 'difensiva');
        }
        continue;
      }

      // ---- FANTERIA DI LINEA ----
      if (!this.ambushTriggered) { sim.orderHold(sq); continue; }
      const shouldAttack = this.aggression > 0.5 || ratio > 0.85 || pi.engagedCount > 0 || this.battleT > 45;
      if (shouldAttack) {
        // preferisci unità in testuggine per la cavalleria, altrimenti il bersaglio più vicino
        let target = this._nearestPlayerSquad(sq, 600);
        if (t.mounted && pi.testudoCount > 0) {
          const test = sim.squads.find((s) => s.side === 0 && s.formation === 'testudo' && s.state === 'fight' && s.aliveCount > 0);
          if (test) target = test;
        }
        if (target) {
          if (this.cfg.encircle && sq.role === 'line') {
            // Canne: il centro avanza lento, i fianchi avvolgono
            sim.orderAttackMove(sq, target.anchor.x, target.anchor.z + 6);
          } else {
            sim.orderAttack(sq, target);
          }
        }
      } else {
        sim.orderHold(sq);
      }
    }
  }

  _cavalryLogic(sq, pi, oi, ratio) {
    const sim = this.sim;
    if (!sq.aiState || sq.aiState === 'hold') sq.aiState = 'flankMove';

    if (sq.aiState === 'flankMove') {
      if (!sq.flankPoint) {
        const sign = sq.role === 'flankL' ? -1 : 1;
        // scegli il lato con meno cavalleria romana
        let leftCav = 0, rightCav = 0;
        for (const p of sim.squads) {
          if (p.side !== 0 || !p.type.mounted || p.state === 'dead' || p.aliveCount <= 0) continue;
          if (p.anchor.x < pi.cx) leftCav++; else rightCav++;
        }
        const weakSign = leftCav <= rightCav ? -1 : 1;
        const useSign = Math.random() < 0.65 ? weakSign : sign;
        sq.flankPoint = { x: pi.cx + useSign * (pi.width / 2 + 38), z: pi.cz + 14 };
        sq.flankT = 0;
      }
      sq.flankT += 0.6;
      const d = dist(sq.anchor.x, sq.anchor.z, sq.flankPoint.x, sq.flankPoint.z);
      if (d < 14 || sq.flankT > 26) {
        sq.aiState = 'charge';
      } else {
        sim.orderMove(sq, sq.flankPoint.x, sq.flankPoint.z);
        if (sq.formation !== 'colonna') sim.setFormation(sq, 'colonna');
      }
      return;
    }

    if (sq.aiState === 'charge') {
      // bersaglio: arcieri, generale, o retrovia della linea
      let target = pi.missile && pi.missile.state === 'fight' ? pi.missile : null;
      if (!target && pi.general && pi.general.state === 'fight' && Math.random() < 0.3) target = pi.general;
      if (!target) target = this._nearestPlayerSquad(sq, 600);
      if (target) {
        if (sq.formation !== 'cavalleria') sim.setFormation(sq, 'cavalleria');
        sim.orderAttack(sq, target);
        // punto di carica: retro del bersaglio
        if (dist(sq.anchor.x, sq.anchor.z, target.anchor.x, target.anchor.z) < 30) {
          const rearX = target.anchor.x - Math.sin(target.facing) * -8;
          const rearZ = target.anchor.z - Math.cos(target.facing) * -8;
          sq.order.x = rearX; sq.order.z = rearZ;
        }
      }
      if (sq.morale < 34 || sq.aliveCount < sq.n0 * 0.3) {
        sq.aiState = 'rally';
        sim.orderMove(sq, oi.cx + (sq.role === 'flankL' ? -40 : 40), -sim.terrain.half * 0.55);
      }
      return;
    }

    if (sq.aiState === 'rally') {
      if (sq.morale > 60 && sq.aliveCount > sq.n0 * 0.35) {
        sq.aiState = 'flankMove'; sq.flankPoint = null;
      }
    }
  }

  _nearestPlayerSquad(sq, r) {
    let best = null, bestD = r * r;
    for (const p of this.sim.squads) {
      if (p.side !== 0 || p.state === 'dead' || p.state === 'gone' || p.aliveCount <= 0) continue;
      if (p.type.id === 'salmerie') continue;
      const d = dist2(sq.anchor.x, sq.anchor.z, p.anchor.x, p.anchor.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }
}
