// ============================================================
// IMPERO ROMANO — HUD di battaglia: obiettivi, tempo, forze,
// coorti selezionate, formazioni, ordini, abilità, minimappa.
// Minimalista: non ostacola la visuale del campo.
// ============================================================

import { PLAYER_FORMATIONS, FORMATIONS } from '../data/Formations.js';
import { CATS } from '../data/Units.js';
import { describePrimary, describeSecondary } from '../battle/Objectives.js';
import { Save, generalBonuses } from '../core/Save.js';
import { Audio } from '../core/Audio.js';
import { clamp } from '../core/RNG.js';

const $ = (id) => document.getElementById(id);

export class BattleHUD {
  constructor(battle) {
    this.battle = battle;
    this.el = $('battle-hud');
    this.el.classList.remove('hidden');
    this._acc = 0; this._mapAcc = 0; this._objCache = '';
    this._cardRefs = [];
    this.messages = [];

    $('bh-mission-name').textContent = battle.mission.name;
    $('bh-mission-date').textContent = `${battle.mission.date} · ${battle.mission.place}`;
    $('bh-enemy-name').textContent = (battle.mission.enemy.general || 'NEMICO').toUpperCase();

    this._buildFormations();
    this._buildAbilities();
    this._wire();
    this._buildMinimapCache();
    this.setSpeed(1);
  }

  // ---------- costruzione ----------
  _buildFormations() {
    const wrap = $('bh-formations');
    wrap.innerHTML = '';
    this.formBtns = {};
    for (const id of PLAYER_FORMATIONS) {
      const f = FORMATIONS[id];
      const btn = document.createElement('button');
      btn.className = 'form-btn';
      btn.title = `${f.name} (${f.key}) — ${f.desc}`;
      btn.innerHTML = `<span class="f-icon">${f.icon}</span><span class="f-key">${f.key}</span>`;
      btn.addEventListener('click', () => { this.battle.input._formation(id); });
      wrap.appendChild(btn);
      this.formBtns[id] = btn;
    }
  }

  _buildAbilities() {
    const wrap = $('bh-abilities');
    wrap.innerHTML = '';
    this.abilBtns = {};
    const defs = [
      { id: 'radunata', icon: '📯', name: 'Radunata', key: 'Z', desc: 'Il generale ispira le coorti vicine: +morale e raduna le truppe in rotta.' },
      { id: 'carica', icon: '⚔', name: 'Carica', key: 'X', desc: 'Le coorti selezionate (o la cavalleria) caricano: +danno e velocità.' },
      { id: 'marcia', icon: '🏃', name: 'Marcia forzata', key: 'B', desc: 'Tutto l\'esercito accelera per 10 secondi.' },
    ];
    const unlocked = generalBonuses(Save.data.general.level).abilities;
    for (const d of defs) {
      const btn = document.createElement('button');
      btn.className = 'abil-btn';
      btn.title = `${d.name} (${d.key}) — ${d.desc}`;
      btn.innerHTML = `<span class="a-icon">${d.icon}</span><span class="a-key">${d.key}</span><i class="cd"></i>`;
      if (!unlocked.includes(d.id)) btn.classList.add('locked');
      btn.addEventListener('click', () => this.battle.useAbility(d.id));
      wrap.appendChild(btn);
      this.abilBtns[d.id] = btn;
    }
  }

