// ============================================================
// IMPERO ROMANO — Effetti di battaglia: frecce e giavellotti
// balistici, sangue, polvere, marker ordini, anelli selezione.
// Tutto instanziato o in pool: zero allocazioni per frame.
// ============================================================

import * as THREE from 'three';

const MAX_ARROWS = 512;
const MAX_PUFFS = 160;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _dir = new THREE.Vector3();
const _c = new THREE.Color();

export class Effects {
  constructor(scene, sim, camera) {
    this.scene = scene;
    this.sim = sim;
    this.camera = camera;
    this.group = new THREE.Group();
    scene.add(this.group);

    // Frecce / giavellotti / pietre
    const arrowGeo = new THREE.BoxGeometry(0.05, 0.05, 0.75);
    this.arrowIM = new THREE.InstancedMesh(arrowGeo, new THREE.MeshLambertMaterial({ color: 0x8a7050 }), MAX_ARROWS);
    this.arrowIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arrowIM.frustumCulled = false;
    this.arrowIM.count = 0;
    this.group.add(this.arrowIM);
    this.arrows = [];
    for (let i = 0; i < MAX_ARROWS; i++) this.arrows.push({ active: false, t: 0, dur: 1, sx: 0, sy: 0, sz: 0, victim: null, dmg: 0, arc: 2, kind: 'arrow' });
    this._arrowCursor = 0;

    // Puff (sangue/polvere): quad billboard
    const puffGeo = new THREE.PlaneGeometry(1, 1);
    this.puffIM = new THREE.InstancedMesh(puffGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }), MAX_PUFFS);
    this.puffIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.puffIM.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 3).fill(1), 3);
    this.puffIM.frustumCulled = false;
    this.puffIM.count = 0;
    this.puffIM.renderOrder = 4;
    this.group.add(this.puffIM);
    this.puffs = [];
    for (let i = 0; i < MAX_PUFFS; i++) this.puffs.push({ active: false, t: 0, dur: 1, x: 0, y: 0, z: 0, size: 1, grow: 1, r: 1, g: 1, b: 1 });
    this._puffCursor = 0;

    // Marker ordini
    this.markers = [];
    const ringGeo = new THREE.RingGeometry(0.8, 1.0, 32);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xc9a227, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.markers.push({ mesh, t: 0, active: false });
    }

    // Anelli di selezione coorti
    this.selRings = [];
    const selGeo = new THREE.RingGeometry(0.94, 1.0, 48);
    selGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 48; i++) {
      const mesh = new THREE.Mesh(selGeo, new THREE.MeshBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.selRings.push(mesh);
    }
  }

  spawnArrow(shooter, victim, dmg, kind = 'arrow') {
    const a = this.arrows[this._arrowCursor];
    this._arrowCursor = (this._arrowCursor + 1) % MAX_ARROWS;
    a.active = true; a.t = 0;
    a.sx = shooter.x; a.sy = shooter.y + 1.5 * shooter.type.size; a.sz = shooter.z;
    a.victim = victim; a.dmg = dmg; a.kind = kind;
    const dx = victim.x - a.sx, dz = victim.z - a.sz;
    const d = Math.sqrt(dx * dx + dz * dz);
    const speed = kind === 'arrow' ? 46 : kind === 'stone' ? 38 : 30;
    a.dur = Math.max(0.15, d / speed);
    a.arc = kind === 'arrow' ? d * 0.10 : d * 0.06;
    a.tx = victim.x; a.ty = victim.y + 1.0; a.tz = victim.z;
  }

  _puff(x, y, z, size, dur, r, g, b, grow = 1.6) {
    const p = this.puffs[this._puffCursor];
    this._puffCursor = (this._puffCursor + 1) % MAX_PUFFS;
    p.active = true; p.t = 0; p.dur = dur;
    p.x = x; p.y = y; p.z = z; p.size = size; p.grow = grow;
    p.r = r; p.g = g; p.b = b;
  }

  blood(x, z, y) { this._puff(x, y, z, 0.5, 0.35, 0.55, 0.08, 0.06, 1.8); }
  dust(x, z, n = 4) {
    const y = this.sim.terrain.getHeight(x, z);
    for (let i = 0; i < n; i++) {
      this._puff(x + (Math.random() - 0.5) * 3, y + 0.4, z + (Math.random() - 0.5) * 3, 1.2 + Math.random(), 1.1, 0.62, 0.55, 0.42, 2.2);
    }
  }

  marker(x, z, kind = 'move') {
    const mk = this.markers.find((m) => !m.active) || this.markers[0];
    mk.active = true; mk.t = 0;
    mk.mesh.visible = true;
    mk.mesh.material.color.setHex(kind === 'attack' ? 0xc0392b : kind === 'retreat' ? 0x7fb3d5 : 0xd4af37);
    mk.mesh.position.set(x, this.sim.terrain.getHeight(x, z) + 0.3, z);
  }

  setSelection(squads) {
    for (let i = 0; i < this.selRings.length; i++) {
      const ring = this.selRings[i];
      if (i < squads.length) {
        const sq = squads[i];
        ring.visible = true;
        ring.userData.squad = sq;
      } else {
        ring.visible = false;
        ring.userData.squad = null;
      }
    }
  }

  update(dt) {
    const sim = this.sim;
    // frecce
    let nA = 0;
    for (const a of this.arrows) {
      if (!a.active) continue;
      a.t += dt;
      if (a.t >= a.dur) {
        a.active = false;
        if (a.victim) sim.applyMissileHit(a.victim, a.dmg);
        continue;
      }
      const t = a.t / a.dur;
      const x = a.sx + (a.tx - a.sx) * t;
      const z = a.sz + (a.tz - a.sz) * t;
      const y = a.sy + (a.ty - a.sy) * t + Math.sin(t * Math.PI) * a.arc;
      // orientamento lungo la velocità
      const vx = (a.tx - a.sx) / a.dur;
      const vz = (a.tz - a.sz) / a.dur;
      const vy = (a.ty - a.sy) / a.dur + Math.cos(t * Math.PI) * Math.PI * a.arc / a.dur;
      _dir.set(vx, vy, vz).normalize();
      _q.setFromUnitVectors(Z_AXIS, _dir);
      const sc = a.kind === 'stone' ? 0.6 : a.kind === 'javelin' || a.kind === 'pilum' ? 1.5 : 1;
      _m.compose(_p.set(x, y, z), _q, _s.set(sc, sc, sc));
      this.arrowIM.setMatrixAt(nA++, _m);
    }
    this.arrowIM.count = nA;
    this.arrowIM.instanceMatrix.needsUpdate = true;

    // puff
    let nP = 0;
    const camQ = this.camera.quaternion;
    for (const p of this.puffs) {
      if (!p.active) continue;
      p.t += dt;
      if (p.t >= p.dur) { p.active = false; continue; }
      const t = p.t / p.dur;
      const size = p.size * (1 + t * p.grow) * (1 - t * 0.4);
      _m.compose(_p.set(p.x, p.y + t * 0.8, p.z), camQ, _s.set(size, size, size));
      this.puffIM.setMatrixAt(nP, _m);
      const fade = 1 - t;
      this.puffIM.instanceColor.setXYZ(nP, p.r * fade + (1 - fade) * 0.5, p.g * fade + (1 - fade) * 0.5, p.b * fade + (1 - fade) * 0.5);
      nP++;
    }
    this.puffIM.count = nP;
    this.puffIM.instanceMatrix.needsUpdate = true;
    this.puffIM.instanceColor.needsUpdate = true;

    // marker
    for (const mk of this.markers) {
      if (!mk.active) continue;
      mk.t += dt;
      const t = mk.t / 0.9;
      if (t >= 1) { mk.active = false; mk.mesh.visible = false; continue; }
      const s = 1.5 + t * 4;
      mk.mesh.scale.set(s, 1, s);
      mk.mesh.material.opacity = 0.9 * (1 - t);
    }

    // anelli selezione
    for (const ring of this.selRings) {
      if (!ring.visible || !ring.userData.squad) continue;
      const sq = ring.userData.squad;
      if (sq.state === 'dead' || sq.state === 'gone' || sq.aliveCount <= 0) { ring.visible = false; continue; }
      const r = Math.max(sq.width, sq.depth) * 0.5 + 1.5;
      ring.position.set(sq.anchor.x, sim.terrain.getHeight(sq.anchor.x, sq.anchor.z) + 0.25, sq.anchor.z);
      ring.scale.set(r, 1, r);
      ring.material.opacity = 0.6 + Math.sin(performance.now() * 0.004) * 0.2;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
