#!/usr/bin/env node
// Skill registry CLI. Zero tokens. See SKILLS.md.
//   skills.mjs sync [--dry-run] [--force] [--background]   make this computer match master
//   skills.mjs list                                          master list vs this computer
//   skills.mjs add <owner/repo|github url> [--path <dir>]... [--ref <commit|branch>] [--id <name>] --use "text" [--no-push]
//   skills.mjs remove <skill-or-source-id> [--no-push]       delete from master (all computers uninstall)
//   skills.mjs docs [--check]                                regenerate (or check) SKILLS.md
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO, STATE, localConfig, readJSON, writeJSON, readText, git, exists, today } from '../lib/common.mjs';
import {
  REGISTRY_REL, DOC_REL, SKILLS_DIR, loadRegistry, validateRegistry, emptyRegistry, loadState, sync, summarize,
  fetchPinned, resolveRef, installSkill, saveState, discover, renderDoc,
} from '../lib/skills.mjs';

const [cmd, ...args] = process.argv.slice(2);
const has = (f) => args.includes(f);
const vals = (f) => args.flatMap((a, i) => (a === f ? [args[i + 1]] : []));
const val = (f) => vals(f)[0];
const cfg = localConfig();
const repo = cfg.kitPath || REPO;
const machine = (cfg.machine || os.hostname().split('.')[0]).replace(/[^\w.-]/g, '-');
const die = (m) => { console.error(m); process.exit(1); };
const quiet = has('--background');

