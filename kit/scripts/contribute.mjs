#!/usr/bin/env node
// Submits a lesson or catalogue entry as one small JSON file to the branch inbox/<machine>,
// pushed with your own GitHub login. Nobody pushes to main. Zero tokens.
//   node kit/scripts/contribute.mjs lesson --stack frappe --cause kit-gap --lesson "..." --fix "..." --project <repo>
//   node kit/scripts/contribute.mjs catalog --file catalog/<name>.json
//   node kit/scripts/contribute.mjs flush        retry entries that could not be pushed
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { REPO, localConfig, readJSON, readText, writeJSON, git, exists } from '../lib/common.mjs';
import { validate } from '../lib/inbox.mjs';

const [kind, ...rest] = process.argv.slice(2);
const val = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
const cfg = localConfig();
const kitRepo = cfg.kitPath || REPO;
const machine = (cfg.machine || os.hostname().split('.')[0]).replace(/[^\w.-]/g, '-');
const pending = path.join(kitRepo, 'inbox', 'pending');

let entry;
if (kind === 'lesson') {
  if (val('--cause') === 'prompt-issue') { console.log('prompt-issue lessons are not shared (dropped).'); process.exit(0); }
  entry = { type: 'lesson', stack: val('--stack'), cause: val('--cause'), lesson: val('--lesson'), fix: val('--fix'), project: val('--project') };
} else if (kind === 'catalog') {
  const e = readJSON(path.resolve(val('--file') || ''), null);
  if (!e) { console.error('--file <catalog entry json> required'); process.exit(2); }
  const { name, stack, repo, purpose, main, domain, status } = e;
  entry = { type: 'catalog', entry: { name, stack, repo, purpose, main, domain, status } };
} else if (kind !== 'flush') {
  console.error('usage: contribute.mjs lesson|catalog|flush ...'); process.exit(2);
}

if (entry) {
  entry.machine = machine;
  entry.created = new Date().toISOString();
  const v = validate(entry);
  if (!v.ok) { console.error(`rejected: ${v.errs.join('; ')}`); process.exit(1); }
  fs.mkdirSync(pending, { recursive: true });
  const name = `${machine}-${entry.created.replace(/\D/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}.json`;
  writeJSON(path.join(pending, name), v.entry);
}

// push every pending entry to inbox/<machine> through a temporary worktree
const files = exists(pending) ? fs.readdirSync(pending).filter((f) => f.endsWith('.json')) : [];
if (!files.length) process.exit(0);
const branch = `inbox/${machine}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mithtech-inbox-'));
const fetched = git(kitRepo, 'fetch', '--quiet', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`).code === 0;
git(kitRepo, 'fetch', '--quiet', 'origin', '+refs/heads/main:refs/remotes/origin/main');
const base = fetched ? `origin/${branch}` : 'origin/main';
let ok = git(kitRepo, 'worktree', 'add', '--quiet', '--detach', tmp, base).code === 0;
if (ok) {
  fs.mkdirSync(path.join(tmp, 'inbox'), { recursive: true });
  for (const f of files) fs.copyFileSync(path.join(pending, f), path.join(tmp, 'inbox', f));
  git(tmp, 'add', 'inbox');
  ok = git(tmp, 'commit', '--quiet', '-m', `inbox: ${files.length} entr${files.length === 1 ? 'y' : 'ies'} from ${machine}`).code === 0
    && git(tmp, 'push', '--quiet', 'origin', `HEAD:refs/heads/${branch}`).code === 0;
}
git(kitRepo, 'worktree', 'remove', '--force', tmp);
if (ok) { for (const f of files) fs.rmSync(path.join(pending, f)); console.log(`sent ${files.length} entr${files.length === 1 ? 'y' : 'ies'} to ${branch}`); }
else console.log(`saved ${files.length} entr${files.length === 1 ? 'y' : 'ies'} in inbox/pending; push failed (check gh auth / org access). Retry: node kit/scripts/contribute.mjs flush`);
