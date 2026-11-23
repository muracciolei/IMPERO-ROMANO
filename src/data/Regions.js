// ============================================================
// IMPERO ROMANO — Mappa strategica del mondo antico.
// Poligoni stilizzati in spazio 1000×620 (stile mappa d'epoca).
// Ogni regione può diventare romana completando le missioni.
// ============================================================

export const MAP_W = 1000, MAP_H = 620;

export const REGIONS = {
  britannia:   { name: 'Britannia', label: [192, 108], poly: [[150,62],[186,56],[214,76],[230,104],[226,134],[196,146],[162,140],[140,116],[144,86]] },
  caledonia:   { name: 'Caledonia', label: [172, 34], poly: [[140,16],[180,8],[206,30],[212,58],[186,56],[150,62],[134,40]] },
  gallia:      { name: 'Gallia', label: [232, 192], poly: [[122,166],[140,150],[152,150],[200,136],[242,128],[286,140],[310,164],[316,200],[300,236],[266,250],[226,256],[186,240],[156,206],[146,178]] },
  hispania:    { name: 'Hispania', label: [160, 305], poly: [[80,256],[150,246],[226,256],[250,270],[240,300],[216,330],[180,360],[130,366],[90,340],[70,300],[74,270]] },
  germania:    { name: 'Germania', label: [362, 122], poly: [[290,140],[310,100],[340,70],[390,60],[426,80],[430,130],[416,170],[380,186],[340,180],[310,166]] },
  cisalpina:   { name: 'Gallia Cisalpina', label: [360, 218], poly: [[310,216],[340,198],[386,196],[410,206],[412,226],[380,236],[340,238],[316,232]] },
  etruria:     { name: 'Etruria', label: [372, 254], poly: [[356,240],[390,238],[398,258],[386,272],[362,268],[352,256]] },
  umbria:      { name: 'Umbria', label: [406, 250], poly: [[390,238],[412,236],[420,252],[410,266],[398,258]] },
  latium:      { name: 'Latium', label: [396, 283], poly: [[386,272],[406,268],[416,282],[406,296],[388,290],[380,280]] },
  sannio:      { name: 'Sannio', label: [426, 278], poly: [[406,268],[426,262],[438,278],[428,292],[416,282]] },
  apulia:      { name: 'Apulia', label: [450, 286], poly: [[428,278],[452,272],[468,288],[456,300],[438,296]] },
  magnaGrecia: { name: 'Magna Grecia', label: [440, 320], poly: [[420,296],[446,300],[462,316],[458,336],[442,346],[430,330],[418,310]] },
  sicilia:     { name: 'Sicilia', label: [418, 360], poly: [[396,352],[436,348],[446,362],[416,372],[396,366]] },
  sardinia:    { name: 'Sardegna', label: [338, 304], poly: [[330,290],[346,288],[348,316],[336,320],[328,306]] },
  corsica:     { name: 'Corsica', label: [340, 266], poly: [[336,254],[346,252],[348,278],[338,280]] },
  africa:      { name: 'Africa (Cartagine)', label: [346, 382], poly: [[310,370],[340,352],[366,350],[384,362],[380,396],[356,412],[326,406],[308,390]] },
  numidia:     { name: 'Numidia', label: [278, 396], poly: [[256,376],[310,370],[308,390],[326,406],[300,420],[260,412],[240,396]] },
  cyrenaica:   { name: 'Cirenaica', label: [514, 448], poly: [[480,430],[540,426],[560,446],[540,470],[490,466],[470,450]] },
  aegyptus:    { name: 'Aegyptus', label: [628, 470], poly: [[560,446],[620,430],[660,436],[680,450],[670,480],[640,520],[622,560],[600,560],[610,510],[590,480],[566,470]] },
  illyricum:   { name: 'Illyricum', label: [474, 240], poly: [[446,216],[480,206],[506,226],[500,256],[480,276],[460,260],[450,240]] },
  pannonia:    { name: 'Pannonia', label: [492, 210], poly: [[456,196],[500,186],[530,200],[526,226],[496,236],[466,226],[456,216]] },
  moesia:      { name: 'Moesia', label: [562, 238], poly: [[526,226],[570,216],[600,230],[596,256],[560,260],[530,250]] },
  dacia:       { name: 'Dacia', label: [556, 196], poly: [[520,180],[560,170],[596,186],[590,216],[560,220],[530,210],[520,196]] },
  thracia:     { name: 'Thracia', label: [590, 278], poly: [[560,260],[600,256],[626,270],[616,296],[586,300],[560,286]] },
  macedonia:   { name: 'Macedonia', label: [512, 282], poly: [[480,266],[520,258],[546,270],[540,296],[516,306],[490,296],[478,280]] },
  graecia:     { name: 'Graecia', label: [512, 318], poly: [[490,296],[516,306],[540,296],[546,316],[526,336],[506,340],[490,326],[486,310]] },
  creta:       { name: 'Creta', label: [552, 359], poly: [[530,354],[570,352],[576,362],[536,366]] },
  cyprus:      { name: 'Cyprus', label: [662, 362], poly: [[650,358],[676,354],[680,364],[656,370]] },
  asia:        { name: 'Asia', label: [648, 316], poly: [[616,296],[660,286],[690,300],[686,330],[656,346],[626,340],[610,320]] },
  cappadocia:  { name: 'Cappadocia', label: [730, 316], poly: [[690,300],[740,290],[776,306],[770,330],[736,340],[696,336],[686,330]] },
  armenia:     { name: 'Armenia', label: [812, 294], poly: [[776,280],[820,270],[850,286],[846,310],[810,318],[780,310],[770,306]] },
  syria:       { name: 'Syria', label: [700, 376], poly: [[680,346],[716,340],[730,366],[720,400],[700,416],[686,396],[676,370]] },
  iudaea:      { name: 'Iudaea', label: [682, 428], poly: [[676,400],[700,416],[696,440],[676,446],[666,426]] },
  mesopotamia: { name: 'Mesopotamia', label: [824, 372], poly: [[770,330],[820,320],[860,340],[880,380],[866,416],[830,420],[796,396],[776,360]] },
  partia:      { name: 'Partia', label: [924, 386], poly: [[860,340],[920,320],[972,340],[976,400],[940,440],[896,446],[866,416],[880,380]] },
};

