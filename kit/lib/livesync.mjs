// Live git sync between one person's Macs (kit/docs/two-macs.md). Opt-in per machine (liveSync in the
// local config). Each repo has a personal sync branch (wip) that a launchd job and the session hooks
// commit, rebase and push; main changes only through `git ship`. Never pushes main, never force-pushes.
// Pure Node, no dependencies. Every function takes an options object so tests can run it in a temp tree.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const DEFAULTS = { branch: 'wip', main: 'main', idleMin: 10, maxMB: 50, activeDays: 7, pruneDays: 30, cacheDays: 14, sessionHours: 12, scalarFiles: 5000 };
const PROTECTED = /^(main|master|production|prod)$/;
const SKIP_DIRS = new Set(['node_modules', '.venv', 'venv', 'env', 'target', '.next', '.turbo', '.dart_tool', '.gradle', 'Pods',
  '__pycache__', '.stversions', '.stfolder', '.Trash', '.Trashes', '.Spotlight-V100', '.cache', '.git']);
export const CACHE_DIRS = ['.next', 'dist', '.turbo'];
// ignored paths that a prune may delete without asking (rebuildable)
const DISPOSABLE = /(^|\/)(node_modules|\.next|dist|build|out|\.turbo|\.venv|venv|env|__pycache__|target|\.cache|coverage|\.parcel-cache|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.dart_tool|\.gradle|Pods|\.medusa|\.vercel|\.svelte-kit|\.nuxt|\.expo|\.DS_Store|[^/]*\.pyc|\.eslintcache|[^/]*\.tsbuildinfo|next-env\.d\.ts|\.kit-placeholder)(\/|$)/;

// air for a MacBook Air, mini for a Mac mini, else the short host name in lower case.
export function devicePrefix(host) {
  const h = String(host || '').toLowerCase();
  if (/air/.test(h)) return 'air';
  if (/mini/.test(h)) return 'mini';
  return h.split(/[.\s]/)[0].replace(/[^a-z0-9-]/g, '') || 'dev';
}

// ---------- secrets and big files ----------
const SECRET_NAME = /^(\.env(\..+)?|.+\.(pem|key|p12|pfx|keystore|jks|ppk)|id_(rsa|dsa|ecdsa|ed25519)|\.netrc|\.pypirc|service[-_]account.*\.json)$/i;
const SECRET_OK = /^\.env\.(example|sample|template|dist|defaults)$/i;
const SECRET_WORD = /(secret|credential|passwd|password|token|apikey|api[-_]key)/i;
const DATA_EXT = /(\.(json|txt|ya?ml|toml|ini|conf|cfg|env|csv|xml|plist|properties)|^[^.]+)$/i;
const SECRET_CONTENT = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{50,}|\bAKIA[0-9A-Z]{16}\b|\bsk-ant-[A-Za-z0-9_-]{20,}|\bsk_live_[A-Za-z0-9]{20,}|\bxox[baprs]-[A-Za-z0-9-]{10,}|_authToken\s*=\s*[^\s$]/;

export function secretName(rel) {
  const b = path.basename(rel);
  if (SECRET_OK.test(b)) return false;
  return SECRET_NAME.test(b) || (SECRET_WORD.test(b) && DATA_EXT.test(b));
}
// Why a changed file must not be committed, or null.
export function refuseReason(rel, abs, st, maxMB = DEFAULTS.maxMB) {
  if (secretName(rel)) return 'looks like a secret (name)';
  if (st.size > maxMB * 1024 * 1024) return `larger than ${maxMB} MB`;
  if (st.size < 1024 * 1024) {
    try {
      const buf = fs.readFileSync(abs);
      if (!buf.subarray(0, 8192).includes(0) && SECRET_CONTENT.test(buf.toString('utf8'))) return 'contains a key or token';
    } catch {}
  }
  return null;
}

// ---------- git helpers ----------
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true', GIT_MERGE_AUTOEDIT: 'no' };
export function g(cwd, ...a) {
  const r = spawnSync('git', a, { cwd, encoding: 'utf8', timeout: 180000, env: GIT_ENV, maxBuffer: 256 << 20 });
  return { code: r.status ?? 1, out: (r.stdout || '').replace(/\s+$/, ''), err: (r.stderr || '').trim() };
}
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const norm = (p) => p.split(path.sep).join('/');

