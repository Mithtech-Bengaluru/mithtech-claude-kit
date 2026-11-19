#!/usr/bin/env node
// Live git sync between one person's Macs (kit/docs/two-macs.md). Opt-in: liveSync: true in the local config.
//   livesync.mjs run [--force]          the launchd job (every 10 min): sync live repos, hourly register,
//                                       daily prune, weekly cache clean, daily disk sweep
//   livesync.mjs repo [dir] [--now]     sync one repo now (--now: no idle wait)
//   livesync.mjs audit [--json]         uncommitted / unpushed / stashes / paused / old worktrees, every repo
//   livesync.mjs resume [dir]           clear a paused repo after you fixed it
//   livesync.mjs clone <rel>            partial clone of a registry repo (placeholder or missing folder)
//   livesync.mjs register [--mode off|live|pull] [--set <rel>=<mode>]   add local repos to the registry
//   livesync.mjs prune [--dry-run]      list (or prune) idle, clean, pushed clones
//   livesync.mjs clean-caches [--dry-run]
//   livesync.mjs sweep [--dry-run] [--add-root <dir>]   delete stale cargo build targets (this Mac only)
//   livesync.mjs status                 one line per registry repo
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CLAUDE_DIR, HOME, localConfig, readJSON, saveLocalConfig, writeJSON } from '../lib/common.mjs';
import * as L from '../lib/livesync.mjs';
import * as S from '../lib/sweep.mjs';

export const STATE_FILE = path.join(CLAUDE_DIR, 'mithtech-livesync.state.json');
export const LOG_FILE = path.join(CLAUDE_DIR, 'mithtech-livesync.log');

// sharedRoot: an explicit path in the local config, else <Syncthing "default" folder>/0000.codesync on this Mac.
export function liveConfig(cfg = localConfig(), home = HOME) {
  const root = process.env.CODING_ROOT || cfg.codingRoot || null;
  const shared = cfg.sharedRoot || L.defaultSharedRoot(home) || process.env.SHARED_ROOT || null;
  return {
    ...L.DEFAULTS, ...(cfg.liveSyncOptions || {}),
    enabled: !!cfg.liveSync, root, shared, device: cfg.devicePrefix || 'dev',
    ownOwners: cfg.ownGitOwners || [], registry: shared ? L.registryFile(shared) : null,
  };
}
export const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
export function notify(msg) {
  if (process.env.MITHTECH_NO_NOTIFY || process.platform !== 'darwin') return;
  spawnSync('osascript', ['-e', `display notification ${JSON.stringify(msg)} with title "Live sync"`], { timeout: 5000 });
}
export function log(line) {
  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
    const st = fs.statSync(LOG_FILE);
    if (st.size > 2e6) { const t = fs.readFileSync(LOG_FILE, 'utf8').split('\n'); fs.writeFileSync(LOG_FILE, t.slice(-4000).join('\n')); }
  } catch {}
}
// The registry entry for a checkout (a linked worktree maps to its main repo).
export function entryFor(c, dir) {
  const info = L.repoInfo(dir);
  if (!info || !c.root || !c.registry) return null;
  const rel = path.relative(real(c.root), real(info.mainTop)).split(path.sep).join('/');
  if (rel.startsWith('..')) return null;
  const e = L.readRegistry(c.registry).repos[rel];
  return e ? { rel, ...e, info } : { rel, mode: null, info };
}
const once = (st, key, hours, fn) => {
  st.notified = st.notified || {};
  if (st.notified[key] && Date.now() - Date.parse(st.notified[key]) < hours * 3600e3) return;
  st.notified[key] = new Date().toISOString(); fn();
};

