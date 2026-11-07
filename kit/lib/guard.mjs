// Decision logic for the PreToolUse guard hook. Pure function of the hook input, plus git and files.
import fs from 'node:fs';
import path from 'node:path';
import { KIT, readJSON, readText, globToRegex, findUp, git, localConfig, HOME } from './common.mjs';

const R = readJSON(path.join(KIT, 'hooks', 'guard-rules.json'), {});
const rx = (s) => new RegExp(s, 'i');
const norm = (p) => p.replace(/\\/g, '/');

export function decide(input) {
  const tool = input.tool_name || '';
  const ti = input.tool_input || {};
  const cwd = input.cwd || process.cwd();
  const cfg = localConfig();
  if (tool === 'Bash') return bash(String(ti.command || ''), cwd, cfg);
  const file = ti.file_path || ti.notebook_path || ti.path || '';
  if (['Read', 'Grep', 'Glob', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const abs = norm(path.resolve(cwd, file || '.'));
    const pat = norm(String(ti.pattern || ti.glob || ''));
    for (const r of R.pathBlock || []) {
      if (rx(r.re).test(abs) || (tool === 'Glob' && rx(r.re).test(pat))) return deny(r.why);
    }
    if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool) && file) return edit(abs, cwd);
  }
  return null;
}

function bash(cmd, cwd, cfg) {
  for (const r of R.bashBlock || []) if (rx(r.re).test(cmd)) return deny(r.why);
  // bare `git push` while on a protected branch
  if (/\bgit\b[^;&|\n]*\bpush\b/.test(cmd) && !/\bpush\b\s+\S+\s+\S+/.test(cmd)) {
    const b = git(cwd, 'symbolic-ref', '--short', 'HEAD').out;
    if (/^(main|master|production|prod)$/.test(b)) return deny(`you are on ${b}; pushing it is blocked`);
  }
  // migrations only on dev/test sites
  const dev = rx(R.devSitePattern);
  const extraDev = (cfg.devSites || []);
  const m = cmd.match(/\bbench\b[^;&|\n]*--site\s+(\S+)[^;&|\n]*\bmigrate\b/);
  if (m && !(dev.test(m[1]) || extraDev.includes(m[1]))) return deny(`migrate on non-dev site ${m[1]} is blocked`);
  if (/\bbench\b[^;&|\n]*\bmigrate\b/.test(cmd) && !m) return ask('bench migrate without --site runs on every site');
  if (/NODE_ENV=production[^;&|\n]*medusa\s+db:(migrate|sync)|medusa\s+db:(migrate|sync)[^;&|\n]*--production/.test(cmd)) return deny('production Medusa migrations are blocked');
  for (const p of cfg.prodPatterns || []) if (rx(p).test(cmd)) return ask(`touches a production target (${p})`);
  for (const r of R.bashAsk || []) if (rx(r.re).test(cmd)) return ask(r.why);
  return null;
}

function edit(abs, cwd) {
  const top = norm(git(path.dirname(abs), 'rev-parse', '--show-toplevel').out || cwd);
  const rel = abs.startsWith(top + '/') ? abs.slice(top.length + 1) : abs;
  for (const g of R.alwaysVendored || []) if (globToRegex(g).test(abs)) return deny(`${rel} is vendored/generated; never edit it`);
  const vend = findUp(path.dirname(abs), '.claude/vendored.txt');
  if (vend) {
    const root = norm(path.dirname(path.dirname(vend)));
    const r2 = abs.startsWith(root + '/') ? abs.slice(root.length + 1) : abs;
    for (const line of lines(vend)) if (globToRegex(line).test(r2)) return deny(`${r2} is vendored (${line}); edit only if the user asks`);
  }
  // worker sessions: owns.txt at the worktree root limits edits
  const owns = path.join(top, '.claude', 'owns.txt');
  if (fs.existsSync(owns)) {
    const L = lines(owns);
    const contracts = L.filter((l) => l.startsWith('contract:')).map((l) => l.slice(9).trim());
    const owned = L.filter((l) => !l.startsWith('contract:'));
    if (contracts.some((g) => globToRegex(g).test(rel))) return deny(`${rel} is a contract file; workers never edit contracts`);
    if (rel.startsWith('.claude/tasks/')) return null; // status and questions
    if (!owned.some((g) => globToRegex(g).test(rel))) return deny(`${rel} is outside this unit's owned files (.claude/owns.txt); write a question instead`);
  }
  return null;
}

const lines = (f) => readText(f).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const deny = (why) => ({ decision: 'deny', reason: `Mithtech kit: ${why}.` });
const ask = (why) => ({ decision: 'ask', reason: `Mithtech kit: ${why}.` });
export const _home = HOME;