export function repoInfo(dir) {
  const gd = g(dir, 'rev-parse', '--absolute-git-dir');
  if (gd.code) return null;
  const common = g(dir, 'rev-parse', '--path-format=absolute', '--git-common-dir').out;
  const top = g(dir, 'rev-parse', '--show-toplevel').out;
  return { dir: top, gitDir: gd.out, mainTop: path.basename(common) === '.git' ? path.dirname(common) : top,
    linked: path.resolve(gd.out) !== path.resolve(common), branch: g(dir, 'symbolic-ref', '--quiet', '--short', 'HEAD').out || null };
}
export function busy(gitDir) {
  return ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'BISECT_LOG', 'index.lock'].find((f) => exists(path.join(gitDir, f))) || null;
}
export const PAUSE_FILE = 'live-sync-paused';
export function pausedReason(gitDir) {
  try { return JSON.parse(fs.readFileSync(path.join(gitDir, PAUSE_FILE), 'utf8')).reason || 'paused'; } catch { return exists(path.join(gitDir, PAUSE_FILE)) ? 'paused' : null; }
}
export function pause(gitDir, reason) { fs.writeFileSync(path.join(gitDir, PAUSE_FILE), JSON.stringify({ reason, at: new Date().toISOString() }) + '\n'); }
export function resume(gitDir) { fs.rmSync(path.join(gitDir, PAUSE_FILE), { force: true }); }

// Session markers: the hooks write <gitDir>/kit-session-<id>; the job leaves such repos alone.
export function markSession(gitDir, id) { fs.writeFileSync(path.join(gitDir, `kit-session-${id}`), new Date().toISOString()); }
export function unmarkSession(gitDir, id) { fs.rmSync(path.join(gitDir, `kit-session-${id}`), { force: true }); }
export function activeSession(gitDir, { sessionHours = DEFAULTS.sessionHours, except = null, now = Date.now() } = {}) {
  let ents = [];
  try { ents = fs.readdirSync(gitDir).filter((f) => f.startsWith('kit-session-') && f !== `kit-session-${except}`); } catch {}
  return ents.some((f) => { try { return now - fs.statSync(path.join(gitDir, f)).mtimeMs < sessionHours * 3600e3; } catch { return false; } });
}

// Changed paths (porcelain -z, renames give the new path).
export function changes(dir) {
  const r = spawnSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: dir, encoding: 'utf8', env: GIT_ENV, maxBuffer: 256 << 20 });
  const parts = (r.stdout || '').split('\0');
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (!e) continue;
    const xy = e.slice(0, 2), p = e.slice(3);
    if (xy[0] === 'R' || xy[0] === 'C') i++; // next part is the old path
    out.push({ xy, path: p });
  }
  return out;
}
export function newestChangeMs(dir, ch) {
  let m = 0;
  for (const c of ch) {
    let p = path.join(dir, c.path);
    for (let k = 0; k < 3 && !exists(p); k++) p = path.dirname(p); // deleted file: its folder
    try { m = Math.max(m, fs.lstatSync(p).mtimeMs); } catch {}
  }
  return m;
}
const branchExists = (dir, ref) => g(dir, 'rev-parse', '--verify', '--quiet', ref).code === 0;

export function lastActivityMs(info) {
  const t = Number(g(info.dir, 'log', '-1', '--format=%ct').out || 0) * 1000;
  let m = t;
  for (const f of ['HEAD', 'index', 'FETCH_HEAD', 'ORIG_HEAD']) { try { m = Math.max(m, fs.statSync(path.join(info.gitDir, f)).mtimeMs); } catch {} }
  return m;
}

