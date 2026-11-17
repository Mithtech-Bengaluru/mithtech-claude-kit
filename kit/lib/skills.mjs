// Skill registry: validation, install, uninstall, sync and SKILLS.md generation.
// The registry (kit/registry/skills.json on main) is the master list. Each machine keeps
// ~/.claude/mithtech-skills.local.json: the skills this kit installed there. Sync makes the
// machine match the registry: install what is missing, uninstall what master dropped.
// Skills go to ~/.claude/skills/<name> (removed ones go to ~/.claude/skills/.trash).
// Files are copied from a pinned commit. No third-party script is ever run.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CLAUDE_DIR, KIT, REPO, localConfig, readJSON, writeJSON, readText, git, exists, today } from './common.mjs';

export const REGISTRY_REL = 'kit/registry/skills.json';
export const DOC_REL = 'SKILLS.md';
export const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills');
export const SKILLS_STATE = path.join(CLAUDE_DIR, 'mithtech-skills.local.json');
export const CACHE = path.join(CLAUDE_DIR, 'mithtech-skills-cache');
export const baseUrl = () => process.env.MITHTECH_SKILLS_BASE || 'https://github.com/';
export const repoUrl = (repo) => `${baseUrl()}${repo}${baseUrl().startsWith('http') ? '.git' : ''}`;

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const SHA = /^[0-9a-f]{40}$/;
const PLAIN = /^[^\u0000-\u0008\u000B-\u001F\u007F]*$/;
const MAX_FILES = 3000, MAX_BYTES = 40 * 1024 * 1024;
const RESERVED = new Set(['synced', 'mithtech']);

// ---------- registry ----------
function txt(v, max, name, errs, required = true) {
  if (v === undefined || v === '') { if (required) errs.push(`${name} missing`); return ''; }
  if (typeof v !== 'string') { errs.push(`${name} not text`); return ''; }
  const s = v.trim().replace(/\s+/g, ' ');
  if (s.length > max) errs.push(`${name} over ${max} chars`);
  if (!PLAIN.test(s)) errs.push(`${name} has control characters`);
  return s;
}

export function validateRegistry(raw) {
  const errs = [];
  const r = raw && typeof raw === 'object' ? raw : {};
  const out = { version: 1, packs: [] };
  if (r.version !== 1) errs.push('version must be 1');
  const names = new Set(), ids = new Set();
  for (const [i, p] of (Array.isArray(r.packs) ? r.packs : []).entries()) {
    const at = `packs[${i}]`;
    const pack = {
      id: txt(p.id, 64, `${at}.id`, errs),
      repo: txt(p.repo, 100, `${at}.repo`, errs),
      ref: txt(p.ref, 40, `${at}.ref`, errs),
      use: txt(p.use, 500, `${at}.use`, errs),
      note: txt(p.note, 300, `${at}.note`, errs, false),
      added: txt(p.added, 10, `${at}.added`, errs, false),
      addedBy: txt(p.addedBy, 40, `${at}.addedBy`, errs, false),
      skills: [],
    };
    if (pack.id && !NAME.test(pack.id)) errs.push(`${at}.id invalid`);
    if (ids.has(pack.id)) errs.push(`${at}.id duplicate`); ids.add(pack.id);
    if (pack.repo && !REPO_RE.test(pack.repo)) errs.push(`${at}.repo must be owner/name`);
    if (pack.ref && !SHA.test(pack.ref)) errs.push(`${at}.ref must be a 40-character commit`);
    if (!Array.isArray(p.skills) || !p.skills.length) errs.push(`${at}.skills empty`);
    for (const [j, s] of (Array.isArray(p.skills) ? p.skills : []).entries()) {
      const sa = `${at}.skills[${j}]`;
      const sk = { name: txt(s.name, 64, `${sa}.name`, errs), path: txt(s.path, 200, `${sa}.path`, errs), desc: txt(s.desc, 300, `${sa}.desc`, errs) };
      if (sk.name && (!NAME.test(sk.name) || RESERVED.has(sk.name))) errs.push(`${sa}.name invalid`);
      if (names.has(sk.name)) errs.push(`${sa}.name duplicate`); names.add(sk.name);
      if (sk.path && (path.isAbsolute(sk.path) || sk.path.split(/[\\/]/).includes('..') || /^[\\/]|\0/.test(sk.path))) errs.push(`${sa}.path unsafe`);
      pack.skills.push(sk);
    }
    out.packs.push(pack);
  }
  return { ok: !errs.length, errs, reg: out };
}

