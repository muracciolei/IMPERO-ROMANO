// ============================================================
// IMPERO ROMANO — Obiettivi di missione.
// Ogni battaglia ha condizioni di vittoria/sconfitta proprie:
// annientamento, difesa, assalto, ritirata, scorta, attraversamento,
// imboscata, sopravvivenza con rinforzi, conquista di posizioni.
// ============================================================

import { dist2 } from '../core/RNG.js';

export function describePrimary(p) {
  switch (p.type) {
    case 'annihilate': return { title: 'Annienta l\'esercito nemico', desc: 'Metti in rotta o distruggi la maggior parte delle forze nemiche.' };
    case 'assault': return { title: 'Espugna il campo nemico', desc: 'Distruggi le tende del comando e gli edifici fortificati del campo.' };
    case 'defend': return { title: `Difendi la posizione per ${Math.round(p.time / 60)} min`, desc: 'Tieni la zona indicata: nessun nemico deve controllarla a lungo.' };
    case 'survive': return { title: `Resisti per ${Math.round(p.time / 60)} min`, desc: 'Sopravvivi fino all\'arrivo dei rinforzi, poi contrattacca.' };
    case 'kill_general': return { title: 'Elimina il comandante nemico', desc: 'Uccidi il generale nemico: il suo esercito si sbanderà.' };
    case 'capture': return { title: 'Conquista la posizione', desc: `Occupa la zona indicata per ${p.holdTime || p.time} secondi consecutivi.` };
    case 'capture_then_retreat': return { title: 'Prendi l\'altura, poi ritira in ordine', desc: `Occupala per ${p.holdTime}s, poi porta almeno il ${Math.round(p.fraction * 100)}% dell'esercito all'uscita.` };
    case 'retreat': return { title: `Ritira almeno il ${Math.round(p.fraction * 100)}% dell'esercito`, desc: 'Porta i soldati alla zona di uscita. Non è una sconfitta: è salvare l\'esercito.' };
    case 'escort': return { title: `Scorta almeno ${p.minConvoys} carri del convoglio al porto`, desc: 'I carri seguono la strada da soli: proteggili dai razziatori.' };
    case 'cross': return { title: `Attraversa il fiume con il ${Math.round(p.fraction * 100)}% dell'esercito`, desc: `Porta le truppe oltre il fiume e mantieni la testa di ponte per ${p.hold}s.` };
    case 'ambush': return { title: `Distruggi il ${Math.round(p.fraction * 100)}% della colonna nemica`, desc: 'Intercetta la colonna in marcia prima che sfili via.' };
    default: return { title: 'Completa la missione', desc: '' };
  }
}

export function describeSecondary(s) {
  switch (s.type) {
    case 'losses_below': return `Perdite inferiori al ${Math.round(s.v * 100)}%`;
    case 'kill_general': return 'Elimina il generale nemico';
    case 'time_below': return `Vinci entro ${Math.round(s.v / 60)} minuti`;
    case 'save_fraction': return `Salva almeno il ${Math.round(s.v * 100)}% dell'esercito`;
    default: return 'Obiettivo secondario';
  }
}

export class Objectives {
  constructor(sim, mission) {
    this.sim = sim;
    this.mission = mission;
    this.prim = JSON.parse(JSON.stringify(mission.objectives.primary));
    this.secondaries = (mission.objectives.secondary || []).map((s) => ({ ...s, done: false }));
    this.status = 'active';
    this.timer = 0;          // tempo di controllo zona / sopravvivenza
    this.zoneLostT = 0;
    this.holdT = 0;
    this.stage = 1;
    this.prim.stage = 1;
    this.checkAcc = 0;
    this.progressText = '';
    this.reinforced = false;
    this.totalConvoys = sim.squads.filter((s) => s.role === 'convoy').length;
    this.initialEnemy = sim.initialCount[1];
    this.initialPlayer = sim.initialCount[0];
  }