export const CITIES = [
  { name: 'Roma', x: 390, y: 274, capital: true },
  { name: 'Veio', x: 386, y: 262 },
  { name: 'Cartagine', x: 358, y: 358 },
  { name: 'Siracusa', x: 434, y: 362 },
  { name: 'Atene', x: 524, y: 322 },
  { name: 'Sparta', x: 514, y: 334 },
  { name: 'Alessandria', x: 642, y: 442 },
  { name: 'Antiochia', x: 700, y: 356 },
  { name: 'Ctesifonte', x: 862, y: 402 },
  { name: 'Londinium', x: 206, y: 112 },
  { name: 'Lutezia', x: 246, y: 176 },
  { name: 'Alesia', x: 274, y: 184 },
  { name: 'Massilia', x: 282, y: 242 },
  { name: 'Tarraco', x: 216, y: 290 },
  { name: 'Corduba', x: 150, y: 330 },
  { name: 'Gerusalemme', x: 684, y: 430 },
  { name: 'Sarmizegetusa', x: 550, y: 204 },
  { name: 'Bisanzio', x: 592, y: 280 },
  { name: 'Efeso', x: 626, y: 322 },
  { name: 'Aquileia', x: 404, y: 212 },
];

// Regioni possedute da Roma all'inizio (509 a.C.: solo il Lazio).
export const INITIAL_ROMAN = ['latium'];

// Mari etichettati (stile mappa antica).
export const SEAS = [
  { name: 'MARE INTERNVM', x: 800, y: 505, size: 17, rot: -0.08 },
  { name: 'Mare Tyrrhenum', x: 372, y: 316, size: 12, rot: -0.5 },
  { name: 'Mare Hadriaticum', x: 442, y: 250, size: 10, rot: 0.7 },
  { name: 'Mare Aegaeum', x: 572, y: 322, size: 11, rot: 0 },
  { name: 'Pontus Euxinus', x: 660, y: 250, size: 12, rot: 0 },
  { name: 'OCEANVS', x: 90, y: 150, size: 16, rot: -0.3 },
  { name: 'Mare Germanicum', x: 250, y: 70, size: 11, rot: 0 },
];

// Fiumi principali disegnati sulla mappa.
export const MAP_RIVERS = [
  [[300,168],[310,140],[318,110],[330,86]],            // Reno
  [[410,206],[450,200],[490,206],[530,214],[570,222],[600,236]], // Danubio
  [[640,442],[636,470],[628,500],[618,530],[612,556]], // Nilo
  [[800,330],[824,360],[846,392],[862,414]],           // Eufrate
  [[390,240],[392,258],[390,274]],                     // Tevere
];