export function runJob(c, { force = false } = {}) {
  const st = readJSON(STATE_FILE, {});
  const lock = path.join(CLAUDE_DIR, 'mithtech-livesync.lock');
  try {
    const l = readJSON(lock, null);
    if (l && Date.now() - Date.parse(l.at) < 30 * 60e3) { try { process.kill(l.pid, 0); return ['another run is in progress']; } catch {} }
  } catch {}
  writeJSON(lock, { pid: process.pid, at: new Date().toISOString() });
  const out = [];
  try {
    if (!c.root || !fs.existsSync(c.root)) return [`coding root ${c.root || '(unset)'} not mounted`];
    if (!c.registry) return ['no shared root: no Syncthing "default" folder and no sharedRoot in the local config'];
    const due = (k, h) => force || !st[k] || Date.now() - Date.parse(st[k]) > h * 3600e3;
    let { repos, copies } = L.readRegistry(c.registry);
    if (due('lastHourly', 1) || copies.length) {
      // new repos start as off: a repo goes live only when you set it (livesync.mjs register --set <path>=live)
      const r = L.register(c.root, repos, { mode: c.newRepoMode || 'off', ownOwners: c.ownOwners });
      const made = L.placeholders(c.root, repos);
      if (r.added.length || copies.length || !fs.existsSync(c.registry)) L.writeRegistry(c.registry, repos, copies);
      if (r.added.length) out.push(`registered ${r.added.join(', ')}`);
      if (made.length) out.push(`placeholders ${made.join(', ')}`);
      st.lastHourly = new Date().toISOString();
    }
    for (const [rel, e] of Object.entries(repos)) {
      if (e.mode !== 'live' && e.mode !== 'pull') continue;
      const dir = path.join(c.root, rel);
      if (!fs.existsSync(path.join(dir, '.git'))) continue;
      const trees = e.mode === 'live' ? L.worktrees(dir).filter((w) => !w.prunable).map((w) => w.path) : [dir];
      for (const t of trees) {
        const r = L.syncRepo(t, { ...c, mode: e.mode, main: e.main || c.main, force });
        const name = path.relative(c.root, t).split(path.sep).join('/');
        if (r.status === 'paused') once(st, `paused:${name}:${r.note}`, 24, () => notify(`${name} paused: ${r.note}`));
        for (const f of r.refused || []) once(st, `refused:${name}:${f.path}`, 24 * 7, () => notify(`${name}: not committed ${f.path} (${f.why})`));
        if (r.committed || r.pulled || r.pushed || ['paused', 'error'].includes(r.status)) out.push(`${name}: ${r.status}${r.note ? ` (${r.note})` : ''}${r.committed ? ` +${r.committed} files` : ''}${r.pulled ? ` pulled ${r.pulled}` : ''}${r.pushed ? ` pushed ${r.pushed}` : ''}`);
      }
    }
    if (due('lastDaily', 24)) {
      for (const [rel, e] of Object.entries(repos)) {
        if (e.mode !== 'live' || e.keep || /^frappe\d*\//.test(rel) || !c.pruneDays) continue;
        const dir = path.join(c.root, rel);
        if (!fs.existsSync(path.join(dir, '.git'))) continue;
        const p = L.prune(c.root, rel, e, { pruneDays: c.pruneDays, shared: c.shared });
        if (p.ok) out.push(`pruned ${rel} (idle ${c.pruneDays} days, clean and pushed)`);
      }
      st.lastDaily = new Date().toISOString();
    }
    if (due('lastWeekly', 24 * 7)) {
      for (const [rel, e] of Object.entries(repos)) {
        if (e.mode === 'off') continue;
        const dir = path.join(c.root, rel);
        if (!fs.existsSync(path.join(dir, '.git'))) continue;
        const rm = L.cleanCaches(dir, { cacheDays: c.cacheDays });
        if (rm.length) out.push(`${rel}: removed ${rm.join(', ')}`);
      }
      st.lastWeekly = new Date().toISOString();
    }
    st.lastRun = new Date().toISOString();
    writeJSON(STATE_FILE, st);
  } finally { fs.rmSync(lock, { force: true }); }
  for (const l of out) log(l);
  return out;
}

// Disk sweep (interim, per Mac): once a day, and on every run while free space is under the floor.
export function runSweep(cfg = localConfig(), { force = false, dry = false, hooks = {} } = {}) {
  const o = { ...S.SWEEP_DEFAULTS, ...(cfg.sweep || {}) };
  if (!(o.targetRoots || []).length) return dry ? ['sweep: no build target roots on this Mac (livesync.mjs sweep --add-root <dir>)'] : [];
  const st = readJSON(STATE_FILE, {});
  const free = hooks.free || S.freeGB;
  const low = o.targetRoots.some((r) => { const gb = free(S.expand(r)); return gb != null && gb < o.floorGB; });
  if (!force && !dry && !low && st.lastSweep && Date.now() - Date.parse(st.lastSweep) < 24 * 3600e3) return [];
  const r = S.sweep(o, { dry, codingRoot: cfg.codingRoot || null, ...hooks });
  const out = [
    ...r.refused.map((x) => `sweep: refused root ${x.root} (${x.why})`),
    ...r.removed.map((x) => `sweep: ${dry ? 'would remove' : 'removed'} ${x.path} (last build ${x.days} days ago)`),
    ...(dry ? r.kept.map((x) => `sweep: kept ${x.path} (${x.why})`) : []),
    ...r.low.map((x) => `sweep: ${x.freeGB} GB free at ${x.root}, under the ${o.floorGB} GB floor`),
  ];
  if (dry) return out.length ? out : ['sweep: nothing to remove'];
  for (const x of r.low) once(st, `sweep-low:${x.root}`, 24, () => notify(`Disk low: ${x.freeGB} GB free after the sweep`));
  st.lastSweep = new Date().toISOString();
  writeJSON(STATE_FILE, st);
  for (const l of out) log(l);
  return out;
}

export function auditAll(root) {
  const res = [];
  for (const rel of L.findRepos(root, { worktrees: true })) {
    const a = L.auditRepo(path.join(root, rel));
    if (!a) continue;
    const old = a.worktrees.filter((w) => w.ageDays > 1);
    if (a.items.length || old.length) res.push({ rel, items: a.items, oldWorktrees: old.map((w) => `${w.path} (${Math.floor(w.ageDays)}d)`) });
  }
  return res;
}

// ---------- CLI ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const has = (k) => args.includes(k);
  const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const c = liveConfig();
  const cmd = args[0];
  const die = (m, code = 1) => { console.error(`livesync: ${m}`); process.exit(code); };
  const pos = args.slice(1).filter((a, i, arr) => !a.startsWith('--') && !(i > 0 && ['--mode', '--set', '--add-root'].includes(arr[i - 1])));
  if (cmd === 'run') {
    if (!c.enabled) { if (!has('--quiet')) console.log('livesync: off on this machine (liveSync is not set)'); process.exit(0); }
    const out = [...runJob(c, { force: has('--force') }), ...runSweep()];
    if (!has('--quiet')) console.log(out.join('\n') || 'livesync: nothing to do');
  } else if (cmd === 'sweep') {
    const cfg = localConfig();
    const add = val('--add-root');
    if (has('--add-root')) {
      if (!add) die('usage: livesync.mjs sweep --add-root <dir>');
      const root = S.expand(add);
      const bad = S.rootProblem(root, { codingRoot: cfg.codingRoot || null });
      if (bad) die(`${root} cannot be a sweep root: ${bad}`);
      const roots = (cfg.sweep?.targetRoots || []).map((r) => S.expand(r));
      if (!roots.includes(root)) saveLocalConfig({ ...cfg, sweep: { ...(cfg.sweep || {}), targetRoots: [...roots, root].map((r) => S.collapse(r)) } });
      console.log(`sweep: ${root} ${roots.includes(root) ? 'is already a root' : 'added'}; check it with: livesync.mjs sweep --dry-run`);
    } else console.log(runSweep(cfg, { force: true, dry: has('--dry-run') }).join('\n') || 'sweep: nothing to remove');
  } else if (cmd === 'repo') {
    const dir = path.resolve(pos[0] || process.cwd());
    const e = entryFor(c, dir);
    if (!e || !e.mode) die(`${dir} is not in the registry; run: livesync.mjs register --set <rel>=live`);
    if (e.mode === 'off') die(`${e.rel} has mode off`);
    const r = L.syncRepo(dir, { ...c, mode: e.mode, main: e.main || c.main, noIdle: has('--now'), ignoreSessions: has('--now'), force: true });
    console.log(`${e.rel}: ${r.status}${r.note ? ` (${r.note})` : ''}; committed ${r.committed}, pulled ${r.pulled}, pushed ${r.pushed}${r.refused.length ? `; not committed: ${r.refused.map((f) => `${f.path} (${f.why})`).join(', ')}` : ''}`);
    process.exit(['paused', 'error'].includes(r.status) ? 1 : 0);
  } else if (cmd === 'audit') {
    if (!c.root) die('no coding root');
    const res = auditAll(c.root);
    if (has('--json')) console.log(JSON.stringify(res, null, 2));
    else console.log(res.length ? res.map((r) => `${r.rel}: ${[...r.items, ...r.oldWorktrees.map((w) => `old worktree ${w}`)].join('; ')}`).join('\n') : 'audit: every repo is committed and pushed');
    process.exit(res.some((r) => r.items.length) ? 1 : 0);
  } else if (cmd === 'resume') {
    const info = L.repoInfo(path.resolve(pos[0] || process.cwd()));
    if (!info) die('not a git repo');
    const b = L.busy(info.gitDir);
    if (b) die(`finish the git operation first (${b})`);
    L.resume(info.gitDir);
    console.log(`livesync: ${info.dir} resumed; next sync in up to 10 minutes (or: livesync.mjs repo --now)`);
  } else if (cmd === 'clone') {
    if (!pos[0]) die('usage: livesync.mjs clone <path relative to the coding root>');
    const e = L.readRegistry(c.registry).repos[pos[0]];
    if (!e) die(`${pos[0]} is not in the registry`);
    const r = L.cloneRepo(c.root, pos[0], e, c);
    console.log(`${pos[0]}: ${r.note}`); process.exit(r.ok ? 0 : 1);
  } else if (cmd === 'register') {
    if (!c.root || !c.registry) die('set codingRoot, and a Syncthing "default" folder (or --shared-root <dir>) (node kit/install.mjs --live-sync)');
    const { repos, copies } = L.readRegistry(c.registry);
    const r = L.register(c.root, repos, { mode: val('--mode') || c.newRepoMode || 'off', ownOwners: c.ownOwners });
    for (let i = 0; i < args.length; i++) if (args[i] === '--set') {
      const [rel, mode] = String(args[i + 1]).split('=');
      if (!repos[rel]) die(`${rel} is not a registered repo`);
      if (!['live', 'pull', 'off'].includes(mode)) die(`mode must be live, pull or off`);
      repos[rel] = { ...repos[rel], mode, updated: new Date().toISOString() };
    }
    L.writeRegistry(c.registry, repos, copies);
    console.log(`registry: ${Object.keys(repos).length} repos (${r.added.length} added)${r.noRemote.length ? `; no remote, not registered: ${r.noRemote.join(', ')}` : ''}`);
  } else if (cmd === 'prune' || cmd === 'clean-caches') {
    const { repos } = L.readRegistry(c.registry);
    for (const [rel, e] of Object.entries(repos)) {
      const dir = path.join(c.root, rel);
      if (e.mode === 'off' || !fs.existsSync(path.join(dir, '.git'))) continue;
      if (cmd === 'prune') {
        if (e.mode !== 'live' || e.keep || /^frappe\d*\//.test(rel)) continue;
        const p = has('--dry-run') ? L.pruneCheck(dir, { pruneDays: c.pruneDays, shared: c.shared }) : L.prune(c.root, rel, e, { pruneDays: c.pruneDays, shared: c.shared });
        if (p.ok || p.why !== 'active') console.log(`${rel}: ${p.ok ? (has('--dry-run') ? 'would prune' : 'pruned') : `kept (${p.why})`}`);
      } else if (has('--dry-run')) console.log(`${rel}: idle caches would be checked`);
      else { const rm = L.cleanCaches(dir, c); if (rm.length) console.log(`${rel}: removed ${rm.join(', ')}`); }
    }
  } else if (cmd === 'status') {
    const { repos } = L.readRegistry(c.registry);
    for (const [rel, e] of Object.entries(repos)) {
      const dir = path.join(c.root, rel);
      const here = fs.existsSync(path.join(dir, '.git')) ? (L.pausedReason(L.repoInfo(dir)?.gitDir || '') ? 'PAUSED' : 'cloned') : L.isPlaceholder(dir) ? 'placeholder' : 'missing';
      console.log(`${e.mode.padEnd(4)} ${here.padEnd(11)} ${rel}`);
    }
  } else {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 14).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(cmd ? 1 : 0);
  }
}
