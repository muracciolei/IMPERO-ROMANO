// ============================================================
// IMPERO ROMANO — Schermate e flusso di gioco.
// Menu, mappa strategica, briefing, legioni/progressione,
// battaglie personalizzate, impostazioni, risultati, ricompense.
// ============================================================

import { MISSIONS, PHASES, missionById, missionIndex } from '../data/Missions.js';
import { UNITS, FACTIONS, PROG_CATS, VET_LEVELS, VET_XP, progressionCat } from '../data/Units.js';
import { Save, GENERAL_TITLES, GENERAL_XP_LEVELS, generalBonuses, vetInfo } from '../core/Save.js';
import { Audio } from '../core/Audio.js';
import { CampaignMap } from './CampaignMap.js';
import { REGIONS } from '../data/Regions.js';
import { Battle } from '../battle/Battle.js';
import { describePrimary, describeSecondary } from '../battle/Objectives.js';
import { makeRNG } from '../core/RNG.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'map', 'briefing', 'legions', 'battles', 'settings', 'result', 'rewards'];
const provinceText = (n) => `${n} ${n === 1 ? 'provincia' : 'province'}`;

let currentBattle = null;
let currentMission = null;
let map = null;
let lastResult = null;

export const Screens = {
  init() {
    this._wireMenu();
    this._wireMap();
    this._wireSettings();
    this._wireLegions();
    this._wireBattles();
    this.refreshMenu();
    this.show('menu');
    // musica al primo gesto
    const startMusic = () => {
      Audio.ensure();
      if (!currentBattle) Audio.startMenuMusic();
      window.removeEventListener('pointerdown', startMusic);
      window.removeEventListener('keydown', startMusic);
    };
    window.addEventListener('pointerdown', startMusic);
    window.addEventListener('keydown', startMusic);
  },

  show(name) {
    for (const s of SCREENS) {
      const el = $(`screen-${s}`);
      if (el) el.classList.toggle('hidden', s !== name);
    }
    document.body.classList.toggle('in-battle', name === 'none');
    if (map) { if (name === 'map') map.start(); else map.stop(); }
    if (name !== 'none' && !currentBattle && Audio.ctx) Audio.startMenuMusic();
  },

  toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), 2400);
  },

  // ================= MENU =================
  _wireMenu() {
    $('btn-new-campaign').addEventListener('click', () => {
      Audio.confirm();
      if (Save.hasCampaign()) {
        if (!confirm('Esiste già una campagna. Iniziarne una nuova cancellerà i progressi attuali. Continuare?')) return;
      }
      Save.newCampaign();
      this.toast('Nuova campagna iniziata. Roma ti attende, comandante.');
      this.openMap(true);
    });
    $('btn-continue').addEventListener('click', () => { Audio.confirm(); this.openMap(true); });
    $('btn-campaign').addEventListener('click', () => { Audio.confirm(); this.openMap(false); });
    $('btn-battles').addEventListener('click', () => { Audio.confirm(); this.openBattles(); });
    $('btn-legions').addEventListener('click', () => { Audio.confirm(); this.openLegions('legioni'); });
    $('btn-progression').addEventListener('click', () => { Audio.confirm(); this.openLegions('progressione'); });
    $('btn-settings').addEventListener('click', () => { Audio.confirm(); this.openSettings('menu'); });
  },

  refreshMenu() {
    const has = Save.hasCampaign();
    $('btn-continue').disabled = !has;
    const prog = Save.campaignProgress();
    $('menu-progress').textContent = has ? `Campagna: ${prog.done}/${prog.total} battaglie · ${provinceText(Save.romanRegions().size)}` : 'Nessuna campagna in corso';
  },

  // ================= MAPPA =================
  _wireMap() {
    map = new CampaignMap($('map-canvas'), (mission, index) => {
      if (!Save.isUnlocked(index)) {
        Audio.error();
        this.toast('Battaglia bloccata: completa prima la missione precedente.');
        return;
      }
      Audio.confirm();
      this.openBriefing(mission, index);
    });
    $('map-back').addEventListener('click', () => { Audio.click(); this.refreshMenu(); this.show('menu'); });
    $('map-zoom-in').addEventListener('click', () => { map.view.scale = Math.min(5, map.view.scale * 1.3); });
    $('map-zoom-out').addEventListener('click', () => { map.view.scale = Math.max(0.7, map.view.scale * 0.77); });
    $('map-fit').addEventListener('click', () => map.fitAll());
    $('map-sidebar-toggle').addEventListener('click', () => {
      $('screen-map').classList.toggle('sidebar-open');
      Audio.click();
      setTimeout(() => map.resize(), 120);
    });
  },

  openMap(focusNext) {
    this.show('map');
    map.resize();
    if (this._pendingFlash) { map.flashConquest(this._pendingFlash); this._pendingFlash = null; }
    this._buildMapSidebar();
    const prog = Save.campaignProgress();
    const regions = Save.romanRegions().size;
    $('map-progress').innerHTML = `<b>${prog.done}</b>/${prog.total} battaglie · <b>${regions}</b> ${regions === 1 ? 'provincia romana' : 'province romane'}`;
    // Vista completa: il Mediterraneo intero, senza etichette tagliate ai bordi.
    map.fitAll();
  },

  _buildMapSidebar() {
    const wrap = $('map-phases');
    wrap.innerHTML = '';
    PHASES.forEach((ph, pi) => {
      const ms = MISSIONS.filter((m) => m.phase === pi);
      const done = ms.filter((m) => Save.isCompleted(m.id)).length;
      const sec = document.createElement('div');
      sec.className = 'phase-block';
      sec.innerHTML = `<div class="phase-head" data-phase="${pi}"><span class="phase-num">${ph.icon}</span><div><b>${ph.name}</b><span>${ph.years} · ${done}/${ms.length}</span></div></div>`;
      const list = document.createElement('div');
      list.className = 'phase-missions';
      ms.forEach((m) => {
        const idx = missionIndex(m.id);
        const unlocked = Save.isUnlocked(idx);
        const completed = Save.isCompleted(m.id);
        const item = document.createElement('button');
        item.className = `mission-item ${completed ? 'done' : ''} ${unlocked ? '' : 'locked'}`;
        const stars = completed ? Save.data.completed[m.id].stars : 0;
        item.innerHTML = `<span class="mi-num">${completed ? '✓' : unlocked ? idx + 1 : '🔒'}</span><span class="mi-name">${m.name}</span><span class="mi-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`;
        item.addEventListener('click', () => {
          if (!unlocked) { Audio.error(); this.toast('Completa la missione precedente per sbloccarla.'); return; }
          Audio.confirm();
          this.openBriefing(m, idx);
        });
        list.appendChild(item);
      });
      sec.appendChild(list);
      sec.querySelector('.phase-head').addEventListener('click', () => {
        list.classList.toggle('open');
        map.fitPhase(pi);
        Audio.click();
      });
      wrap.appendChild(sec);
    });
    // apri la fase corrente
    const nextIdx = Save.nextMissionIndex();
    const curPhase = MISSIONS[nextIdx].phase;
    wrap.children[curPhase]?.querySelector('.phase-missions')?.classList.add('open');
  },

  // ================= BRIEFING =================
  openBriefing(mission, index) {
    currentMission = mission;
    this.show('briefing');
    const ph = PHASES[mission.phase];
    $('br-phase').textContent = `${ph.icon} · ${ph.name}`;
    $('br-title').textContent = mission.name;
    $('br-meta').textContent = `${mission.date} · ${mission.place}`;
    $('br-commanders').innerHTML = `<div><span>ROMA</span><b>${mission.commanders.rome}</b></div><div class="vs">VS</div><div><span>${FACTIONS[mission.enemy.faction].name.toUpperCase()}</span><b>${mission.commanders.enemy}</b></div>`;
    $('br-context').textContent = mission.context;
    $('br-hint').textContent = mission.hint;

    const prim = describePrimary(mission.objectives.primary);
    let objHtml = `<div class="br-obj primary"><b>⚑ Obiettivo principale</b><div>${prim.title}</div><span>${prim.desc}</span></div>`;
    for (const s of mission.objectives.secondary || []) {
      objHtml += `<div class="br-obj secondary">☆ ${describeSecondary(s)}</div>`;
    }
    objHtml += `<div class="br-obj defeat">✖ Sconfitta: collasso dell'esercito o fallimento dell'obiettivo.</div>`;
    $('br-objectives').innerHTML = objHtml;

    const armyList = (squads, faction) => {
      const counts = {};
      for (const s of squads) counts[s.t] = (counts[s.t] || 0) + s.n;
      counts.generale = (counts.generale || 0) + 10;
      return Object.entries(counts).map(([t, n]) => `<div class="army-row"><span>${UNITS[t]?.name || t}</span><b>×${n}</b></div>`).join('');
    };
    $('br-army-rome').innerHTML = armyList(mission.player.squads, 'roma');
    $('br-army-enemy').innerHTML = `<div class="army-faction">${FACTIONS[mission.enemy.faction].name}</div>` + armyList(mission.enemy.squads, mission.enemy.faction);

    const completed = Save.isCompleted(mission.id);
    $('br-best').innerHTML = completed
      ? `Miglior risultato: ${'★'.repeat(Save.data.completed[mission.id].stars)}${'☆'.repeat(3 - Save.data.completed[mission.id].stars)} · perdite ${Math.round(Save.data.completed[mission.id].losses * 100)}%`
      : 'Mai combattuta.';

    $('br-start').onclick = () => { Audio.horn(); this.startBattle(mission); };
    $('br-back').onclick = () => { Audio.click(); this.openMap(false); };
  },

  // ================= BATTAGLIA =================
  startBattle(mission) {
    currentMission = mission;
    this.show('none');
    if (currentBattle) { currentBattle.dispose(); currentBattle = null; }
    Audio.stopAll();
    currentBattle = new Battle(mission, {
      onEnd: (result) => {
        lastResult = result;
        currentBattle.dispose();
        currentBattle = null;
        this.openResult(result);
      },
      onAbandon: () => {
        currentBattle.dispose();
        currentBattle = null;
        if (mission.id === 'skirmish') this.show('menu');
        else this.openMap(false);
      },
      onRestart: () => {
        const m = currentMission;
        currentBattle.dispose();
        currentBattle = null;
        this.startBattle(m);
      },
      onSettings: () => this.openSettings('battle'),
    });
    window.__battle = currentBattle; // hook di debug/test
  },

  // ================= RISULTATO =================
  openResult(result) {
    this.show('result');
    const mission = missionById(result.missionId) || currentMission;
    const victory = result.victory;
    $('result-title').textContent = victory ? 'VITTORIA' : 'SCONFITTA';
    $('result-title').className = victory ? 'victory' : 'defeat';
    $('result-sub').textContent = mission ? mission.name : '';
    $('result-stars').textContent = victory ? '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars) : '☆☆☆';
    if (!victory && result.loseReason) $('result-reason').textContent = result.loseReason;
    else $('result-reason').textContent = victory ? (mission?.regions?.length ? `Nuove province romane: ${mission.regions.map((id) => REGIONS[id]?.name || id).join(', ')}` : 'La storia prosegue.') : 'Roma non dimentica i suoi caduti. Riprova, comandante.';

    const mins = Math.floor(result.time / 60), secs = Math.floor(result.time % 60);
    $('result-stats').innerHTML = `
      <div><span>Durata</span><b>${mins}:${String(secs).padStart(2, '0')}</b></div>
      <div><span>Nemici eliminati</span><b>${result.kills}</b></div>
      <div><span>Perdite romane</span><b>${result.lossesSoldiers} (${Math.round(result.losses * 100)}%)</b></div>
      <div><span>In salvo</span><b>${result.saved || 0}</b></div>
      <div><span>Coorti nemiche in rotta</span><b>${result.routs[1]}</b></div>`;

    let secHtml = '';
    (result.secondaries || []).forEach((s, i) => {
      secHtml += `<div class="${s.done ? 'done' : ''}">${s.done ? '✓' : '✗'} ${describeSecondary(s)}</div>`;
    });
    $('result-secondary').innerHTML = secHtml;

    let xpHtml = '';
    for (const cat in result.xpByCat || {}) {
      xpHtml += `<div>${PROG_CATS[cat]?.icon || ''} ${PROG_CATS[cat]?.name || cat}: <b>+${result.xpByCat[cat]} XP</b></div>`;
    }
    xpHtml += `<div>🦅 Generale: <b>+${result.xpGeneral} XP</b></div>`;
    $('result-xp').innerHTML = xpHtml;

    const isSkirmish = result.missionId === 'skirmish';
    const btnNext = $('result-next');
    const btnReward = $('result-reward');
    if (victory && !isSkirmish) {
      const idx = missionIndex(result.missionId);
      const hasNext = idx < MISSIONS.length - 1;
      const rewardTaken = Save.data.rewardsTaken.includes(result.missionId);
      btnReward.classList.toggle('hidden', rewardTaken);
      btnNext.classList.remove('hidden');
      btnNext.textContent = hasNext ? 'Prossima battaglia ➜' : 'Torna alla mappa';
      btnNext.onclick = () => {
        Audio.confirm();
        if (!rewardTaken) this.openRewards(result);
        else if (hasNext) this.openBriefing(MISSIONS[idx + 1], idx + 1);
        else this.openMap(false);
      };
      btnReward.onclick = () => { Audio.confirm(); this.openRewards(result); };
    } else {
      btnNext.classList.add('hidden');
      btnReward.classList.add('hidden');
    }
    $('result-retry').textContent = victory ? 'Rigioca' : 'Riprova';
    $('result-retry').onclick = () => { Audio.confirm(); this.startBattle(mission); };
    $('result-map').onclick = () => {
      Audio.click();
      if (isSkirmish) { this.refreshMenu(); this.show('menu'); }
      else this.openMap(false);
    };
    if (victory && mission?.regions?.length) {
      // flash conquista quando si torna alla mappa
      this._pendingFlash = mission.regions;
    }
  },

  // ================= RICOMPENSE =================
  openRewards(result) {
    this.show('rewards');
    const mission = missionById(result.missionId);
    $('rewards-sub').textContent = `${mission.name} — scegli una ricompensa per l'esercito`;
    const rng = makeRNG(Date.now() & 0xffff);
    const cats = Object.keys(result.xpByCat || {});
    const pool = cats.length ? cats : ['heavy', 'cav'];
    const c1 = rng.pick(pool);
    let c2 = rng.pick(pool.filter((c) => c !== c1).concat(['missile', 'light']));
    const amount = Math.round(mission.rewards.xp * 0.55);
    const options = [
      { cat: c1, amount, icon: PROG_CATS[c1].icon, title: PROG_CATS[c1].name, desc: `+${amount} XP alla ${PROG_CATS[c1].name.toLowerCase()}. Le coorti diventano più forti e resilienti.` },
      { cat: c2, amount: Math.round(amount * 0.8), icon: PROG_CATS[c2]?.icon || '🛡', title: PROG_CATS[c2]?.name || c2, desc: `+${Math.round(amount * 0.8)} XP alla ${PROG_CATS[c2]?.name.toLowerCase() || c2}.` },
      { general: Math.round(mission.rewards.xp * 0.3), icon: '🦅', title: 'Gloria del generale', desc: `+${Math.round(mission.rewards.xp * 0.3)} XP al generale: aura più ampia, morale e abilità.` },
    ];
    const wrap = $('rewards-cards');
    wrap.innerHTML = '';
    options.forEach((opt) => {
      const card = document.createElement('button');
      card.className = 'reward-card';
      card.innerHTML = `<div class="rw-icon">${opt.icon}</div><b>${opt.title}</b><span>${opt.desc}</span>`;
      card.addEventListener('click', () => {
        Save.applyReward(mission.id, opt);
        Audio.conquest();
        this.toast('Ricompensa assegnata. L\'esercito cresce.');
        const idx = missionIndex(mission.id);
        if (this._pendingFlash) { map.flashConquest(this._pendingFlash); this._pendingFlash = null; }
        if (idx < MISSIONS.length - 1) this.openBriefing(MISSIONS[idx + 1], idx + 1);
        else this.openMap(false);
      });
      wrap.appendChild(card);
    });
    $('rewards-skip').onclick = () => {
      Audio.click();
      Save.applyReward(mission.id, {});
      const idx = missionIndex(mission.id);
      if (idx < MISSIONS.length - 1) this.openBriefing(MISSIONS[idx + 1], idx + 1);
      else this.openMap(false);
    };
  },

  // ================= LEGIONI / PROGRESSIONE =================
  _wireLegions() {
    $('legions-back').addEventListener('click', () => { Audio.click(); this.refreshMenu(); this.show('menu'); });
    document.querySelectorAll('#legions-tabs button').forEach((btn) => {
      btn.addEventListener('click', () => {
        Audio.click();
        document.querySelectorAll('#legions-tabs button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this._renderLegionsTab(btn.dataset.tab);
      });
    });
  },

  openLegions(tab = 'legioni') {
    this.show('legions');
    document.querySelectorAll('#legions-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    this._renderLegionsTab(tab);
  },

  _renderLegionsTab(tab) {
    const wrap = $('legions-content');
    if (tab === 'legioni') {
      let html = '<div class="legion-grid">';
      for (const cat in PROG_CATS) {
        const info = vetInfo(cat);
        const lv = VET_LEVELS[info.lv];
        const romanIds = ['hastati', 'principes', 'triarii', 'velites', 'legionari', 'veterani', 'auxilia', 'arcieri', 'sagittarii', 'equites', 'cavAusiliaria', 'cavPesante', 'cavLeggera', 'esploratori', 'pretoriani', 'centurioni'];
        const romanUnits = romanIds.map((id) => UNITS[id]).filter((u) => u && progressionCat(u.id) === cat);
        html += `<div class="legion-card">
          <div class="lc-head"><span class="lc-icon">${PROG_CATS[cat].icon}</span><div><b>${PROG_CATS[cat].name}</b><span>${PROG_CATS[cat].desc}</span></div></div>
          <div class="lc-level">${lv.name} <em>Lv ${info.lv + 1}/5</em></div>
          <div class="lc-xpbar"><i style="width:${Math.round(info.pct * 100)}%"></i></div>
          <div class="lc-xp">${info.xp} XP${info.next ? ` / ${info.next}` : ' · MASSIMO'}</div>
          <div class="lc-bonus">HP +${Math.round((lv.hp - 1) * 100)}% · Danno +${Math.round((lv.atk - 1) * 100)}% · Morale +${lv.morale}</div>
          <div class="lc-units">${romanUnits.map((u) => u.name).join(' · ')}</div>
        </div>`;
      }
      html += '</div>';
      wrap.innerHTML = html;
    } else if (tab === 'generale') {
      const g = Save.data.general;
      const bonuses = generalBonuses(g.level);
      const nextXp = GENERAL_XP_LEVELS[g.level] || null;
      const title = GENERAL_TITLES[Math.min(g.level - 1, GENERAL_TITLES.length - 1)];
      wrap.innerHTML = `
        <div class="general-panel">
          <div class="gen-portrait">🦅</div>
          <div class="gen-info">
            <h3>${g.name}</h3>
            <div class="gen-title">${title} · Livello ${g.level}</div>
            <div class="lc-xpbar big"><i style="width:${nextXp ? Math.min(100, (g.xp / nextXp) * 100) : 100}%"></i></div>
            <div class="lc-xp">${g.xp} XP${nextXp ? ` / ${nextXp}` : ' · LIVELLO MASSIMO'}</div>
            <div class="gen-stats">
              <div>Battaglie: <b>${g.battles}</b></div><div>Vittorie: <b>${g.wins}</b></div>
              <div>Aura: <b>${Math.round(bonuses.auraRadius)} m</b></div><div>Morale: <b>+${bonuses.moraleRegen.toFixed(1)}/s</b></div>
              <div>Mischia: <b>+${Math.round((bonuses.meleeBonus - 1) * 100)}%</b></div><div>Velocità: <b>+${Math.round((bonuses.speedBonus - 1) * 100)}%</b></div>
            </div>
            <div class="gen-abilities">
              <div class="${g.level >= 1 ? '' : 'locked'}">📯 Radunata (Z) — Lv 1</div>
              <div class="${g.level >= 3 ? '' : 'locked'}">⚔ Carica (X) — Lv 3</div>
              <div class="${g.level >= 5 ? '' : 'locked'}">🏃 Marcia forzata (B) — Lv 5</div>
            </div>
          </div>
        </div>`;
    } else {
      const prog = Save.campaignProgress();
      let html = `<div class="prog-stats">
        <div><span>Battaglie combattute</span><b>${Save.data.general.battles}</b></div>
        <div><span>Vittorie</span><b>${Save.data.general.wins}</b></div>
        <div><span>Nemici eliminati</span><b>${Save.data.totalKills}</b></div>
        <div><span>Caduti romani</span><b>${Save.data.totalLosses}</b></div>
        <div><span>Province romane</span><b>${Save.romanRegions().size}</b></div>
        <div><span>Campagna</span><b>${Math.round(prog.pct * 100)}%</b></div>
      </div><div class="prog-timeline">`;
      PHASES.forEach((ph, pi) => {
        const ms = MISSIONS.filter((m) => m.phase === pi);
        html += `<div class="pt-phase"><div class="pt-head">${ph.icon} · ${ph.name} <em>${ph.years}</em></div>`;
        for (const m of ms) {
          const c = Save.data.completed[m.id];
          html += `<div class="pt-mission ${c ? 'done' : ''}"><span>${c ? '✓' : '○'} ${m.name}</span><em>${m.date}</em>${c ? `<b>${'★'.repeat(c.stars)}</b>` : ''}</div>`;
        }
        html += '</div>';
      });
      html += '</div>';
      wrap.innerHTML = html;
    }
  },

  // ================= BATTAGLIE PERSONALIZZATE =================
  _wireBattles() {
    $('battles-back').addEventListener('click', () => { Audio.click(); this.refreshMenu(); this.show('menu'); });
    $('skirmish-start').addEventListener('click', () => {
      Audio.horn();
      const faction = $('skirmish-faction').value;
      const size = $('skirmish-size').value;
      const biome = $('skirmish-biome').value;
      this.startBattle(this._makeSkirmish(faction, size, biome));
    });
  },

  openBattles() {
    this.show('battles');
    const wrap = $('battles-list');
    wrap.innerHTML = '';
    MISSIONS.forEach((m, i) => {
      const unlocked = Save.isUnlocked(i);
      const c = Save.data.completed[m.id];
      const item = document.createElement('button');
      item.className = `battle-item ${c ? 'done' : ''} ${unlocked ? '' : 'locked'}`;
      item.innerHTML = `<span class="bi-num">${i + 1}</span><div><b>${m.name}</b><span>${m.date} · ${PHASES[m.phase].name}</span></div><span class="bi-stars">${c ? '★'.repeat(c.stars) + '☆'.repeat(3 - c.stars) : unlocked ? '—' : '🔒'}</span>`;
      item.addEventListener('click', () => {
        if (!unlocked) { Audio.error(); this.toast('Battaglia bloccata nella campagna.'); return; }
        Audio.confirm();
        this.openBriefing(m, i);
      });
      wrap.appendChild(item);
    });
    // fazioni disponibili per schermaglie
    const sel = $('skirmish-faction');
    sel.innerHTML = '';
    for (const f in FACTIONS) {
      if (f === 'roma') continue;
      const opt = document.createElement('option');
      opt.value = f; opt.textContent = FACTIONS[f].name;
      sel.appendChild(opt);
    }
  },

  _makeSkirmish(faction, size, biome) {
    const rng = makeRNG((Date.now() & 0x7fffffff) >>> 0);
    const pools = {
      latini: ['oplitaLatino', 'oplitaLatino', 'cavLeggera'],
      etruschi: ['fanteEtrusco', 'fanteEtrusco', 'arciereCretese'],
      sanniti: ['guerrieroSannita', 'peltastaSannita', 'guerrieroSannita'],
      epiro: ['falangita', 'fanteEpirota', 'cavMacedone', 'elefante'],
      cartagine: ['fanteLibico', 'mercenarioIspanico', 'fromboliere', 'cavNumida', 'cavCartaginese'],
      macedoni: ['falangita', 'peltastaGreco', 'arciereCretese', 'cavMacedone'],
      seleucidi: ['falangita', 'fanteSeleucide', 'catafratto', 'arciereCretese'],
      egizi: ['guardiaEgizia', 'falangita', 'arciereCretese', 'cavPompeiana'],
      galli: ['guerrieroGallico', 'guerrieroGallico', 'arciereGallico', 'cavGallica'],
      germani: ['berserkerGermano', 'berserkerGermano', 'arciereGallico', 'cavGallica'],
      britanni: ['fanteBritanno', 'fanteBritanno', 'carroBritanno', 'arciereGallico'],
      daci: ['guerrieroDaco', 'guerrieroDaco', 'arciereDaco', 'cavDaca'],
      parti: ['arciereParto', 'arciereParto', 'catafratto', 'fanteSeleucide'],
      pompeiani: ['fantePompeiano', 'fantePompeiano', 'arcieri', 'cavPompeiana'],
    };
    const nSquads = size === 'piccola' ? 6 : size === 'grande' ? 13 : 9;
    const squadN = size === 'piccola' ? 22 : size === 'grande' ? 32 : 27;
    const pool = pools[faction] || pools.galli;
    const squads = [];
    for (let i = 0; i < nSquads; i++) {
      const t = rng.pick(pool);
      const u = UNITS[t];
      const role = i === 0 ? 'line' : u.mounted ? (rng() < 0.5 ? 'flankL' : 'flankR') : u.cat === 'missile' ? 'missile' : i > nSquads - 3 ? 'reserve' : rng() < 0.25 ? 'skirmish' : 'line';
      squads.push({ t, n: u.cat === 'elephant' ? 4 : u.mounted ? Math.round(squadN * 0.5) : squadN, role });
    }
    const playerSquads = [
      { t: 'legionari', n: squadN + 3, role: 'line' }, { t: 'legionari', n: squadN + 3, role: 'line' },
      { t: 'veterani', n: squadN, role: 'line' }, { t: 'auxilia', n: squadN, role: 'skirmish' },
      { t: 'sagittarii', n: 16, role: 'missile' }, { t: 'cavAusiliaria', n: 14, role: 'flankL' },
      { t: 'cavAusiliaria', n: 14, role: 'flankR' }, { t: 'pretoriani', n: 20, role: 'reserve' },
    ];
    if (size === 'grande') playerSquads.push({ t: 'legionari', n: squadN, role: 'line' }, { t: 'cavPesante', n: 10, role: 'flankR' });
    if (size === 'piccola') playerSquads.splice(2, 1);
    const hills = rng() < 0.7 ? [{ x: rng.range(-120, 120), z: rng.range(-140, -60), r: rng.range(50, 90), h: rng.range(8, 20) }] : [];
    const forests = rng() < 0.6 ? [{ x: rng.range(-150, 150), z: rng.range(-120, 120), r: rng.range(28, 45) }] : [];
    const river = rng() < 0.35 ? { axis: 'x', pos: rng.range(-40, 40), width: 14 } : null;
    return {
      id: 'skirmish', phase: 0, name: 'Battaglia personalizzata', date: 'Campo di Marte', place: 'Addestramento',
      commanders: { rome: Save.data.general.name, enemy: `Comandante ${FACTIONS[faction].name}` },
      context: 'Una battaglia di addestramento contro le forze nemiche scelte. Nessuna posta in gioco: solo gloria e pratica di comando.',
      hint: 'Sfrutta terreno, formazioni e cavalleria. La vittoria qui non conta nella campagna.',
      map: { x: 390, y: 274 }, regions: [],
      terrain: { biome, seed: rng.int(1, 9999), size: 400, rough: rng.range(0.4, 1.0), hills, forests, river },
      player: { general: Save.data.general.name, squads: playerSquads },
      enemy: { faction, general: 'Comandante nemico', ai: { aggression: rng.range(0.55, 0.9) }, squads },
      objectives: { primary: { type: 'annihilate' }, secondary: [{ type: 'losses_below', v: 0.35 }, { type: 'kill_general' }] },
      rewards: { xp: 60 },
    };
  },

  // ================= IMPOSTAZIONI =================
  _wireSettings() {
    $('settings-back').addEventListener('click', () => {
      Audio.click();
      if (this._settingsFrom === 'battle' && currentBattle) {
        this.show('none');
      } else {
        this.refreshMenu();
        this.show('menu');
      }
    });
    const s = Save.settings;
    const quality = $('set-quality');
    quality.value = s.quality;
    quality.addEventListener('change', () => { s.quality = quality.value; Save.persistSettings(); this.toast('Qualità applicata dalla prossima battaglia.'); });
    const diff = $('set-difficulty');
    diff.value = s.difficulty;
    diff.addEventListener('change', () => { s.difficulty = diff.value; Save.persistSettings(); this.toast('Difficoltà applicata dalla prossima battaglia.'); });
    const music = $('set-music');
    music.value = Math.round(s.musicVol * 100);
    music.addEventListener('input', () => { s.musicVol = music.value / 100; Save.persistSettings(); Audio.applyVolumes(); });
    const sfx = $('set-sfx');
    sfx.value = Math.round(s.sfxVol * 100);
    sfx.addEventListener('input', () => { s.sfxVol = sfx.value / 100; Save.persistSettings(); Audio.applyVolumes(); Audio.click(); });
    const edge = $('set-edge');
    edge.checked = s.edgeScroll;
    edge.addEventListener('change', () => { s.edgeScroll = edge.checked; Save.persistSettings(); });
    const cam = $('set-camspeed');
    cam.value = Math.round(s.cameraSpeed * 100);
    cam.addEventListener('input', () => { s.cameraSpeed = cam.value / 100; Save.persistSettings(); });
    const hints = $('set-hints');
    hints.checked = s.showHints;
    hints.addEventListener('change', () => { s.showHints = hints.checked; Save.persistSettings(); });
    $('set-reset').addEventListener('click', () => {
      if (confirm('Cancellare TUTTI i progressi della campagna? L\'operazione è irreversibile.')) {
        Save.resetAll();
        this.toast('Campagna azzerata.');
        this.refreshMenu();
        this.show('menu');
      }
    });
  },

  openSettings(from = 'menu') {
    this._settingsFrom = from;
    this.show('settings');
  },
};
