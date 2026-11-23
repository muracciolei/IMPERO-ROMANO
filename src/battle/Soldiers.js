// ============================================================
// IMPERO ROMANO — Rendering istanziato degli eserciti.
// Poche draw call per migliaia di soldati: corpo, testa, scudo,
// arma, cavalli, elefanti, carri. Animazioni: marcia, attacco,
// caduta in morte. Bandiere e barre di stato per coorte.
// ============================================================

import * as THREE from 'three';
import { mergeGeoms, box } from './Terrain.js';
import { FACTIONS } from '../data/Units.js';

const MAX_SOLDIERS = 4200;
const MAX_MOUNTS = 900;
const MAX_ELEPHANTS = 80;
const MAX_CARTS = 200;
const MAX_SQUADS = 90;

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qs = new THREE.Quaternion(); // quaternion neutro para sombras a tierra
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);

function soldierBodyGeo() {
  return mergeGeoms([
    box(0.14, 0.55, 0.17, -0.11, 0.28, 0),
    box(0.14, 0.55, 0.17, 0.11, 0.28, 0),
    box(0.38, 0.22, 0.24, 0, 0.62, 0),
    box(0.44, 0.52, 0.27, 0, 0.98, 0),
    box(0.5, 0.14, 0.3, 0, 1.24, 0), // spalle
  ]);
}
function soldierHeadGeo() {
  return mergeGeoms([
    box(0.2, 0.22, 0.21, 0, 1.42, 0.01),
    box(0.27, 0.13, 0.29, 0, 1.56, 0),
    box(0.06, 0.12, 0.32, 0, 1.66, -0.02), // cresta
  ]);
}
function shieldGeo() {
  const g = new THREE.CylinderGeometry(0.36, 0.36, 0.78, 8, 1, false, -0.7, 1.4);
  g.rotateZ(Math.PI / 2);
  g.rotateY(Math.PI / 2);
  g.scale(1, 1, 0.35);
  g.translate(-0.34, 0.95, 0.16);
  const boss = box(0.1, 0.16, 0.1, -0.42, 0.95, 0.2);
  return mergeGeoms([g.toNonIndexed(), boss]);
}
function weaponGeo() {
  // Lama/asta base: scala per-instance per spada vs lancia.
  return mergeGeoms([
    box(0.055, 1.0, 0.055, 0, 0.5, 0),
    box(0.16, 0.05, 0.08, 0, 0.05, 0), // guardia
  ]);
}
function armorGeo() {
  return mergeGeoms([
    box(0.46, 0.32, 0.3, 0, 1.02, 0),      // corazza
    box(0.5, 0.07, 0.32, 0, 1.21, 0),      // spalliere
  ]);
}
function crestGeo() {
  return mergeGeoms([
    box(0.08, 0.2, 0.36, 0, 1.72, -0.02),
    box(0.05, 0.13, 0.3, 0, 1.84, -0.02),
  ]);
}
function cloakGeo() {
  return mergeGeoms([box(0.46, 0.6, 0.05, 0, 0.94, -0.24)]);
}
function contactShadowGeo() {
  const g = new THREE.CircleGeometry(0.62, 10);
  g.rotateX(-Math.PI / 2);
  return g;
}
function horseGeo() {
  return mergeGeoms([
    box(0.5, 0.55, 1.45, 0, 1.02, 0),
    box(0.24, 0.62, 0.32, 0, 1.42, 0.72),
    box(0.22, 0.26, 0.52, 0, 1.66, 0.95),
    box(0.12, 0.78, 0.15, -0.17, 0.4, 0.52),
    box(0.12, 0.78, 0.15, 0.17, 0.4, 0.52),
    box(0.12, 0.78, 0.15, -0.17, 0.4, -0.52),
    box(0.12, 0.78, 0.15, 0.17, 0.4, -0.52),
    box(0.1, 0.5, 0.12, 0, 1.15, -0.78), // coda
  ]);
}
function elephantGeo() {
  return mergeGeoms([
    box(1.7, 1.5, 2.7, 0, 2.0, 0),
    box(1.05, 1.05, 0.95, 0, 2.45, 1.6),
    box(0.38, 1.5, 0.38, 0, 1.55, 2.05),
    box(0.16, 0.95, 0.85, -0.68, 2.5, 1.35),
    box(0.16, 0.95, 0.85, 0.68, 2.5, 1.35),
    box(0.48, 1.35, 0.55, -0.55, 0.68, 0.85),
    box(0.48, 1.35, 0.55, 0.55, 0.68, 0.85),
    box(0.48, 1.35, 0.55, -0.55, 0.68, -0.85),
    box(0.48, 1.35, 0.55, 0.55, 0.68, -0.85),
    box(0.13, 0.13, 1.0, -0.38, 1.95, 2.0),
    box(0.13, 0.13, 1.0, 0.38, 1.95, 2.0),
    box(1.1, 0.75, 1.3, 0, 3.1, -0.2), // torretta
  ]);
}
function cartGeo() {
  const wheel = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 10);
  wheel.rotateZ(Math.PI / 2);
  const w1 = wheel.clone(); w1.translate(-0.75, 0.55, -1.1);
  const w2 = wheel.clone(); w2.translate(0.75, 0.55, -1.1);
  return mergeGeoms([
    box(1.3, 0.7, 1.9, 0, 0.95, -1.1),
    box(1.3, 0.5, 0.15, 0, 1.45, -2.0),
    w1.toNonIndexed(), w2.toNonIndexed(),
    box(0.12, 0.12, 1.4, -0.4, 0.95, 0.2),
    box(0.12, 0.12, 1.4, 0.4, 0.95, 0.2),
  ]);
}

