#!/usr/bin/env node
// git ship: put the finished work of the sync branch (wip) or a feature branch on main as one commit.
//   git ship [--gate "<cmd>"] [--no-gate] [--title "<t>"] [--dry-run]
// Steps: sync the branch, merge the latest main into it, run the local gate, push, open a PR with the
// gate result (the gate runs locally), squash-merge it, then merge main back into wip so both Macs go on
// without a force-push. A feature branch is deleted after the merge. Never pushes main itself.
// GitHub remotes use gh; any other origin is treated as Forgejo (API token from `git credential fill`
// for that host, or FORGEJO_TOKEN).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJSON } from '../lib/common.mjs';
import { g, syncRepo, busy, repoInfo, DEFAULTS } from '../lib/livesync.mjs';
import { liveConfig, entryFor } from './livesync.mjs';

// Gate command: --gate flag, then .claude/gate (first non-comment line), then the npm "gate" script.
export function findGate(top, flag) {
  if (flag) return { cmd: flag, from: '--gate' };
  const f = path.join(top, '.claude', 'gate');
  if (fs.existsSync(f)) {
    const line = fs.readFileSync(f, 'utf8').split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
    if (line) return { cmd: line, from: '.claude/gate' };
  }
  const pkg = readJSON(path.join(top, 'package.json'), {});
  if (pkg.scripts?.gate) return { cmd: `${fs.existsSync(path.join(top, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm'} run -s gate`, from: 'package.json' };
  return null;
}
export function prBody(gate, result, subjects = []) {
  const lines = [];
  if (subjects.length) lines.push('## Changes', ...subjects.slice(0, 30).map((s) => `- ${s}`), '');
  lines.push('## Gate (local run)');
  if (!gate) lines.push('No gate defined for this repo (shipped with --no-gate).');
  else {
    lines.push(`Command (${gate.from}): \`${gate.cmd}\``, `Result: ${!result ? 'not run (dry run)' : result.code === 0 ? 'PASS' : `FAIL (exit ${result.code})`}`);
    const tail = (result?.out || '').split('\n').filter(Boolean).slice(-15).join('\n');
    if (tail) lines.push('', '```', tail, '```');
  }
  return lines.join('\n');
}

