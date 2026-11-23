// ============================================================
// IMPERO ROMANO — Mappa strategica del Mediterraneo.
// Canvas 2D in stile mappa d'epoca: province, città, frontiere,
// percorso della campagna, battaglie, espansione di Roma.
// ============================================================

import { REGIONS, CITIES, SEAS, MAP_RIVERS, MAP_W, MAP_H } from '../data/Regions.js';
import { MISSIONS, PHASES } from '../data/Missions.js';
import { Save } from '../core/Save.js';
import { clamp } from '../core/RNG.js';

export class CampaignMap {
  constructor(canvas, onMissionClick) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onMissionClick = onMissionClick;
    this.view = { x: MAP_W / 2, y: MAP_H / 2, scale: 1 };
    this.hover = null;
    this.drag = null;
    this.pulse = 0;
    this.conquestFlash = null; // {regions:[], t}
    this.running = false;
    this._raf = 0;
    this.tooltip = document.getElementById('map-tooltip');
    this._speckle = this._makeSpeckle();
    this._bind();
    this.resize();
  }

  _makeSpeckle() {
    const c = document.createElement('canvas');
    c.width = MAP_W; c.height = MAP_H;
    const ctx = c.getContext('2d');
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * MAP_W, y = Math.random() * MAP_H;
      ctx.fillStyle = `rgba(${60 + Math.random() * 40 | 0},${45 + Math.random() * 30 | 0},25,${0.04 + Math.random() * 0.07})`;
      ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    return c;
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.dpr = dpr;
    this.w = rect.width; this.h = rect.height;
    // scala base: adatta la mappa
    this.baseScale = Math.min(this.w / MAP_W, this.h / MAP_H) * 1.02;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      this.pulse += 0.03;
      if (this.conquestFlash) {
        this.conquestFlash.t += 0.016;
        if (this.conquestFlash.t > 3) this.conquestFlash = null;
      }
      this.draw();
    };
    this._raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; cancelAnimationFrame(this._raf); }

  flashConquest(regions) { this.conquestFlash = { regions, t: 0 }; }

  centerOn(x, y, scale = null) {
    this.view.x = x; this.view.y = y;
    if (scale) this.view.scale = scale;
  }

  fitAll() { this.view = { x: MAP_W / 2, y: MAP_H / 2, scale: 1 }; }

  fitPhase(phase) {
    const ms = MISSIONS.filter((m) => m.phase === phase);
    if (!ms.length) return;
    const cx = ms.reduce((a, m) => a + m.map.x, 0) / ms.length;
    const cy = ms.reduce((a, m) => a + m.map.y, 0) / ms.length;
    this.centerOn(cx, cy, 1.9);
  }

  // coordinate schermo → mappa
  toMap(sx, sy) {
    const s = this.baseScale * this.view.scale;
    return {
      x: (sx - this.w / 2) / s + this.view.x,
      y: (sy - this.h / 2) / s + this.view.y,
    };
  }
  toScreen(mx, my) {
    const s = this.baseScale * this.view.scale;
    return { x: (mx - this.view.x) * s + this.w / 2, y: (my - this.view.y) * s + this.h / 2 };
  }

  missionAt(sx, sy) {
    const p = this.toMap(sx, sy);
    const r = 14 / this.view.scale;
    for (let i = 0; i < MISSIONS.length; i++) {
      const m = MISSIONS[i];
      const dx = p.x - m.map.x, dy = p.y - m.map.y;
      if (dx * dx + dy * dy < r * r) return { mission: m, index: i };
    }
    return null;
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      this.drag = { sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: false };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      const rect = c.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      if (this.drag) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        this.drag.x = e.clientX; this.drag.y = e.clientY;
        if (Math.abs(e.clientX - this.drag.sx) + Math.abs(e.clientY - this.drag.sy) > 6) this.drag.moved = true;
        const s = this.baseScale * this.view.scale;
        this.view.x -= dx / s; this.view.y -= dy / s;
        this.view.x = clamp(this.view.x, -100, MAP_W + 100);
        this.view.y = clamp(this.view.y, -100, MAP_H + 100);
      }
      const hit = this.missionAt(sx, sy);
      this.hover = hit;
      c.style.cursor = hit ? 'pointer' : this.drag ? 'grabbing' : 'grab';
      if (hit) {
        const unlocked = Save.isUnlocked(hit.index);
        const done = Save.isCompleted(hit.mission.id);
        this.tooltip.innerHTML = `<b>${hit.mission.name}</b><span>${hit.mission.date} · ${hit.mission.place}</span><em>${done ? '✓ Completata' : unlocked ? 'Disponibile — clicca' : '🔒 Bloccata'}</em>`;
        this.tooltip.style.display = 'block';
        this.tooltip.style.left = (e.clientX + 14) + 'px';
        this.tooltip.style.top = (e.clientY + 10) + 'px';
      } else this.tooltip.style.display = 'none';
    });
    c.addEventListener('pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      if (d && !d.moved) {
        const rect = c.getBoundingClientRect();
        const hit = this.missionAt(e.clientX - rect.left, e.clientY - rect.top);
        if (hit) this.onMissionClick(hit.mission, hit.index);
      }
    });
    c.addEventListener('pointerleave', () => { this.tooltip.style.display = 'none'; this.hover = null; });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const before = this.toMap(e.clientX - rect.left, e.clientY - rect.top);
      this.view.scale = clamp(this.view.scale * (e.deltaY > 0 ? 0.88 : 1.14), 0.7, 5);
      const after = this.toMap(e.clientX - rect.left, e.clientY - rect.top);
      this.view.x += before.x - after.x;
      this.view.y += before.y - after.y;
    }, { passive: false });
    window.addEventListener('resize', () => this.resize());
  }

  // ---------- disegno ----------
  draw() {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // mare di fondo (pergamena scura)
    const seaGrad = ctx.createLinearGradient(0, 0, this.w, this.h);
    seaGrad.addColorStop(0, '#2b444c');
    seaGrad.addColorStop(0.5, '#31505a');
    seaGrad.addColorStop(1, '#27404a');
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, 0, this.w, this.h);

    const s = this.baseScale * this.view.scale;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (this.w / 2 - this.view.x * s), dpr * (this.h / 2 - this.view.y * s));

    // linee d'onda decorative
    ctx.strokeStyle = 'rgba(220,230,225,0.05)';
    ctx.lineWidth = 1 / s;
    for (let y = 20; y < MAP_H; y += 26) {
      ctx.beginPath();
      for (let x = 0; x <= MAP_W; x += 20) {
        const yy = y + Math.sin(x * 0.05 + y) * 2;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }

    const owned = Save.romanRegions();
    const flash = this.conquestFlash;

    // regioni
    for (const id in REGIONS) {
      const r = REGIONS[id];
      const roman = owned.has(id);
      ctx.beginPath();
      r.poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      if (roman) {
        let alpha = 1;
        if (flash && flash.regions.includes(id)) alpha = 0.55 + Math.sin(flash.t * 8) * 0.35;
        ctx.fillStyle = `rgba(143,47,37,${0.88 * alpha})`;
      } else {
        ctx.fillStyle = '#cdb88e';
      }
      ctx.fill();
      ctx.strokeStyle = roman ? '#e8c860' : '#8a7050';
      ctx.lineWidth = (roman ? 1.6 : 1.1) / Math.sqrt(this.view.scale);
      ctx.stroke();
      // texture pergamena
      ctx.save();
      ctx.clip();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this._speckle, 0, 0);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // fiumi
    ctx.strokeStyle = 'rgba(90,140,160,0.8)';
    ctx.lineWidth = 1.6 / Math.sqrt(this.view.scale);
    for (const river of MAP_RIVERS) {
      ctx.beginPath();
      river.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
    }

    // etichette mari
    ctx.textAlign = 'center';
    for (const sea of SEAS) {
      ctx.save();
      ctx.translate(sea.x, sea.y);
      ctx.rotate(sea.rot || 0);
      ctx.font = `italic ${sea.size}px Georgia, serif`;
      ctx.fillStyle = 'rgba(215,228,225,0.4)';
      const text = sea.name.split('').join('\u200a');
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    // etichette regioni
    for (const id in REGIONS) {
      const r = REGIONS[id];
      const roman = owned.has(id);
      ctx.font = `${roman ? 'bold ' : ''}${10}px Georgia, serif`;
      ctx.fillStyle = roman ? 'rgba(240,220,170,0.9)' : 'rgba(70,55,35,0.85)';
      ctx.fillText(r.name.toUpperCase(), r.label[0], r.label[1]);
      if (roman && this.view.scale > 1.3) {
        ctx.font = '7px Georgia, serif';
        ctx.fillStyle = 'rgba(232,200,96,0.6)';
        ctx.fillText('· S · P · Q · R ·', r.label[0], r.label[1] + 9);
      }
    }

    // città
    for (const city of CITIES) {
      const roman = this._cityRoman(city, owned);
      ctx.beginPath();
      ctx.arc(city.x, city.y, city.capital ? 3.4 : 2, 0, Math.PI * 2);
      ctx.fillStyle = city.capital ? '#e8c860' : roman ? '#f0dca8' : '#5a4630';
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,20,10,0.7)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.font = `${city.capital ? 'bold 10px' : '8.5px'} Georgia, serif`;
      ctx.fillStyle = city.capital ? '#f5e6b8' : 'rgba(40,30,18,0.9)';
      ctx.textAlign = 'left';
      ctx.fillText(city.name, city.x + 4.5, city.y + 3);
      ctx.textAlign = 'center';
    }

    // percorso della campagna
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1.4 / Math.sqrt(this.view.scale);
    for (let i = 0; i < MISSIONS.length - 1; i++) {
      const a = MISSIONS[i], b = MISSIONS[i + 1];
      const done = Save.isCompleted(a.id);
      ctx.strokeStyle = done ? 'rgba(232,200,96,0.65)' : 'rgba(200,190,160,0.22)';
      ctx.beginPath();
      ctx.moveTo(a.map.x, a.map.y);
      ctx.lineTo(b.map.x, b.map.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // marker battaglie
    for (let i = 0; i < MISSIONS.length; i++) {
      const m = MISSIONS[i];
      const done = Save.isCompleted(m.id);
      const unlocked = Save.isUnlocked(i);
      const hovered = this.hover && this.hover.index === i;
      const r = hovered ? 10 : 8;
      // alone pulsante per la prossima disponibile
      if (unlocked && !done) {
        const pr = r + 4 + Math.sin(this.pulse * 2) * 2.5;
        ctx.beginPath();
        ctx.arc(m.map.x, m.map.y, pr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(232,200,96,0.55)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(m.map.x, m.map.y, r, 0, Math.PI * 2);
      ctx.fillStyle = done ? '#c9a227' : unlocked ? '#8f2f25' : '#4a443c';
      ctx.fill();
      ctx.strokeStyle = done ? '#f5e6b8' : unlocked ? '#e8c860' : '#6a6258';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.font = 'bold 8px Georgia, serif';
      ctx.fillStyle = done ? '#2a1c08' : unlocked ? '#f0dca8' : '#9a9288';
      ctx.fillText(done ? '✓' : unlocked ? String(i + 1) : '🔒', m.map.x, m.map.y + 3);
    }

    // cartiglio e rosa dei venti (in spazio mappa, angolo)
    this._drawDecor(ctx);

    // vignettatura schermo
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vg = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.42, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(10,6,2,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  _cityRoman(city, owned) {
    for (const id in REGIONS) {
      if (!owned.has(id)) continue;
      const r = REGIONS[id];
      if (this._inPoly(city.x, city.y, r.poly)) return true;
    }
    return false;
  }

  _inPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  _drawDecor(ctx) {
    // rosa dei venti
    const cx = 920, cy = 540, R = 30;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(232,200,96,0.5)';
    ctx.fillStyle = 'rgba(232,200,96,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R * 0.62, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const len = i % 2 === 0 ? R : R * 0.62;
      ctx.beginPath();
      ctx.moveTo(Math.sin(a - 0.09) * R * 0.2, Math.cos(a - 0.09) * R * 0.2);
      ctx.lineTo(Math.sin(a) * len, Math.cos(a) * len);
      ctx.lineTo(Math.sin(a + 0.09) * R * 0.2, Math.cos(a + 0.09) * R * 0.2);
      ctx.closePath();
      if (i % 2 === 0) ctx.fill(); else ctx.stroke();
    }
    ctx.font = 'bold 9px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('SEPTENTRIO', 0, -R - 5);
    ctx.restore();

    // cartiglio
    ctx.save();
    ctx.translate(70, 555);
    ctx.fillStyle = 'rgba(20,14,8,0.55)';
    ctx.fillRect(-58, -22, 190, 44);
    ctx.strokeStyle = 'rgba(232,200,96,0.55)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-58, -22, 190, 44);
    ctx.fillStyle = '#e8c860';
    ctx.font = 'bold 13px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.fillText('IMPERIVM ROMANVM', -48, -4);
    ctx.font = 'italic 9px Georgia, serif';
    ctx.fillStyle = 'rgba(232,220,190,0.75)';
    const prog = Save.campaignProgress();
    ctx.fillText(`Battaglie: ${prog.done}/${prog.total} · Province: ${Save.romanRegions().size}`, -48, 12);
    ctx.restore();
  }
}