export const emptyRegistry = () => ({ version: 1, packs: [] });

// The master list: origin/main of the kit clone (data only, no code runs from it); falls back
// to the clone's file, then to the copy shipped inside the plugin.
export function loadRegistry(cfg = localConfig(), { fetch = true } = {}) {
  const repo = cfg.kitPath || REPO;
  let raw = null, from = '';
  if (exists(path.join(repo, '.git'))) {
    if (fetch) git(repo, 'fetch', '--quiet', 'origin', '+refs/heads/main:refs/remotes/origin/main');
    const s = git(repo, 'show', `origin/main:${REGISTRY_REL}`);
    if (s.code === 0 && s.out) { raw = s.out; from = 'origin/main'; }
  }
  if (!raw) for (const p of [path.join(repo, REGISTRY_REL), path.join(KIT, 'registry', 'skills.json')]) {
    if (exists(p)) { raw = readText(p); from = p; break; }
  }
  if (!raw) return { ok: false, errs: ['no registry found'], reg: emptyRegistry(), from: '' };
  let parsed; try { parsed = JSON.parse(raw); } catch { return { ok: false, errs: ['registry is not JSON'], reg: emptyRegistry(), from }; }
  return { ...validateRegistry(parsed), from };
}

// ---------- local state ----------
export const loadState = () => { const s = readJSON(SKILLS_STATE, null); return s && s.installed ? s : { installed: {} }; };
export const saveState = (s) => writeJSON(SKILLS_STATE, s);

// ---------- files ----------
export function hashDir(dir) {
  const h = crypto.createHash('sha256');
  const walk = (d, rel = '') => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name === '.git' || e.isSymbolicLink()) continue;
      const p = path.join(d, e.name), r = rel + '/' + e.name;
      if (e.isDirectory()) walk(p, r);
      else if (e.isFile()) { h.update(r + '\0'); h.update(fs.readFileSync(p)); }
    }
  };
  walk(dir);
  return h.digest('hex');
}

function copyTree(src, dest) {
  let files = 0, bytes = 0;
  const walk = (s, d) => {
    fs.mkdirSync(d, { recursive: true });
    for (const e of fs.readdirSync(s, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === '.github' || e.isSymbolicLink()) continue;
      const sp = path.join(s, e.name), dp = path.join(d, e.name);
      if (e.isDirectory()) walk(sp, dp);
      else if (e.isFile()) {
        const st = fs.statSync(sp);
        if (++files > MAX_FILES || (bytes += st.size) > MAX_BYTES) throw new Error('skill too large');
        fs.copyFileSync(sp, dp);
      }
    }
  };
  walk(src, dest);
}

const cacheDir = (repo) => path.join(CACHE, repo.replace('/', '__'));

// Fetch one pinned commit of a repo into the cache and check it out. Returns the checkout dir.
export function fetchPinned(repo, ref) {
  const dir = cacheDir(repo);
  if (!exists(path.join(dir, '.git'))) { fs.mkdirSync(dir, { recursive: true }); git(dir, 'init', '--quiet'); }
  git(dir, 'remote', 'remove', 'origin');
  git(dir, 'remote', 'add', 'origin', repoUrl(repo));
  if (git(dir, 'cat-file', '-e', `${ref}^{commit}`).code !== 0) {
    const f = git(dir, 'fetch', '--quiet', '--depth', '1', 'origin', ref);
    if (f.code !== 0) throw new Error(`cannot fetch ${repo}@${ref.slice(0, 8)}: ${f.err.split('\n')[0]}`);
  }
  const c = git(dir, '-c', 'advice.detachedHead=false', 'checkout', '--quiet', '--force', '--detach', ref);
  if (c.code !== 0) throw new Error(`cannot check out ${repo}@${ref.slice(0, 8)}`);
  return dir;
}

