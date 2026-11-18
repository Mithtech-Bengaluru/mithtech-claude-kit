#!/usr/bin/env node
// SessionEnd: drop the session marker. A temporary device worktree (air/<task>, mini/<task>) is folded into
// the sync branch (rebase, push HEAD:wip) and removed; on a conflict it stays and you get a notification.
import path from 'node:path';
import { readStdin } from '../lib/common.mjs';
import * as LS from '../lib/livesync.mjs';
import { liveConfig, entryFor, log, notify } from '../scripts/livesync.mjs';

let input = {};
try { input = JSON.parse(readStdin() || '{}'); } catch {}
try {
  const c = liveConfig();
  const e = entryFor(c, input.cwd || process.cwd());
  if (e && input.session_id) LS.unmarkSession(e.info.gitDir, input.session_id);
  if (!c.enabled || !e || e.mode !== 'live' || !e.info.linked) process.exit(0);
  const { dir, branch } = e.info;
  if (!branch || !branch.startsWith(`${c.device}/`) || LS.busy(e.info.gitDir)) process.exit(0);
  LS.commitAll(dir, { maxMB: c.maxMB, shared: c.shared, device: c.device });
  if (LS.changes(dir).length) { notify(`${e.rel}: worktree ${branch} kept (files not committed)`); process.exit(0); }
  if (LS.g(dir, 'fetch', '--quiet', 'origin').code) process.exit(0);
  const base = LS.g(dir, 'rev-parse', '--verify', '--quiet', `origin/${c.branch}`).code === 0 ? `origin/${c.branch}` : `origin/${e.main || c.main}`;
  const rb = LS.g(dir, 'rebase', base);
  if (rb.code) { LS.g(dir, 'rebase', '--abort'); notify(`${e.rel}: worktree ${branch} kept (conflict with ${c.branch})`); log(`${e.rel}: worktree ${branch} kept, rebase conflict`); process.exit(0); }
  if (LS.g(dir, 'push', '-q', 'origin', `HEAD:refs/heads/${c.branch}`).code) { notify(`${e.rel}: worktree ${branch} kept (push failed)`); process.exit(0); }
  LS.g(dir, 'push', '-q', 'origin', '--delete', branch);
  LS.g(e.info.mainTop, 'worktree', 'remove', dir);
  LS.g(e.info.mainTop, 'branch', '-q', '-D', branch);
  log(`${e.rel}: worktree ${branch} folded into ${c.branch} and removed (${path.basename(dir)})`);
} catch {}
process.exit(0);
