// ============================================================
// IMPERO ROMANO — Terreno di battaglia 3D.
// Heightmap procedurale per missione: colline, fiumi, foreste,
// colori per bioma, alberi e rocce instanziati, campi fortificati.
// ============================================================

import * as THREE from 'three';
import { makeRNG, makeNoise2D, fbm, clamp } from '../core/RNG.js';

const BIOMES = {
  mediterraneo: { grass: [0.31, 0.43, 0.17], dry: [0.53, 0.48, 0.25], rock: [0.45, 0.42, 0.36], sand: [0.62, 0.56, 0.38], tree: 0x466a2c, trunk: 0x5a4630, fog: 0xc8b890, sky: 0x9fb8c8 },
  verde:        { grass: [0.24, 0.42, 0.15], dry: [0.40, 0.47, 0.21], rock: [0.42, 0.42, 0.38], sand: [0.55, 0.52, 0.36], tree: 0x2f5a26, trunk: 0x4f3d28, fog: 0xb8c8b0, sky: 0x9fc0d0 },
  arido:        { grass: [0.58, 0.50, 0.30], dry: [0.66, 0.58, 0.36], rock: [0.52, 0.46, 0.36], sand: [0.72, 0.64, 0.44], tree: 0x6b7a3a, trunk: 0x6b5236, fog: 0xd8c8a0, sky: 0xc0c8c0 },
  foresta:      { grass: [0.19, 0.34, 0.14], dry: [0.28, 0.40, 0.19], rock: [0.38, 0.38, 0.34], sand: [0.45, 0.44, 0.30], tree: 0x24481e, trunk: 0x453524, fog: 0xa8b8a0, sky: 0x90b0c0 },
  aspro:        { grass: [0.33, 0.38, 0.21], dry: [0.44, 0.43, 0.26], rock: [0.48, 0.45, 0.40], sand: [0.55, 0.50, 0.36], tree: 0x3f5a2c, trunk: 0x50402c, fog: 0xb8b8a8, sky: 0xa0b8c8 },
};