// ---------- commit ----------
// Stage everything except refused files; commit with --no-verify (sync commits; ship squashes them).
export function commitAll(dir, { maxMB = DEFAULTS.maxMB, shared = null, device = 'dev', ch = null } = {}) {
  ch = ch || changes(dir);
  if (!ch.length) return { committed: 0, refused: [] };
  const refused = [];
  for (const c of ch) {
    if (c.xy.includes('D')) continue;
    const abs = path.join(dir, c.path);
    let st; try { st = fs.lstatSync(abs); } catch { continue; }
    if (st.isSymbolicLink()) {
      let t = ''; try { t = path.resolve(path.dirname(abs), fs.readlinkSync(abs)); } catch {}
      if (shared && t.startsWith(path.resolve(shared) + path.sep)) refused.push({ path: c.path, why: 'link into Shared (secret)' });
      continue;
    }
    if (st.isDirectory()) { if (exists(path.join(abs, '.git'))) refused.push({ path: c.path.replace(/\/$/, ''), why: 'nested git repo' }); continue; }
    const why = refuseReason(c.path, abs, st, maxMB);
    if (why) refused.push({ path: c.path, why });
  }
  g(dir, 'add', '-A');
  if (refused.length) {
    const paths = refused.map((r) => r.path);
    if (g(dir, 'restore', '--staged', '--', ...paths).code) g(dir, 'rm', '-r', '--cached', '-q', '--ignore-unmatch', '--', ...paths);
  }
  if (g(dir, 'diff', '--cached', '--quiet').code === 0) return { committed: 0, refused };
  const n = g(dir, 'diff', '--cached', '--name-only').out.split('\n').filter(Boolean).length;
  const d = new Date(), z = (x) => String(x).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
  const r = g(dir, 'commit', '--no-verify', '-q', '-m', `sync(${device}): ${n} file${n === 1 ? '' : 's'}, ${stamp}`);
  return { committed: r.code === 0 ? n : 0, refused, error: r.code ? r.err : null };
}

// ---------- sync one checkout ----------
// Returns { status: ok|idle|skip|paused|offline|error, note, committed, pulled, pushed, refused }
export function syncRepo(dir, o = {}) {
  const opt = { ...DEFAULTS, ...o };
  const res = (status, note = '', extra = {}) => ({ status, note, committed: 0, pulled: 0, pushed: 0, refused: [], ...extra });
  const info = repoInfo(dir);
  if (!info) return res('skip', 'not a git repo');
  dir = info.dir;
  const pr = pausedReason(info.gitDir);
  if (pr) return res('paused', pr);
  const b = busy(info.gitDir);
  if (b) return res('skip', `git operation in progress (${b})`);
  if (!opt.ignoreSessions && activeSession(info.gitDir, { sessionHours: opt.sessionHours, except: opt.sessionId })) return res('skip', 'open Claude session');
  if (!info.branch) return res('skip', 'detached HEAD');
  if (g(dir, 'remote', 'get-url', 'origin').code) return res('skip', 'no origin remote');
  const fr = opt.remote ? followRemote(dir, opt.remote) : null;
  if (fr && !fr.moved) return res('offline', fr.note);
  if (opt.mode === 'pull') return pullOnly(dir, info, opt, res);
  let ch = changes(dir);
  if (ch.length && !opt.noIdle && Date.now() - newestChangeMs(dir, ch) < opt.idleMin * 60e3) return res('skip', 'edited in the last few minutes');
  if (!ch.length && !opt.force && Date.now() - lastActivityMs(info) > opt.activeDays * 864e5) return res('idle', 'untouched for a week');
  let branch = info.branch;
  if (PROTECTED.test(branch) || branch === opt.main) {
    if (info.linked) return res('skip', `worktree on ${branch}`);
    if (g(dir, 'fetch', '--quiet', 'origin').code) return res('offline', 'fetch failed');
    const local = branchExists(dir, `refs/heads/${opt.branch}`);
    const remote = branchExists(dir, `refs/remotes/origin/${opt.branch}`);
    if (!ch.length && !local && !remote) return pullOnly(dir, info, opt, res); // not adopted yet: keep main current
    const sw = local ? g(dir, 'switch', '-q', opt.branch) : remote ? g(dir, 'switch', '-q', '-c', opt.branch, '--track', `origin/${opt.branch}`) : g(dir, 'switch', '-q', '-c', opt.branch);
    if (sw.code) { pause(info.gitDir, `changes on ${branch}; could not switch to ${opt.branch}: ${sw.err.split('\n')[0]}`); return res('paused', pausedReason(info.gitDir)); }
    branch = opt.branch;
    ch = changes(dir);
  }
  const c = commitAll(dir, { maxMB: opt.maxMB, shared: opt.shared, device: opt.device, ch });
  const out = res('ok', '', { committed: c.committed, refused: c.refused });
  if (c.error) return { ...out, status: 'error', note: `commit failed: ${c.error.split('\n')[0]}` };
  const f = g(dir, 'fetch', '--quiet', '--prune', 'origin');
  if (f.code) return { ...out, status: 'offline', note: f.err.split('\n')[0] };
  if (g(dir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}').code && branchExists(dir, `refs/remotes/origin/${branch}`)) {
    g(dir, 'branch', '-q', '--set-upstream-to', `origin/${branch}`);
  }
  const hasUp = g(dir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}').code === 0;
  if (hasUp) {
    const behind = Number(g(dir, 'rev-list', '--count', 'HEAD..@{u}').out || 0);
    if (behind) {
      const r = g(dir, 'rebase', '--autostash', '@{u}');
      if (r.code) {
        g(dir, 'rebase', '--abort');
        pause(info.gitDir, `rebase conflict with origin/${branch}: ${(r.out + '\n' + r.err).split('\n').filter((l) => /CONFLICT/.test(l)).slice(0, 3).join('; ') || r.err.split('\n')[0]}`);
        return { ...out, status: 'paused', note: pausedReason(info.gitDir) };
      }
      out.pulled = behind;
    }
  }
  const ahead = hasUp ? Number(g(dir, 'rev-list', '--count', '@{u}..HEAD').out || 0) : Math.max(1, Number(g(dir, 'rev-list', '--count', 'HEAD', '--not', '--remotes').out || 0));
  if (ahead) {
    if (PROTECTED.test(branch) || branch === opt.main) return { ...out, status: 'error', note: `refusing to push ${branch}` };
    let p = g(dir, 'push', '-q', ...(hasUp ? [] : ['-u']), 'origin', `HEAD:refs/heads/${branch}`);
    if (p.code && hasUp) { // someone pushed in between: one more rebase, then retry
      g(dir, 'fetch', '--quiet', 'origin');
      const r = g(dir, 'rebase', '--autostash', '@{u}');
      if (r.code) { g(dir, 'rebase', '--abort'); pause(info.gitDir, `rebase conflict with origin/${branch}`); return { ...out, status: 'paused', note: pausedReason(info.gitDir) }; }
      p = g(dir, 'push', '-q', 'origin', `HEAD:refs/heads/${branch}`);
    }
    if (p.code) return { ...out, status: 'error', note: `push failed: ${p.err.split('\n')[0]}` };
    out.pushed = ahead;
  }
  return out;
}
function pullOnly(dir, info, opt, res) {
  if (changes(dir).length) return res('skip', 'pull-only repo has local changes');
  if (!opt.force && Date.now() - lastActivityMs(info) > opt.activeDays * 864e5) return res('idle', 'untouched for a week');
  const f = g(dir, 'fetch', '--quiet', 'origin');
  if (f.code) return res('offline', f.err.split('\n')[0]);
  if (g(dir, 'rev-parse', '--abbrev-ref', '@{u}').code) return res('skip', 'no upstream');
  const behind = Number(g(dir, 'rev-list', '--count', 'HEAD..@{u}').out || 0);
  if (!behind) return res('ok');
  const m = g(dir, 'merge', '--ff-only', '-q', '@{u}');
  return m.code ? res('skip', 'cannot fast-forward (local commits)') : res('ok', '', { pulled: behind });
}

