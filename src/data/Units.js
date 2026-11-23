// ============================================================
// IMPERO ROMANO — Unità militari e fazioni
// Statistiche bilanciate: hp, atk, def, spd (m/s), morale, disciplina.
// cat: heavy | light | spear | missile | javelin | cav | cavHeavy | cavLight
//      horseArcher | elephant | chariot | general | phalanx
// ============================================================

export const CATS = {
  heavy:   { name: 'Fanteria pesante', icon: '🛡' },
  light:   { name: 'Fanteria leggera', icon: '🗡' },
  missile: { name: 'Tiratori',         icon: '🏹' },
  cav:     { name: 'Cavalleria',       icon: '🐎' },
  special: { name: 'Unità speciali',   icon: '🦅' },
};

// weapon: sword | spear | bow | javelin | falx | none
// missile: { dmg, range, reload, ammo }  (ammo Infinity = unlimited)
const U = (id, name, cat, o) => ({
  id, name, cat,
  hp: 90, atk: 11, def: 8, spd: 4.6, range: 1.7,
  morale: 60, disc: 1.0, charge: 1.0, size: 1,
  weapon: 'sword', shield: true, mounted: false,
  missile: null, fear: false, kite: false, pierce: 0,
  desc: '', ...o,
});

export const UNITS = {
  // ---------------- ROMA ----------------
  hastati:      U('hastati', 'Hastati', 'heavy', { hp: 90, atk: 11, def: 9, spd: 4.7, morale: 58, weapon: 'sword',
    missile: { dmg: 24, range: 17, reload: 9, ammo: 1, kind: 'pilum' },
    desc: 'Prima linea della legione manipolare. Giovani leve armate di pilum e gladio.' }),
  principes:    U('principes', 'Principes', 'heavy', { hp: 100, atk: 13, def: 11, spd: 4.5, morale: 66, disc: 1.1,
    missile: { dmg: 24, range: 17, reload: 9, ammo: 1, kind: 'pilum' },
    desc: 'Soldati nel fiore degli anni, cuore della linea di battaglia repubblicana.' }),
  triarii:      U('triarii', 'Triarii', 'spear', { hp: 110, atk: 14, def: 14, spd: 4.0, morale: 78, disc: 1.35, weapon: 'spear',
    desc: 'Veterani della terza linea. "Res ad triarios redit": l\'ultima riserva della legione.' }),
  velites:      U('velites', 'Velites', 'javelin', { hp: 60, atk: 7, def: 3, spd: 5.7, morale: 48, disc: 0.85, weapon: 'javelin',
    missile: { dmg: 15, range: 22, reload: 3.4, ammo: 7, kind: 'javelin' },
    desc: 'Schermagliatori leggeri. Scagliano giavellotti e si ritirano dietro la linea.' }),
  legionari:    U('legionari', 'Legionari', 'heavy', { hp: 112, atk: 15, def: 13, spd: 4.6, morale: 74, disc: 1.25,
    missile: { dmg: 26, range: 17, reload: 9, ammo: 1, kind: 'pilum' },
    desc: 'Il legionario mariano: professionista addestrato, gladio, scutum e pilum.' }),
  veterani:     U('veterani', 'Veterani', 'heavy', { hp: 125, atk: 17, def: 15, spd: 4.6, morale: 85, disc: 1.45,
    missile: { dmg: 28, range: 17, reload: 9, ammo: 1, kind: 'pilum' },
    desc: 'Legionari di lunga esperienza. Tenacia e disciplina fuori dal comune.' }),
  auxilia:      U('auxilia', 'Auxilia', 'light', { hp: 85, atk: 11, def: 8, spd: 5.1, morale: 60,
    desc: 'Truppe ausiliarie non cittadine. Flessibili e veloci, meno corazzate.' }),
  arcieri:      U('arcieri', 'Arcieri', 'missile', { hp: 55, atk: 5, def: 2, spd: 5.0, morale: 45, disc: 0.8, weapon: 'bow', shield: false,
    missile: { dmg: 12, range: 55, reload: 2.3, ammo: Infinity, kind: 'arrow' },
    desc: 'Arcieri ausiliari. Letali a distanza, fragili nel corpo a corpo.' }),
  sagittarii:   U('sagittarii', 'Sagittarii', 'missile', { hp: 60, atk: 6, def: 3, spd: 5.0, morale: 52, disc: 0.9, weapon: 'bow', shield: false,
    missile: { dmg: 14, range: 60, reload: 2.1, ammo: Infinity, kind: 'arrow' },
    desc: 'Arcieri scelti d\'Oriente, al servizio dell\'Impero.' }),
  equites:      U('equites', 'Equites Romani', 'cav', { hp: 120, atk: 14, def: 10, spd: 8.6, morale: 68, disc: 1.1, charge: 2.2, mounted: true, weapon: 'spear',
    desc: 'Cavalleria di cittadini romani. Decisiva nelle cariche sui fianchi.' }),
  cavAusiliaria:U('cavAusiliaria', 'Cavalleria ausiliaria', 'cav', { hp: 110, atk: 13, def: 9, spd: 9.0, morale: 64, charge: 2.0, mounted: true, weapon: 'spear',
    desc: 'Alae di cavalleria reclutate tra Galli, Germani e Iberi.' }),
  cavPesante:   U('cavPesante', 'Cavalleria corazzata', 'cavHeavy', { hp: 165, atk: 18, def: 16, spd: 7.0, morale: 76, disc: 1.25, charge: 2.6, mounted: true, weapon: 'spear',
    desc: 'Catafratti al servizio di Roma: uomini e cavalli coperti di ferro.' }),
  cavLeggera:   U('cavLeggera', 'Cavalleria leggera', 'cavLight', { hp: 90, atk: 10, def: 6, spd: 10.2, morale: 55, charge: 1.6, mounted: true, weapon: 'javelin',
    missile: { dmg: 13, range: 18, reload: 4, ammo: 5, kind: 'javelin' },
    desc: 'Cavalleria da ricognizione e inseguimento. Veloce ma fragile.' }),
  esploratori:  U('esploratori', 'Speculatores', 'cavLight', { hp: 80, atk: 8, def: 5, spd: 11.0, morale: 55, charge: 1.4, mounted: true, weapon: 'sword',
    desc: 'Esploratori a cavallo. Occhi e orecchie del comandante.' }),
  pretoriani:   U('pretoriani', 'Pretoriani', 'special', { hp: 145, atk: 18, def: 16, spd: 4.7, morale: 88, disc: 1.5,
    desc: 'La guardia del corpo imperiale. I migliori soldati di Roma.' }),
  centurioni:   U('centurioni', 'Centurioni', 'special', { hp: 135, atk: 17, def: 14, spd: 4.6, morale: 90, disc: 1.55,
    desc: 'Ufficiali veterani che guidano la linea. Il loro esempio salda il morale.' }),
  generale:     U('generale', 'Generale', 'special', { hp: 150, atk: 16, def: 14, spd: 8.2, morale: 95, disc: 1.7, charge: 1.8, mounted: true, weapon: 'sword',
    desc: 'Il comandante e la sua scorta. La sua aura ispira le truppe vicine; la sua caduta le spezza.' }),
  salmerie:     U('salmerie', 'Salmerie e carri', 'special', { hp: 220, atk: 2, def: 4, spd: 3.4, morale: 40, disc: 0.7, mounted: true, weapon: 'none', shield: false, size: 1.25,
    desc: 'Il convoglio dei bagagli e del grano. Lento e indifeso: va scortato a tutti i costi.' }),

  // ---------------- NEMICI ----------------
  oplitaLatino: U('oplitaLatino', 'Opliti latini', 'spear', { hp: 85, atk: 10, def: 9, spd: 4.3, morale: 55, weapon: 'spear',
    desc: 'Fanteria oplitica delle città latine.' }),
  fanteEtrusco: U('fanteEtrusco', 'Fanteria etrusca', 'heavy', { hp: 90, atk: 11, def: 10, spd: 4.3, morale: 58, weapon: 'spear',
    desc: 'Opliti delle lucumonie etrusche, ben corazzati.' }),
  peltastaSannita: U('peltastaSannita', 'Peltasti sanniti', 'javelin', { hp: 75, atk: 11, def: 6, spd: 5.3, morale: 60, weapon: 'javelin',
    missile: { dmg: 14, range: 20, reload: 3.6, ammo: 5, kind: 'javelin' },
    desc: 'Guerrieri degli Appennini, maestri di imboscate e terreno aspro.' }),
  guerrieroSannita: U('guerrieroSannita', 'Guerrieri sanniti', 'light', { hp: 88, atk: 12, def: 7, spd: 5.0, morale: 64,
    desc: 'Fanteria da urto delle tribù sannitiche.' }),
  fanteEpirota: U('fanteEpirota', 'Fanteria epirota', 'spear', { hp: 90, atk: 12, def: 10, spd: 4.4, morale: 62, weapon: 'spear',
    desc: 'Veterani delle guerre ellenistiche al seguito di Pirro.' }),
  elefante:     U('elefante', 'Elefanti da guerra', 'elephant', { hp: 620, atk: 42, def: 12, spd: 5.4, morale: 70, disc: 1.2, charge: 3.0,
    size: 2.6, weapon: 'none', shield: false, fear: true,
    desc: 'Bestie da guerra terrorizzanti. Il panico si diffonde tra chi non le contrasta a distanza.' }),
  fanteLibico:  U('fanteLibico', 'Fanteria libica', 'spear', { hp: 90, atk: 12, def: 10, spd: 4.4, morale: 60, weapon: 'spear',
    desc: 'Falange africana cartaginese, solida e ben equipaggiata.' }),
  mercenarioIspanico: U('mercenarioIspanico', 'Mercenari iberici', 'light', { hp: 85, atk: 13, def: 7, spd: 4.9, morale: 62,
    desc: 'Spadaccini iberici, feroci nel corpo a corpo.' }),
  fromboliere:  U('fromboliere', 'Frombolieri balearesi', 'missile', { hp: 50, atk: 5, def: 2, spd: 5.3, morale: 45, disc: 0.8, weapon: 'bow', shield: false,
    missile: { dmg: 13, range: 50, reload: 2.0, ammo: Infinity, kind: 'stone' },
    desc: 'Frombolieri delle Baleari: proiettili che spezzano le ossa.' }),
  cavNumida:    U('cavNumida', 'Cavalleria numida', 'cavLight', { hp: 85, atk: 11, def: 5, spd: 10.6, morale: 58, charge: 1.6, mounted: true, weapon: 'javelin', kite: true,
    missile: { dmg: 13, range: 19, reload: 3.8, ammo: 8, kind: 'javelin' },
    desc: 'I migliori cavallerizzi d\'Africa. Colpiscono e si sottraggono.' }),
  cavCartaginese: U('cavCartaginese', 'Cavalleria cartaginese', 'cav', { hp: 120, atk: 14, def: 10, spd: 8.6, morale: 66, charge: 2.2, mounted: true, weapon: 'spear',
    desc: 'Cavalleria pesante iberica e gallica al soldo di Cartagine.' }),
  falangita:    U('falangita', 'Falangiti macedoni', 'phalanx', { hp: 100, atk: 16, def: 14, spd: 3.7, morale: 68, disc: 1.2, weapon: 'spear', size: 1.05,
    desc: 'La falange di sarisse. Fronte quasi invincibile, fianchi e terreno rotto i suoi talloni d\'Achille.' }),
  peltastaGreco: U('peltastaGreco', 'Peltasti greci', 'javelin', { hp: 75, atk: 11, def: 7, spd: 5.5, morale: 58, weapon: 'javelin',
    missile: { dmg: 13, range: 20, reload: 3.6, ammo: 5, kind: 'javelin' },
    desc: 'Fanteria leggera ellenica, mobile e versatile.' }),
  arciereCretese: U('arciereCretese', 'Arcieri cretesi', 'missile', { hp: 55, atk: 5, def: 2, spd: 5.1, morale: 48, weapon: 'bow', shield: false,
    missile: { dmg: 14, range: 62, reload: 2.1, ammo: Infinity, kind: 'arrow' },
    desc: 'Arcieri mercenari di Creta, rinomati in tutto il Mediterraneo.' }),
  cavMacedone:  U('cavMacedone', 'Cavalleria macedone', 'cav', { hp: 125, atk: 15, def: 11, spd: 8.8, morale: 70, disc: 1.15, charge: 2.4, mounted: true, weapon: 'spear',
    desc: 'Gli eredi dei Compagni di Alessandro.' }),
  fanteSeleucide: U('fanteSeleucide', 'Fanteria seleucide', 'heavy', { hp: 90, atk: 12, def: 10, spd: 4.4, morale: 58,
    desc: 'Argiraspidi e fanti del regno seleucide.' }),
  catafratto:   U('catafratto', 'Catafratti', 'cavHeavy', { hp: 165, atk: 18, def: 16, spd: 7.0, morale: 74, disc: 1.2, charge: 2.6, mounted: true, weapon: 'spear',
    desc: 'Cavalleria corazzata d\'Oriente. Una carica che spezza le linee.' }),
  arciereParto: U('arciereParto', 'Arcieri a cavallo parti', 'horseArcher', { hp: 90, atk: 6, def: 6, spd: 9.4, morale: 60, weapon: 'bow', shield: false, mounted: true, kite: true,
    missile: { dmg: 12, range: 46, reload: 2.4, ammo: Infinity, kind: 'arrow' },
    desc: 'Il tiro partico: colpiscono cavalcando, all\'indietro, senza mai lasciarsi afferrare.' }),
  guardiaEgizia: U('guardiaEgizia', 'Guardie del Nilo', 'heavy', { hp: 85, atk: 11, def: 9, spd: 4.5, morale: 55,
    desc: 'Fanteria del regno tolemaico, di tradizione ellenistica.' }),
  fanteBritanno: U('fanteBritanno', 'Guerrieri britanni', 'light', { hp: 85, atk: 12, def: 5, spd: 5.2, morale: 62, disc: 0.9,
    desc: 'Guerrieri dipinti di guado, impetuosi ma poco protetti.' }),
  carroBritanno: U('carroBritanno', 'Carri da guerra', 'chariot', { hp: 150, atk: 16, def: 6, spd: 10.0, morale: 64, charge: 2.5, mounted: true, weapon: 'javelin', size: 1.3,
    missile: { dmg: 14, range: 16, reload: 5, ammo: 4, kind: 'javelin' },
    desc: 'Carri britanni: rumore, velocità e terrore. Fragili se fermati.' }),
  berserkerGermano: U('berserkerGermano', 'Guerrieri germani', 'light', { hp: 110, atk: 16, def: 4, spd: 5.3, morale: 68, disc: 0.9, charge: 1.6,
    desc: 'Guerrieri delle foreste. Carica furiosa, disciplina limitata.' }),
  guerrieroDaco: U('guerrieroDaco', 'Guerrieri daci (falx)', 'light', { hp: 95, atk: 18, def: 5, spd: 5.1, morale: 70, disc: 1.05, weapon: 'falx', pierce: 6,
    desc: 'La falx dacica: una lama che aggira gli scudi e recide le braccia.' }),
  arciereDaco:  U('arciereDaco', 'Arcieri daci', 'missile', { hp: 55, atk: 5, def: 3, spd: 5.0, morale: 52, weapon: 'bow', shield: false,
    missile: { dmg: 12, range: 52, reload: 2.4, ammo: Infinity, kind: 'arrow' },
    desc: 'Arcieri dei Carpazi.' }),
  cavDaca:      U('cavDaca', 'Cavalleria daca', 'cav', { hp: 110, atk: 13, def: 8, spd: 9.0, morale: 64, charge: 2.0, mounted: true, weapon: 'spear',
    desc: 'Nobili daci a cavallo.' }),
  fantePompeiano: U('fantePompeiano', 'Legionari pompeiani', 'heavy', { hp: 100, atk: 13, def: 12, spd: 4.5, morale: 66, disc: 1.15,
    missile: { dmg: 24, range: 17, reload: 9, ammo: 1, kind: 'pilum' },
    desc: 'Legioni romane fedeli a Pompeo. Roma contro Roma.' }),
  cavPompeiana: U('cavPompeiana', 'Cavalleria pompeiana', 'cav', { hp: 115, atk: 14, def: 10, spd: 8.8, morale: 66, charge: 2.2, mounted: true, weapon: 'spear',
    desc: 'La cavalleria ottimatese, numerosa e agguerrita.' }),
  guerrieroGallico: U('guerrieroGallico', 'Guerrieri galli', 'light', { hp: 95, atk: 14, def: 5, spd: 5.1, morale: 65, disc: 0.85, charge: 1.7,
    desc: 'La furia gallica: una carica devastante che cala alla lunga.' }),
  cavGallica:   U('cavGallica', 'Cavalleria gallica', 'cav', { hp: 110, atk: 13, def: 8, spd: 9.0, morale: 62, charge: 2.1, mounted: true, weapon: 'spear',
    desc: 'Nobili galli a cavallo.' }),
  arciereGallico: U('arciereGallico', 'Arcieri galli', 'missile', { hp: 50, atk: 5, def: 2, spd: 5.0, morale: 45, weapon: 'bow', shield: false,
    missile: { dmg: 10, range: 48, reload: 2.6, ammo: Infinity, kind: 'arrow' },
    desc: 'Cacciatori galli armati d\'arco.' }),
};