export class SoldierRenderer {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.group = new THREE.Group();
    scene.add(this.group);
    const lambert = (opts = {}) => new THREE.MeshLambertMaterial(opts);
    const shadows = quality === 'alta';

    const mk = (geo, mat, max, castShadow = false) => {
      const im = new THREE.InstancedMesh(geo, mat, max);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = shadows && castShadow;
      im.count = 0;
      // inizializza colori istanza
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.group.add(im);
      return im;
    };

    this.bodyIM = mk(soldierBodyGeo(), lambert({}), MAX_SOLDIERS, true);
    this.headIM = mk(soldierHeadGeo(), lambert({}), MAX_SOLDIERS);
    this.shieldIM = mk(shieldGeo(), lambert({}), MAX_SOLDIERS);
    this.weaponIM = mk(weaponGeo(), lambert({ color: 0xb8b8b8 }), MAX_SOLDIERS);
    this.armorIM = mk(armorGeo(), lambert({}), MAX_SOLDIERS, true);
    this.crestIM = mk(crestGeo(), lambert({}), MAX_SOLDIERS);
    this.cloakIM = mk(cloakGeo(), lambert({ side: THREE.DoubleSide }), MAX_SOLDIERS);
    this.shadowIM = mk(contactShadowGeo(), new THREE.MeshBasicMaterial({ color: 0x0a0805, transparent: true, opacity: 0.2, depthWrite: false }), MAX_SOLDIERS);
    this.horseIM = mk(horseGeo(), lambert({}), MAX_MOUNTS, true);
    this.elephantIM = mk(elephantGeo(), lambert({}), MAX_ELEPHANTS, true);
    this.cartIM = mk(cartGeo(), lambert({}), MAX_CARTS);