  _wire() {
    const b = this.battle;
    $('bh-pause-btn').addEventListener('click', () => b.togglePause());
    document.querySelectorAll('#bh-speeds button').forEach((btn) => {
      btn.addEventListener('click', () => b.setSpeed(parseInt(btn.dataset.speed, 10)));
    });
    $('bh-menu-btn').addEventListener('click', () => b.togglePauseMenu());
    $('bh-start-battle').addEventListener('click', () => b.startBattle());
    $('pm-resume').addEventListener('click', () => this.togglePauseMenu(false));
    $('pm-restart').addEventListener('click', () => { this.togglePauseMenu(false); if (b.callbacks.onRestart) b.callbacks.onRestart(); });
    $('pm-settings').addEventListener('click', () => { if (b.callbacks.onSettings) b.callbacks.onSettings(); });
    $('pm-abandon').addEventListener('click', () => { this.togglePauseMenu(false); if (b.callbacks.onAbandon) b.callbacks.onAbandon(); });

    document.querySelectorAll('#bh-stances button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        const sel = b.selection.filter((s) => s.state === 'fight');
        if (cmd === 'attackmove') { b.input.attackMoveMode = true; this.setAttackMoveMode(true); }
        else if (cmd === 'stop') { for (const sq of sel) b.sim.orderHold(sq); Audio.moveOrder(); }
        else if (cmd === 'hold') { for (const sq of sel) { b.sim.orderHold(sq); b.sim.setFormation(sq, 'difensiva'); } Audio.formation(); this.refreshSelection(); }
        else if (cmd === 'retreat') { for (const sq of sel) b.sim.orderRetreat(sq); Audio.moveOrder(); }
      });
    });

    $('bh-touch-select').addEventListener('click', () => {
      const next = b.input.touchMode === 'select' ? 'camera' : 'select';
      b.input.setTouchMode(next);
    });
    document.querySelectorAll('#bh-mobile-bar [data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => b.input.setTouchMode(btn.dataset.mode));
    });
    $('bh-collapse').addEventListener('click', () => {
      this.el.classList.toggle('collapsed');
      $('bh-collapse').textContent = this.el.classList.contains('collapsed') ? '⌃' : '⌄';
      Audio.click();
    });
    $('mob-all').addEventListener('click', () => b.input.selectAll());
    $('mob-focus').addEventListener('click', () => b.input.focusGeneral());
    $('mob-pause').addEventListener('click', () => b.togglePause());
    $('bh-zoom-in').addEventListener('click', () => { b.input.distance = clamp(b.input.distance * 0.8, 24, 300); });
    $('bh-zoom-out').addEventListener('click', () => { b.input.distance = clamp(b.input.distance * 1.25, 24, 300); });

    const mm = $('bh-minimap');
    const onMap = (e) => {
      const rect = mm.getBoundingClientRect();
      const cx = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
      const cy = (e.clientY ?? e.touches?.[0]?.clientY) - rect.top;
      const half = b.terrain.half;
      const wx = (cx / rect.width) * half * 2 - half;
      const wz = (cy / rect.height) * half * 2 - half;
      b.input.focus(wx, wz);
    };
    mm.addEventListener('pointerdown', onMap);

    // touch controls visibili solo su touch
    if ('ontouchstart' in window) $('bh-touch-controls').classList.add('touch-visible');
  }

  // ---------- stati ----------
  enterDeployment() {
    $('bh-deploy').classList.remove('hidden');
    this.el.classList.add('deploying');
    $('bh-deploy-hint').textContent = this.battle.mission.hint || 'Toca una cohorte y luego el terreno para recolocarla en la zona roja.';
    $('bh-bottom').classList.add('deploying');
  }
  enterBattle() {
    $('bh-deploy').classList.add('hidden');
    this.el.classList.remove('deploying');
    $('bh-bottom').classList.remove('deploying');
  }
  setPaused(p) {
    $('bh-pause-overlay').classList.toggle('hidden', !p);
    $('bh-pause-btn').textContent = p ? '▶' : '⏸';
  }
  setSpeed(s) {
    document.querySelectorAll('#bh-speeds button').forEach((btn) => {
      btn.classList.toggle('active', this.battle.speeds[parseInt(btn.dataset.speed, 10)] === s);
    });
  }
  setAttackMoveMode(on) {
    $('bh-attackmove-hint').classList.toggle('hidden', !on);
    document.querySelector('#bh-stances [data-cmd="attackmove"]').classList.toggle('active', on);
  }
  setTouchMode(mode) {
    document.querySelectorAll('#bh-mobile-bar [data-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    $('bh-touch-select').classList.toggle('active', mode === 'select');
    const hints = {
      camera: 'Toca una cohorte para seleccionarla · arrastra para mover la cámara · pellizca para zoom',
      select: 'Arrastra sobre las tropas para seleccionarlas · toca una cohorte para elegirla',
      attackmove: 'Toca el terreno: las coortes avanzarán y atacarán al primer enemigo',
      attack: 'Toca un enemigo para atacarlo · mantén pulsado para avanzar',
    };
    $('bh-mode-hint').textContent = hints[mode] || '';
    document.querySelector('#bh-stances [data-cmd="attackmove"]').classList.toggle('active', mode === 'attackmove' || mode === 'attack');
  }
  togglePauseMenu(force) {
    const el = $('bh-pause-menu');
    const show = force !== undefined ? force : el.classList.contains('hidden');
    el.classList.toggle('hidden', !show);
    if (show && this.battle.state === 'running') { this.battle.paused = true; this.setPaused(true); }
    Audio.click();
  }

  // ---------- selezione ----------
  refreshSelection() {
    const wrap = $('bh-selection');
    wrap.innerHTML = '';
    this._cardRefs = [];
    const sel = this.battle.selection.slice(0, 8);
    for (const sq of sel) {
      const card = document.createElement('div');
      card.className = 'unit-card';
      const icon = CATS[sq.type.cat]?.icon || '⚔';
      card.innerHTML = `
        <div class="uc-head"><span class="uc-icon">${icon}</span><span class="uc-name">${sq.type.name}</span><span class="uc-count">${sq.aliveCount}/${sq.n0}</span></div>
        <div class="uc-bar morale"><i></i></div>
        <div class="uc-bar fatigue"><i></i></div>
        <div class="uc-form">${FORMATIONS[sq.formation]?.name || ''}${sq.state === 'rout' ? ' · IN ROTTA' : ''}</div>
        <div class="uc-order">HOLD</div>`;
      card.addEventListener('click', (e) => {
        this.battle.input.select([sq], e.shiftKey);
      });
      wrap.appendChild(card);
      this._cardRefs.push({
        sq,
        count: card.querySelector('.uc-count'),
        morale: card.querySelector('.morale i'),
        fatigue: card.querySelector('.fatigue i'),
        form: card.querySelector('.uc-form'),
        order: card.querySelector('.uc-order'),
        card,
      });
    }
    if (this.battle.selection.length > 8) {
      const more = document.createElement('div');
      more.className = 'unit-card more';
      more.textContent = `+${this.battle.selection.length - 8} coorti`;
      wrap.appendChild(more);
    }
    // evidenzia formazione comune
    const forms = new Set(this.battle.selection.map((s) => s.formation));
    for (const id in this.formBtns) this.formBtns[id].classList.toggle('active', forms.size === 1 && forms.has(id));
  }

  refreshAbilities() {
    const unlocked = generalBonuses(Save.data.general.level).abilities;
    for (const id in this.abilBtns) this.abilBtns[id].classList.toggle('locked', !unlocked.includes(id));
  }

  // ---------- messaggi ----------
  message(text, kind = 'info') {
    const wrap = $('bh-messages');
    const div = document.createElement('div');
    div.className = `bh-msg ${kind}`;
    div.textContent = text;
    wrap.appendChild(div);
    while (wrap.children.length > 5) wrap.removeChild(wrap.firstChild);
    setTimeout(() => { div.classList.add('fade'); setTimeout(() => div.remove(), 900); }, 5200);
  }

  // ---------- minimappa ----------
  _buildMinimapCache() {
    // fillRect per cella (niente putImageData: più compatibile coi backend GPU)
    const size = 190, cell = 2, n = size / cell;
    this.mapCache = document.createElement('canvas');
    this.mapCache.width = size; this.mapCache.height = size;
    const ctx = this.mapCache.getContext('2d');
    const t = this.battle.terrain;
    const half = t.half;
    const b = t.biome;
    for (let py = 0; py < n; py++) {
      for (let px = 0; px < n; px++) {
        const x = (px / n) * half * 2 - half;
        const z = (py / n) * half * 2 - half;
        const h = t.getHeight(x, z);
        let r, g, bl;
        if (h < t.waterLevel + 0.3) { r = 60; g = 100; bl = 115; }
        else if (t.isForest(x, z)) { r = ((b.tree >> 16) & 255) * 0.7; g = ((b.tree >> 8) & 255) * 0.8; bl = (b.tree & 255) * 0.7; }
        else {
          const tt = clamp((h - 1) / 18, 0, 1);
          r = (b.grass[0] + (b.rock[0] - b.grass[0]) * tt) * 255;
          g = (b.grass[1] + (b.rock[1] - b.grass[1]) * tt) * 255;
          bl = (b.grass[2] + (b.rock[2] - b.grass[2]) * tt) * 255;
        }
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${bl | 0})`;
        ctx.fillRect(px * cell, py * cell, cell, cell);
      }
    }
  }

  _drawMinimap() {
    const mm = $('bh-minimap');
    const ctx = mm.getContext('2d');
    const size = mm.width;
    const b = this.battle;
    const half = b.terrain.half;
    ctx.drawImage(this.mapCache, 0, 0);
    const toMap = (x, z) => [((x + half) / (half * 2)) * size, ((z + half) / (half * 2)) * size];

    // zone
    for (const z of b.zones || []) {
      if (!z.ring.visible) continue;
      const [mx, my] = toMap(z.zone.x, z.zone.z);
      ctx.strokeStyle = '#' + z.ring.material.color.getHexString();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx, my, (z.zone.r / (half * 2)) * size, 0, Math.PI * 2);
      ctx.stroke();
    }
    // coorti
    for (const sq of b.sim.squads) {
      if (sq.state === 'dead' || sq.state === 'gone' || sq.aliveCount <= 0) continue;
      const [mx, my] = toMap(sq.anchor.x, sq.anchor.z);
      const s = sq.isGeneral ? 4 : clamp(sq.aliveCount / 8, 2, 4);
      ctx.fillStyle = sq.side === 0 ? (sq.state === 'rout' ? '#e8d8a0' : '#d4af37') : (sq.state === 'rout' ? '#8888aa' : '#c0392b');
      ctx.fillRect(mx - s / 2, my - s / 2, s, s);
      if (b.selection.includes(sq)) {
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(mx - s / 2 - 1, my - s / 2 - 1, s + 2, s + 2);
      }
    }
    // camera
    const [cx, cy] = toMap(b.input.target.x, b.input.target.z);
    const view = (b.input.distance / (half * 2)) * size * 1.4;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - view / 2, cy - view / 2, view, view);
  }

  // ---------- update ----------
  update(dt) {
    this._acc += dt;
    this._mapAcc += dt;
    if (this._mapAcc > 0.2) { this._mapAcc = 0; this._drawMinimap(); }
    if (this._acc < 0.25) return;
    this._acc = 0;
    const b = this.battle;
    const sim = b.sim;

    // tempo
    const t = Math.floor(sim.time);
    $('bh-time').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

    // forze
    $('bh-str-roma').style.width = `${Math.round(sim.armyStrength(0) * 100)}%`;
    $('bh-str-enemy').style.width = `${Math.round(sim.armyStrength(1) * 100)}%`;

    // obiettivi
    const prim = b.objectives.prim;
    const desc = describePrimary(prim);
    let html = `<div class="obj-primary"><b>${desc.title}</b><span>${b.objectives.progressText || ''}</span></div>`;
    for (let i = 0; i < b.objectives.secondaries.length; i++) {
      const s = b.objectives.secondaries[i];
      html += `<div class="obj-secondary ${s.done ? 'done' : ''}">${s.done ? '✓' : '○'} ${describeSecondary(s)}</div>`;
    }
    if (html !== this._objCache) { this._objCache = html; $('bh-objectives').innerHTML = html; }

    // carte unità
    for (const ref of this._cardRefs) {
      const sq = ref.sq;
      if (sq.state === 'dead' || sq.state === 'gone') { ref.card.classList.add('lost'); continue; }
      ref.count.textContent = `${sq.aliveCount}/${sq.n0}`;
      ref.morale.style.width = `${clamp((sq.morale / sq.maxMorale) * 100, 0, 100)}%`;
      ref.morale.className = sq.morale < 30 ? 'low' : '';
      ref.fatigue.style.width = `${clamp(sq.fatigue, 0, 100)}%`;
      const formName = FORMATIONS[sq.formation]?.name || '';
      const label = formName + (sq.state === 'rout' ? ' · IN ROTTA' : '');
      if (ref.form.textContent !== label) ref.form.textContent = label;
      const ord = sq.state === 'rout' ? 'FUGA' : { move: 'MOVI', attack: 'ATTACCA', attackmove: 'AVANZA', structure: 'ASSALTO', hold: 'HOLD', column: 'MARCIA' }[sq.order.kind] || 'HOLD';
      if (ref.order.textContent !== ord) ref.order.textContent = ord;
      ref.order.className = 'uc-order ' + (sq.order.kind === 'attack' || sq.order.kind === 'attackmove' ? 'aggressive' : '');
      ref.card.classList.toggle('routing', sq.state === 'rout');
    }

    // abilità cooldown
    const cds = { radunata: 45, carica: 60, marcia: 90 };
    for (const id in this.abilBtns) {
      const cd = b.abilityCooldowns[id];
      const overlay = this.abilBtns[id].querySelector('.cd');
      overlay.style.height = cd > 0 ? `${(cd / cds[id]) * 100}%` : '0%';
      this.abilBtns[id].classList.toggle('oncd', cd > 0);
    }

    // evidenzia formazione comune
    const forms = new Set(b.selection.map((s) => s.formation));
    for (const id in this.formBtns) this.formBtns[id].classList.toggle('active', forms.size === 1 && forms.has(id));
  }

  dispose() {
    this.el.classList.add('hidden');
    $('bh-pause-menu').classList.add('hidden');
    $('bh-pause-overlay').classList.add('hidden');
    $('bh-messages').innerHTML = '';
    $('bh-selection').innerHTML = '';
  }
}
