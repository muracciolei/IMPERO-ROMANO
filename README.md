# IMPERIO ROMANO — Il destino di Roma

Gioco di strategia militare in tempo reale ambientato nell'antica Roma.
Completamente **frontend**: Three.js/WebGL, JavaScript ES modules, Web Audio API.
Nessun backend, nessun build step, nessun asset esterno obbligatorio.

## Giocare

```bash
npm start          # http://localhost:8090
```

Oppure pubblica semplicemente la cartella su GitHub Pages (branch `main`, radice `/`).

> Non aprire `index.html` con `file://`: i moduli ES richiedono un server HTTP.

## Contenuti

- **30 battaglie storiche** in 6 epoche, dalla guerra latina (496 a.C.) alla campagna partica di Traiano (116 d.C.). Ogni missione si sblocca completando la precedente.
- Campagna con obiettivi diversi: annientamento, assalto a campi fortificati, difesa, scorta di convogli, ritirata strategica, imboscate, attraversamento di fiumi, sopravvivenza fino ai rinforzi.
- Eserciti storicamente differenziati: Romani, Latini, Etruschi, Sanniti, Epiroti di Pirro (elefanti), Cartaginesi, Macedoni (falange), Seleucidi, Galli, Germani, Britanni (carri), Daci (falx), Parti (arcieri a cavallo), Egizi, Pompeiani.
- 8 formazioni con effetti reali su combattimento, mobilità e protezione dai proiettili.
- Morale, fatica, rotta e radunata: il generale cambia l'esito con la sua aura e tre abilità.
- IA nemica che difende, attacca in vantaggio, aggira con la cavalleria, usa le riserve e si ritira.
- Mappa strategica del Mediterraneo che evolves con le conquiste.
- Progressione di 5 categorie di truppe (Reclute → Leggendarie) e del generale (8 livelli).
- Salvataggio automatico in localStorage, impostazioni, Audio procedurale, qualità grafica regolabile.

## Comandi

### Desktop
| Azione | Tasto |
| --- | --- |
| Selezionare | Click / trascina rettangolo · doppio click = stesso tipo |
| Ordine | Click destro (terreno = muovi, nemico = attacca) |
| Attack-move | `A` + click |
| Stop / Muro di scudi / Ritirata | `S` / `H` / `R` |
| Formazioni | `L` `C` `T` `O` `D` `F` `W` `V` |
| Abilità | `Z` radunata · `X` carica · `B` marcia forzata |
| Camera | Frecce, bordi, trascina con pulsante centrale, rotella = zoom, `Q`/`E` rotazione |
| Tempo | `Spazio` pausa · `+`/`−` velocità |
| Gruppi | `Ctrl+1..9` assegna · `1..9` richiama |

### Mobile
- **✋ Camera**: tocca per selezionare/ordinare, trascina per spostare la camera, doppio tap su una coorte = tutte le coorti dello stesso tipo.
- **▭ Selez.**: trascina il dito sulle truppe per selezionarle con un rettangolo.
- **⚔ Avanti**: tocca il terreno per un ordine attack-move (si può tenere attiva per ordini ripetuti).
- **🎯 Attacca**: tocca un nemico per attaccarlo.
- **👑 Tutti**: seleziona tutto l'esercito · **🏠 Generale**: centra sul generale · **⏸ Pausa**.
- Pizzico con due dita = zoom · rotazione con due dita = camera · **tocco prolungato** = attack-move.
- Pulsanti grandi (≥48 px), layout adattato a schermi stretti e safe-area per notch.

## Struttura

```
index.html            Tutte le schermate e l'HUD
style.css             Tema cinematografico romano + layout responsive/mobile
vendor/three/         Three.js incluso (nessuna CDN)
src/
  main.js             Bootstrap
  core/               RNG, salvataggio/progressione, audio procedurale
  data/               Unità, fazioni, formazioni, 30 missioni, mappa regioni
  battle/             Terreno, rendering istanziato, simulazione, IA, obiettivi,
                      effetti, input (mouse/touch), orchestratore
  ui/                 Menu, mappa strategica, HUD, briefing, progressione
scripts/              Verifica sintassi e validazione dati
```

## Verifica

```bash
npm run check                 # sintassi di tutti i moduli
node scripts/validate-data.js # coerenza di missioni, unità, regioni
```

## GitHub Pages

Il repository è pronto per Pages: percorso relativi, import map per Three.js locale,
nessun build. Pubblicare il branch `main`, cartella `/ (root)`.

Licenza MIT. Three.js distribuito con la propria licenza in `vendor/three/LICENSE`.
