#!/usr/bin/env node
// One branch workflow for every repo, on every Mac, through Git Town and GitHub.
// Installed as git aliases: git start <task> | git sync | git ship | git flow-setup
//   flow.mjs setup [--main <branch>]   write git-town.toml in this repo (commit it)
//   flow.mjs start <task>              new feature branch <device prefix>/<task> from fresh main, pushed
//   flow.mjs sync                      git town sync (pull main, merge it into this branch, push)
//   flow.mjs ship [--gate "<cmd>"] [--no-gate] [--title "<t>"] [--dry-run]
//        sync, run the gate, open a PR with the gate result, squash-merge it on GitHub, prune.
//        Never pushes main itself; main changes only through the merged PR.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { git, run, localConfig, readJSON } from '../lib/common.mjs';

export const TOML_NAME = 'git-town.toml';
export function townToml(main = 'main') {
  return `# Git Town config, shared by every Mac (see kit/docs/two-macs.md). The device prefix
# (air/, mini/) is per machine: git config --global git-town.branch-prefix
[branches]
main = "${main}"

[create]
new-branch-type = "feature"
share-new-branches = "push"

[hosting]
dev-remote = "origin"
forge-type = "github"
github-connector = "gh"

[ship]
strategy = "api"
delete-tracking-branch = true

[sync]
feature-strategy = "merge"
perennial-strategy = "ff-only"
prototype-strategy = "merge"
push-branches = true
tags = true
`;
}

// air for a MacBook Air, mini for a Mac mini, else the short host name in lower case.
export function devicePrefix(host) {
  const h = String(host || '').toLowerCase();
  if (/air/.test(h)) return 'air';
  if (/mini/.test(h)) return 'mini';
  return h.split(/[.\s]/)[0].replace(/[^a-z0-9-]/g, '') || 'dev';
}

// Gate command for ship: --gate flag, then .claude/gate (first non-comment line), then npm "gate" script.
export function findGate(top, flag) {
  if (flag) return { cmd: flag, from: '--gate' };
  const f = path.join(top, '.claude', 'gate');
  if (fs.existsSync(f)) {
    const line = fs.readFileSync(f, 'utf8').split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
    if (line) return { cmd: line, from: '.claude/gate' };
  }
  const pkg = readJSON(path.join(top, 'package.json'), {});
  if (pkg.scripts?.gate) return { cmd: 'npm run -s gate', from: 'package.json' };
  return null;
}

export function prBody(gate, result, dirty) {
  const lines = ['## Gate (local run, GitHub Free: no CI)'];
  if (!gate) lines.push('No gate defined for this repo (shipped with --no-gate).');
  else {
    lines.push(`Command (${gate.from}): \`${gate.cmd}\``, `Result: ${!result ? 'not run (dry run)' : result.code === 0 ? 'PASS' : `FAIL (exit ${result.code})`}`);
    const tail = (result?.out || '').split('\n').filter(Boolean).slice(-15).join('\n');
    if (tail) lines.push('', '```', tail, '```');
  }
  if (dirty) lines.push('', 'Note: working tree had uncommitted changes that are not in this PR.');
  return lines.join('\n');
}

