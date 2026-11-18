#!/usr/bin/env node
// Keep Syncthing away from git repos: writes one ignore line per repo into a marked block
// in <coding root>/.stglobalignore and keeps every other line.
//   node kit/scripts/stignore.mjs [--root <dir>] [--check] [--dry-run] [--quiet] [--if-older <minutes>]
//   --check     exit 1 when the block is stale or a repo folder is not ignored (prints which)
//   --if-older  do nothing when the last run was less than N minutes ago (SessionStart uses 60)
import path from 'node:path';
import { STATE, localConfig, readJSON, writeJSON, readText, exists } from '../lib/common.mjs';
import { generate, findRepos, unignored, currentBlock, blockLines } from '../lib/stignore.mjs';

const args = process.argv.slice(2);
const has = (k) => args.includes(k);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const rootArg = val('--root') || localConfig().codingRoot;
// never guess the root from the current folder: a wrong root would write an ignore file into a repo
if (!rootArg) { if (!has('--quiet')) console.log('stignore: no coding root; pass --root <dir> or set codingRoot (node kit/install.mjs --coding-root <dir>)'); process.exit(has('--check') ? 1 : 0); }
const root = path.resolve(rootArg);
const quiet = has('--quiet');
const say = (m) => { if (!quiet) console.log(m); };

if (!exists(root)) { say(`stignore: coding root ${root} not found (external disk not mounted?)`); process.exit(0); }

if (val('--if-older')) {
  const st = readJSON(STATE, {});
  if (st.lastStignore && Date.now() - Date.parse(st.lastStignore) < Number(val('--if-older')) * 60e3) process.exit(0);
  st.lastStignore = new Date().toISOString(); writeJSON(STATE, st);
}

if (has('--check')) {
  const text = readText(path.join(root, '.stglobalignore'));
  const repos = findRepos(root);
  const block = currentBlock(text);
  const stale = !block || block.join('\n') !== blockLines(repos).join('\n');
  const missing = unignored(text, repos);
  if (!stale && !missing.length) { say(`stignore: ${repos.length} repos ignored, block current`); process.exit(0); }
  if (stale) console.log(`stignore: block ${block ? 'stale' : 'missing'} in ${root}/.stglobalignore; run node kit/scripts/stignore.mjs`);
  if (missing.length) console.log(`stignore: repo folders not ignored (Syncthing would sync their files): ${missing.join(', ')}`);
  process.exit(1);
}

const r = generate(root, { dryRun: has('--dry-run') });
say(`stignore: ${r.repos.length} repos; ${r.changed ? (has('--dry-run') ? 'block would change' : 'block updated') : 'block current'} (${r.file})`);
