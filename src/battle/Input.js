// ============================================================
// IMPERO ROMANO — Input di battaglia: camera RTS, selezione
// (click, rettangolo, gruppi), ordini (muovi/attacca/attack-move),
// tasti rapidi, touch (pan, tap, pinch, box di selezione).
// ============================================================

import * as THREE from 'three';
import { dist, dist2, clamp } from '../core/RNG.js';
import { Audio } from '../core/Audio.js';
import { Save } from '../core/Save.js';

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _v = new THREE.Vector3();

export class BattleInput {
  constructor(battle) {
    this.battle = battle;
    this.canvas = battle.renderer.domElement;
    this.camera = battle.camera;
    // rig camera
    this.target = { x: 0, z: 60 };
    this.distance = 98;
    this.azimuth = 0;         // 0 = guarda verso nord (-z)
    this.pitch = 0.94;
    this.keys = {};
    this.pointer = { x: 0, y: 0, inside: false };
    this.drag = null;         // {mode:'select'|'pan'|'rotate', sx, sy, x, y, button}
    this.attackMoveMode = false;
    this.touchSelectMode = false;
    this.touchMode = 'camera';   // camera | select | attackmove | attack
    this.longPressFired = false;
    this._longTimer = null;
    this.lastTap = 0;
    this.touches = new Map();
    this.pinchDist = 0;
    this.hoverSquad = null;
    this._hoverAcc = 0;
    this.boxEl = document.getElementById('selection-box');

    this._bind();
    this.updateCamera(0);
  }

