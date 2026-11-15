#!/usr/bin/env node
// Starts one worker session for a unit (run by the orchestrator, from the project root).
//   node kit/scripts/worker.mjs <slug> --plan               table of all units (starts nothing)
//   node kit/scripts/worker.mjs <slug> <unit> [--dry-run]   worktree + owns.txt + claude -p
//   node kit/scripts/worker.mjs <slug> <unit> --answer "<text>"   resume the unit with an answer
// Model/effort come from lib/route.mjs: the brief's `Route:` line (a route id, or legacy model/effort) and `Floor:` line.
// A unit that failed before is escalated by the ladder (retry once, raise one step, then park).
// Usage is summed from stream-json; the unit is paused at 150% of its token estimate.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { KIT, readText, readJSON, exists, git, localConfig, IS_WIN } from '../lib/common.mjs';
import { loadRouting, resolve, escalate, logRoute, floorIds } from '../lib/route.mjs';

const [slug, unitArg, ...rest] = process.argv.slice(2);
const flag = (k) => rest.includes(k) || unitArg === k;
const val = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
const root = git(process.cwd(), 'rev-parse', '--show-toplevel').out;
if (!slug || !root) { console.error('usage: node kit/scripts/worker.mjs <slug> (<unit>|--plan) [--dry-run] [--answer text]'); process.exit(2); }
const cfg = localConfig();
const routing = loadRouting();
const briefsDir = path.join(root, 'docs', 'programs', slug, 'briefs');
const tasks = path.join(root, '.claude', 'tasks', slug);