export function resolveRef(repo, ref) {
  if (ref && SHA.test(ref)) return ref;
  const r = git(CLAUDE_DIR, 'ls-remote', repoUrl(repo), ref || 'HEAD');
  const sha = (r.out.split('\n')[0] || '').split(/\s+/)[0];
  if (!SHA.test(sha || '')) throw new Error(`cannot resolve ${repo} ${ref || 'HEAD'}`);
  return sha;
}

// Copy one skill from the pinned checkout into ~/.claude/skills/<name>. Returns the content hash.
export function installSkill(pack, skill) {
  const dir = fetchPinned(pack.repo, pack.ref);
  const src = path.resolve(dir, skill.path);
  const real = fs.realpathSync(src);
  if (real !== fs.realpathSync(dir) && !real.startsWith(fs.realpathSync(dir) + path.sep)) throw new Error('path escapes the repo');
  if (!exists(path.join(src, 'SKILL.md'))) throw new Error(`${skill.name}: no SKILL.md at ${skill.path}`);
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  const tmp = path.join(SKILLS_DIR, `.mithtech-tmp-${skill.name}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  try { copyTree(src, tmp); } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); throw e; }
  const hash = hashDir(tmp);
  trash(skill.name);
  fs.renameSync(tmp, path.join(SKILLS_DIR, skill.name));
  return hash;
}

export function trash(name) {
  const p = path.join(SKILLS_DIR, name);
  if (!exists(p)) return null;
  const dest = path.join(SKILLS_DIR, '.trash', `${name}-${today()}-${crypto.randomBytes(2).toString('hex')}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(p, dest);
  return dest;
}

// ---------- sync ----------
// opts: dry (change nothing), force (replace adopted or edited skills with the pinned copy).
export function sync(reg, cfg = localConfig(), opts = {}) {
  const state = loadState();
  const res = { installed: [], updated: [], adopted: [], removed: [], kept: [], failed: [] };
  const exclude = new Set(cfg.skillsExclude || []);
  const wanted = new Map();
  for (const pack of reg.packs) for (const sk of pack.skills) if (!exclude.has(sk.name)) wanted.set(sk.name, { pack, sk });

  for (const [name, { pack, sk }] of wanted) {
    const dest = path.join(SKILLS_DIR, name);
    const cur = state.installed[name];
    try {
      if (!exists(dest)) {
        if (!opts.dry) state.installed[name] = { pack: pack.id, repo: pack.repo, ref: pack.ref, hash: installSkill(pack, sk), at: new Date().toISOString() };
        res.installed.push(name);
      } else if (!cur) {
        if (opts.force) {
          if (!opts.dry) state.installed[name] = { pack: pack.id, repo: pack.repo, ref: pack.ref, hash: installSkill(pack, sk), at: new Date().toISOString() };
          res.updated.push(name);
        } else {
          if (!opts.dry) state.installed[name] = { pack: pack.id, repo: pack.repo, ref: pack.ref, hash: null, adopted: true, at: new Date().toISOString() };
          res.adopted.push(name);
        }
      } else if (cur.ref !== pack.ref || cur.repo !== pack.repo) {
        const edited = cur.hash && hashDir(dest) !== cur.hash;
        if (cur.adopted || edited) {
          if (!opts.force) { res.kept.push(`${name} (${cur.adopted ? 'adopted' : 'edited here'}; sync --force replaces it)`); continue; }
        }
        if (!opts.dry) state.installed[name] = { pack: pack.id, repo: pack.repo, ref: pack.ref, hash: installSkill(pack, sk), at: new Date().toISOString() };
        res.updated.push(name);
      }
    } catch (e) { res.failed.push(`${name}: ${e.message}`); }
  }

  for (const name of Object.keys(state.installed)) {
    if (wanted.has(name)) continue;
    if (exclude.has(name)) continue;
    if (!opts.dry) { trash(name); delete state.installed[name]; }
    res.removed.push(name);
  }
  if (!opts.dry) saveState(state);
  return res;
}

export function summarize(res, dry = false) {
  const bits = [];
  for (const [k, label] of [['installed', 'installed'], ['updated', 'updated'], ['removed', 'uninstalled'], ['adopted', 'adopted']]) if (res[k].length) bits.push(`${label} ${res[k].join(', ')}`);
  if (res.kept.length) bits.push(`kept ${res.kept.join('; ')}`);
  if (res.failed.length) bits.push(`failed ${res.failed.join('; ')}`);
  return bits.length ? `skills${dry ? ' (dry run)' : ''}: ${bits.join(' | ')}` : '';
}

// ---------- discovery (for `add`) ----------
export function frontmatter(file) {
  const m = readText(file).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (!m) return out;
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^[>|][+-]?$/.test(v)) { v = ''; while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) v += ' ' + lines[++i].trim(); }
    out[kv[1]] = v.replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