// ---------------- FAZIONI ----------------
export const FACTIONS = {
  roma:        { name: 'Roma',            tunic: 0x9e2b25, shield: 0x7a1f1a, helmet: 0xb8a06a, banner: 0xc9a227, skin: 0xd9a679 },
  latini:      { name: 'Latini',          tunic: 0x8a7a52, shield: 0x6e5b33, helmet: 0xa08c5a, banner: 0x86713d, skin: 0xd9a679 },
  etruschi:    { name: 'Etruschi',        tunic: 0x3f6f6a, shield: 0x2f524e, helmet: 0xb09a5e, banner: 0x3f8f86, skin: 0xd9a679 },
  sanniti:     { name: 'Sanniti',         tunic: 0x6b5d3f, shield: 0x4c422c, helmet: 0x8f815c, banner: 0x77683f, skin: 0xd0a070 },
  epiro:       { name: 'Epiro (Pirro)',   tunic: 0x3d5a99, shield: 0x2c4477, helmet: 0xc0b070, banner: 0x4a6fc0, skin: 0xd9a679 },
  cartagine:   { name: 'Cartagine',       tunic: 0xcfc4ae, shield: 0x5e3a6e, helmet: 0xb8a878, banner: 0x7a4a8f, skin: 0xc08a5a },
  macedoni:    { name: 'Macedonia',       tunic: 0x4a5fa0, shield: 0xc9a227, helmet: 0xc9b060, banner: 0xd4af37, skin: 0xd9a679 },
  seleucidi:   { name: 'Regno seleucide', tunic: 0x7a4a8f, shield: 0x9aa0a8, helmet: 0xb8b8c0, banner: 0x8f5aa8, skin: 0xc89868 },
  egizi:       { name: 'Egitto tolemaico',tunic: 0xe0d6b8, shield: 0xc9a227, helmet: 0xd4c070, banner: 0xe0c040, skin: 0xb87a4a },
  galli:       { name: 'Galli',           tunic: 0x4a7a3f, shield: 0x8f5a2f, helmet: 0x9a8a5a, banner: 0x5a9a4a, skin: 0xe0b088 },
  germani:     { name: 'Germani',         tunic: 0x5a5248, shield: 0x6e5b33, helmet: 0x77705f, banner: 0x6a6156, skin: 0xe8c098 },
  britanni:    { name: 'Britanni',        tunic: 0x3f6f9e, shield: 0x2f5277, helmet: 0x8a8a70, banner: 0x4a86c0, skin: 0xe0b898 },
  daci:        { name: 'Daci',            tunic: 0x6e4a2f, shield: 0x4c3520, helmet: 0x9a8a5a, banner: 0x8f5a2f, skin: 0xd8a878 },
  parti:       { name: 'Parti',           tunic: 0x8f2f2f, shield: 0xc9a227, helmet: 0xb0a060, banner: 0xc0392b, skin: 0xc89868 },
  pompeiani:   { name: 'Pompeiani',       tunic: 0x3f5a8f, shield: 0x2f4477, helmet: 0xb8a06a, banner: 0x4a6fc0, skin: 0xd9a679 },
};