// ---------- repos and registry ----------
// Every folder under root that holds a .git; stops at a repo root; skips worktree containers.
export function findRepos(root, { maxDepth = 8, worktrees = false } = {}) {
  const found = [];
  const walk = (dir, depth) => {
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (dir !== root && ents.some((e) => e.name === '.git')) { found.push(norm(path.relative(root, dir))); return; }
    if (depth >= maxDepth) return;
    for (const e of ents) {
      if (!e.isDirectory() || e.isSymbolicLink() || SKIP_DIRS.has(e.name)) continue;
      if (!worktrees && (e.name.endsWith('-worktrees') || e.name === '.worktrees')) continue;
      walk(path.join(dir, e.name), depth + 1);
    }
  };
  walk(root, 0);
  return found.sort();
}

export const registryFile = (shared) => path.join(shared, 'coding', 'repos.json');
// Reads repos.json plus any Syncthing conflict copies and merges them (newest entry per path wins).
export function readRegistry(file) {
  const dir = path.dirname(file), base = path.basename(file, '.json');
  const copies = exists(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith(`${base}.sync-conflict-`) && f.endsWith('.json')).map((f) => path.join(dir, f)) : [];
  const repos = {};
  for (const f of [file, ...copies]) {
    let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
    for (const [k, v] of Object.entries(j.repos || {})) if (!repos[k] || (v.updated || '') > (repos[k].updated || '')) repos[k] = v;
  }
  return { repos, copies };
}
export function serializeRegistry(repos) {
  const keys = Object.keys(repos).sort();
  const body = keys.map((k, i) => `    ${JSON.stringify(k)}: ${JSON.stringify(repos[k])}${i < keys.length - 1 ? ',' : ''}`).join('\n');
  return `{\n  "_doc": "Repos on every Mac of this person (kit/docs/two-macs.md). Path relative to the coding root. mode: live (sync branch), pull (third-party: fetch only), off. Written by kit/scripts/livesync.mjs; one line per repo.",\n  "repos": {\n${body}\n  }\n}\n`;
}
export function writeRegistry(file, repos, copies = []) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = serializeRegistry(repos);
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text); fs.renameSync(tmp, file);
  for (const c of copies) fs.rmSync(c, { force: true });
}
// Owner of a hosted repo URL (GitHub, Forgejo, any https/ssh/scp-style URL).
export const ownerOf = (url) => (String(url).match(/^(?:[a-z+]+:\/\/(?:[^@/]+@)?[^/]+|[^@/]+@[^:/]+:)\/?([^/]+)\/[^/]+$/i) || [])[1] || null;
// Same repo? Compare URLs without scheme, user, port, ".git" and case.
export const sameRemote = (a, b) => {
  const n = (u) => String(u || '').trim().toLowerCase().replace(/^[a-z+]+:\/\/(?:[^@/]+@)?/, '').replace(/^[^@/]+@([^:/]+):/, '$1/').replace(/:\d+\//, '/').replace(/\.git$|\/$/g, '');
  return n(a) === n(b);
};

// The registry names each repo's remote. When it changed (a repo moved, e.g. GitHub -> Forgejo),
// point origin at it and keep the old URL as remote "github" (or "old-origin"). Switches only after
// a fetch from the new remote works. Until then the repo reports offline and pushes nowhere, so a
// Mac without credentials for the new host never pushes work to the old, frozen remote.
export function followRemote(dir, remote) {
  const cur = g(dir, 'remote', 'get-url', 'origin').out;
  if (!remote || !cur || sameRemote(cur, remote)) return null;
  if (g(dir, 'ls-remote', '--heads', remote).code) return { moved: false, note: `registry remote ${remote} not reachable; still on ${cur}` };
  const keep = /github\.com/i.test(cur) && g(dir, 'remote', 'get-url', 'github').code ? 'github' : 'old-origin';
  if (!g(dir, 'remote', 'get-url', keep).code) g(dir, 'remote', 'remove', keep);
  g(dir, 'remote', 'rename', 'origin', keep);
  g(dir, 'remote', 'add', 'origin', remote);
  if (g(dir, 'fetch', '--quiet', 'origin').code) { g(dir, 'remote', 'remove', 'origin'); g(dir, 'remote', 'rename', keep, 'origin'); return { moved: false, note: `fetch from ${remote} failed; still on ${cur}` }; }
  g(dir, 'remote', 'set-head', 'origin', '-a');
  for (const b of g(dir, 'for-each-ref', '--format=%(refname:short)', 'refs/heads').out.split('\n').filter(Boolean)) {
    if (branchExists(dir, `refs/remotes/origin/${b}`)) g(dir, 'branch', '-q', '-u', `origin/${b}`, b);
  }
  return { moved: true, note: `origin moved to ${remote} (old: ${keep})` };
}

// Add local repos the registry does not know. Returns { added, noRemote }.
export function register(root, repos, { mode = null, ownOwners = [], now = new Date().toISOString() } = {}) {
  const added = [], noRemote = [];
  for (const rel of findRepos(root)) {
    if (repos[rel]) continue;
    const dir = path.join(root, rel);
    const remote = g(dir, 'remote', 'get-url', 'origin').out;
    if (!remote) { noRemote.push(rel); continue; }
    const main = g(dir, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD').out.replace(/^origin\//, '') || 'main';
    const own = ownOwners.map((o) => o.toLowerCase()).includes((ownerOf(remote) || '').toLowerCase());
    repos[rel] = { remote, main, mode: mode || (own ? 'live' : 'pull'), updated: now };
    added.push(rel);
  }
  return { added, noRemote };
}

export const PLACEHOLDER = '.kit-placeholder';
export const isPlaceholder = (dir) => exists(path.join(dir, PLACEHOLDER)) && !exists(path.join(dir, '.git'));
// An empty folder with a marker for every registry repo missing here, so it shows up in Finder and Claude.
export function placeholders(root, repos) {
  const made = [];
  for (const [rel, e] of Object.entries(repos)) {
    if (e.mode === 'off') continue;
    const dir = path.join(root, rel);
    if (exists(dir)) continue;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, PLACEHOLDER), JSON.stringify({ remote: e.remote, main: e.main, note: 'Not cloned on this Mac. Open it in Claude (or run livesync.mjs clone) to clone it.' }, null, 2) + '\n');
    made.push(rel);
  }
  return made;
}
// Partial clone into a placeholder (or missing) folder; switches to the sync branch when it exists.
export function cloneRepo(root, rel, e, { branch = DEFAULTS.branch, scalarFiles = DEFAULTS.scalarFiles } = {}) {
  const dir = path.join(root, rel);
  if (exists(path.join(dir, '.git'))) return { ok: true, note: 'already cloned' };
  if (exists(dir) && !fs.readdirSync(dir).every((f) => f === PLACEHOLDER || f === '.DS_Store')) return { ok: false, note: 'folder is not empty' };
  const marker = exists(path.join(dir, PLACEHOLDER)) ? fs.readFileSync(path.join(dir, PLACEHOLDER), 'utf8') : null;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const r = spawnSync('git', ['clone', '--quiet', '--filter=blob:none', e.remote, dir], { encoding: 'utf8', env: GIT_ENV, timeout: 1800000 });
  if (r.status !== 0) {
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    if (marker) fs.writeFileSync(path.join(dir, PLACEHOLDER), marker);
    return { ok: false, note: `clone failed: ${(r.stderr || '').trim().split('\n').pop()}` };
  }
  if (branchExists(dir, `refs/remotes/origin/${branch}`)) g(dir, 'switch', '-q', '-c', branch, '--track', `origin/${branch}`);
  let note = 'cloned (partial)';
  if (g(dir, 'ls-files').out.split('\n').length > scalarFiles && spawnSync('scalar', ['register', dir], { encoding: 'utf8' }).status === 0) note += ', scalar registered';
  return { ok: true, note };
}