export function discover(dir, repo) {
  const found = [];
  const add = (rel) => {
    const f = path.join(dir, rel, 'SKILL.md');
    if (!exists(f)) return;
    const fm = frontmatter(f);
    const base = rel === '.' ? repo.split('/')[1] : path.basename(rel);
    const name = String(fm.name || base).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    const desc = (fm.description || '').replace(/\s+/g, ' ').slice(0, 297).replace(/\s+\S*$/, (m) => ((fm.description || '').length > 297 ? '...' : m));
    found.push({ name, path: rel, desc: desc.length > 300 ? desc.slice(0, 297) + '...' : desc });
  };
  if (exists(path.join(dir, 'SKILL.md'))) add('.');
  for (const group of ['skills', '.claude/skills', '.agents/skills']) {
    if (found.length) break;
    const g = path.join(dir, group);
    if (exists(g)) for (const e of fs.readdirSync(g, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) if (e.isDirectory()) add(`${group}/${e.name}`);
  }
  return found;
}

// ---------- SKILLS.md ----------
export function renderDoc(reg) {
  const L = [];
  const nSkills = reg.packs.reduce((n, p) => n + p.skills.length, 0);
  L.push('# Skills registry', '',
    '<!-- Generated by `node kit/scripts/skills.mjs docs` from kit/registry/skills.json. Do not edit by hand. -->', '',
    `Master list of the Claude skills every Mithtech computer installs: ${nSkills} skills from ${reg.packs.length} sources. Each source is pinned to one commit.`, '',
    '## How it works', '',
    '- **Master list:** `kit/registry/skills.json` on `main`. It is the only list.',
    '- **Local list:** `~/.claude/mithtech-skills.local.json` records what this kit installed on one computer.',
    '- **Sync:** at most once a day (SessionStart hook) and on `install.mjs`, each computer fetches the master list, installs missing skills into `~/.claude/skills`, updates skills whose pinned commit changed, and uninstalls skills that master dropped. Removed skills move to `~/.claude/skills/.trash`.',
    '- **Own skills stay safe:** a skill that already exists is adopted, not overwritten. A computer can opt out of a skill with `skillsExclude` in `~/.claude/mithtech-kit.local.json`.',
    '- **No third-party code runs:** sync only copies files from the pinned commit. A skill may ask you to run its own scripts later; read it first.', '',
    '## Commands', '',
    '```bash',
    'node kit/scripts/skills.mjs list                       # master list vs this computer',
    'node kit/scripts/skills.mjs sync [--dry-run] [--force] # make this computer match master',
    'node kit/scripts/skills.mjs add <owner/repo> --use "how to use it"   # install here and add to master',
    'node kit/scripts/skills.mjs remove <skill-or-source>   # delete from master; every computer uninstalls it',
    'node kit/scripts/skills.mjs docs                       # regenerate this file',
    '```', '',
    '`add` and `remove` commit straight to `main` (one branch only) and retry if another computer pushed first. `add` takes `--path <dir>` (repeat for several skills), `--ref <commit|branch>`, `--id <name>` and `--no-push` (change the local copy only).', '',
    '## Skills', '');
  for (const p of reg.packs) {
    L.push(`### ${p.id}`, '',
      `Source: [${p.repo}](https://github.com/${p.repo}) at \`${p.ref.slice(0, 10)}\`${p.note ? `. ${p.note}` : ''}`, '',
      `**How to use:** ${p.use}`, '',
      '| Skill | What it does |', '|---|---|');
    for (const s of p.skills) L.push(`| \`${s.name}\` | ${s.desc.replace(/\|/g, '/')} |`);
    L.push('');
  }
  return L.join('\n');
}
