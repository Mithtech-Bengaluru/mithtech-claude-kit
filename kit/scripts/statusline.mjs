#!/usr/bin/env node
// Kit statusline (installed only when no statusline exists): model, effort, context use, cost.
import { readStdin } from '../lib/common.mjs';
let s = {};
try { s = JSON.parse(readStdin() || '{}'); } catch {}
const parts = [
  s.model?.display_name || s.model?.id || '?',
  s.effort?.level ? `effort ${s.effort.level}` : null,
  s.context_window?.used_percentage != null ? `ctx ${Math.round(s.context_window.used_percentage)}%` : null,
  s.cost?.total_cost_usd != null ? `$${s.cost.total_cost_usd.toFixed(2)}` : null,
  s.workspace?.git_worktree ? `wt ${s.workspace.git_worktree}` : null,
].filter(Boolean);
process.stdout.write(parts.join(' | '));
