// ============================================================
// IMPERO ROMANO — Formazioni: layout e modificatori reali.
// Ogni formazione cambia statistiche e disposizione dei soldati.
// flankMul: moltiplicatore del penalty morale quando attaccati sul fianco.
// missileDef: moltiplicatore dei danni da proiettile subiti (basso = protetti).
// ============================================================

export const FORMATIONS = {
  linea: {
    name: 'Linea di battaglia', icon: '▬', key: 'L',
    speed: 1.0, atk: 1.0, def: 1.0, missileDef: 1.0, flank: 1.0, charge: 1.0,
    desc: 'Schieramento standard: fronte ampio, potenza di combattimento equilibrata.',
  },
  colonna: {
    name: 'Colonna di marcia', icon: '▮', key: 'C',
    speed: 1.3, atk: 0.85, def: 0.9, missileDef: 1.25, flank: 1.2, charge: 1.0,
    desc: 'Marcia rapida e compatta. Vulnerabile ai proiettili e poco adatta allo scontro frontale.',
  },
  testudo: {
    name: 'Testuggine', icon: '⛨', key: 'T',
    speed: 0.45, atk: 0.7, def: 1.15, missileDef: 0.25, flank: 1.1, charge: 0.5,
    desc: 'Scudi serrati sopra le teste: quasi immuni ai proiettili, ma lenti e deboli in mischia.',
  },
  cerchio: {
    name: 'Formazione circolare', icon: '◯', key: 'O',
    speed: 0.35, atk: 0.9, def: 1.2, missileDef: 0.9, flank: 0.0, charge: 0.4,
    desc: 'Difesa a 360°: nessun fianco scoperto. Quasi immobile.',
  },
  difensiva: {
    name: 'Muro di scudi', icon: '▭', key: 'D',
    speed: 0.6, atk: 0.85, def: 1.4, missileDef: 0.7, flank: 0.55, charge: 0.5,
    desc: 'Linea serrata di scudi: eccellente per tenere una posizione, scarsa mobilità.',
  },
  aperta: {
    name: 'Ordine sparso', icon: '⋯', key: 'F',
    speed: 1.15, atk: 0.95, def: 0.8, missileDef: 0.55, flank: 1.1, charge: 1.0,
    desc: 'Ranghi larghi: bersaglio difficile per arcieri e frombolieri, meno solida in mischia.',
  },
  cuneo: {
    name: 'Cuneo d\'urto', icon: '▲', key: 'W',
    speed: 1.1, atk: 1.15, def: 0.9, missileDef: 1.05, flank: 1.3, charge: 1.7,
    desc: 'Punta di lancia per sfondare la linea nemica. Fianchi esposti.',
  },
  cavalleria: {
    name: 'Schieramento equestre', icon: '➤', key: 'V',
    speed: 1.0, atk: 1.0, def: 1.0, missileDef: 1.0, flank: 0.9, charge: 1.5,
    desc: 'Linea larga di cavalleria, pronta alla carica. Devastante contro truppe in rotta.',
  },
  falange: {
    name: 'Falange', icon: '𝍖', key: '',
    speed: 0.55, atk: 1.3, def: 1.6, missileDef: 0.85, flank: 2.6, charge: 0.8, rough: true,
    desc: 'Muro di sarisse. Fronte micidiale; crolla se aggirata o spezzata dal terreno.',
  },
};

export const PLAYER_FORMATIONS = ['linea', 'colonna', 'testudo', 'cerchio', 'difensiva', 'aperta', 'cuneo', 'cavalleria'];

// Calcola gli slot locali (x = destra, z = avanti) per n soldati.
// Ritorna { slots: Float32Array[n*2], width, depth }.
export function formationLayout(formId, n, mounted = false) {
  const sp = mounted ? 2.3 : 1.45;
  const slots = new Float32Array(n * 2);
  let width = 0, depth = 0;

  const grid = (cols, spacing, jitter = 0.06) => {
    const rows = Math.ceil(n / cols);
    width = cols * spacing; depth = rows * spacing;
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const rowCount = Math.min(cols, n - r * cols);
      slots[i * 2] = (c - (rowCount - 1) / 2) * spacing + (Math.random() - 0.5) * jitter;
      slots[i * 2 + 1] = ((rows - 1) / 2 - r) * spacing + (Math.random() - 0.5) * jitter;
    }
  };

  switch (formId) {
    case 'colonna': grid(Math.max(3, Math.round(Math.sqrt(n) * 0.55)), sp * 0.8); break;
    case 'testudo': grid(Math.max(4, Math.round(Math.sqrt(n) * 1.2)), sp * 0.55, 0.02); break;
    case 'difensiva': grid(Math.max(6, Math.round(Math.sqrt(n) * 2.2)), sp * 0.75, 0.03); break;
    case 'aperta': grid(Math.max(5, Math.round(Math.sqrt(n) * 1.7)), sp * 1.8); break;
    case 'cuneo': {
      // Triangolo: righe 1,2,3,... dall'apice (avanti) alla base.
      let i = 0, row = 0;
      while (i < n) {
        const inRow = Math.min(row + 1, n - i);
        for (let c = 0; c < inRow; c++) {
          slots[i * 2] = (c - (inRow - 1) / 2) * sp * 0.9;
          slots[i * 2 + 1] = -row * sp * 0.85;
          i++;
        }
        row++;
      }
      depth = row * sp * 0.85; width = row * sp * 0.9;
      // Centra verticalmente il cuneo
      for (let k = 0; k < n; k++) slots[k * 2 + 1] += depth / 2 - sp;
      break;
    }
    case 'cerchio': {
      let placed = 0, ring = 0;
      const baseR = Math.max(2.2, Math.sqrt(n) * sp * 0.52);
      while (placed < n) {
        const r = baseR + ring * sp * 0.9;
        const cap = ring === 0 ? Math.max(6, Math.floor((2 * Math.PI * r) / sp)) : Math.floor((2 * Math.PI * r) / sp);
        const cnt = Math.min(cap, n - placed);
        for (let c = 0; c < cnt; c++) {
          const a = (c / cnt) * Math.PI * 2 + ring * 0.35;
          slots[(placed + c) * 2] = Math.sin(a) * r;
          slots[(placed + c) * 2 + 1] = Math.cos(a) * r;
        }
        placed += cnt; ring++;
      }
      width = depth = (baseR + ring * sp) * 2;
      break;
    }
    case 'cavalleria': grid(Math.max(4, Math.round(Math.sqrt(n) * 2.0)), sp * 1.15); break;
    case 'falange': grid(Math.max(8, Math.round(Math.sqrt(n) * 2.4)), sp * 0.62, 0.02); break;
    case 'linea':
    default: grid(Math.max(6, Math.round(Math.sqrt(n) * 1.8)), sp); break;
  }
  return { slots, width: Math.max(width, 2), depth: Math.max(depth, 2) };
}

// Orientamento degli slot individuali (cerchio: verso l'esterno).
export function slotFacing(formId, lx, lz, squadFacing) {
  if (formId === 'cerchio') return Math.atan2(lx, lz);
  return squadFacing;
}
