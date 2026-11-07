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

// Commands that run text again (sh -c, eval, ssh …) are checked on the raw text, conservatively.
const REEVAL = /\b(sh|bash|zsh|dash|fish)\s+(-\w+\s+)*-c\b|\beval\b|\bxargs\b|\bssh\b|\bsource\b|(^|[\s;&|])\.\s|\bwatch\b|\bparallel\b/;
const PROTECTED = /^(main|master|production|prod)$/;
const WRAPPERS = new Set(['sudo', 'env', 'command', 'time', 'nohup', 'exec', 'nice']);

// Quoted text and here-doc bodies are data, not commands: drop multi-word strings, keep one-word ones as words.
function structural(cmd) {
  let s = cmd.replace(/<<-?\s*(['"]?)([\w.-]+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, ' ');
  return s.replace(/\$'(?:\\.|[^'\\])*'|'([^']*)'|"((?:\\.|[^"\\])*)"/g, (m, a, b) => {
    const v = a ?? b ?? '';
    return v && !/\s/.test(v) ? v : "''";
  });
}
// Split into simple commands; follow `cd DIR` so later git calls use the right repo.
function commands(cmd, cwd) {
  const out = [];
  let dir = cwd;
  for (const seg of structural(cmd).split(/&&|\|\||[;&|\n()`{}]|\$\(/)) {
    let w = seg.trim().split(/\s+/).filter(Boolean);
    while (w.length && (/^\w+=/.test(w[0]) || WRAPPERS.has(w[0]))) w.shift();
    if (!w.length) continue;
    if (w[0] === 'cd' && w[1]) { dir = path.resolve(dir, w[1].replace(/^~(?=\/|$)/, HOME)); continue; }
    out.push({ w, dir });
  }
  return out;
}
function gitPush({ w, dir }) {
  if (!/(^|\/)git$/.test(w[0])) return null;
  let i = 1, d = dir;
  while (i < w.length && w[i].startsWith('-')) {
    if (w[i] === '-C' && w[i + 1]) { d = path.resolve(d, w[i + 1]); i += 2; }
    else if (['-c', '--git-dir', '--work-tree', '--namespace'].includes(w[i])) i += 2;
    else i++;
  }
  if (w[i] !== 'push') return null;
  const args = w.slice(i + 1);
  if (args.some((a) => /^--force(-with-lease|-if-includes)?(=|$)/.test(a) || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a) || /^\+/.test(a))) return deny('force-push is blocked');
  if (args.some((a) => a === '--all' || a === '--mirror')) return deny('push --all/--mirror is blocked');
  const valueOpts = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);
  const pos = [];
  for (let k = 0; k < args.length; k++) { if (valueOpts.has(args[k])) { k++; continue; } if (!args[k].startsWith('-')) pos.push(args[k]); }
  if (pos.slice(1).some((r) => r.split(':').some((x) => PROTECTED.test(x.replace(/^refs\/heads\//, ''))))) return deny('push to main/master/production is blocked; push a feature branch and open a PR');
  if (pos.length < 2) {
    const b = git(d, 'symbolic-ref', '--short', 'HEAD').out;
    if (PROTECTED.test(b)) return deny(`you are on ${b}; pushing it is blocked`);
  }
  return null;
}
// bench site commands: migrate only on dev/test sites; dev-site migrate/backup/run-tests are pre-approved here
// (instead of wildcard allow rules in settings.json).
function benchSite({ w }, cfg) {
  if (!/(^|\/)bench$/.test(w[0])) return null;
  const si = w.indexOf('--site');
  const site = si >= 0 ? w[si + 1] : null;
  const sub = w.filter((x, k) => !x.startsWith('-') && k > 0 && k !== si + 1)[0];
  const isDev = site && (rx(R.devSitePattern).test(site) || (cfg.devSites || []).includes(site));
  if (sub === 'migrate') {
    if (!site) return ask('bench migrate without --site runs on every site');
    if (!isDev) return deny(`migrate on non-dev site ${site} is blocked`);
  }
  if (isDev && ['migrate', 'backup', 'run-tests'].includes(sub)) return { decision: 'allow', reason: `Mithtech kit: ${sub} on dev site ${site}.` };
  return null;
}

function bash(cmd, cwd, cfg) {
  const raw = REEVAL.test(cmd);
  for (const r of R.bashBlock || []) if (rx(r.re).test(cmd)) return deny(r.why);
  if (raw) for (const r of R.gitPushRaw || []) if (rx(r.re).test(cmd)) return deny(r.why);
  let allow = null;
  for (const c of commands(cmd, cwd)) {
    const d = gitPush(c) || benchSite(c, cfg);
    if (d && d.decision !== 'allow') return d;
    if (d) allow = allow || d;
  }
  if (raw && /\bbench\b[^;&|\n]*\bmigrate\b/.test(cmd)) return ask('bench migrate inside a nested shell; check the site');
  if (/NODE_ENV=production[^;&|\n]*medusa\s+db:(migrate|sync)|medusa\s+db:(migrate|sync)[^;&|\n]*--production/.test(cmd)) return deny('production Medusa migrations are blocked');
  for (const p of cfg.prodPatterns || []) if (rx(p).test(cmd)) return ask(`touches a production target (${p})`);
  for (const r of R.bashAsk || []) if (rx(r.re).test(cmd)) return ask(r.why);
  // pre-approve only a single plain command, never one chained with others
  return allow && commands(cmd, cwd).length === 1 && !raw ? allow : null;
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
