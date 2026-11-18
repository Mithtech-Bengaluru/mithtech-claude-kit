#!/usr/bin/env node
// Stop (end of every Claude turn): commit and push the sync branch of a live repo. On a rebase conflict the
// repo is paused and Claude is asked once to resolve it (resolve, gate, continue, push, resume).
import { readStdin, KIT } from '../lib/common.mjs';
import * as LS from '../lib/livesync.mjs';
import { liveConfig, entryFor, log } from '../scripts/livesync.mjs';

let input = {};
try { input = JSON.parse(readStdin() || '{}'); } catch {}
try {
  const c = liveConfig();
  if (!c.enabled) process.exit(0);
  const e = entryFor(c, input.cwd || process.cwd());
  if (!e || e.mode !== 'live') process.exit(0);
  const r = LS.syncRepo(e.info.dir, { ...c, mode: 'live', main: e.main || c.main, noIdle: true, ignoreSessions: true, sessionId: input.session_id });
  if (r.committed || r.pulled || r.pushed || r.status !== 'ok') log(`${e.rel}: turn end ${r.status}${r.note ? ` (${r.note})` : ''} +${r.committed} pulled ${r.pulled} pushed ${r.pushed}`);
  if (r.status === 'paused' && !input.stop_hook_active) {
    process.stderr.write(`Live sync paused ${e.rel}: ${r.note}\nResolve it now: on ${c.branch} run git pull --rebase, fix the conflicts (ask the user only if two changes contradict), run the repo's gate if it has one, git rebase --continue, git push, then node ${KIT}/scripts/livesync.mjs resume.\n`);
    process.exit(2);
  }
  if (r.refused.length && !input.stop_hook_active) process.stdout.write(`live sync: not committed ${r.refused.map((f) => `${f.path} (${f.why})`).join(', ')}\n`);
} catch {}
process.exit(0);
