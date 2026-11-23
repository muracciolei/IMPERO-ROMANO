// Verifica sintassi di tutti i moduli del gioco.
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js') || p.endsWith('.mjs')) files.push(p);
  }
};
walk(join(ROOT, 'src'));
files.push(join(ROOT, 'server.mjs'));

let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    console.log('OK  ', f.replace(ROOT + '/', ''));
  } catch (e) {
    failed++;
    console.error('FAIL', f.replace(ROOT + '/', ''));
    console.error(e.stderr?.toString() || e.message);
  }
}
console.log(failed ? `\n${failed} file con errori.` : '\nTutti i moduli sono sintatticamente validi.');
process.exit(failed ? 1 : 0);