function mergeGeoms(geoms) {
  // Unisce geometrie non indicizzate in una sola (position+normal, color se presente).
  let total = 0;
  const nonIndexed = geoms.map((g) => { const n = g.index ? g.toNonIndexed() : g; total += n.attributes.position.count; return n; });
  const hasColor = nonIndexed.every((g) => g.attributes.color);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  const col = hasColor ? new Float32Array(total * 3) : null;
  let off = 0;
  for (const g of nonIndexed) {
    pos.set(g.attributes.position.array, off * 3);
    nor.set(g.attributes.normal.array, off * 3);
    if (col) col.set(g.attributes.color.array, off * 3);
    off += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

function box(w, h, d, x, y, z, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
  g.applyMatrix4(m);
  return g;
}

// Colora una geometria con una tinta uniforme e una leggera variazione.
function vertexColor(geo, color, jitter = 0.12) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const count = g.attributes.position.count;
  const arr = new Float32Array(count * 3);
  const c = new THREE.Color(color);
  const v = 1 - jitter + Math.random() * jitter * 2;
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r * v; arr[i * 3 + 1] = c.g * v; arr[i * 3 + 2] = c.b * v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export class Terrain {
  constructor(spec, quality = 'media') {
    this.spec = spec;
    this.size = spec.size || 400;
    this.half = this.size / 2;
    this.biome = BIOMES[spec.biome] || BIOMES.mediterraneo;
    this.rng = makeRNG(spec.seed * 7919 + 13);
    this.noise = makeNoise2D(spec.seed);
    this.noise2 = makeNoise2D(spec.seed + 101);
    this.waterLevel = -0.9;
    this.structures = [];
    this.obstacles = [];   // cerchi di collisione {x,z,r,s}
    this.group = new THREE.Group();
    this.treePositions = [];

    const seg = quality === 'alta' ? 160 : quality === 'bassa' ? 96 : 128;
    this._buildMesh(seg);
    this._buildWater();
    this._buildVegetation(quality);
  }

  // ---------- funzioni di campo ----------
  riverDist(x, z) {
    const r = this.spec.river;
    if (!r) return Infinity;
    return r.axis === 'x' ? Math.abs(z - r.pos) : Math.abs(x - r.pos);
  }

  getHeight(x, z) {
    const s = this.spec;
    let h = 1.2 + fbm(this.noise, x * 0.011 + 3.7, z * 0.011 + 9.2, 3) * 5.5 * (s.rough || 0.5);
    h += fbm(this.noise2, x * 0.05, z * 0.05, 2) * 0.7 * (s.rough || 0.5);
    for (const hill of s.hills || []) {
      const dx = x - hill.x, dz = z - hill.z;
      const d2 = (dx * dx + dz * dz) / (hill.r * hill.r);
      if (d2 < 4) h += hill.h * Math.exp(-d2 * 1.4);
    }
    if (s.river) {
      const d = this.riverDist(x, z);
      const w = s.river.width;
      if (d < w) {
        const t = 1 - d / w;
        h -= (h + 2.4) * Math.min(1, t * t * 1.6);
      }
    }
    return h;
  }

  getSlope(x, z) {
    const e = 1.5;
    const hx = this.getHeight(x + e, z) - this.getHeight(x - e, z);
    const hz = this.getHeight(x, z + e) - this.getHeight(x, z - e);
    return Math.sqrt(hx * hx + hz * hz) / (2 * e);
  }

  isForest(x, z) {
    for (const f of this.spec.forests || []) {
      const dx = x - f.x, dz = z - f.z;
      if (dx * dx + dz * dz < f.r * f.r) return true;
    }
    return false;
  }

  inWater(x, z) { return this.getHeight(x, z) < this.waterLevel + 0.25; }

  inBounds(x, z, margin = 6) {
    return Math.abs(x) < this.half - margin && Math.abs(z) < this.half - margin;
  }

  clampToBounds(p, margin = 8) {
    p.x = clamp(p.x, -this.half + margin, this.half - margin);
    p.z = clamp(p.z, -this.half + margin, this.half - margin);
    return p;
  }

  // ---------- mesh ----------
  _buildMesh(seg) {
    const geo = new THREE.PlaneGeometry(this.size, this.size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const b = this.biome;
    const rng = makeRNG(this.spec.seed + 5);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.getHeight(x, z);
      pos.setY(i, h);
      const slope = this.getSlope(x, z);
      const forest = this.isForest(x, z);
      const n = fbm(this.noise2, x * 0.08 + 40, z * 0.08 + 40, 2);
      const broad = fbm(this.noise, x * 0.017, z * 0.017, 2);
      let r, g, bl;
      if (h < this.waterLevel + 0.6) { [r, g, bl] = b.sand; }
      else if (slope > 0.55) { [r, g, bl] = b.rock; }
      else {
        const t = clamp(0.2 + (n - 0.5) * 1.6 + (broad - 0.5) * 0.7 + (h - 1.2) * 0.02, 0, 1);
        r = b.grass[0] + (b.dry[0] - b.grass[0]) * t;
        g = b.grass[1] + (b.dry[1] - b.grass[1]) * t;
        bl = b.grass[2] + (b.dry[2] - b.grass[2]) * t;
        if (forest) { r *= 0.72; g *= 0.85; bl *= 0.7; }
      }
      const v = 0.86 + rng() * 0.22;
      colors[i * 3] = r * v; colors[i * 3 + 1] = g * v; colors[i * 3 + 2] = bl * v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
    this.group.add(this.mesh);

    // Bordo mappa: montagne lontane (quinta scenografica)
    const rimGeo = new THREE.RingGeometry(this.half * 0.98, this.half * 2.6, 48, 3);
    rimGeo.rotateX(-Math.PI / 2);
    const rimPos = rimGeo.attributes.position;
    for (let i = 0; i < rimPos.count; i++) {
      const x = rimPos.getX(i), z = rimPos.getZ(i);
      const d = Math.sqrt(x * x + z * z);
      const t = clamp((d - this.half) / (this.half * 1.2), 0, 1);
      rimPos.setY(i, -0.5 + t * t * (26 + fbm(this.noise, x * 0.01, z * 0.01, 2) * 30));
    }
    rimGeo.computeVertexNormals();
    const rim = new THREE.Mesh(rimGeo, new THREE.MeshLambertMaterial({ color: new THREE.Color(b.fog).multiplyScalar(0.82) }));
    this.group.add(rim);
  }

  _buildWater() {
    if (!this.spec.river) return;
    const geo = new THREE.PlaneGeometry(this.size, this.size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0x3f6f7a, transparent: true, opacity: 0.78 });
    this.water = new THREE.Mesh(geo, mat);
    this.water.position.y = this.waterLevel;
    this.group.add(this.water);
  }

  _buildVegetation(quality) {
    const b = this.biome;
    const treeCount = quality === 'bassa' ? 140 : quality === 'alta' ? 420 : 260;
    const blob = (r, x, y, z) => {
      const g = new THREE.IcosahedronGeometry(r, 0);
      g.scale(1, 1.15, 1);
      g.translate(x, y, z);
      return g;
    };
    // Chioma a grappoli: legge come un albero, non come un sasso verde.
    const treeGeo = mergeGeoms([
      vertexColor(box(0.34, 2.4, 0.34, 0, 1.2, 0), b.trunk, 0.1),
      vertexColor(blob(1.45, 0, 3.0, 0), b.tree, 0.16),
      vertexColor(blob(1.0, 0.8, 2.6, 0.25), b.tree, 0.24),
      vertexColor(blob(0.9, -0.7, 2.75, -0.2), b.tree, 0.3),
    ]);
    const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.trees = new THREE.InstancedMesh(treeGeo, treeMat, treeCount);
    this.trees.castShadow = quality === 'alta';
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    let placed = 0, guard = 0;
    const forests = this.spec.forests || [];
    while (placed < treeCount && guard++ < treeCount * 12) {
      let x, z;
      if (forests.length && this.rng() < 0.85) {
        const f = this.rng.pick(forests);
        const a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * f.r;
        x = f.x + Math.sin(a) * r; z = f.z + Math.cos(a) * r;
      } else {
        x = this.rng.range(-this.half + 12, this.half - 12);
        z = this.rng.range(-this.half + 12, this.half - 12);
        if (!this.isForest(x, z) && this.rng() < 0.75) continue;
      }
      if (!this.inBounds(x, z, 10) || this.inWater(x, z)) continue;
      const y = this.getHeight(x, z);
      const s = this.rng.range(0.7, 1.5);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng() * Math.PI * 2);
      m.compose(p.set(x, y - 0.2, z), q, sc.set(s, s * this.rng.range(0.85, 1.2), s));
      this.trees.setMatrixAt(placed, m);
      this.treePositions.push({ x, z, r: 0.6 * s });
      placed++;
    }
    this.trees.count = placed;
    this.trees.instanceMatrix.needsUpdate = true;
    this.trees.frustumCulled = false;
    this.group.add(this.trees);

    // Rocce
    const rockCount = quality === 'bassa' ? 30 : 70;
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rockMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(this.biome.rock[0], this.biome.rock[1], this.biome.rock[2]) });
    this.rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    let rp = 0; guard = 0;
    while (rp < rockCount && guard++ < rockCount * 10) {
      const x = this.rng.range(-this.half + 14, this.half - 14);
      const z = this.rng.range(-this.half + 14, this.half - 14);
      if (this.inWater(x, z)) continue;
      const y = this.getHeight(x, z);
      const s = this.rng.range(0.4, 1.6);
      q.setFromEuler(new THREE.Euler(this.rng() * 0.5, this.rng() * Math.PI * 2, this.rng() * 0.5));
      m.compose(p.set(x, y + s * 0.2, z), q, sc.set(s * this.rng.range(0.8, 1.4), s * 0.7, s));
      this.rocks.setMatrixAt(rp, m);
      if (s > 1.0) this.obstacles.push({ x, z, r: s * 0.9, natural: true });
      rp++;
    }
    this.rocks.count = rp;
    this.rocks.instanceMatrix.needsUpdate = true;
    this.rocks.frustumCulled = false;
    this.group.add(this.rocks);

    // Ciuffi d'erba: una sola draw call, danno texture e profondità al terreno.
    const tuftGeoms = [];
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.ConeGeometry(0.06, 0.5, 3);
      blade.translate((i - 1) * 0.09, 0.25, (i % 2) * 0.07);
      tuftGeoms.push(blade);
    }
    const tuftCount = quality === 'bassa' ? 1500 : quality === 'alta' ? 5200 : 3400;
    this.tufts = new THREE.InstancedMesh(mergeGeoms(tuftGeoms), new THREE.MeshBasicMaterial({}), tuftCount);
    this.tufts.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(tuftCount * 3).fill(1), 3);
    const up = new THREE.Vector3(0, 1, 0);
    const grassC = new THREE.Color(0x8a9a4a);
    const dryC = new THREE.Color(0xb3a466);
    const col = new THREE.Color();
    let tp = 0; guard = 0;
    while (tp < tuftCount && guard++ < tuftCount * 6) {
      const x = this.rng.range(-this.half + 8, this.half - 8);
      const z = this.rng.range(-this.half + 8, this.half - 8);
      if (this.inWater(x, z)) continue;
      const y = this.getHeight(x, z);
      const s = this.rng.range(0.6, 1.45);
      q.setFromAxisAngle(up, this.rng() * Math.PI * 2);
      m.compose(p.set(x, y - 0.04, z), q, sc.set(s, s * this.rng.range(0.8, 1.5), s));
      this.tufts.setMatrixAt(tp, m);
      col.copy(grassC).lerp(dryC, this.rng() * 0.5).multiplyScalar(this.rng.range(0.85, 1.05));
      this.tufts.instanceColor.setXYZ(tp, col.r, col.g, col.b);
      tp++;
    }
    this.tufts.count = tp;
    this.tufts.instanceMatrix.needsUpdate = true;
    this.tufts.instanceColor.needsUpdate = true;
    this.tufts.frustumCulled = false;
    this.group.add(this.tufts);

    // Alberi come ostacoli leggeri (solo i più grandi)
    for (const t of this.treePositions) if (t.r > 0.75) this.obstacles.push({ x: t.x, z: t.z, r: t.r * 0.7, natural: true });
  }

  // ---------- campo fortificato (obiettivi assalto/difesa) ----------
  buildCamp(cx, cz, factionColor = 0x6b5236) {
    const rng = makeRNG(Math.floor(cx * 13 + cz * 7) + 999);
    const woodMat = new THREE.MeshLambertMaterial({ color: factionColor });
    const darkWood = new THREE.MeshLambertMaterial({ color: 0x4a3826 });
    const tentMat = new THREE.MeshLambertMaterial({ color: 0xb8a888 });
    const commandMat = new THREE.MeshLambertMaterial({ color: 0x8f2f2f });
    const W = 46, D = 34;
    const y0 = this.getHeight(cx, cz);

    const addStructure = (mesh, x, z, hp, kind, radius, objective = false) => {
      mesh.position.set(x, this.getHeight(x, z), z);
      this.group.add(mesh);
      const s = { x, z, hp, maxHp: hp, kind, mesh, radius, objective, destroyed: false, side: 1 };
      this.structures.push(s);
      this.obstacles.push({ x, z, r: radius, s });
      return s;
    };

    // Palizzata: segments sui 4 lati con varco a sud (verso il giocatore)
    const segLen = 5;
    const palisadeGeo = mergeGeoms([
      box(segLen, 2.6, 0.4, 0, 1.3, 0),
      box(0.3, 3.1, 0.3, -segLen / 2 + 0.3, 1.55, 0),
      box(0.3, 3.1, 0.3, segLen / 2 - 0.3, 1.55, 0),
      box(0.3, 3.1, 0.3, 0, 1.55, 0),
    ]);
    const mkPal = (x, z, ry) => {
      const mesh = new THREE.Mesh(palisadeGeo, woodMat);
      mesh.rotation.y = ry;
      mesh.castShadow = true;
      addStructure(mesh, x, z, 260, 'palisade', 2.4);
    };
    for (let x = -W / 2; x <= W / 2; x += segLen) {
      if (Math.abs(x) > 6) mkPal(cx + x, cz + D / 2, 0); // lato sud con varco centrale
      mkPal(cx + x, cz - D / 2, 0);
    }
    for (let z = -D / 2 + segLen / 2; z < D / 2; z += segLen) {
      mkPal(cx - W / 2, cz + z, Math.PI / 2);
      mkPal(cx + W / 2, cz + z, Math.PI / 2);
    }
    // Torri agli angoli
    const towerGeo = mergeGeoms([box(3, 6, 3, 0, 3, 0), box(4, 0.6, 4, 0, 6.2, 0), box(0.4, 1.2, 0.4, -1.6, 6.9, -1.6), box(0.4, 1.2, 0.4, 1.6, 6.9, -1.6), box(0.4, 1.2, 0.4, -1.6, 6.9, 1.6), box(0.4, 1.2, 0.4, 1.6, 6.9, 1.6)]);
    for (const [tx, tz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
      const mesh = new THREE.Mesh(towerGeo, darkWood);
      mesh.castShadow = true;
      addStructure(mesh, cx + tx, cz + tz, 420, 'tower', 2.2);
    }
    // Tende
    const tentGeo = mergeGeoms([box(4, 2.2, 5, 0, 1.1, 0), box(4.4, 0.5, 5.4, 0, 2.3, 0)]);
    const tentSpots = [[-12, -6], [12, -6], [-12, 8], [12, 8]];
    for (const [tx, tz] of tentSpots) {
      const mesh = new THREE.Mesh(tentGeo, tentMat);
      mesh.rotation.y = rng() * 0.6 - 0.3;
      addStructure(mesh, cx + tx, cz + tz, 300, 'tent', 2.6, true);
    }
    // Tenda del comando (obiettivo principale)
    const cmdGeo = mergeGeoms([box(6, 3, 7, 0, 1.5, 0), box(6.6, 0.6, 7.6, 0, 3.2, 0), box(0.3, 5, 0.3, 0, 5.5, 0)]);
    const cmd = new THREE.Mesh(cmdGeo, commandMat);
    cmd.castShadow = true;
    const cmdS = addStructure(cmd, cx, cz - 2, 600, 'command', 3.2, true);
    // Bandiera sulla tenda comando
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), new THREE.MeshBasicMaterial({ color: factionColor, side: THREE.DoubleSide }));
    flag.position.set(1.2, 7.2, 0);
    cmd.add(flag);
    cmdS.flag = flag;
    return this.structures;
  }

  // ---------- area di schieramento ----------
  buildDeployRect(rect, color = 0x9e2b25) {
    const group = new THREE.Group();
    const geo = new THREE.PlaneGeometry(rect.w, rect.d, 16, 8);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + rect.x, z = pos.getZ(i) + rect.z;
      pos.setY(i, this.getHeight(x, z) + 0.1);
    }
    const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.045, depthWrite: false, side: THREE.DoubleSide }));
    fill.position.x = rect.x;
    fill.position.z = rect.z;
    const x0 = rect.x - rect.w / 2, x1 = rect.x + rect.w / 2;
    const z0 = rect.z - rect.d / 2, z1 = rect.z + rect.d / 2;
    const pts = [];
    for (let x = x0; x <= x1; x += 4) pts.push(new THREE.Vector3(x, this.getHeight(x, z0) + 0.22, z0));
    for (let z = z0; z <= z1; z += 4) pts.push(new THREE.Vector3(x1, this.getHeight(x1, z) + 0.22, z));
    for (let x = x1; x >= x0; x -= 4) pts.push(new THREE.Vector3(x, this.getHeight(x, z1) + 0.22, z1));
    for (let z = z1; z >= z0; z -= 4) pts.push(new THREE.Vector3(x0, this.getHeight(x0, z) + 0.22, z));
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.28 }));
    line.visible = false; // il bordo taglierebbe lo schermo: basta la velatura a terra
    group.add(fill, line);
    // Vessilli ai quattro angoli.
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x4a3826 });
    const flagMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
      const y = this.getHeight(px, pz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 5), poleMat);
      pole.position.set(px, y + 1.5, pz);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.75), flagMat);
      flag.position.set(px + 0.6, y + 2.6, pz);
      group.add(pole, flag);
    }
    this.group.add(group);
    return { group, fill, line, zone: rect };
  }

  // ---------- zone obiettivo ----------
  buildZone(zone, color = 0xc9a227) {
    const y = this.getHeight(zone.x, zone.z) + 0.35;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(zone.r - 1.2, zone.r, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(zone.x, y, zone.z);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(zone.r - 1.2, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(zone.x, y - 0.05, zone.z);
    // Palo con vessillo
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), new THREE.MeshLambertMaterial({ color: 0x5a4630 }));
    pole.position.set(zone.x, y + 3, zone.z);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    flag.position.set(zone.x + 1.3, y + 5.2, zone.z);
    this.group.add(ring, disc, pole, flag);
    return { ring, disc, pole, flag, zone };
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); }
    });
  }
}

export { mergeGeoms, box };
