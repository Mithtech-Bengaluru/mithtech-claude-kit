#!/usr/bin/env node
// COLLECT (maintainer only, manual, zero tokens). Fetches every inbox/* branch, validates each
// entry, shows a summary of 10 lines or fewer and accepts nothing without your yes. On yes:
// writes lessons into kit/rules.json (as skill gotchas), catalogue entries into catalog/,
// regenerates RULES.md and the skill rule blocks, bumps the version, tags a release, pushes
// main and the tag, and deletes the processed inbox branches.
//   node kit/maintain.mjs [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { KIT, REPO, readJSON, writeJSON, readText, git, run, semverCmp } from './lib/common.mjs';
import { validate, similar, norm } from './lib/inbox.mjs';

const dry = process.argv.includes('--dry-run');
const die = (m) => { console.error(m); process.exit(1); };
if (git(REPO, 'rev-parse', '--abbrev-ref', 'HEAD').out !== 'main') die('switch the kit repo to main first');
if (git(REPO, 'status', '--porcelain', '--untracked-files=no').out) die('the kit repo has uncommitted changes; commit or stash them first');
git(REPO, 'fetch', '--quiet', '--prune', 'origin', '+refs/heads/main:refs/remotes/origin/main', '+refs/heads/inbox/*:refs/remotes/origin/inbox/*');
if (git(REPO, 'merge', '--ff-only', '--quiet', 'origin/main').code !== 0) die('local main is not a fast-forward of origin/main');

const branches = git(REPO, 'for-each-ref', '--format=%(refname:short) %(objectname)', 'refs/remotes/origin/inbox/').out.split('\n').filter(Boolean).map((l) => l.split(' '));
const rules = readJSON(path.join(KIT, 'rules.json'));
const allRules = rules.groups.flatMap((g) => g.rules.map((r) => r.text));
const accepted = { lesson: [], catalog: [] }, rejected = [];
const seen = new Set();
for (const [ref] of branches) {
  const files = git(REPO, 'diff', '--name-only', '--diff-filter=A', `origin/main...${ref}`, '--', 'inbox/').out.split('\n').filter((f) => /^inbox\/[\w.-]+\.json$/.test(f));
  for (const f of files) {
    const raw = git(REPO, 'show', `${ref}:${f}`).out;
    if (raw.length > 4000) { rejected.push([f, 'file too large']); continue; }
    const v = validate(raw);
    if (!v.ok) { rejected.push([f, v.errs.join('; ')]); continue; }
    const e = v.entry;
    const key = e.type === 'lesson' ? norm(e.lesson + ' ' + e.fix) : 'cat:' + e.entry.name;
    if (seen.has(key)) { rejected.push([f, 'duplicate in inbox']); continue; }
    seen.add(key);
    if (e.type === 'lesson' && allRules.some((t) => similar(t, `${e.fix} ${e.lesson}`) > 0.7)) { rejected.push([f, 'near-duplicate of an existing rule']); continue; }
    accepted[e.type].push({ ...e, file: f });
  }
}

// summary: 10 lines or fewer
const out = [`inbox: ${branches.length} branch(es); valid: ${accepted.lesson.length} lesson(s), ${accepted.catalog.length} catalogue entr(ies); rejected: ${rejected.length}`];
for (const l of accepted.lesson.slice(0, 5)) out.push(`+ [${l.stack}/${l.cause}] ${l.fix} (${l.lesson}) - ${l.project}`);
if (accepted.lesson.length > 5) out.push(`+ ... ${accepted.lesson.length - 5} more lesson(s)`);
if (accepted.catalog.length) out.push(`+ catalogue: ${accepted.catalog.map((c) => c.entry.name).slice(0, 6).join(', ')}${accepted.catalog.length > 6 ? ', ...' : ''}`);
for (const [f, why] of rejected.slice(0, 10 - out.length - 1)) out.push(`- rejected ${path.basename(f)}: ${why}`);
console.log(out.slice(0, 10).join('\n'));
if (!accepted.lesson.length && !accepted.catalog.length) {
  if (!rejected.length) process.exit(0);
}
if (dry) process.exit(0);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ans = (await rl.question('Accept the valid entries, release and delete the processed inbox branches? [y/N] ')).trim().toLowerCase();
rl.close();
if (ans !== 'y' && ans !== 'yes') { console.log('Nothing changed.'); process.exit(0); }

// write lessons as gotchas in the right group; catalogue entries as files
for (const l of accepted.lesson) {
  const g = rules.groups.find((x) => x.id === l.stack) || rules.groups.find((x) => x.id === 'other');
  const n = g.rules.filter((r) => r.kind === 'gotcha').length + 1;
  const fix = l.fix.replace(/[.\s]+$/, '');
  g.rules.push({ id: `${g.id[0].toUpperCase()}G${String(n).padStart(2, '0')}`, kind: 'gotcha', text: `${fix}; ${l.lesson.charAt(0).toLowerCase()}${l.lesson.slice(1).replace(/[.\s]+$/, '')}.`, source: l.project, added: l.created.slice(0, 10) });
}
writeJSON(path.join(KIT, 'rules.json'), rules);
for (const c of accepted.catalog) {
  const file = path.join(REPO, 'catalog', c.entry.name.replace(/^@/, '').replace(/\//g, '__') + '.json');
  writeJSON(file, { ...readJSON(file, {}), ...c.entry, updated: c.created.slice(0, 10) });
}
const gen = run(process.execPath, [path.join(KIT, 'scripts', 'rules.mjs')]);
if (gen.code !== 0) die(`rules.mjs failed: ${gen.err}`);

// version bump: minor for lessons, patch for catalogue only
const cur = readText(path.join(KIT, 'VERSION')).trim();
const [ma, mi, pa] = cur.split('.').map(Number);
const next = accepted.lesson.length ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`;
fs.writeFileSync(path.join(KIT, 'VERSION'), next + '\n');
const pj = path.join(KIT, '.claude-plugin', 'plugin.json');
writeJSON(pj, { ...readJSON(pj), version: next });
git(REPO, 'add', 'kit', 'catalog', 'RULES.md');
const msg = `kit v${next}: ${accepted.lesson.length} lesson(s), ${accepted.catalog.length} catalogue entr(ies)`;
if (git(REPO, 'commit', '--quiet', '-m', msg).code !== 0) die('commit failed');
const signed = !!git(REPO, 'config', 'user.signingkey').out;
git(REPO, 'tag', signed ? '-s' : '-a', `v${next}`, '-m', msg);
const push = git(REPO, 'push', '--quiet', 'origin', 'main', `v${next}`);
if (push.code !== 0) {
  git(REPO, 'push', '--quiet', 'origin', `HEAD:refs/heads/release/v${next}`);
  console.log(`main is protected against direct push. Open the PR: gh pr create --head release/v${next} --title "${msg}"`);
  console.log(`After merging, tag the merge commit: git tag ${signed ? '-s' : '-a'} v${next} -m "${msg}" && git push origin v${next}`);
}
// delete processed inbox branches only if nobody pushed to them since the fetch
for (const [ref, sha] of branches) {
  const b = ref.replace(/^origin\//, '');
  git(REPO, 'push', '--quiet', `--force-with-lease=refs/heads/${b}:${sha}`, 'origin', `:refs/heads/${b}`);
}
console.log(`released v${next}${push.code === 0 ? '' : ' (pending PR)'}; ${branches.length} inbox branch(es) processed. ${signed ? 'Tag signed.' : 'Tag not signed (set user.signingkey to sign).'}`);