    // Barre di stato sopra le coorti (2 draw call totali)
    const barGeo = new THREE.PlaneGeometry(1, 0.24);
    this.barBgIM = mk(barGeo, new THREE.MeshBasicMaterial({ color: 0x1c140c, transparent: true, opacity: 0.8, depthWrite: false }), MAX_SQUADS);
    for (let i = 0; i < MAX_SQUADS; i++) this.barBgIM.instanceColor.setXYZ(i, 0.11, 0.08, 0.05);
    this.barBgIM.instanceColor.needsUpdate = true;
    this.barFillIM = mk(barGeo.clone(), new THREE.MeshBasicMaterial({ color: 0x9ac96a, transparent: true, opacity: 0.95, depthWrite: false }), MAX_SQUADS);
    this.barBgIM.renderOrder = 5; this.barFillIM.renderOrder = 6;

    // Bandiere per coorte
    this.banners = [];
    this.bannerGroup = new THREE.Group();
    this.group.add(this.bannerGroup);

    this.selected = new Set();
    this._colorDirty = true;
  }

  addBanner(squad) {
    const fac = FACTIONS[squad.faction];
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.4, 5), new THREE.MeshLambertMaterial({ color: 0x5a4630 }));
    pole.position.y = 2.2;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshBasicMaterial({ color: fac.banner, side: THREE.DoubleSide }));
    flag.position.set(0.78, 3.7, 0);
    g.add(pole, flag);
    if (squad.isGeneral) {
      const aquila = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 4), new THREE.MeshLambertMaterial({ color: 0xd4af37 }));
      aquila.position.y = 4.6;
      g.add(aquila);
      flag.material.color.set(squad.side === 0 ? 0x9e2b25 : fac.banner);
    }
    this.bannerGroup.add(g);
    const b = { group: g, flag, squad, phase: Math.random() * 6 };
    this.banners.push(b);
    squad.banner = b;
    return b;
  }

  setSelected(ids) {
    this.selected = new Set(ids);
    this._colorDirty = true;
  }

  // Colori iniziali per tutti i soldati (chiamato a battaglia avviata e su selezione).
  refreshColors(sim) {
    const soldiers = sim.soldiers;
    for (let i = 0; i < soldiers.length; i++) {
      const s = soldiers[i];
      const fac = FACTIONS[s.squad.faction];
      const sel = this.selected.has(s.squad.id);
      const v = s.colorVar;
      const boost = sel ? 1.45 : 1.0;
      if (s.type.cat === 'elephant') {
        _c.setHex(0x8a8078).multiplyScalar(v * boost);
        this.elephantIM.instanceColor.setXYZ(s.mountIdx, _c.r, _c.g, _c.b);
        continue;
      }
      _c.setHex(fac.tunic).multiplyScalar(v * boost);
      this.bodyIM.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
      _c.setHex(0x9aa6b2).multiplyScalar(v * boost);
      this.armorIM.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
      _c.setHex(s.squad.side === 0 ? 0xb12820 : fac.banner).multiplyScalar(v * boost);
      this.crestIM.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
      _c.setHex(fac.tunic).multiplyScalar(v * boost * 0.55);
      this.cloakIM.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
      _c.setHex(fac.helmet).multiplyScalar(v * boost);
      this.headIM.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
      if (s.type.shield) {
        _c.setHex(fac.shield).multiplyScalar(v * boost);
        this.shieldIM.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
      }
      if (s.mountIdx >= 0 && s.type.cat !== 'chariot' && s.type.id !== 'salmerie') {
        _c.setHex(0x6b4f33).multiplyScalar(s.colorVar2 * boost);
        this.horseIM.instanceColor.setXYZ(s.mountIdx, _c.r, _c.g, _c.b);
      }
      if (s.cartIdx >= 0) {
        _c.setHex(s.type.id === 'salmerie' ? 0x8a7050 : fac.shield).multiplyScalar(v * boost);
        this.cartIM.instanceColor.setXYZ(s.cartIdx, _c.r, _c.g, _c.b);
      }
    }
    this.bodyIM.instanceColor.needsUpdate = true;
    this.headIM.instanceColor.needsUpdate = true;
    this.shieldIM.instanceColor.needsUpdate = true;
    this.armorIM.instanceColor.needsUpdate = true;
    this.crestIM.instanceColor.needsUpdate = true;
    this.cloakIM.instanceColor.needsUpdate = true;
    this.horseIM.instanceColor.needsUpdate = true;
    this.elephantIM.instanceColor.needsUpdate = true;
    this.cartIM.instanceColor.needsUpdate = true;
    this._colorDirty = false;
  }

  update(sim, camera, time) {
    if (this._colorDirty) this.refreshColors(sim);
    const soldiers = sim.soldiers;
    let nBody = 0, nMount = 0, nEle = 0, nCart = 0;

    for (let i = 0; i < soldiers.length; i++) {
      const s = soldiers[i];
      const t = s.type;
      const dead = s.state === 'dead';
      let hide = false;
      let deadRot = 0, sink = 0;
      if (dead) {
        if (s.deadT > 9) { hide = true; }
        else {
          deadRot = Math.min(1, s.deadT / 0.45) * (-Math.PI / 2);
          if (s.deadT > 4) sink = (s.deadT - 4) * 0.35;
        }
      }

      const bob = (!dead && s.moving) ? Math.abs(Math.sin(s.walkPhase)) * 0.07 : 0;
      const y = s.y + bob - sink;
      const size = t.size;
      const facing = s.facing;

      // lean d'attacco
      const atk = s.attackT > 0 ? Math.sin((1 - s.attackT / 0.28) * Math.PI) : 0;

      if (t.cat === 'elephant') {
        if (hide) { _m.makeScale(0, 0, 0); }
        else {
          _q.setFromAxisAngle(Y_AXIS, facing);
          if (deadRot) { _q2.setFromAxisAngle(X_AXIS, deadRot); _q.multiply(_q2); }
          const ramp = s.rampage ? 1.06 : 1;
          _m.compose(_p.set(s.x, y, s.z), _q, _s.set(size * ramp, size * ramp, size * ramp));
        }
        this.elephantIM.setMatrixAt(s.mountIdx, _m);
        nEle = Math.max(nEle, s.mountIdx + 1);
        // corpo/head nascosti per elefanti
        _m.makeScale(0, 0, 0);
        this.bodyIM.setMatrixAt(i, _m); this.headIM.setMatrixAt(i, _m);
        this.shieldIM.setMatrixAt(i, _m); this.weaponIM.setMatrixAt(i, _m);
        this.armorIM.setMatrixAt(i, _m); this.crestIM.setMatrixAt(i, _m);
        this.cloakIM.setMatrixAt(i, _m); this.shadowIM.setMatrixAt(i, _m);
        // ombra a terra dell'elefante
        if (!hide) {
          _m.compose(_p.set(s.x, s.y + 0.06, s.z), _qs, _s.set(size * 1.35, 1, size * 1.35));
          this.shadowIM.setMatrixAt(i, _m);
        }
        nBody = i + 1;
        continue;
      }

      // mounted offset (cavaliere in sella / carro)
      const isChariot = t.cat === 'chariot' || t.id === 'salmerie';
      const riderY = t.mounted ? (isChariot ? 1.35 : 1.32) : 0;
      const riderZ = isChariot ? -1.1 : 0;

      // rotazione base
      _q.setFromAxisAngle(Y_AXIS, facing);
      if (deadRot) { _q2.setFromAxisAngle(X_AXIS, deadRot); _q.multiply(_q2); }
      else if (atk > 0) { _q2.setFromAxisAngle(X_AXIS, atk * 0.14); _q.multiply(_q2); }

      const rz = Math.sin(facing) * riderZ, rx = Math.cos(facing) * riderZ;

      if (hide) {
        _m.makeScale(0, 0, 0);
        this.bodyIM.setMatrixAt(i, _m); this.headIM.setMatrixAt(i, _m);
        this.shieldIM.setMatrixAt(i, _m); this.weaponIM.setMatrixAt(i, _m);
        this.armorIM.setMatrixAt(i, _m); this.crestIM.setMatrixAt(i, _m);
        this.cloakIM.setMatrixAt(i, _m); this.shadowIM.setMatrixAt(i, _m);
      } else {
        _m.compose(_p.set(s.x + rx, y + riderY, s.z + rz), _q, _s.set(size, size, size));
        this.bodyIM.setMatrixAt(i, _m);
        this.headIM.setMatrixAt(i, _m);
        this.armorIM.setMatrixAt(i, _m);
        this.crestIM.setMatrixAt(i, _m);
        this.cloakIM.setMatrixAt(i, _m);
        // ombra di contatto: dà profondità ai ranghi
        _m.compose(_p.set(s.x, s.y + 0.07, s.z), _qs, _s.set(size * 0.95, 1, size * 0.95));
        this.shadowIM.setMatrixAt(i, _m);
        if (t.shield && !dead) {
          // in testudo lo scudo è alzato sopra la testa
          if (s.squad.formation === 'testudo') {
            _q2.setFromAxisAngle(X_AXIS, -1.25);
            const mq = _q.clone().multiply(_q2);
            _m2.compose(_p.set(s.x + rx, y + riderY + 0.55 * size, s.z + rz + 0.3), mq, _s.set(size * 1.15, size * 1.15, size * 1.15));
            this.shieldIM.setMatrixAt(i, _m2);
          } else {
            this.shieldIM.setMatrixAt(i, _m);
          }
        } else {
          _m.makeScale(0, 0, 0);
          this.shieldIM.setMatrixAt(i, _m);
        }
        // arma: scala per tipo, affondo in attacco
        if (t.weapon !== 'none' && !dead) {
          const wScaleY = t.weapon === 'spear' ? 1.7 : t.weapon === 'bow' ? 0.8 : t.weapon === 'javelin' ? 1.3 : 0.62;
          const thrust = atk * (t.weapon === 'spear' ? 0.55 : 0.35);
          _q2.setFromAxisAngle(X_AXIS, -atk * 1.1 + (t.weapon === 'bow' ? 0.3 : 0.15));
          const wq = _q.clone().multiply(_q2);
          const wx = s.x + rx + Math.cos(facing) * 0.3 * size + Math.sin(facing) * (0.25 + thrust) * size;
          const wz = s.z + rz - Math.sin(facing) * 0.3 * size + Math.cos(facing) * (0.25 + thrust) * size;
          _m.compose(_p.set(wx, y + riderY + 0.85 * size, wz), wq, _s.set(size, size * wScaleY, size));
          this.weaponIM.setMatrixAt(i, _m);
        } else {
          _m.makeScale(0, 0, 0);
          this.weaponIM.setMatrixAt(i, _m);
        }
      }
      nBody = i + 1;

      // cavallo / carro
      if (t.mounted && s.mountIdx >= 0) {
        if (hide) _m.makeScale(0, 0, 0);
        else {
          _q.setFromAxisAngle(Y_AXIS, facing);
          if (deadRot) { _q2.setFromAxisAngle(X_AXIS, deadRot * 0.8); _q.multiply(_q2); }
          const hb = (!dead && s.moving) ? Math.abs(Math.sin(s.walkPhase * 0.9)) * 0.1 : 0;
          const ms = isChariot ? 0.95 : 1.05;
          _m.compose(_p.set(s.x, y + hb - sink, s.z), _q, _s.set(ms, ms, ms));
        }
        this.horseIM.setMatrixAt(s.mountIdx, _m);
        nMount = Math.max(nMount, s.mountIdx + 1);
      }
      if (isChariot && s.cartIdx >= 0) {
        if (hide) _m.makeScale(0, 0, 0);
        else {
          _q.setFromAxisAngle(Y_AXIS, facing);
          if (deadRot) { _q2.setFromAxisAngle(X_AXIS, deadRot * 0.7); _q.multiply(_q2); }
          const cs = t.id === 'salmerie' ? 1.25 : 1.0;
          _m.compose(_p.set(s.x, y - sink, s.z), _q, _s.set(cs, cs, cs));
        }
        this.cartIM.setMatrixAt(s.cartIdx, _m);
        nCart = Math.max(nCart, s.cartIdx + 1);
      }
    }

    this.bodyIM.count = nBody; this.headIM.count = nBody;
    this.shieldIM.count = nBody; this.weaponIM.count = nBody;
    this.armorIM.count = nBody; this.crestIM.count = nBody;
    this.cloakIM.count = nBody; this.shadowIM.count = nBody;
    this.horseIM.count = nMount; this.elephantIM.count = nEle; this.cartIM.count = nCart;
    this.bodyIM.instanceMatrix.needsUpdate = true;
    this.headIM.instanceMatrix.needsUpdate = true;
    this.shieldIM.instanceMatrix.needsUpdate = true;
    this.weaponIM.instanceMatrix.needsUpdate = true;
    this.armorIM.instanceMatrix.needsUpdate = true;
    this.crestIM.instanceMatrix.needsUpdate = true;
    this.cloakIM.instanceMatrix.needsUpdate = true;
    this.shadowIM.instanceMatrix.needsUpdate = true;
    this.horseIM.instanceMatrix.needsUpdate = true;
    this.elephantIM.instanceMatrix.needsUpdate = true;
    this.cartIM.instanceMatrix.needsUpdate = true;

    // Bandiere + barre
    const camQ = camera.quaternion;
    let nBar = 0;
    for (const b of this.banners) {
      const sq = b.squad;
      const alive = sq.aliveCount > 0;
      b.group.visible = alive;
      if (!alive) continue;
      const bx = sq.anchor.x - Math.sin(sq.facing) * (sq.depth * 0.5 + 1.2);
      const bz = sq.anchor.z - Math.cos(sq.facing) * (sq.depth * 0.5 + 1.2);
      b.group.position.set(bx, sim.terrain.getHeight(bx, bz), bz);
      b.flag.rotation.y = Math.sin(time * 2.2 + b.phase) * 0.25;
      b.flag.rotation.z = Math.sin(time * 3.1 + b.phase) * 0.06;

      // barra di stato (billboard)
      const w = Math.max(3.5, Math.min(9, sq.width * 0.7));
      const by = sim.terrain.getHeight(sq.anchor.x, sq.anchor.z) + (sq.type.mounted ? 5.4 : 4.2);
      _m.compose(_p.set(sq.anchor.x, by, sq.anchor.z), camQ, _s.set(w, 1, 1));
      this.barBgIM.setMatrixAt(nBar, _m);
      const frac = sq.aliveCount / sq.n0;
      const moraleT = sq.morale / 100;
      _c.setRGB(0.85 - moraleT * 0.55, 0.25 + moraleT * 0.6, 0.2);
      if (sq.state === 'rout') _c.setRGB(0.9, 0.9, 0.9);
      this.barFillIM.instanceColor.setXYZ(nBar, _c.r, _c.g, _c.b);
      _m.compose(_p.set(sq.anchor.x - (w * (1 - frac)) / 2, by, sq.anchor.z), camQ, _s.set(w * frac, 0.8, 1));
      // offset lungo l'asse locale x del billboard
      _p.set(sq.anchor.x, by, sq.anchor.z);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQ);
      _p.addScaledVector(right, -(w * (1 - frac)) / 2);
      _m.compose(_p, camQ, _s.set(Math.max(0.001, w * frac), 0.8, 1));
      this.barFillIM.setMatrixAt(nBar, _m);
      nBar++;
    }
    this.barBgIM.count = nBar; this.barFillIM.count = nBar;
    this.barBgIM.instanceMatrix.needsUpdate = true;
    this.barFillIM.instanceMatrix.needsUpdate = true;
    this.barFillIM.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); }
    });
  }
}