// Write to master (main): re-applies the change on the newest origin/main and retries when
// another computer pushed first. Only one branch exists.
function updateMaster(mutate, message) {
  if (!exists(path.join(repo, '.git'))) die(`kit clone not found at ${repo}`);
  for (let attempt = 0; attempt < 4; attempt++) {
    git(repo, 'fetch', '--quiet', 'origin', '+refs/heads/main:refs/remotes/origin/main');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mithtech-skills-'));
    let ok = false, err = '';
    try {
      if (git(repo, 'worktree', 'add', '--quiet', '--detach', tmp, 'origin/main').code !== 0) die('cannot open origin/main');
      const file = path.join(tmp, REGISTRY_REL);
      const reg = exists(file) ? JSON.parse(readText(file)) : emptyRegistry();
      mutate(reg);
      const v = validateRegistry(reg);
      if (!v.ok) die(`registry would be invalid: ${v.errs.slice(0, 3).join('; ')}`);
      writeJSON(file, v.reg);
      fs.writeFileSync(path.join(tmp, DOC_REL), renderDoc(v.reg) + '\n');
      git(tmp, 'add', REGISTRY_REL, DOC_REL);
      if (!git(tmp, 'status', '--porcelain').out) return 'unchanged';
      const c = git(tmp, 'commit', '--quiet', '-m', message);
      if (c.code !== 0) die(`commit failed: ${c.err}`);
      const p = git(tmp, 'push', '--quiet', 'origin', 'HEAD:refs/heads/main');
      ok = p.code === 0; err = p.err;
    } finally { git(repo, 'worktree', 'remove', '--force', tmp); }
    if (ok) {
      if (git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').out === 'main' && !git(repo, 'status', '--porcelain', '--untracked-files=no').out) git(repo, 'merge', '--ff-only', '--quiet', 'origin/main');
      return 'pushed';
    }
    if (!/non-fast-forward|fetch first|rejected|stale/i.test(err)) die(`push to main failed: ${err.split('\n')[0]}`);
  }
  die('push to main kept losing a race; run the command again');
}

// Local-only write of the registry file in the kit clone (no push).
function writeLocalRegistry(mutate) {
  const file = path.join(repo, REGISTRY_REL);
  const reg = exists(file) ? JSON.parse(readText(file)) : emptyRegistry();
  mutate(reg);
  const v = validateRegistry(reg);
  if (!v.ok) die(`registry would be invalid: ${v.errs.slice(0, 3).join('; ')}`);
  writeJSON(file, v.reg);
  fs.writeFileSync(path.join(repo, DOC_REL), renderDoc(v.reg) + '\n');
}

if (cmd === 'sync') {
  const r = loadRegistry(cfg, { fetch: true });
  if (!r.ok) { if (!quiet) console.error(`registry invalid (${r.errs.slice(0, 2).join('; ')}); nothing changed`); process.exit(quiet ? 0 : 1); }
  const res = sync(r.reg, cfg, { dry: has('--dry-run'), force: has('--force') });
  const line = summarize(res, has('--dry-run'));
  if (quiet) {
    const st = readJSON(STATE, {});
    writeJSON(STATE, { ...st, skillsMessage: line || undefined, skillsShown: !line, lastSkillSync: new Date().toISOString() });
  } else console.log(line || `skills: ${r.reg.packs.reduce((n, p) => n + p.skills.length, 0)} in master, this computer is in sync (${r.from})`);
  process.exit(res.failed.length && !quiet ? 1 : 0);
}

if (cmd === 'list') {
  const r = loadRegistry(cfg, { fetch: true });
  const st = loadState();
  const rows = [];
  for (const p of r.reg.packs) for (const s of p.skills) {
    const here = fs.existsSync(path.join(SKILLS_DIR, s.name));
    const cur = st.installed[s.name];
    rows.push(`${here ? (cur?.ref === p.ref ? 'ok     ' : cur?.adopted ? 'adopted' : 'stale  ') : 'MISSING'}  ${s.name.padEnd(28)} ${p.repo}@${p.ref.slice(0, 8)}`);
  }
  const gone = Object.keys(st.installed).filter((n) => !r.reg.packs.some((p) => p.skills.some((s) => s.name === n)));
  console.log(rows.join('\n') + (gone.length ? `\nto uninstall on next sync: ${gone.join(', ')}` : '') + `\n(master: ${r.from})`);
  process.exit(0);
}

if (cmd === 'docs') {
  const r = loadRegistry(cfg, { fetch: false });
  const want = renderDoc(r.reg) + '\n';
  const file = path.join(repo, DOC_REL);
  if (has('--check')) { if (readText(file) !== want) die('SKILLS.md is out of sync: run node kit/scripts/skills.mjs docs'); console.log('SKILLS.md in sync'); process.exit(0); }
  fs.writeFileSync(file, want); console.log(`wrote ${DOC_REL}`); process.exit(0);
}

if (cmd === 'add') {
  const target = args.find((a) => !a.startsWith('--') && !vals('--path').includes(a) && a !== val('--ref') && a !== val('--id') && a !== val('--use'));
  const m = String(target || '').match(/^(?:https:\/\/github\.com\/)?([\w.-]+\/[\w.-]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?\/?$/);
  if (!m) die('usage: skills.mjs add <owner/repo|github url> --use "how to use it" [--path dir]... [--ref commit|branch] [--id name] [--no-push]');
  const [, rp, treeRef, treePath] = m;
  const use = val('--use');
  if (!use) die('--use "how to use it" is required: say in one or two sentences how people use these skills');
  let sha, dir;
  try { sha = resolveRef(rp, val('--ref') || treeRef); dir = fetchPinned(rp, sha); } catch (e) { die(e.message); }
  const paths = vals('--path').length ? vals('--path') : treePath ? [treePath] : null;
  const skills = paths
    ? paths.flatMap((p) => { const f = discover(path.join(dir, p, '..'), rp).find((s) => path.basename(s.path) === path.basename(p)); return f ? [{ ...f, path: p.replace(/\/$/, '') }] : discover(path.join(dir, p), rp).map((s) => ({ ...s, path: s.path === '.' ? p : `${p}/${s.path}` })); })
    : discover(dir, rp);
  if (!skills.length) die('no SKILL.md found; pass --path <dir with SKILL.md>');
  const pack = { id: val('--id') || rp.split('/')[1].toLowerCase().replace(/[^a-z0-9-]+/g, '-'), repo: rp, ref: sha, use, note: '', added: today(), addedBy: machine, skills };
  const v = validateRegistry({ version: 1, packs: [pack] });
  if (!v.ok) die(`rejected: ${v.errs.slice(0, 4).join('; ')}`);

  // install on this computer first, so a broken skill never reaches master
  const st = loadState();
  for (const s of v.reg.packs[0].skills) {
    try { st.installed[s.name] = { pack: pack.id, repo: rp, ref: sha, hash: installSkill(v.reg.packs[0], s), at: new Date().toISOString() }; console.log(`installed ${s.name}`); }
    catch (e) { die(`${s.name}: ${e.message}`); }
  }
  saveState(st);
  const mutate = (reg) => { reg.packs = (reg.packs || []).filter((p) => p.id !== pack.id && p.repo !== rp).concat(v.reg.packs); };
  if (has('--no-push')) { writeLocalRegistry(mutate); console.log('added to the local registry only (not pushed)'); }
  else console.log(`master: ${updateMaster(mutate, `skills: add ${pack.id} (${skills.length} skill${skills.length === 1 ? '' : 's'}) from ${machine}`)}`);
  process.exit(0);
}

if (cmd === 'remove') {
  const what = args.find((a) => !a.startsWith('--'));
  if (!what) die('usage: skills.mjs remove <skill-or-source-id> [--no-push]');
  const r = loadRegistry(cfg, { fetch: true });
  const hit = r.reg.packs.filter((p) => p.id === what || p.repo === what || p.skills.some((s) => s.name === what));
  if (!hit.length) die(`not in master: ${what}`);
  const mutate = (reg) => {
    for (const p of reg.packs) if (p.id === what || p.repo === what) p.skills = [];
    for (const p of reg.packs) p.skills = p.skills.filter((s) => s.name !== what);
    reg.packs = reg.packs.filter((p) => p.skills.length);
  };
  if (has('--no-push')) writeLocalRegistry(mutate);
  else console.log(`master: ${updateMaster(mutate, `skills: remove ${what} from ${machine}`)}`);
  const res = sync(loadRegistry(cfg, { fetch: false }).reg, cfg);
  console.log(summarize(res) || 'removed from master');
  process.exit(0);
}

console.error('usage: skills.mjs sync|list|add|remove|docs ...');
process.exit(2);