// ---------- CLI ----------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const has = (k) => args.includes(k);
  const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const cmd = args[0];
  const cwd = process.cwd();
  const top = git(cwd, 'rev-parse', '--show-toplevel').out;
  const die = (m) => { console.error(`flow: ${m}`); process.exit(1); };
  const sh = (c, a, o = {}) => spawnSync(c, a, { stdio: 'inherit', cwd: top, ...o }).status ?? 1;
  const town = (...a) => sh('git', ['town', ...a]);
  if (!top) die('not inside a git repo');
  if (run('git', ['town', '--version']).code !== 0) die('git-town is not installed; run: brew install git-town');

  const defaultBranch = () => git(top, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD').out.replace(/^origin\//, '') || 'main';
  const ensurePrefix = () => {
    if (git(top, 'config', 'git-town.branch-prefix').out) return;
    die(`no device prefix; run: git config --global git-town.branch-prefix ${localConfig().devicePrefix || devicePrefix(run('hostname', ['-s']).out)}/`);
  };
  const ensureToml = () => { if (!fs.existsSync(path.join(top, TOML_NAME))) die(`no ${TOML_NAME} in this repo; run: git flow-setup, then commit it`); };

  if (cmd === 'setup') {
    const f = path.join(top, TOML_NAME);
    const want = townToml(val('--main') || defaultBranch());
    if (fs.existsSync(f) && fs.readFileSync(f, 'utf8') === want) { console.log(`flow: ${TOML_NAME} current`); process.exit(0); }
    fs.writeFileSync(f, want);
    console.log(`flow: wrote ${TOML_NAME}; commit it on a branch and ship it`);
  } else if (cmd === 'start') {
    const task = args.slice(1).filter((a) => !a.startsWith('--')).join('-').toLowerCase().replace(/[^a-z0-9._/-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!task) die('usage: git start <task>');
    ensureToml(); ensurePrefix();
    process.exit(town('hack', task));
  } else if (cmd === 'sync') {
    ensureToml();
    process.exit(town('sync', ...args.slice(1)));
  } else if (cmd === 'ship') {
    ensureToml();
    const branch = git(top, 'branch', '--show-current').out;
    const main = defaultBranch();
    if (!branch || branch === main) die(`ship runs on a feature branch, not ${branch || 'a detached HEAD'}`);
    if (/sync-conflict/.test(git(top, 'ls-files').out)) die('a *.sync-conflict-* file is committed; remove it first');
    const dirty = !!git(top, 'status', '--porcelain').out;
    if (dirty && !has('--allow-dirty')) die('uncommitted changes; commit them (or pass --allow-dirty to ship without them)');
    const dry = has('--dry-run');
    if (!dry && town('sync') !== 0) die('git town sync failed; resolve it (git town continue) and ship again');
    const gate = has('--no-gate') ? null : findGate(top, val('--gate'));
    if (!gate && !has('--no-gate')) die('no gate: add .claude/gate or an npm "gate" script, or pass --gate "<cmd>" or --no-gate');
    let result = dry ? null : { code: 0, out: '' };
    if (gate) {
      console.log(`flow: gate (${gate.from}): ${gate.cmd}`);
      if (!dry) {
        const r = spawnSync(gate.cmd, { shell: true, cwd: top, encoding: 'utf8', maxBuffer: 64 << 20 });
        result = { code: r.status ?? 1, out: (r.stdout || '') + (r.stderr || '') };
        process.stdout.write(result.out.split('\n').slice(-20).join('\n') + '\n');
        if (result.code !== 0) die(`gate failed (exit ${result.code}); nothing shipped`);
      }
    }
    const body = prBody(gate, result, dirty);
    const title = val('--title') || git(top, 'log', '-1', '--format=%s').out;
    if (dry) { console.log(`flow: dry run; would open PR "${title}" ${branch} -> ${main} and squash-merge it\n${body}`); process.exit(0); }
    const existing = run('gh', ['pr', 'view', branch, '--json', 'number,state', '-q', '.state'], { cwd: top }).out;
    if (existing === 'OPEN') {
      if (sh('gh', ['pr', 'edit', branch, '--body', body]) !== 0) die('could not update the PR body');
    } else if (sh('gh', ['pr', 'create', '--base', main, '--head', branch, '--title', title, '--body', body]) !== 0) die('could not open the PR');
    if (sh('gh', ['pr', 'merge', branch, '--squash', '--delete-branch']) !== 0) die('merge failed; the PR stays open');
    sh('git', ['switch', main]);
    town('sync');
    console.log(`flow: shipped ${branch} into ${main}`);
  } else {
    console.log('usage: git start <task> | git sync | git ship [--gate "<cmd>"|--no-gate] [--dry-run] | git flow-setup');
    process.exit(cmd ? 1 : 0);
  }
}