  // ---------- camera ----------
  updateCamera(dt) {
    const spd = 60 * (this.distance / 120) * Save.settings.cameraSpeed;
    let dx = 0, dz = 0;
    if (this.keys['ArrowLeft']) dx -= 1;
    if (this.keys['ArrowRight']) dx += 1;
    if (this.keys['ArrowUp']) dz -= 1;
    if (this.keys['ArrowDown']) dz += 1;
    // edge scroll
    if (Save.settings.edgeScroll && this.pointer.inside && !this.drag && this.battle.state === 'running') {
      const m = 26, w = window.innerWidth, h = window.innerHeight;
      if (this.pointer.x < m) dx -= 1;
      if (this.pointer.x > w - m) dx += 1;
      if (this.pointer.y < m) dz -= 1;
      if (this.pointer.y > h - m - 120) dz += 1;
    }
    if (dx || dz) {
      const sin = Math.sin(this.azimuth), cos = Math.cos(this.azimuth);
      // movimento relativo alla vista
      const mx = dx * cos - dz * sin;
      const mz = dx * sin + dz * cos;
      this.target.x += mx * spd * dt;
      this.target.z += mz * spd * dt;
    }
    if (this.keys['q'] || this.keys['Q']) this.azimuth += 1.6 * dt;
    if (this.keys['e'] || this.keys['E']) this.azimuth -= 1.6 * dt;
    const half = this.battle.terrain.half;
    this.target.x = clamp(this.target.x, -half, half);
    this.target.z = clamp(this.target.z, -half, half);
    this.distance = clamp(this.distance, 24, 300);

    const ty = this.battle.terrain.getHeight(this.target.x, this.target.z);
    const horiz = Math.cos(this.pitch) * this.distance;
    const vert = Math.sin(this.pitch) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.azimuth) * horiz,
      ty + vert,
      this.target.z + Math.cos(this.azimuth) * horiz
    );
    this.camera.lookAt(this.target.x, ty, this.target.z);
  }

  focus(x, z, dist = null) {
    this.target.x = x; this.target.z = z;
    if (dist) this.distance = dist;
  }

  // ---------- picking ----------
  screenToGround(cx, cy) {
    const rect = this.canvas.getBoundingClientRect();
    _ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    _ray.setFromCamera(_ndc, this.camera);
    const hits = _ray.intersectObject(this.battle.terrain.mesh, false);
    if (hits.length) return hits[0].point;
    // fallback: piano y=1
    const t = (1 - _ray.ray.origin.y) / (_ray.ray.direction.y || -0.001);
    if (t > 0) return _ray.ray.origin.clone().addScaledVector(_ray.ray.direction, t);
    return null;
  }

  squadAt(point, side = null, maxDist = 10) {
    let best = null, bestD = maxDist * maxDist;
    for (const sq of this.battle.sim.squads) {
      if (sq.state === 'dead' || sq.state === 'gone' || sq.aliveCount <= 0) continue;
      if (side !== null && sq.side !== side) continue;
      const r = Math.max(sq.width, sq.depth) * 0.5 + 2;
      const d = dist2(point.x, point.z, sq.anchor.x, sq.anchor.z);
      if (d < Math.max(bestD, r * r) && d < r * r + 16) {
        if (d < bestD || !best) { bestD = d; best = sq; }
      }
    }
    return best;
  }

  structureAt(point) {
    for (const st of this.battle.terrain.structures) {
      if (!st.destroyed && dist2(point.x, point.z, st.x, st.z) < (st.radius + 2) ** 2) return st;
    }
    return null;
  }

  projectToScreen(x, y, z) {
    _v.set(x, y, z).project(this.camera);
    return {
      x: (_v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-_v.y * 0.5 + 0.5) * window.innerHeight,
      behind: _v.z > 1,
    };
  }

  // ---------- selezione ----------
  select(squads, additive = false) {
    const b = this.battle;
    if (!additive) b.selection = [];
    for (const sq of squads) {
      if (sq.side === 0 && !b.selection.includes(sq) && sq.state !== 'dead' && sq.state !== 'gone') b.selection.push(sq);
    }
    b.onSelectionChanged();
  }

  boxSelect(x0, y0, x1, y1, additive) {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const picked = [];
    for (const sq of this.battle.sim.squads) {
      if (sq.side !== 0 || sq.state === 'dead' || sq.state === 'gone' || sq.aliveCount <= 0) continue;
      let hit = false;
      // ancora + campione di soldati
      const pts = [sq.anchor];
      const step = Math.max(1, Math.floor(sq.soldiers.length / 6));
      for (let i = 0; i < sq.soldiers.length; i += step) pts.push(sq.soldiers[i]);
      for (const p of pts) {
        const y = p.y !== undefined ? p.y : this.battle.terrain.getHeight(p.x, p.z);
        const sp = this.projectToScreen(p.x, y + 1, p.z);
        if (!sp.behind && sp.x >= minX && sp.x <= maxX && sp.y >= minY && sp.y <= maxY) { hit = true; break; }
      }
      if (hit) picked.push(sq);
    }
    this.select(picked, additive);
    if (picked.length) Audio.click();
  }

  // ---------- ordini ----------
  issueOrderAt(point, attack = false) {
    const b = this.battle;
    if (!b.selection.length) return;
    const enemy = this.squadAt(point, 1, 12);
    const structure = this.structureAt(point);
    const sel = b.selection.filter((s) => s.state === 'fight');
    if (!sel.length) return;

    if (attack || enemy || structure) {
      if (enemy) {
        for (const sq of sel) b.sim.orderAttack(sq, enemy);
        b.effects.marker(enemy.anchor.x, enemy.anchor.z, 'attack');
        Audio.attackOrder();
      } else if (structure) {
        for (const sq of sel) b.sim.orderAttackStructure(sq, structure);
        b.effects.marker(structure.x, structure.z, 'attack');
        Audio.attackOrder();
      } else {
        // attack-move su punto
        this._spreadMove(sel, point, 'attackmove');
        Audio.attackOrder();
      }
    } else {
      this._spreadMove(sel, point, 'move');
      Audio.moveOrder();
    }
  }

  _spreadMove(sel, point, kind) {
    const b = this.battle;
    // dispone le coorti selezionate in linea perpendicolare alla direzione
    const cx = sel.reduce((a, s) => a + s.anchor.x, 0) / sel.length;
    const cz = sel.reduce((a, s) => a + s.anchor.z, 0) / sel.length;
    const dirX = point.x - cx, dirZ = point.z - cz;
    const dl = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
    const perpX = -dirZ / dl, perpZ = dirX / dl;
    const totalW = sel.reduce((a, s) => a + s.width + 5, 0);
    let off = -totalW / 2;
    for (const sq of sel) {
      const px = point.x + perpX * (off + sq.width / 2);
      const pz = point.z + perpZ * (off + sq.width / 2);
      off += sq.width + 5;
      if (kind === 'move') b.sim.orderMove(sq, px, pz);
      else b.sim.orderAttackMove(sq, px, pz);
    }
    b.effects.marker(point.x, point.z, kind === 'move' ? 'move' : 'attack');
  }

  // ---------- eventi ----------
  _bind() {
    const c = this.canvas;
    this._onCtx = (e) => e.preventDefault();
    this._onDown = (e) => this._down(e);
    this._onMove = (e) => this._move(e);
    this._onUp = (e) => this._up(e);
    this._onWheel = (e) => { e.preventDefault(); this.distance *= e.deltaY > 0 ? 1.12 : 0.89; };
    this._onKeyDown = (e) => this._keyDown(e);
    this._onKeyUp = (e) => { this.keys[e.key] = false; };
    this._onBlur = () => { this.keys = {}; };
    this._onLeave = () => { this.pointer.inside = false; };
    this._onEnter = () => { this.pointer.inside = true; };
    this._onTouchStart = (e) => this._touchStart(e);
    this._onTouchMove = (e) => this._touchMove(e);
    this._onTouchEnd = (e) => this._touchEnd(e);
    c.addEventListener('contextmenu', this._onCtx);
    c.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    c.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    c.addEventListener('pointerleave', this._onLeave);
    c.addEventListener('pointerenter', this._onEnter);
    c.addEventListener('touchstart', this._onTouchStart, { passive: false });
    c.addEventListener('touchmove', this._onTouchMove, { passive: false });
    c.addEventListener('touchend', this._onTouchEnd, { passive: false });
  }

  _isTouch(e) { return e.pointerType === 'touch'; }

  _down(e) {
    if (this._isTouch(e)) return; // gestito dai touch events
    const b = this.battle;
    if (b.state !== 'running' && b.state !== 'deployment' && b.state !== 'paused') return;
    this.pointer.x = e.clientX; this.pointer.y = e.clientY;
    if (e.button === 0) {
      if (this.attackMoveMode) {
        const p = this.screenToGround(e.clientX, e.clientY);
        if (p) { this._spreadMove(b.selection.filter((s) => s.state === 'fight'), p, 'attackmove'); Audio.attackOrder(); }
        this.attackMoveMode = false;
        b.hud.setAttackMoveMode(false);
        return;
      }
      this.drag = { mode: 'select', sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, shift: e.shiftKey, moved: false };
    } else if (e.button === 1) {
      e.preventDefault();
      this.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY };
    } else if (e.button === 2) {
      this.drag = { mode: 'right', sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: false };
    }
  }

  _move(e) {
    this.pointer.x = e.clientX; this.pointer.y = e.clientY;
    this.pointer.inside = e.clientX >= 0 && e.clientY >= 0 && e.clientX <= window.innerWidth && e.clientY <= window.innerHeight;
    if (!this.drag) return;
    const d = this.drag;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.x = e.clientX; d.y = e.clientY;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 7) d.moved = true;

    if (d.mode === 'pan' || (d.mode === 'right' && d.moved)) {
      const scale = this.distance * 0.0016;
      const sin = Math.sin(this.azimuth), cos = Math.cos(this.azimuth);
      if (d.mode === 'pan') {
        this.target.x -= (dx * cos - dy * sin) * scale;
        this.target.z -= (dx * sin + dy * cos) * scale;
      } else {
        this.azimuth -= dx * 0.005;
        this.distance = clamp(this.distance + dy * 0.15, 24, 300);
      }
    } else if (d.mode === 'select' && d.moved) {
      const x0 = Math.min(d.sx, e.clientX), y0 = Math.min(d.sy, e.clientY);
      const w = Math.abs(e.clientX - d.sx), h = Math.abs(e.clientY - d.sy);
      Object.assign(this.boxEl.style, { display: 'block', left: x0 + 'px', top: y0 + 'px', width: w + 'px', height: h + 'px' });
    }
  }

  _up(e) {
    if (this._isTouch(e)) return;
    const d = this.drag;
    this.drag = null;
    this.boxEl.style.display = 'none';
    if (!d) return;
    const b = this.battle;
    if (b.state !== 'running' && b.state !== 'deployment' && b.state !== 'paused') return;

    if (d.mode === 'select') {
      if (d.moved) {
        this.boxSelect(d.sx, d.sy, e.clientX, e.clientY, d.shift);
      } else {
        const p = this.screenToGround(e.clientX, e.clientY);
        if (!p) return;
        if (b.state === 'deployment') {
          this._deploymentClick(p, d.shift);
          return;
        }
        const sq = this.squadAt(p, 0, 12);
        const now = performance.now();
        if (sq) {
          if (now - this.lastTap < 320 && this._lastClicked === sq) {
            // doppio click: tutte le coorti dello stesso tipo
            const same = b.sim.squads.filter((s) => s.side === 0 && s.type.id === sq.type.id && s.state !== 'dead' && s.aliveCount > 0);
            this.select(same, d.shift);
          } else {
            this.select([sq], d.shift);
            Audio.click();
          }
          this._lastClicked = sq;
        } else if (!d.shift) {
          this.select([], false);
        }
        this.lastTap = now;
      }
    } else if (d.mode === 'right' && !d.moved) {
      const p = this.screenToGround(e.clientX, e.clientY);
      if (!p) return;
      if (b.state === 'deployment') return;
      this.issueOrderAt(p, e.shiftKey);
    }
  }

  _deploymentClick(p, shift) {
    const b = this.battle;
    const sq = this.squadAt(p, 0, 12);
    if (sq) { this.select([sq], shift); Audio.click(); return; }
    // riposiziona le coorti selezionate nella zona di schieramento
    const r = b.sim.deployRect;
    if (Math.abs(p.x - r.x) < r.w / 2 + 30 && Math.abs(p.z - r.z) < r.d / 2 + 20) {
      const sel = b.selection;
      if (!sel.length) return;
      const totalW = sel.reduce((a, s) => a + s.width + 4, 0);
      let off = -totalW / 2;
      for (const s of sel) {
        const nx = p.x + off + s.width / 2;
        off += s.width + 4;
        const dx = nx - s.anchor.x, dz = p.z - s.anchor.z;
        s.anchor.x = nx; s.anchor.z = p.z;
        for (const sol of s.soldiers) { sol.x += dx; sol.z += dz; sol.y = b.terrain.getHeight(sol.x, sol.z); }
        s.order = { kind: 'hold', x: s.anchor.x, z: s.anchor.z, target: null };
      }
      Audio.moveOrder();
    }
  }

  // ---------- touch ----------
  setTouchMode(mode) {
    this.touchMode = mode;
    this.attackMoveMode = (mode === 'attackmove' || mode === 'attack');
    this.touchSelectMode = (mode === 'select');
    this.battle.hud.setTouchMode(mode);
    Audio.click();
  }

  selectAll() {
    const all = this.battle.sim.squads.filter((s) => s.side === 0 && s.state !== 'dead' && s.state !== 'gone' && s.aliveCount > 0);
    this.select(all, false);
    Audio.horn();
  }

  focusGeneral() {
    const g = this.battle.sim.playerGeneral;
    if (g) this.focus(g.anchor.x, g.anchor.z - 10, 120);
    Audio.click();
  }

  _touchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      this.touches.set(t.identifier, { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, moved: false, time: performance.now() });
    }
    if (this.touches.size === 2) {
      const [a, b] = [...this.touches.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchAngle = Math.atan2(b.y - a.y, b.x - a.x);
      this.drag = null;
      this.boxEl.style.display = 'none';
      if (this._longTimer) clearTimeout(this._longTimer);
      this._longTimer = null;
    } else if (this.touches.size === 1) {
      const t = [...this.touches.values()][0];
      if (this.touchSelectMode) {
        this.drag = { mode: 'select', sx: t.x, sy: t.y, x: t.x, y: t.y, shift: false, moved: false };
      } else {
        this.drag = { mode: 'pan', sx: t.x, sy: t.y, x: t.x, y: t.y, moved: false };
      }
      this.longPressFired = false;
      clearTimeout(this._longTimer);
      this._longTimer = setTimeout(() => {
        if (this.drag && !this.drag.moved && this.touches.size === 1) {
          this.longPressFired = true;
          const p = this.screenToGround(this.drag.sx, this.drag.sy);
          if (p && this.battle.selection.length && this.battle.state === 'running') {
            this._spreadMove(this.battle.selection.filter((s) => s.state === 'fight'), p, 'attackmove');
            Audio.attackOrder();
            if (navigator.vibrate) navigator.vibrate(35);
          }
        }
      }, 520);
    }
  }

  _touchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const rec = this.touches.get(t.identifier);
      if (!rec) continue;
      const dx = t.clientX - rec.x, dy = t.clientY - rec.y;
      rec.x = t.clientX; rec.y = t.clientY;
      if (Math.abs(t.clientX - rec.sx) + Math.abs(t.clientY - rec.sy) > 11) {
        rec.moved = true;
        if (this._longTimer) { clearTimeout(this._longTimer); this._longTimer = null; }
      }
      if (this.touches.size === 1 && this.drag) {
        if (this.drag.mode === 'pan') {
          const scale = this.distance * 0.0022;
          const sin = Math.sin(this.azimuth), cos = Math.cos(this.azimuth);
          this.target.x -= (dx * cos - dy * sin) * scale;
          this.target.z -= (dx * sin + dy * cos) * scale;
        } else {
          const d = this.drag;
          d.x = t.clientX; d.y = t.clientY; d.moved = true;
          const x0 = Math.min(d.sx, t.clientX), y0 = Math.min(d.sy, t.clientY);
          Object.assign(this.boxEl.style, { display: 'block', left: x0 + 'px', top: y0 + 'px', width: Math.abs(t.clientX - d.sx) + 'px', height: Math.abs(t.clientY - d.sy) + 'px' });
        }
      }
    }
    if (this.touches.size === 2) {
      const [a, b] = [...this.touches.values()];
      const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      if (this.pinchDist > 0) this.distance = clamp(this.distance * (this.pinchDist / d), 24, 300);
      this.pinchDist = d;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (this.pinchAngle !== undefined) {
        let da = ang - this.pinchAngle;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        this.azimuth -= da * 1.1;
      }
      this.pinchAngle = ang;
    }
  }

  _touchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const rec = this.touches.get(t.identifier);
      this.touches.delete(t.identifier);
      if (!rec) continue;
      if (this.touches.size === 0) {
        this.boxEl.style.display = 'none';
        if (this._longTimer) { clearTimeout(this._longTimer); this._longTimer = null; }
        if (this.drag && this.drag.mode === 'select' && this.drag.moved) {
          this.boxSelect(this.drag.sx, this.drag.sy, rec.x, rec.y, false);
          this.drag = null;
          continue;
        }
        const wasPan = this.drag && this.drag.mode === 'pan';
        this.drag = null;
        if (!rec.moved && !this.longPressFired) this._tap(rec.x, rec.y, wasPan);
      }
    }
    if (this.touches.size < 2) { this.pinchDist = 0; this.pinchAngle = undefined; }
  }

  _tap(x, y, wasPan = false) {
    const b = this.battle;
    if (b.state !== 'running' && b.state !== 'deployment') return;
    const p = this.screenToGround(x, y);
    if (!p) return;
    if (b.state === 'deployment') { this._deploymentClick(p, false); return; }
    const own = this.squadAt(p, 0, 14);

    // doppio tap su una coorte: seleziona tutte le coorti dello stesso tipo
    const now = performance.now();
    if (own && now - this.lastTap < 340 && this._lastTapped === own) {
      const same = b.sim.squads.filter((s) => s.side === 0 && s.type.id === own.type.id && s.state !== 'dead' && s.aliveCount > 0);
      this.select(same, false);
      return;
    }
    this.lastTap = now;
    this._lastTapped = own;

    if (this.touchMode === 'select') {
      this.select(own ? [own] : [], false);
      return;
    }
    // nelle modalità di attacco il tap è sempre un ordine (anche sopra una coorte propria)
    if (this.touchMode === 'attackmove' || this.touchMode === 'attack') {
      if (!b.selection.length && own) this.select([own], false);
      const enemy = this.squadAt(p, 1, 16) || this.structureAt(p);
      if (enemy || this.touchMode === 'attack') {
        this.issueOrderAt(p, true);
      } else {
        this._spreadMove(b.selection.filter((s) => s.state === 'fight'), p, 'attackmove');
        b.effects.marker(p.x, p.z, 'attack');
      }
      Audio.attackOrder();
      return;
    }
    if (own) { this.select([own], false); Audio.click(); return; }

    if (!b.selection.length) { if (wasPan) return; }
    this.issueOrderAt(p, false);
  }

  // ---------- tastiera ----------
  _keyDown(e) {
    const b = this.battle;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    this.keys[e.key] = true;
    if (b.state !== 'running' && b.state !== 'paused' && b.state !== 'deployment') return;
    const k = e.key.toLowerCase();

    if (e.key === ' ') { e.preventDefault(); b.togglePause(); return; }
    if (e.key === 'Escape') { b.togglePauseMenu(); return; }
    if (e.key === '+' || e.key === '=') { b.cycleSpeed(1); return; }
    if (e.key === '-' || e.key === '_') { b.cycleSpeed(-1); return; }
    if (e.key === 'Home') { const g = b.sim.playerGeneral; if (g) this.focus(g.anchor.x, g.anchor.z); return; }

    if (b.state === 'deployment') {
      if (e.key === 'Enter') b.startBattle();
      return;
    }

    // gruppi di controllo
    if (e.ctrlKey && /^[1-9]$/.test(e.key)) {
      b.controlGroups[e.key] = b.selection.map((s) => s.id);
      b.hud.message(`Gruppo ${e.key} assegnato (${b.selection.length} coorti)`, 'info');
      e.preventDefault();
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      const ids = b.controlGroups[e.key] || [];
      const squads = b.sim.squads.filter((s) => ids.includes(s.id) && s.state !== 'dead' && s.aliveCount > 0);
      if (squads.length) { this.select(squads, false); }
      return;
    }

    if (!b.selection.length) return;
    const sel = b.selection.filter((s) => s.state === 'fight' || s.state === 'rout');

    switch (k) {
      case 'a':
        this.attackMoveMode = true;
        b.hud.setAttackMoveMode(true);
        b.hud.message('Attack-move: clicca un punto del terreno', 'info');
        break;
      case 's': for (const sq of sel) b.sim.orderHold(sq); Audio.moveOrder(); break;
      case 'h': for (const sq of sel) { b.sim.orderHold(sq); b.sim.setFormation(sq, 'difensiva'); } Audio.formation(); break;
      case 'r': for (const sq of sel) b.sim.orderRetreat(sq); b.effects.marker(sel[0].anchor.x, sel[0].anchor.z, 'retreat'); Audio.moveOrder(); break;
      case 'l': this._formation('linea'); break;
      case 'c': this._formation('colonna'); break;
      case 't': this._formation('testudo'); break;
      case 'o': this._formation('cerchio'); break;
      case 'd': this._formation('difensiva'); break;
      case 'f': this._formation('aperta'); break;
      case 'w': this._formation('cuneo'); break;
      case 'v': this._formation('cavalleria'); break;
      case 'z': b.useAbility('radunata'); break;
      case 'x': b.useAbility('carica'); break;
      case 'b': b.useAbility('marcia'); break;
    }
  }

  _formation(id) {
    const b = this.battle;
    for (const sq of b.selection) {
      if (sq.state === 'fight') b.sim.setFormation(sq, id);
    }
    Audio.formation();
    b.hud.refreshSelection();
  }

  update(dt) {
    this.updateCamera(dt);
    // hover feedback (throttled)
    this._hoverAcc += dt;
    if (this._hoverAcc > 0.12 && this.pointer.inside && !this.drag) {
      this._hoverAcc = 0;
      const p = this.screenToGround(this.pointer.x, this.pointer.y);
      if (p) {
        const own = this.squadAt(p, 0, 10);
        const enemy = this.squadAt(p, 1, 10);
        this.canvas.style.cursor = this.attackMoveMode ? 'crosshair' : own ? 'pointer' : enemy ? 'crosshair' : 'default';
      }
    }
  }

  dispose() {
    const c = this.canvas;
    c.removeEventListener('contextmenu', this._onCtx);
    c.removeEventListener('pointerdown', this._onDown);
    c.removeEventListener('wheel', this._onWheel);
    c.removeEventListener('pointerleave', this._onLeave);
    c.removeEventListener('pointerenter', this._onEnter);
    c.removeEventListener('touchstart', this._onTouchStart);
    c.removeEventListener('touchmove', this._onTouchMove);
    c.removeEventListener('touchend', this._onTouchEnd);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.keys = {};
  }
}
