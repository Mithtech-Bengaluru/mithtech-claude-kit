// Interim disk sweep, per Mac (kit/docs/two-macs.md). It deletes stale cargo build targets under the folders
// listed in the local config (sweep.targetRoots). Nothing here syncs between Macs.
// Retire this file when the NEXUS cleaner owns disk cleaning.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { HOME } from './common.mjs';

export const SWEEP_DEFAULTS = { targetRoots: [], targetDays: 3, floorGB: 30, lowDays: 1 };
const TAG = 'CACHEDIR.TAG';
const SIG = 'Signature: 8a477f597d28d172789f06886806bc55'; // the cache directory tag that cargo writes
const BIG = new Set(['deps', '.fingerprint', 'build', 'incremental']); // stat these, never list them
const DAY = 864e5;

export const expand = (p, home = HOME) => path.resolve(String(p).replace(/^~(?=$|\/)/, home));
export const collapse = (p, home = HOME) => (p === home || p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p);
const within = (child, parent) => child === parent || child.startsWith(parent + path.sep);

export function freeGB(p) {
  try { const s = fs.statfsSync(p); return (s.bavail * s.bsize) / 2 ** 30; } catch { return null; }
}

// Why a folder may not be a sweep root, or null when it may.
export function rootProblem(root, { home = HOME, codingRoot = null } = {}) {
  if (!path.isAbsolute(root)) return 'not an absolute path';
  if (root.split(path.sep).filter(Boolean).length < 3) return 'too close to the disk root';
  if (within(home, root)) return 'holds the home folder';
  const cr = codingRoot ? path.resolve(codingRoot) : null;
  if (cr && (within(cr, root) || within(root, cr))) return 'overlaps the coding root';
  if (fs.existsSync(path.join(root, '.git'))) return 'is a git repo';
  return null;
}

export const isCargoTarget = (dir) => {
  try { return fs.readFileSync(path.join(dir, TAG), 'utf8').startsWith(SIG); } catch { return false; }
};

// Newest mtime in the top three levels of a target folder. A build always touches one of them.
export function lastBuildMs(dir) {
  let newest = 0;
  const walk = (d, depth) => {
    let ents;
    try { newest = Math.max(newest, fs.statSync(d).mtimeMs); ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && depth < 3 && !BIG.has(e.name)) walk(p, depth + 1);
      else { try { newest = Math.max(newest, fs.lstatSync(p).mtimeMs); } catch {} }
    }
  };
  walk(dir, 1);
  return newest;
}

// True when a process has a file open under dir, or when that cannot be checked.
export function openFiles(dir) {
  const r = spawnSync('lsof', ['+D', dir], { encoding: 'utf8', timeout: 120e3, maxBuffer: 16 * 2 ** 20 });
  if (r.error || r.status === null) return true;
  return (r.stdout || '').trim().split('\n').length > 1;
}

// Deletes each direct child of a root that is a cargo target, is older than the limit and is not in use.
export function sweep(cfg = {}, { dry = false, now = Date.now(), home = HOME, codingRoot = null, free = freeGB, inUse = openFiles } = {}) {
  const o = { ...SWEEP_DEFAULTS, ...cfg };
  const res = { removed: [], kept: [], refused: [], low: [] };
  for (const raw of o.targetRoots || []) {
    const root = expand(raw, home);
    const bad = rootProblem(root, { home, codingRoot });
    if (bad) { res.refused.push({ root, why: bad }); continue; }
    let ents;
    try { ents = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    const gb = free(root);
    const days = gb != null && gb < o.floorGB ? Math.min(o.lowDays, o.targetDays) : o.targetDays;
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      const p = path.join(root, e.name);
      const keep = (why) => res.kept.push({ path: p, why });
      if (!isCargoTarget(p)) { keep('no cargo CACHEDIR.TAG'); continue; }
      if (fs.existsSync(path.join(p, '.git'))) { keep('is a git repo'); continue; }
      const age = (now - lastBuildMs(p)) / DAY;
      if (age < days) { keep(`built ${age.toFixed(1)} days ago, limit ${days}`); continue; }
      if (inUse(p)) { keep('in use'); continue; }
      if (!dry) {
        try { fs.rmSync(p, { recursive: true, force: true }); } catch (err) { keep(`delete failed: ${err.code || err.message}`); continue; }
      }
      res.removed.push({ path: p, days: Math.floor(age) });
    }
    const after = dry ? gb : free(root);
    if (after != null && after < o.floorGB) res.low.push({ root, freeGB: Math.round(after) });
  }
  return res;
}
