// Validazione dati: unità, fazioni, regioni, obiettivi, formazioni.
import { MISSIONS, PHASES } from '../src/data/Missions.js';
import { UNITS, FACTIONS } from '../src/data/Units.js';
import { REGIONS } from '../src/data/Regions.js';
import { FORMATIONS, formationLayout, PLAYER_FORMATIONS } from '../src/data/Formations.js';

let errors = 0;
const err = (m) => { console.error('ERRORE:', m); errors++; };

const OBJ_TYPES = ['annihilate', 'assault', 'defend', 'survive', 'kill_general', 'capture', 'capture_then_retreat', 'retreat', 'escort', 'cross', 'ambush'];
const SEC_TYPES = ['losses_below', 'kill_general', 'time_below', 'save_fraction'];

console.log(`Missioni: ${MISSIONS.length}, Fasi: ${PHASES.length}`);
const perPhase = {};
MISSIONS.forEach((m, i) => {
  perPhase[m.phase] = (perPhase[m.phase] || 0) + 1;
  if (!m.id || !m.name || !m.date || !m.context) err(`missione ${i} incompleta`);
  if (!FACTIONS[m.enemy.faction]) err(`${m.id}: fazione ${m.enemy.faction} inesistente`);
  for (const s of [...m.player.squads, ...m.enemy.squads]) {
    if (!UNITS[s.t]) err(`${m.id}: unità ${s.t} inesistente`);
    if (s.n <= 0) err(`${m.id}: n non valido per ${s.t}`);
  }
  for (const r of m.regions) if (!REGIONS[r]) err(`${m.id}: regione ${r} inesistente`);
  const p = m.objectives.primary;
  if (!OBJ_TYPES.includes(p.type)) err(`${m.id}: obiettivo ${p.type} non supportato`);
  if (p.type === 'assault' && !p.camp) err(`${m.id}: assault senza campo`);
  if (p.type === 'defend' && !p.zone) err(`${m.id}: defend senza zona`);
  if ((p.type === 'retreat' || p.type === 'escort' || p.type === 'capture_then_retreat') && !p.exit) err(`${m.id}: senza uscita`);
  if (p.type === 'escort' && !p.path) err(`${m.id}: escort senza percorso`);
  if (p.type === 'ambush' && !m.enemy.columnPath) err(`${m.id}: ambush senza columnPath`);
  for (const s of m.objectives.secondary || []) if (!SEC_TYPES.includes(s.type)) err(`${m.id}: secondario ${s.type} non supportato`);
  if (m.map.x < 0 || m.map.x > 1000 || m.map.y < 0 || m.map.y > 620) err(`${m.id}: coordinate mappa fuori range`);
});
console.log('Per fase:', perPhase);

// layout formazioni
for (const f of Object.keys(FORMATIONS)) {
  for (const n of [4, 12, 30, 60]) {
    const l = formationLayout(f, n, false);
    if (l.slots.length !== n * 2) err(`layout ${f} n=${n} sbagliato`);
    for (let i = 0; i < n * 2; i++) if (!Number.isFinite(l.slots[i])) err(`layout ${f} n=${n} NaN`);
  }
}
for (const f of PLAYER_FORMATIONS) if (!FORMATIONS[f]) err(`formazione giocatore ${f} inesistente`);

// totale soldati per missione (scala 1.0)
let maxTotal = 0;
for (const m of MISSIONS) {
  let total = 20; // generali
  for (const s of [...m.player.squads, ...m.enemy.squads]) total += s.n;
  maxTotal = Math.max(maxTotal, total);
  if (total > 4000) err(`${m.id}: troppi soldati (${total})`);
}
console.log('Massimo soldati in una battaglia (scala alta):', maxTotal);

console.log(errors ? `\n${errors} errori nei dati.` : '\nDati validi.');
process.exit(errors ? 1 : 0);
