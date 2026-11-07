#!/usr/bin/env node
// SessionStart: print the last self-update result once, start a background update check
// (at most once a day), then at most 5 lines about the current project.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { KIT, STATE, readJSON, writeJSON, readStdin, git, exists } from '../lib/common.mjs';

let input = {};
try { input = JSON.parse(readStdin() || '{}'); } catch {}
const cwd = input.cwd || process.cwd();
const out = [];

const st = readJSON(STATE, {});
if (st.message && !st.shown) { out.push(`kit: ${st.message}`); st.shown = true; writeJSON(STATE, st); }
if (!st.lastCheck || Date.now() - Date.parse(st.lastCheck) > 24 * 3600e3) {
  st.lastCheck = new Date().toISOString(); writeJSON(STATE, st);
  const child = spawn(process.execPath, [path.join(KIT, 'scripts', 'update.mjs'), '--background'], { detached: true, stdio: 'ignore' });
  child.unref();
}

const top = git(cwd, 'rev-parse', '--show-toplevel').out || cwd;
const branch = git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD').out || '-';
const has = (f) => exists(path.join(top, f));
const stack = has('apps') && has('sites') ? 'frappe bench'
  : has('hooks.py') || globHooks(top) ? 'frappe app'
  : /@medusajs\//.test(readPkg(top)) ? 'medusa'
  : /"next"/.test(readPkg(top)) ? 'nextjs'
  : has('Cargo.toml') ? 'rust' : has('go.mod') ? 'go' : has('pubspec.yaml') ? 'flutter'
  : has('pyproject.toml') ? 'python' : has('package.json') ? 'js' : 'other';
out.push(`project: ${path.basename(top)} | stack: ${stack} | branch: ${branch}`);

const tasks = path.join(top, '.claude', 'tasks');
if (exists(tasks)) {
  const progs = fs.readdirSync(tasks).filter((d) => exists(path.join(tasks, d, 'status.md')))
    .map((d) => ({ d, t: fs.statSync(path.join(tasks, d, 'status.md')).mtimeMs })).sort((a, b) => b.t - a.t);
  if (progs[0]) {
    const s = fs.readFileSync(path.join(tasks, progs[0].d, 'status.md'), 'utf8');
    const gate = (s.match(/^gate:\s*(.+)$/im) || [])[1] || '?';
    out.push(`program: ${progs[0].d} | gate: ${gate} | resume: ORCHESTRATE resume ${progs[0].d}`);
  }
}
const read = ['CLAUDE.md', 'HANDOFF.md'].filter(has);
if (read.length) out.push(`read first: ${read.join(', ')}`);
if (has('.claude/owns.txt')) out.push('worker session: edit only files in .claude/owns.txt; questions go to questions.md');
process.stdout.write(out.slice(0, 5).join('\n') + '\n');

function readPkg(d) { try { return fs.readFileSync(path.join(d, 'package.json'), 'utf8'); } catch { return ''; } }
function globHooks(d) { try { return fs.readdirSync(d).some((x) => exists(path.join(d, x, 'hooks.py'))); } catch { return false; } }
