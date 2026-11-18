#!/usr/bin/env node
// SessionStart: print the last self-update result once, start a background update check
// (at most once a day), then at most 5 lines about the current project.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { KIT, STATE, readJSON, writeJSON, readStdin, git, exists } from '../lib/common.mjs';
import * as LS from '../lib/livesync.mjs';
import { liveConfig, entryFor, log, real } from '../scripts/livesync.mjs';
import { link as linkSecrets } from '../scripts/secrets.mjs';

let input = {};
try { input = JSON.parse(readStdin() || '{}'); } catch {}
const cwd = input.cwd || process.cwd();
const out = [];

const st = readJSON(STATE, {});
if (st.message && !st.shown) { out.push(`kit: ${st.message}`); st.shown = true; writeJSON(STATE, st); }
if (st.skillsMessage && !st.skillsShown) { out.push(st.skillsMessage); st.skillsShown = true; writeJSON(STATE, st); }
if (!st.lastCheck || Date.now() - Date.parse(st.lastCheck) > 24 * 3600e3) {
  st.lastCheck = new Date().toISOString(); writeJSON(STATE, st);
  const child = spawn(process.execPath, [path.join(KIT, 'scripts', 'update.mjs'), '--background'], { detached: true, stdio: 'ignore' });
  child.unref();
}
// skill sync (own daily timer; reads the master list from main, never needs a release tag)
if (!st.lastSkillSync || Date.now() - Date.parse(st.lastSkillSync) > 24 * 3600e3) {
  st.lastSkillSync = new Date().toISOString(); writeJSON(STATE, st);
  const sk = spawn(process.execPath, [path.join(KIT, 'scripts', 'skills.mjs'), 'sync', '--background'], { detached: true, stdio: 'ignore' });
  sk.unref();
}

// Live git sync (opt-in per machine): clone a placeholder, else commit + pull the sync branch first.
const live = liveSyncStart();

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
if (live) out.push(live);
const read = ['CLAUDE.md', 'HANDOFF.md'].filter(has);
if (read.length) out.push(`read first: ${read.join(', ')}`);
if (has('.claude/owns.txt')) out.push('worker session: edit only files in .claude/owns.txt; questions go to questions.md');
process.stdout.write(out.slice(0, 5).join('\n') + '\n');

function readPkg(d) { try { return fs.readFileSync(path.join(d, 'package.json'), 'utf8'); } catch { return ''; } }
function globHooks(d) { try { return fs.readdirSync(d).some((x) => exists(path.join(d, x, 'hooks.py'))); } catch { return false; } }

function liveSyncStart() {
  try {
    const c = liveConfig();
    if (!c.enabled || !c.root || !c.registry) return null;
    const rel = path.relative(real(c.root), real(cwd)).split(path.sep).join('/');
    if (!rel.startsWith('..') && LS.isPlaceholder(cwd)) {
      const e = LS.readRegistry(c.registry).repos[rel];
      if (!e) return `live sync: ${rel} is a placeholder but not in the registry`;
      const r = LS.cloneRepo(c.root, rel, e, c);
      log(`${rel}: ${r.note} (session start)`);
      return `live sync: ${rel} ${r.ok ? `${r.note}; restart this session to load the project files` : r.note}`;
    }
    const e = entryFor(c, cwd);
    if (!e || !['live', 'pull'].includes(e.mode)) return null;
    if (input.session_id) LS.markSession(e.info.gitDir, input.session_id);
    if (c.shared && e.mode === 'live') { try { linkSecrets(e.info.dir, c.root, c.shared); } catch {} }
    const pausedMsg = (why) => `live sync PAUSED for ${e.rel}: ${why}. Help the user clear it first: on ${c.branch}, git pull --rebase, resolve (ask only if two changes contradict), git rebase --continue, git push, then node ${KIT}/scripts/livesync.mjs resume`;
    const paused = LS.pausedReason(e.info.gitDir);
    if (paused) return pausedMsg(paused);
    const r = LS.syncRepo(e.info.dir, { ...c, mode: e.mode, main: e.main || c.main, noIdle: true, ignoreSessions: true, force: true });
    if (r.status === 'paused') return pausedMsg(r.note);
    if (r.committed || r.pulled || r.pushed) log(`${e.rel}: session start ${r.status} +${r.committed} pulled ${r.pulled} pushed ${r.pushed}`);
    const b = git(e.info.dir, 'branch', '--show-current').out;
    return `live sync: ${e.rel} on ${b} ${r.status}${r.note ? ` (${r.note})` : ''}${r.pulled ? `, pulled ${r.pulled}` : ''}${r.committed ? `, committed ${r.committed} leftover files` : ''}. Work on ${c.branch}; \`git ship\` puts it on main.`;
  } catch (err) { return `live sync: start check failed (${String(err.message || err).split('\n')[0]})`; }
}
