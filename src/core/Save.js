// ============================================================
// IMPERO ROMANO — Salvataggio locale, progressione, impostazioni.
// Tutto in localStorage: campagna, autosave, legioni, generale.
// ============================================================

import { MISSIONS } from '../data/Missions.js';
import { VET_XP, vetLevelFor } from '../data/Units.js';

const SAVE_KEY = 'impero_romano_save_v1';
const SETTINGS_KEY = 'impero_romano_settings_v1';

const DEFAULT_SAVE = () => ({
  version: 1,
  started: false,
  completed: {},          // id -> { stars, losses, time, date, secondary: [bool] }
  xp: { heavy: 0, light: 0, missile: 0, cav: 0, special: 0 },
  general: { name: 'Quinto Fabio Massimo', xp: 0, level: 1, battles: 0, wins: 0 },
  rewardsTaken: [],       // scelte di ricompensa già effettuate per missione
  totalKills: 0,
  totalLosses: 0,
  createdAt: Date.now(),
});

const DEFAULT_SETTINGS = () => ({
  quality: 'media',       // bassa | media | alta
  musicVol: 0.55,
  sfxVol: 0.8,
  edgeScroll: true,
  cameraSpeed: 1.0,
  showHints: true,
  difficulty: 'storica',  // facile | storica | leggendaria
});

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback();
    return { ...fallback(), ...JSON.parse(raw) };
  } catch { return fallback(); }
}

export const Save = {
  data: null,
  settings: null,

  load() {
    this.data = readJSON(SAVE_KEY, DEFAULT_SAVE);
    this.settings = readJSON(SETTINGS_KEY, DEFAULT_SETTINGS);
    // merge difensivo
    this.data.xp = { ...DEFAULT_SAVE().xp, ...this.data.xp };
    this.data.general = { ...DEFAULT_SAVE().general, ...this.data.general };
  },

  persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch {}
  },
  persistSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch {}
  },

  hasCampaign() { return this.data.started || Object.keys(this.data.completed).length > 0; },

  newCampaign() {
    this.data = DEFAULT_SAVE();
    this.data.started = true;
    this.persist();
  },

  resetAll() {
    this.data = DEFAULT_SAVE();
    this.persist();
  },

  isUnlocked(index) {
    if (index === 0) return true;
    return !!this.data.completed[MISSIONS[index - 1].id];
  },
  isCompleted(id) { return !!this.data.completed[id]; },

  nextMissionIndex() {
    for (let i = 0; i < MISSIONS.length; i++) {
      if (!this.data.completed[MISSIONS[i].id]) return i;
    }
    return MISSIONS.length - 1;
  },

  // Registra il risultato di una battaglia.
  completeMission(id, result) {
    const known = MISSIONS.some((m) => m.id === id);
    const prev = this.data.completed[id];
    const stars = result.stars || 1;
    if (known && (!prev || stars > prev.stars || (stars === prev.stars && result.losses < prev.losses))) {
      this.data.completed[id] = { stars, losses: result.losses, time: result.time, date: Date.now(), secondary: result.secondary || [] };
    }
    this.data.totalKills += result.kills || 0;
    this.data.totalLosses += result.lossesSoldiers || 0;
    this.data.general.battles++;
    if (result.victory) this.data.general.wins++;
    this.data.general.xp += Math.round((result.xpGeneral || 40) * (result.victory ? 1 : 0.35));
    this.data.general.level = generalLevelFor(this.data.general.xp);
    this.persist(); // autosave
  },

  addCategoryXP(cat, amount) {
    this.data.xp[cat] = (this.data.xp[cat] || 0) + amount;
    this.persist();
  },

  applyReward(missionId, reward) {
    if (this.data.rewardsTaken.includes(missionId)) return;
    this.data.rewardsTaken.push(missionId);
    if (reward.cat) this.addCategoryXP(reward.cat, reward.amount);
    if (reward.general) { this.data.general.xp += reward.general; this.data.general.level = generalLevelFor(this.data.general.xp); }
    this.persist();
  },

  romanRegions() {
    const owned = new Set(['latium']);
    for (const m of MISSIONS) {
      if (this.data.completed[m.id]) for (const r of m.regions) owned.add(r);
    }
    return owned;
  },

  campaignProgress() {
    const done = Object.keys(this.data.completed).length;
    return { done, total: MISSIONS.length, pct: done / MISSIONS.length };
  },
};

export const GENERAL_XP_LEVELS = [0, 120, 320, 620, 1050, 1600, 2300, 3200];
export const GENERAL_TITLES = ['Legato', 'Tribuno militare', 'Prefetto', 'Legato di legione', 'Console', 'Proconsole', 'Imperator', 'Divus'];

export function generalLevelFor(xp) {
  let lv = 1;
  for (let i = 0; i < GENERAL_XP_LEVELS.length; i++) if (xp >= GENERAL_XP_LEVELS[i]) lv = i + 1;
  return Math.min(lv, 8);
}

// Bonus reali del generale sul campo, per livello.
export function generalBonuses(level) {
  const abilities = ['radunata'];
  if (level >= 3) abilities.push('carica');
  if (level >= 5) abilities.push('marcia');
  return {
    auraRadius: 26 + level * 4,
    moraleRegen: 1.5 + level * 0.5,
    meleeBonus: 1 + level * 0.02,
    speedBonus: 1 + level * 0.015,
    abilities,
  };
}

export function vetInfo(cat) {
  const xp = Save.data.xp[cat] || 0;
  const lv = vetLevelFor(xp);
  const next = VET_XP[lv + 1];
  return { xp, lv, next, pct: next ? (xp - VET_XP[lv]) / (next - VET_XP[lv]) : 1 };
}

Save.load();
