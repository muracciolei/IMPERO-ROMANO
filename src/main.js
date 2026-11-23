// ============================================================
// IMPERO ROMANO — Punto di ingresso.
// ============================================================

import { Screens } from './ui/Screens.js';
import { Save } from './core/Save.js';
import { Audio } from './core/Audio.js';

function boot() {
  const loading = document.getElementById('loading-screen');
  try {
    Screens.init();
    // prima interazione: audio
    const unlock = () => { Audio.ensure(); Audio.applyVolumes(); window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('pointerdown', unlock);
    setTimeout(() => {
      loading.classList.add('done');
      setTimeout(() => loading.remove(), 900);
    }, 700);
    // parametro di debug/test: avvia subito la prima battaglia
    const params = new URLSearchParams(location.search);
    if (params.has('autobattle')) {
      const idx = Math.min(parseInt(params.get('autobattle') || '0', 10) || 0, 29);
      import('./data/Missions.js').then(({ MISSIONS }) => {
        setTimeout(() => Screens.startBattle(MISSIONS[idx]), 150);
      });
    }
  } catch (err) {
    console.error(err);
    loading.innerHTML = `<div class="loading-title">ERRORE</div><div class="loading-sub">${err.message}</div>`;
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