function parseBrief(unit) {
  const t = readText(path.join(briefsDir, `${unit}.md`));
  if (!t) throw new Error(`no brief docs/programs/${slug}/briefs/${unit}.md`);
  const block = (name) => ((t.match(new RegExp('```' + name + '\\n([\\s\\S]*?)```')) || [])[1] || '').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
  const rv = (t.match(/^[\s>*-]*Route:[ \t]*([a-z][\w./-]*)/im) || [])[1] || 'feature';
  const floors = ((t.match(/^[\s>*-]*Floor:[ \t]*([^\n|]+)/im) || [])[1] || '').split(/[,\s]+/).filter((f) => floorIds(routing).includes(f));
  const reason = (t.match(/Route:[^\n]*\|\s*Reason:\s*(.+)/i) || [])[1];
  let r;
  try { r = resolve(rv, { floors, routing, cfg }); } catch (e) { console.error(`bad Route/Floor in brief ${unit}: ${e.message}`); process.exit(2); }
  return {
    unit, owner: ((t.match(/Owner:\s*([^\n|]+)/i) || [])[1] || 'session').trim(),
    wave: ((t.match(/Wave:\s*([^\n|]+)/i) || [])[1] || '?').trim(),
    route: rv, floors, model: r.alias, effort: r.effort, reason: reason ? `${reason.trim()}${floors.length ? ` (floor ${floors.join(', ')})` : ''}` : r.reason,
    tokens: Number(((t.match(/Token estimate:\s*([\d_,.]+)\s*(k)?/i) || [])[1] || '0').replace(/[_,]/g, '')) * (/Token estimate:\s*[\d_,.]+\s*k/i.test(t) ? 1000 : 1),
    owns: block('owns'), contracts: block('contracts'), gate: ((t.match(/## Gate command\s*\n+`([^`]+)`/) || [])[1] || ''),
  };
}

if (flag('--plan')) {
  const units = exists(briefsDir) ? fs.readdirSync(briefsDir).filter((f) => f.endsWith('.md')).map((f) => parseBrief(f.slice(0, -3))) : [];
  console.log('| Unit | Wave | Owned files | Model/effort | Reason | Token estimate | Owner |\n|---|---|---|---|---|---|---|');
  for (const u of units) console.log(`| ${u.unit} | ${u.wave} | ${u.owns.join('<br>')} | ${u.model}/${u.effort} | ${u.reason} | ${u.tokens.toLocaleString('en')} | ${u.owner} |`);
  console.log(`\n${units.length} unit(s), ${units.reduce((a, u) => a + u.tokens, 0).toLocaleString('en')} tokens estimated. No session started. Max parallel: ${cfg.maxParallel || 3}.`);
  process.exit(0);
}

const u = parseBrief(unitArg);
if (u.owner.startsWith('person:')) { console.log(`${u.unit} | blocked | assigned to ${u.owner}; give them docs/programs/${slug}/briefs/${u.unit}.md | 0 | none`); process.exit(0); }

// parallel limit
const running = path.join(tasks, 'running');
fs.mkdirSync(running, { recursive: true });
const live = fs.readdirSync(running).filter((f) => { try { process.kill(Number(readText(path.join(running, f))), 0); return true; } catch { fs.rmSync(path.join(running, f), { force: true }); return false; } });
if ((cfg.maxParallel ?? 3) > 0 && live.length >= (cfg.maxParallel ?? 3) && !live.includes(u.unit)) { console.log(`${u.unit} | blocked | ${live.length} units running (max ${cfg.maxParallel || 3}); start it after one finishes | 0 | none`); process.exit(0); }

// worktree on unit/<slug>/<unit> from feat/<slug>
const wtRoot = cfg.worktreeRoot ? path.join(cfg.worktreeRoot, path.basename(root)) : `${root}-worktrees`;
const wt = path.join(wtRoot, u.unit);
const branch = `unit/${slug}/${u.unit}`;
// stop rule as code: failed runs of this unit (since its last finish) -> retry once, raise one step, then park
const tlog = readText(path.join(tasks, 'tokens.log')).split('\n').filter((l) => l.split(' | ')[1] === u.unit);
let failures = 0;
for (const l of tlog) { const st = l.split(' | ').pop().trim(); if (st === 'finished') failures = 0; else if (st.startsWith('exit-')) failures++; }
const base = { model: u.model, effort: u.effort };
const esc = escalate(base, failures, { routing, cfg });
if (esc.action === 'park') { console.log(`${u.unit} | blocked | failed ${failures} time(s); ${esc.reason}; ask: simplify, split or stop | 0 | escalation`); process.exit(0); }
const model = esc.model; u.effort = esc.effort;
if (failures) u.reason = `${u.reason}; ${esc.reason}`;
const promptFile = path.join(KIT, 'agents', 'worker.md');
const prompt = `You are the worker for unit "${u.unit}" of program "${slug}". Your brief: .claude/tasks/${slug}/brief.md (copied from docs/programs/${slug}/briefs/${u.unit}.md). `
  + `Contracts (read-only): ${u.contracts.join(', ') || 'none'}. Gate: ${u.gate || 'see brief'}. Write questions to .claude/tasks/${slug}/questions.md.`
  + (val('--answer') ? `\nAnswer from the user to your earlier question: ${val('--answer')}\nContinue the unit.` : '');
const cmd = ['-p', prompt, '--model', model, '--effort', u.effort, '--permission-mode', 'bypassPermissions', '--output-format', 'stream-json', '--verbose',
  '--append-system-prompt', readText(promptFile).replace(/^---[\s\S]*?---\n/, '')];
if (flag('--dry-run')) { console.log(`routing ${model}/${u.effort}: ${u.reason}\nworktree ${wt} (branch ${branch})\nclaude ${cmd.slice(0, 1).join(' ')} "<prompt>" ${cmd.slice(2, 11).join(' ')} --append-system-prompt <worker agent>`); process.exit(0); }

if (!exists(wt)) {
  if (git(root, 'rev-parse', '--verify', `feat/${slug}`).code !== 0) git(root, 'branch', `feat/${slug}`);
  const r = git(root, 'worktree', 'add', '-b', branch, wt, `feat/${slug}`);
  if (r.code !== 0 && git(root, 'worktree', 'add', wt, branch).code !== 0) { console.error(r.err); process.exit(1); }
}
const common = path.resolve(root, git(root, 'rev-parse', '--git-common-dir').out);
const excl = path.join(common, 'info', 'exclude');
if (!readText(excl).includes('.claude/owns.txt')) fs.appendFileSync(excl, '\n.claude/owns.txt\n.claude/tasks/\n');
fs.mkdirSync(path.join(wt, '.claude', 'tasks', slug), { recursive: true });
fs.writeFileSync(path.join(wt, '.claude', 'owns.txt'), u.owns.concat(u.contracts.map((c) => `contract:${c}`)).join('\n') + '\n');
fs.copyFileSync(path.join(briefsDir, `${u.unit}.md`), path.join(wt, '.claude', 'tasks', slug, 'brief.md'));

logRoute({ cwd: root, program: slug, label: u.unit, model, effort: u.effort, reason: u.reason });
const child = spawn('claude', cmd, { cwd: wt, shell: IS_WIN, stdio: ['ignore', 'pipe', 'pipe'] });
fs.writeFileSync(path.join(running, u.unit), String(child.pid));
let used = 0, cost = 0, result = '', paused = false, buf = '';
const perMsg = new Map(); // message id -> tokens (last usage seen wins)
const noCap = exists(path.join(tasks, 'nocap')) || (cfg.noTokenCap || []).includes(path.basename(root));
const limit = u.tokens && !noCap ? u.tokens * 1.5 : Infinity;
child.stdout.on('data', (d) => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let ev; try { ev = JSON.parse(line); } catch { continue; }
    const us = ev.message?.usage;
    // stream-json sends one assistant event per content block, each repeating the message's usage: count each message id once (latest usage).
    if (ev.type === 'assistant' && us) { perMsg.set(ev.message.id || perMsg.size, (us.input_tokens || 0) + (us.output_tokens || 0) + (us.cache_creation_input_tokens || 0) + Math.round((us.cache_read_input_tokens || 0) * 0.1)); used = [...perMsg.values()].reduce((a, b) => a + b, 0); }
    if (ev.type === 'result') { result = String(ev.result || '').trim().split('\n').pop(); cost = ev.total_cost_usd || 0; }
    if (used > limit && !paused) { paused = true; child.kill('SIGTERM'); }
  }
});
child.on('close', (code) => {
  fs.rmSync(path.join(running, u.unit), { force: true });
  const wq = path.join(wt, '.claude', 'tasks', slug, 'questions.md');
  if (exists(wq)) { fs.mkdirSync(tasks, { recursive: true }); fs.appendFileSync(path.join(tasks, 'questions.md'), readText(wq)); fs.rmSync(wq); }
  const status = paused ? 'paused-over-budget' : code === 0 ? 'finished' : `exit-${code}`;
  fs.mkdirSync(tasks, { recursive: true });
  fs.appendFileSync(path.join(tasks, 'tokens.log'), `${new Date().toISOString()} | ${u.unit} | ${model}/${u.effort} | ${used} tokens (est ${u.tokens}) | $${cost.toFixed(3)} | ${status}\n`);
  const next = code !== 0 && !paused ? escalate(base, failures + 1, { routing, cfg }) : null;
  if (next) logRoute({ cwd: root, program: slug, label: u.unit, model: next.model, effort: next.effort, reason: `next run after failure ${failures + 1}: ${next.action}: ${next.reason}` });
  if (paused) console.log(`${u.unit} | blocked | paused at ${used} tokens (150% of ${u.tokens}); ask: continue, simplify or stop | ${used} | budget`);
  else console.log(result.includes('|') ? result : `${u.unit} | ${code === 0 ? 'done' : 'blocked'} | ${result || 'no summary'}${next ? ` (next run: ${next.action} ${next.model.replace('claude-', '')}/${next.effort})` : ''} | ${used} | see questions.md`);
});
