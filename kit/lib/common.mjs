// Shared helpers for kit scripts and hooks. Node only, no dependencies.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.dirname(KIT);
export const HOME = os.homedir();
export const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
export const LOCAL_CFG = path.join(CLAUDE_DIR, 'mithtech-kit.local.json');
export const STATE = path.join(CLAUDE_DIR, 'mithtech-kit.state.json');
export const MANIFEST = path.join(CLAUDE_DIR, 'mithtech-kit.manifest.json');
export const CONFLICT_LOG = path.join(CLAUDE_DIR, 'mithtech-kit-conflicts.log');
export const IS_WIN = process.platform === 'win32';

export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };

export function readJSON(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
export function writeJSON(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}
export function readText(p, fallback = '') {
  try { return fs.readFileSync(p, 'utf8'); } catch { return fallback; }
}

// Back up a file once per day as <name>.bak-<date>; returns the backup path or null.
export function backup(p) {
  if (!exists(p)) return null;
  let b = `${p}.bak-${today()}`;
  if (exists(b)) return b; // first backup of the day is the pre-kit state
  fs.copyFileSync(p, b);
  const m = readJSON(MANIFEST, { backups: [], created: [] });
  m.backups.push({ file: p, backup: b, date: new Date().toISOString() });
  writeJSON(MANIFEST, m);
  return b;
}
export function recordCreated(p) {
  const m = readJSON(MANIFEST, { backups: [], created: [] });
  if (!m.created.includes(p)) m.created.push(p);
  writeJSON(MANIFEST, m);
}

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: IS_WIN, timeout: opts.timeout ?? 60000, ...opts });
  return { code: r.status ?? 1, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
export const git = (cwd, ...args) => run('git', ['-C', cwd, ...args]);

export function localConfig() {
  return readJSON(LOCAL_CFG, {});
}
export function saveLocalConfig(cfg) { writeJSON(LOCAL_CFG, cfg); }

export function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

// Minimal glob to RegExp: **, *, ?, and {a,b}. Paths use forward slashes.
export function globToRegex(glob) {
  let g = glob.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { re += '.*'; i++; if (g[i + 1] === '/') i++; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') { const end = g.indexOf('}', i); re += '(' + g.slice(i + 1, end).split(',').map(esc).join('|') + ')'; i = end; }
    else re += esc(c);
  }
  if (g.endsWith('/')) re += '.*';
  return new RegExp('^' + re + '$');
}
const esc = (s) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');

export function findUp(start, rel) {
  let d = path.resolve(start);
  for (;;) {
    const p = path.join(d, rel);
    if (exists(p)) return p;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

export function semverCmp(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number), pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

export const kitVersion = () => readText(path.join(KIT, 'VERSION')).trim();
