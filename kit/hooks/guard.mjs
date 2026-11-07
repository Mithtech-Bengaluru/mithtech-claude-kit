#!/usr/bin/env node
// PreToolUse guard: blocks force-push, pushes to main, prod migrations, secret reads,
// vendored edits, and (in worker sessions) edits outside .claude/owns.txt.
// Exit 2 + stderr blocks the call in every permission mode, bypassPermissions included.
import { decide } from '../lib/guard.mjs';
import { readStdin } from '../lib/common.mjs';

let input = {};
try { input = JSON.parse(readStdin() || '{}'); } catch { process.exit(0); }

let d = null;
try { d = decide(input); } catch (e) {
  // A broken guard must not stop work; report it once on stderr.
  process.stderr.write(`mithtech guard error: ${e.message}\n`);
  process.exit(0);
}

if (!d) process.exit(0);
if (d.decision === 'deny') {
  process.stderr.write(d.reason + '\n');
  process.exit(2);
}
// ask: force a confirmation even when allow rules match
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'ask',
    permissionDecisionReason: d.reason,
  },
}));
process.exit(0);