  zoneCounts(zone) {
    let romans = 0, enemies = 0;
    for (const s of this.sim.soldiers) {
      if (s.state === 'dead' || s.state === 'saved' || s.state === 'escaped') continue;
      if (dist2(s.x, s.z, zone.x, zone.z) < zone.r * zone.r) {
        if (s.squad.side === 0) romans++; else enemies++;
      }
    }
    return { romans, enemies };
  }

  update(dt) {
    if (this.status !== 'active') return this.status;
    this.checkAcc += dt;
    if (this.checkAcc < 0.25) return this.status;
    const step = this.checkAcc;
    this.checkAcc = 0;
    const sim = this.sim;
    const p = this.prim;

    // sconfitta comune: collasso dell'esercito romano (eccetto ritirata)
    if (sim.collapse[0] && p.type !== 'retreat' && !(p.type === 'capture_then_retreat' && this.stage === 2)) {
      return this._lose('L\'esercito romano è stato distrutto.');
    }

    switch (p.type) {
      case 'annihilate': {
        if (sim.collapse[1]) return this._win();
        this.progressText = `Forze nemiche: ${Math.round(sim.armyStrength(1) * 100)}%`;
        break;
      }
      case 'kill_general': {
        if (sim.enemyGeneral.state === 'dead') return this._win();
        break;
      }
      case 'assault': {
        const objs = sim.terrain.structures.filter((s) => s.objective);
        const left = objs.filter((s) => !s.destroyed).length;
        this.progressText = `Strutture: ${objs.length - left}/${objs.length}`;
        if (left === 0 && objs.length > 0) return this._win();
        break;
      }
      case 'defend': {
        const { romans, enemies } = this.zoneCounts(p.zone);
        const controlled = romans > 0 && enemies === 0;
        const lost = enemies > romans;
        if (controlled) this.timer += step;
        if (lost) this.zoneLostT += step; else this.zoneLostT = Math.max(0, this.zoneLostT - step * 2);
        this.progressText = `Controllo: ${Math.min(100, Math.round((this.timer / p.time) * 100))}%`;
        if (this.timer >= p.time) return this._win();
        if (this.zoneLostT > 45) return this._lose('La posizione è caduta in mano nemica.');
        break;
      }
      case 'capture': {
        const { romans, enemies } = this.zoneCounts(p.zone);
        if (romans > 0 && enemies === 0) this.holdT += step; else this.holdT = 0;
        this.progressText = `Occupazione: ${Math.round(this.holdT)}/${p.holdTime || p.time}s`;
        if (this.holdT >= (p.holdTime || p.time)) return this._win();
        break;
      }
      case 'capture_then_retreat': {
        if (this.stage === 1) {
          const { romans, enemies } = this.zoneCounts(p.zone);
          if (romans > 0 && enemies === 0) this.holdT += step; else this.holdT = Math.max(0, this.holdT - step);
          this.progressText = `Altura: ${Math.round(this.holdT)}/${p.holdTime}s`;
          if (this.holdT >= p.holdTime) {
            this.stage = 2; p.stage = 2;
            sim.retreatStage2 = true;
            sim.pushEvent('Posizione presa! Ora ritirate in ordine verso sud!', 'good');
          }
        } else {
          const needed = Math.ceil(this.initialPlayer * p.fraction);
          this.progressText = `In salvo: ${sim.stats.saved}/${needed}`;
          if (sim.stats.saved >= needed) return this._win();
          const potential = sim.stats.saved + sim.aliveSoldiers(0);
          if (potential < needed) return this._lose('Troppi soldati perduti: la ritirata è fallita.');
        }
        break;
      }
      case 'survive': {
        if (this.stage === 1) {
          this.timer += step;
          this.progressText = `Rinforzi tra ${Math.max(0, Math.ceil(p.time - this.timer))}s`;
          if (this.timer >= p.time && !this.reinforced) {
            this.reinforced = true;
            if (p.reinforcements) {
              sim.spawnReinforcements(p.reinforcements);
              sim.pushEvent(p.reinforcements.label || 'I rinforzi sono arrivati!', 'good');
            }
            this.stage = 2;
            if (p.then === 'assault') {
              this.prim = { type: 'assault', camp: p.camp };
              sim.pushEvent('Ora espugnate il campo nemico!', 'info');
            } else {
              this.prim = { type: 'annihilate' };
              sim.pushEvent('Contrattaccate! Annientate il nemico!', 'info');
            }
          }
        } else {
          // seconda fase: gestita dal nuovo obiettivo primario
          return this.update(step);
        }
        break;
      }
      case 'retreat': {
        const needed = Math.ceil(this.initialPlayer * p.fraction);
        this.progressText = `In salvo: ${sim.stats.saved}/${needed}`;
        if (sim.stats.saved >= needed) return this._win();
        const potential = sim.stats.saved + sim.aliveSoldiers(0);
        if (potential < needed) return this._lose('Troppi soldati perduti: la ritirata è fallita.');
        break;
      }
      case 'escort': {
        let saved = 0, lost = 0;
        for (const sq of sim.squads) {
          if (sq.role !== 'convoy') continue;
          if (sq.state === 'gone') saved++;
          else if (sq.state === 'dead') lost++;
        }
        this.progressText = `Carri in salvo: ${saved}/${this.totalConvoys} (perduti: ${lost})`;
        if (saved >= p.minConvoys) return this._win();
        if (lost > this.totalConvoys - p.minConvoys) return this._lose('Il convoglio è stato distrutto.');
        break;
      }
      case 'cross': {
        const linePos = p.line.pos;
        let across = 0;
        for (const s of sim.soldiers) {
          if (s.squad.side !== 0 || s.state === 'dead' || s.state === 'saved') continue;
          if (p.line.axis === 'z' ? s.z < linePos : s.x < linePos) across++;
        }
        const frac = across / this.initialPlayer;
        if (frac >= p.fraction) this.holdT += step; else this.holdT = Math.max(0, this.holdT - step * 1.5);
        this.progressText = `Oltre il fiume: ${Math.round(frac * 100)}% · testa di ponte ${Math.round(this.holdT)}/${p.hold}s`;
        if (this.holdT >= p.hold) return this._win();
        break;
      }
      case 'ambush': {
        let routed = 0;
        for (const s of sim.soldiers) if (s.squad.side === 1 && s.state === 'rout') routed++;
        const neutralized = sim.stats.losses[1] + routed;
        const frac = neutralized / this.initialEnemy;
        const escapedFrac = sim.stats.escaped / this.initialEnemy;
        this.progressText = `Colonna neutralizzata: ${Math.round(frac * 100)}% · fuggiti: ${Math.round(escapedFrac * 100)}%`;
        if (frac >= p.fraction) return this._win();
        if (escapedFrac >= p.escapeLimit) return this._lose('La colonna nemica è sfilata via.');
        if (sim.collapse[0]) return this._lose('L\'esercito romano è stato distrutto.');
        break;
      }
    }
    return this.status;
  }

  evaluateSecondaries(victory) {
    const sim = this.sim;
    for (const s of this.secondaries) {
      switch (s.type) {
        case 'losses_below': s.done = victory && sim.stats.losses[0] / this.initialPlayer <= s.v; break;
        case 'kill_general': s.done = sim.enemyGeneral.state === 'dead'; break;
        case 'time_below': s.done = victory && sim.time <= s.v; break;
        case 'save_fraction': s.done = victory && sim.stats.saved / this.initialPlayer >= s.v; break;
      }
    }
    return this.secondaries;
  }

  _win() { this.status = 'won'; return this.status; }
  _lose(reason) { this.status = 'lost'; this.loseReason = reason; return this.status; }
}