// ---------- audit (before any destructive step) ----------
export function auditRepo(dir) {
  const info = repoInfo(dir);
  if (!info) return null;
  const items = [];
  const ch = changes(info.dir);
  if (ch.length) items.push(`${ch.length} uncommitted`);
  const heads = g(info.dir, 'for-each-ref', '--format=%(refname:short)', 'refs/heads').out.split('\n').filter(Boolean);
  const hasRemote = !!g(info.dir, 'remote').out;
  for (const h of heads) {
    const n = hasRemote ? Number(g(info.dir, 'rev-list', '--count', h, '--not', '--remotes').out || 0) : Number(g(info.dir, 'rev-list', '--count', h).out || 0);
    if (n) items.push(`${h}: ${n} unpushed`);
  }
  const st = g(info.dir, 'stash', 'list').out.split('\n').filter(Boolean).length;
  if (st) items.push(`${st} stash${st > 1 ? 'es' : ''}`);
  const pr = pausedReason(info.gitDir);
  if (pr) items.push(`paused: ${pr}`);
  return { dir: info.dir, items, worktrees: worktrees(info.dir).filter((w) => !w.main) };
}
export function worktrees(dir) {
  const out = []; let cur = null;
  for (const l of g(dir, 'worktree', 'list', '--porcelain').out.split('\n')) {
    if (l.startsWith('worktree ')) { cur = { path: l.slice(9), main: !out.length }; out.push(cur); }
    else if (cur && l.startsWith('branch ')) cur.branch = l.slice(7).replace(/^refs\/heads\//, '');
    else if (cur && l === 'prunable' || (cur && l.startsWith('prunable'))) cur.prunable = true;
  }
  const common = g(dir, 'rev-parse', '--path-format=absolute', '--git-common-dir').out;
  for (const w of out.filter((x) => !x.main)) {
    try { w.ageDays = (Date.now() - fs.statSync(path.join(common, 'worktrees', path.basename(w.path))).birthtimeMs) / 864e5; } catch { w.ageDays = 0; }
  }
  return out;
}

// ---------- prune (idle, clean and pushed clones become placeholders again) ----------
export function pruneCheck(dir, { pruneDays = DEFAULTS.pruneDays, now = Date.now(), shared = null } = {}) {
  const info = repoInfo(dir);
  if (!info || info.linked) return { ok: false, why: 'not a main checkout' };
  if (now - lastActivityMs(info) < pruneDays * 864e5) return { ok: false, why: 'active' };
  const a = auditRepo(dir);
  if (a.items.length) return { ok: false, why: a.items.join('; ') };
  if (a.worktrees.length) return { ok: false, why: `${a.worktrees.length} worktree(s)` };
  if (activeSession(info.gitDir, { now })) return { ok: false, why: 'open Claude session' };
  const ign = g(info.dir, 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory').out.split('\n').filter(Boolean);
  const keep = ign.filter((p) => {
    if (DISPOSABLE.test(p.replace(/\/$/, ''))) return false;
    try { const t = path.resolve(info.dir, fs.readlinkSync(path.join(info.dir, p.replace(/\/$/, '')))); if (shared && t.startsWith(path.resolve(shared))) return false; } catch {}
    return true;
  });
  if (keep.length) return { ok: false, why: `ignored files that are not caches: ${keep.slice(0, 3).join(', ')}${keep.length > 3 ? ' …' : ''}` };
  return { ok: true };
}
export function prune(root, rel, e, opts = {}) {
  const dir = path.join(root, rel);
  const c = pruneCheck(dir, opts);
  if (!c.ok) return c;
  fs.rmSync(dir, { recursive: true, force: true });
  placeholders(root, { [rel]: e });
  return { ok: true };
}

// ---------- cache clean (git-ignored build output in idle projects) ----------
export function cleanCaches(dir, { cacheDays = DEFAULTS.cacheDays, now = Date.now() } = {}) {
  const info = repoInfo(dir);
  if (!info || now - lastActivityMs(info) < cacheDays * 864e5) return [];
  const removed = [];
  const walk = (d, depth) => {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (!e.isDirectory() || e.isSymbolicLink() || e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(d, e.name), rel = norm(path.relative(info.dir, p));
      if (CACHE_DIRS.includes(e.name)) {
        const ignored = g(info.dir, 'check-ignore', '-q', rel + '/').code === 0;
        const tracked = !!g(info.dir, 'ls-files', '--', rel).out;
        if (ignored && !tracked) { fs.rmSync(p, { recursive: true, force: true }); removed.push(rel); }
        continue;
      }
      if (depth < 3) walk(p, depth + 1);
    }
  };
  walk(info.dir, 0);
  return removed;
}

// ---------- Syncthing ----------
// Folder paths Syncthing shares on this Mac (from its config.xml); [] when Syncthing is not set up.
export function syncthingFolders(home) {
  for (const f of [path.join(home, 'Library', 'Application Support', 'Syncthing', 'config.xml'), path.join(home, '.local', 'state', 'syncthing', 'config.xml'), path.join(home, '.config', 'syncthing', 'config.xml')]) {
    try { return [...fs.readFileSync(f, 'utf8').matchAll(/<folder\b[^>]*\bpath="([^"]+)"/g)].map((m) => m[1].replace(/^~(?=\/)/, home)).filter(Boolean); } catch {}
  }
  return [];
}
// Path of one Syncthing folder by id (for example "default"), or null.
export function syncthingFolder(home, id) {
  for (const f of [path.join(home, 'Library', 'Application Support', 'Syncthing', 'config.xml'), path.join(home, '.local', 'state', 'syncthing', 'config.xml'), path.join(home, '.config', 'syncthing', 'config.xml')]) {
    let x; try { x = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const m of x.matchAll(/<folder\b[^>]*>/g)) {
      const fid = (m[0].match(/\bid="([^"]*)"/) || [])[1], fp = (m[0].match(/\bpath="([^"]*)"/) || [])[1];
      if (fid === id && fp) return fp.replace(/^~(?=\/)/, home);
    }
  }
  return null;
}
// Shared sync data lives in one subfolder of the Syncthing "default" folder, on every Mac.
export const SHARED_SUBDIR = '0000.codesync';
export function defaultSharedRoot(home) {
  const d = syncthingFolder(home, 'default');
  return d ? path.join(d, SHARED_SUBDIR) : null;
}
