#!/usr/bin/env node
// Self-update (zero tokens). Moves the local kit clone to the newest release tag only when:
//  - the tag is vX.Y.Z, its commit is on origin/main (protected), and
//  - if kit/allowed_signers exists in the CURRENT trusted copy, the tag signature verifies.
// Never updates over local uncommitted kit edits. Re-runs the installer quietly.
import path from 'node:path';
import { STATE, localConfig, readJSON, writeJSON, git, run, semverCmp, exists, readText } from '../lib/common.mjs';

const quiet = process.argv.includes('--background');
const cfg = localConfig();
const repo = cfg.kitPath;
const done = (message, extra = {}) => {
  const st = readJSON(STATE, {});
  writeJSON(STATE, { ...st, lastCheck: new Date().toISOString(), message, shown: !message, ...extra });
  if (!quiet && message) console.log(message);
  process.exit(0);
};
if (!repo || !exists(path.join(repo, 'kit', 'install.mjs'))) done('');

const dirty = git(repo, 'status', '--porcelain', '--', 'kit', '.claude-plugin', 'RULES.md', 'catalog').out;
const f = git(repo, 'fetch', '--quiet', '--tags', '--prune', 'origin', '+refs/heads/main:refs/remotes/origin/main');
if (f.code !== 0) done(''); // offline: stay quiet

const tags = git(repo, 'tag', '--list', 'v*').out.split('\n').filter((t) => /^v\d+\.\d+\.\d+$/.test(t)).sort(semverCmp);
const newest = tags.at(-1);
const current = 'v' + readText(path.join(repo, 'kit', 'VERSION')).trim();
if (!newest || semverCmp(newest, current) <= 0) done('');
if (dirty) done(`kit ${newest} is available, but local kit edits exist in ${repo}; not updated. Commit or stash them first.`);

const commit = git(repo, 'rev-list', '-n', '1', newest).out;
if (git(repo, 'merge-base', '--is-ancestor', commit, 'origin/main').code !== 0) done(`refused ${newest}: its commit is not on protected main.`);
const signers = path.join(repo, 'kit', 'allowed_signers');
if (exists(signers)) {
  const v = git(repo, '-c', `gpg.ssh.allowedSignersFile=${signers}`, 'verify-tag', newest);
  if (v.code !== 0) done(`refused ${newest}: tag signature does not verify.`);
}

const branch = git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').out;
let r;
if (branch === 'HEAD') r = git(repo, 'checkout', '--quiet', '--detach', newest);
else if (branch === 'main') r = git(repo, 'merge', '--ff-only', '--quiet', newest);
else done(`kit ${newest} is available; the clone is on branch ${branch}, so it was not updated.`);
if (r.code !== 0) done(`kit ${newest}: fast-forward failed (${r.err.split('\n')[0]}).`);

const inst = run(process.execPath, [path.join(repo, 'kit', 'install.mjs'), '--update', '--quiet'], { timeout: 120000 });
done(inst.code === 0 ? `updated to ${newest}. Restart Claude Code to load it.` : `updated files to ${newest}, but the installer failed: run node kit/install.mjs --update`);
