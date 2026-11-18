#!/usr/bin/env node
// Repo secrets live outside git, in <shared>/secrets/<repo path>/, and are linked into each repo.
// Syncthing syncs the shared folder between this person's Macs; git never sees the files.
//   secrets.mjs adopt [dir] [--dry-run]   move untracked secret files (.env*, keys) to Shared and link them back
//   secrets.mjs link [dir|--all]          create missing links from Shared into the repo(s)
//   secrets.mjs check [--all]             report missing or broken links
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { g, repoInfo, secretName, findRepos } from '../lib/livesync.mjs';
import { liveConfig } from './livesync.mjs';

const SKIP = new Set(['node_modules', '.git', '.venv', 'venv', 'env', 'target', '.next', 'dist', '.turbo']);
export const secretsDir = (shared, rel) => path.join(shared, 'secrets', ...rel.split('/'));

function walk(dir, base, depth, out) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name) && depth < 3 && !fs.existsSync(path.join(p, '.git'))) walk(p, base, depth + 1, out); }
    else if (e.isFile() && secretName(e.name)) out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}
function ensureIgnored(top, rel) {
  if (g(top, 'check-ignore', '-q', rel).code === 0) return false;
  const ex = path.join(g(top, 'rev-parse', '--absolute-git-dir').out, 'info', 'exclude');
  fs.mkdirSync(path.dirname(ex), { recursive: true });
  fs.appendFileSync(ex, `/${rel}\n`);
  return true;
}
// Move untracked secret files of one repo into Shared and leave links behind.
export function adopt(top, root, shared, { dryRun = false } = {}) {
  const rel = path.relative(root, top).split(path.sep).join('/');
  const dest = secretsDir(shared, rel);
  const res = { moved: [], tracked: [], skipped: [] };
  for (const f of walk(top, top, 0, [])) {
    const abs = path.join(top, f);
    if (fs.lstatSync(abs).isSymbolicLink()) continue;
    if (g(top, 'ls-files', '--error-unmatch', '--', f).code === 0) { res.tracked.push(f); continue; }
    const target = path.join(dest, f);
    if (fs.existsSync(target)) { res.skipped.push(`${f} (already in Shared; compare by hand)`); continue; }
    if (!dryRun) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(abs, target);
      fs.chmodSync(target, 0o600);
      fs.rmSync(abs); fs.symlinkSync(target, abs);
      ensureIgnored(top, f);
    }
    res.moved.push(f);
  }
  return res;
}
// Create links for every file in Shared/secrets/<repo>/.
export function link(top, root, shared, { check = false } = {}) {
  const rel = path.relative(root, top).split(path.sep).join('/');
  const src = secretsDir(shared, rel);
  const res = { linked: [], ok: [], conflict: [], missing: [] };
  const files = [];
  const w = (d) => { let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of ents) { const p = path.join(d, e.name); if (e.isDirectory()) w(p); else if (e.name !== '.DS_Store') files.push(path.relative(src, p).split(path.sep).join('/')); } };
  w(src);
  for (const f of files) {
    const at = path.join(top, f), target = path.join(src, f);
    let cur = null; try { cur = fs.lstatSync(at); } catch {}
    if (cur?.isSymbolicLink() && path.resolve(path.dirname(at), fs.readlinkSync(at)) === target) { res.ok.push(f); continue; }
    if (cur) { res.conflict.push(f); continue; }
    if (check) { res.missing.push(f); continue; }
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.symlinkSync(target, at); ensureIgnored(top, f); res.linked.push(f);
  }
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const cmd = args[0], all = args.includes('--all'), dry = args.includes('--dry-run');
  const c = liveConfig();
  if (!c.root || !c.shared) { console.error('secrets: set codingRoot and sharedRoot (node kit/install.mjs --shared-root <dir>)'); process.exit(1); }
  const tops = all ? findRepos(c.root).map((r) => path.join(c.root, r)) : [repoInfo(path.resolve(args.find((a, i) => i > 0 && !a.startsWith('--')) || process.cwd()))?.dir].filter(Boolean);
  if (!tops.length) { console.error('secrets: not inside a git repo'); process.exit(1); }
  let bad = 0;
  for (const top of tops) {
    const rel = path.relative(c.root, top);
    if (cmd === 'adopt') {
      const r = adopt(top, c.root, c.shared, { dryRun: dry });
      if (r.moved.length || r.tracked.length || r.skipped.length) console.log(`${rel}: ${dry ? 'would move' : 'moved'} ${r.moved.join(', ') || 'nothing'}${r.tracked.length ? `; TRACKED in git (remove from history by hand): ${r.tracked.join(', ')}` : ''}${r.skipped.length ? `; skipped ${r.skipped.join(', ')}` : ''}`);
      bad += r.tracked.length;
    } else if (cmd === 'link' || cmd === 'check') {
      const r = link(top, c.root, c.shared, { check: cmd === 'check' });
      if (r.linked.length || r.conflict.length || r.missing.length) console.log(`${rel}: ${[r.linked.length && `linked ${r.linked.join(', ')}`, r.missing.length && `missing ${r.missing.join(', ')}`, r.conflict.length && `a real file blocks the link: ${r.conflict.join(', ')}`].filter(Boolean).join('; ')}`);
      bad += r.conflict.length + r.missing.length;
    } else { console.log('usage: secrets.mjs adopt|link|check [dir|--all] [--dry-run]'); process.exit(1); }
  }
  process.exit(bad ? 1 : 0);
}