export const ROMAN_FACTION = 'roma';

// Bonus di veterania per livello (0..4) — dalla progressione di campagna.
export const VET_LEVELS = [
  { name: 'Reclute',    hp: 1.00, atk: 1.00, morale: 0 },
  { name: 'Addestrate', hp: 1.06, atk: 1.06, morale: 4 },
  { name: 'Esperte',    hp: 1.12, atk: 1.12, morale: 8 },
  { name: 'Veterane',   hp: 1.20, atk: 1.20, morale: 12 },
  { name: 'Leggendarie',hp: 1.30, atk: 1.30, morale: 16 },
];
export const VET_XP = [0, 150, 400, 800, 1400];

export function vetLevelFor(xp) {
  let lv = 0;
  for (let i = 0; i < VET_XP.length; i++) if (xp >= VET_XP[i]) lv = i;
  return lv;
}

// Categoria di progressione per tipo unità (romana).
export function progressionCat(typeId) {
  const u = UNITS[typeId];
  if (!u) return 'heavy';
  if (u.cat === 'missile') return 'missile';
  if (u.cat === 'cav' || u.cat === 'cavHeavy' || u.cat === 'cavLight') return 'cav';
  if (u.cat === 'special') return 'special';
  if (u.cat === 'light' || u.cat === 'javelin') return 'light';
  return 'heavy';
}

export const PROG_CATS = {
  heavy:   { name: 'Fanteria di linea', icon: '🛡', desc: 'Hastati, Principes, Legionari, Triarii' },
  light:   { name: 'Fanteria leggera',  icon: '🗡', desc: 'Velites e Auxilia' },
  missile: { name: 'Tiratori',          icon: '🏹', desc: 'Arcieri e Sagittarii' },
  cav:     { name: 'Cavalleria',        icon: '🐎', desc: 'Equites, Alae e Catafratti' },
  special: { name: 'Guardie e ufficiali', icon: '🦅', desc: 'Pretoriani e Centurioni' },
};