// Forgejo origin -> { host, repo: 'owner/name' } (https, ssh:// with port, or scp-style URL).
export function forgejoRepo(url) {
  const m = String(url).trim().match(/^(?:https?:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?|ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?|[^@/]+@([^:/]+):)\/?([^/]+\/[^/]+?)(?:\.git)?\/?$/i);
  if (!m || /github\.com$/i.test(m[1] || m[2] || m[3])) return null;
  return { host: m[1] || m[2] || m[3], repo: m[4] };
}
// Token for a Forgejo host: FORGEJO_TOKEN, else the password git's credential helper stores for it.
export function forgejoToken(host) {
  if (process.env.FORGEJO_TOKEN) return process.env.FORGEJO_TOKEN;
  const r = spawnSync('git', ['credential', 'fill'], { input: `protocol=https\nhost=${host}\n\n`, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return (r.stdout || '').match(/^password=(.*)$/m)?.[1] || null;
}
// Open or update the PR for branch -> main on Forgejo, then squash-merge it. Returns an error string or null.
export async function forgejoShip(fj, token, { main, branch, title, body, deleteBranch, sleepMs = 3000 }) {
  const api = async (method, p, data) => {
    const r = await fetch(`https://${fj.host}/api/v1/repos/${fj.repo}${p}`, { method, headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: data ? JSON.stringify(data) : undefined });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch {}
    return { ok: r.ok, status: r.status, j, text };
  };
  const open = await api('GET', '/pulls?state=open&limit=50');
  if (!open.ok) return `could not list PRs (${open.status})`;
  let pr = (open.j || []).find((p) => p.head?.ref === branch && p.base?.ref === main);
  if (pr) { const u = await api('PATCH', `/pulls/${pr.number}`, { title, body }); if (!u.ok) return `could not update the PR (${u.status})`; }
  else { const c = await api('POST', '/pulls', { base: main, head: branch, title, body }); if (!c.ok) return `could not open the PR (${c.status}: ${c.j?.message || c.text.slice(0, 200)})`; pr = c.j; }
  // Forgejo checks mergeability in the background right after a PR opens or changes: retry briefly.
  for (let i = 0; i < 10; i++) {
    const m = await api('POST', `/pulls/${pr.number}/merge`, { Do: 'squash', MergeTitleField: `${title} (#${pr.number})`, MergeMessageField: body, delete_branch_after_merge: deleteBranch });
    if (m.ok) return null;
    if (![405, 409].includes(m.status) || i === 9) return `merge failed (${m.status}: ${m.j?.message || m.text.slice(0, 200)}); the PR stays open: https://${fj.host}/${fj.repo}/pulls/${pr.number}`;
    await new Promise((r) => setTimeout(r, sleepMs));
  }
  return 'merge failed';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const has = (k) => args.includes(k);
  const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const die = (m) => { console.error(`ship: ${m}`); process.exit(1); };
  const info = repoInfo(process.cwd());
  if (!info) die('not inside a git repo');
  const top = info.dir;
  const c = liveConfig();
  const e = entryFor(c, top);
  const main = e?.main || g(top, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD').out.replace(/^origin\//, '') || 'main';
  const wip = c.branch || DEFAULTS.branch;
  const branch = info.branch;
  const dry = has('--dry-run');
  const sh = (cmd, a) => spawnSync(cmd, a, { cwd: top, stdio: 'inherit' }).status ?? 1;
  // PRs go to origin, even when an `upstream` remote exists (gh would pick upstream).
  const originUrl = g(top, 'remote', 'get-url', 'origin').out;
  const gh = originUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1];
  const R = gh ? ['-R', gh] : [];
  const fj = gh ? null : forgejoRepo(originUrl);
  const fjToken = fj ? forgejoToken(fj.host) : null;
  if (fj && !fjToken) die(`no Forgejo token for ${fj.host}: store one with git credential (or set FORGEJO_TOKEN)`);
  if (!branch || branch === main) die(`ship runs on ${wip} or a feature branch, not ${branch || 'a detached HEAD'}`);
  if (busy(info.gitDir)) die(`finish the git operation in progress first (${busy(info.gitDir)})`);
  if (/\.sync-conflict-/.test(g(top, 'ls-files').out)) die('a *.sync-conflict-* file is committed; remove it first');

  // 1. commit and sync the branch (same safety checks as the live sync job)
  if (!dry) {
    const s = syncRepo(top, { ...c, mode: 'live', main, remote: e?.remote, noIdle: true, ignoreSessions: true, force: true });
    if (['paused', 'error'].includes(s.status)) die(`sync: ${s.note}. Fix it, run livesync.mjs resume, then ship again`);
    if (s.status === 'offline') die(`offline: ${s.note}`);
    if (s.refused.length) console.log(`ship: not committed (secret or too big): ${s.refused.map((f) => f.path).join(', ')}`);
  }
  // 2. latest main into the branch
  if (g(top, 'fetch', '--quiet', 'origin').code) die('fetch failed');
  if (!dry && Number(g(top, 'rev-list', '--count', `HEAD..origin/${main}`).out || 0)) {
    const m = g(top, 'merge', '--no-edit', '-q', `origin/${main}`);
    if (m.code) die(`merge of origin/${main} has conflicts. Resolve them, commit, then run git ship again.\n${m.out}`);
  }
  const ahead = Number(g(top, 'rev-list', '--count', `origin/${main}..HEAD`).out || 0);
  const diff = g(top, 'diff', '--quiet', `origin/${main}`, 'HEAD').code !== 0;
  if (!ahead || !diff) die(`nothing to ship: ${branch} has the same content as ${main}`);
  // 3. gate
  const gate = has('--no-gate') ? null : findGate(top, val('--gate'));
  if (!gate && !has('--no-gate')) die('no gate: add .claude/gate or an npm "gate" script, or pass --gate "<cmd>" or --no-gate');
  let result = dry ? null : { code: 0, out: '' };
  if (gate) {
    console.log(`ship: gate (${gate.from}): ${gate.cmd}`);
    if (!dry) {
      const r = spawnSync(gate.cmd, { shell: true, cwd: top, encoding: 'utf8', maxBuffer: 64 << 20 });
      result = { code: r.status ?? 1, out: (r.stdout || '') + (r.stderr || '') };
      process.stdout.write(result.out.split('\n').slice(-20).join('\n') + '\n');
      if (result.code !== 0) die(`gate failed (exit ${result.code}); nothing shipped`);
    }
  }
  const subjects = g(top, 'log', '--no-merges', '--format=%s', `origin/${main}..HEAD`).out.split('\n').filter((s) => s && !/^sync\(/.test(s));
  const title = val('--title') || (subjects.length === 1 ? subjects[0] : `${path.basename(top)}: ${subjects[0] || 'work'}${subjects.length > 1 ? ` (+${subjects.length - 1} more)` : ''}`);
  const body = prBody(gate, result, subjects);
  if (dry) { console.log(`ship: dry run; would push ${branch}, open PR "${title}" into ${main} and squash-merge it\n\n${body}`); process.exit(0); }
  // 4. push, PR, squash-merge
  if (g(top, 'push', '-q', '-u', 'origin', `HEAD:refs/heads/${branch}`).code) die(`push of ${branch} failed`);
  if (fj) {
    const err = await forgejoShip(fj, fjToken, { main, branch, title, body, deleteBranch: branch !== wip });
    if (err) die(err);
  } else {
    const state = spawnSync('gh', ['pr', 'view', branch, ...R, '--json', 'state', '-q', '.state'], { cwd: top, encoding: 'utf8' }).stdout?.trim();
    if (state === 'OPEN') { if (sh('gh', ['pr', 'edit', branch, ...R, '--title', title, '--body', body])) die('could not update the PR'); }
    else if (sh('gh', ['pr', 'create', ...R, '--base', main, '--head', branch, '--title', title, '--body', body])) die('could not open the PR');
    if (sh('gh', ['pr', 'merge', branch, ...R, '--squash', ...(branch === wip ? [] : ['--delete-branch'])])) die('merge failed; the PR stays open');
  }
  // 5. main back into wip (identical content, so a clean merge), or back to wip after a feature branch
  g(top, 'fetch', '--quiet', 'origin');
  if (branch !== wip) {
    if (!info.linked) {
      const sw = g(top, 'switch', '-q', wip).code ? g(top, 'switch', '-q', '-c', wip, '--track', `origin/${wip}`) : { code: 0 };
      if (sw.code) g(top, 'switch', '-q', '-c', wip, `origin/${main}`);
      g(top, 'branch', '-q', '-D', branch);
    }
  }
  if (!info.linked || branch === wip) {
    const m = g(top, 'merge', '--no-edit', '-q', `origin/${main}`);
    if (m.code) die(`shipped, but merging ${main} back into ${wip} has conflicts; resolve and commit (live sync pushes it)`);
    g(top, 'push', '-q', '-u', 'origin', `HEAD:refs/heads/${wip}`);
  }
  console.log(`ship: ${branch} is on ${main} as one commit${info.linked ? '; remove this worktree when done' : `; ${wip} continues from ${main}`}`);
}
