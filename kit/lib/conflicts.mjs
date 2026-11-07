// Finds and replaces rules, preferences and memories that contradict the kit.
// Every changed file is backed up first; each change is logged to ~/.claude/mithtech-kit-conflicts.log.
import fs from 'node:fs';
import path from 'node:path';
import { KIT, CLAUDE_DIR, CONFLICT_LOG, readJSON, readText, writeJSON, backup, exists } from './common.mjs';

const C = readJSON(path.join(KIT, 'conflicts.json'), { rules: [], settings: {} });
const KIT_START = '<!-- mithtech-kit:start -->', KIT_END = '<!-- mithtech-kit:end -->';
const logLine = (o) => fs.appendFileSync(CONFLICT_LOG, JSON.stringify({ date: new Date().toISOString(), ...o }) + '\n');

function targets(cfg) {
  const t = [];
  const g = path.join(CLAUDE_DIR, 'CLAUDE.md');
  if (exists(g)) t.push({ file: g, scope: 'claude_md' });
  for (const p of cfg.projects || []) for (const f of ['CLAUDE.md', '.claude/CLAUDE.md']) if (exists(path.join(p, f))) t.push({ file: path.join(p, f), scope: 'claude_md' });
  if (cfg.codingRoot && exists(path.join(cfg.codingRoot, 'CLAUDE.md'))) t.push({ file: path.join(cfg.codingRoot, 'CLAUDE.md'), scope: 'claude_md' });
  const projDir = path.join(CLAUDE_DIR, 'projects');
  if (exists(projDir)) for (const d of fs.readdirSync(projDir)) {
    const m = path.join(projDir, d, 'memory');
    if (!exists(m)) continue;
    for (const f of fs.readdirSync(m)) if (f.endsWith('.md') && f !== 'MEMORY.md') t.push({ file: path.join(m, f), scope: 'memory' });
  }
  const os = path.join(CLAUDE_DIR, 'output-styles');
  if (exists(os)) for (const f of fs.readdirSync(os)) if (f.endsWith('.md')) t.push({ file: path.join(os, f), scope: 'output_style' });
  const sk = path.join(CLAUDE_DIR, 'skills');
  if (exists(sk)) for (const d of fs.readdirSync(sk)) { const f = path.join(sk, d, 'SKILL.md'); if (exists(f)) t.push({ file: f, scope: 'skill' }); }
  const ag = path.join(CLAUDE_DIR, 'agents');
  if (exists(ag)) for (const f of fs.readdirSync(ag)) if (f.endsWith('.md')) t.push({ file: path.join(ag, f), scope: 'agent' });
  // other plugins' skills and agents (not ours)
  const cache = path.join(CLAUDE_DIR, 'plugins', 'cache');
  if (exists(cache)) walkPlugins(cache, t, 0);
  return t;
}
function walkPlugins(dir, t, depth) {
  if (depth > 6) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/mithtech/.test(e.name) && e.name !== 'node_modules') walkPlugins(p, t, depth + 1); }
    else if (e.name === 'SKILL.md') t.push({ file: p, scope: 'skill' });
    else if (/\/agents\/[^/]+\.md$/.test(p.replace(/\\/g, '/'))) t.push({ file: p, scope: 'agent' });
  }
}

// Returns a list of changes; applies them unless dry.
export function scanConflicts(cfg, { dry = false } = {}) {
  const changes = [];
  for (const { file, scope } of targets(cfg)) {
    const text = readText(file);
    if (!text) continue;
    // never touch the kit's own block in the global CLAUDE.md
    const i = text.indexOf(KIT_START), j = text.indexOf(KIT_END);
    // match prose only: drop the kit block, frontmatter, [[memory links]], code spans and file names
    const outside = clean(i >= 0 && j > i ? text.slice(0, i) + text.slice(j + KIT_END.length) : text);
    const hits = C.rules.filter((r) => r.scopes.includes(scope) && new RegExp(r.re, 'i').test(outside));
    if (!hits.length) continue;
    if (scope === 'memory') {
      const idx = path.join(path.dirname(file), 'MEMORY.md');
      const base = path.basename(file);
      changes.push({ file, scope, rule: hits[0].id, old: firstMatch(outside, hits[0]), new: '(memory deleted)' });
      if (dry) continue;
      const b = backup(file);
      const bi = exists(idx) ? backup(idx) : null;
      fs.rmSync(file);
      if (exists(idx)) fs.writeFileSync(idx, readText(idx).split('\n').filter((l) => !l.includes(`(${base})`)).join('\n'));
      logLine({ file, old: firstMatch(outside, hits[0]), new: '(memory deleted)', backup: b, indexBackup: bi, rule: hits[0].id });
      continue;
    }
    let lines = text.split('\n'), changed = false, inKit = false;
    lines = lines.map((l) => {
      if (l.includes(KIT_START)) inKit = true;
      if (l.includes(KIT_END)) { inKit = false; return l; }
      if (inKit) return l;
      const r = hits.find((h) => new RegExp(h.re, 'i').test(clean(l)));
      if (!r) return l;
      const nl = `${(l.match(/^\s*([-*]\s+)?/) || [''])[0]}[kit] ${r.kit}`;
      changes.push({ file, scope, rule: r.id, old: l.trim(), new: nl.trim() });
      changed = true;
      return nl;
    });
    if (changed && !dry) {
      const b = backup(file);
      // drop exact duplicate kit lines created by several replacements
      const seen = new Set();
      fs.writeFileSync(file, lines.filter((l) => !/\[kit\] /.test(l) || (!seen.has(l.trim()) && seen.add(l.trim()))).join('\n'));
      for (const c of changes.filter((x) => x.file === file)) logLine({ file, old: c.old, new: c.new, backup: b, rule: c.rule });
    }
  }
  // settings: output style that contradicts the kit's communication rules
  const sf = path.join(CLAUDE_DIR, 'settings.json');
  const s = readJSON(sf, {});
  if ((C.settings.outputStyleConflicts || []).includes(s.outputStyle)) {
    changes.push({ file: sf, scope: 'settings', rule: 'output-style', old: `outputStyle: ${s.outputStyle}`, new: 'outputStyle removed (kit communication rules apply)' });
    if (!dry) { const old = s.outputStyle; const b = backup(sf); delete s.outputStyle; writeJSON(sf, s); logLine({ file: sf, old: `outputStyle ${old}`, new: '(removed)', backup: b, rule: 'output-style' }); }
  }
  return changes;
}
function clean(t) {
  return t.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/\[\[[^\]]*\]\]/g, '').replace(/`[^`\n]*`/g, '').replace(/\b[\w.-]+-[\w.-]+\.md\b/g, '');
}
function firstMatch(text, r) {
  const l = text.split('\n').find((x) => new RegExp(r.re, 'i').test(x)) || '';
  return l.trim().slice(0, 200);
}

// Restore every file the conflict pass changed (used by --uninstall).
export function restoreConflicts() {
  let n = 0;
  for (const l of readText(CONFLICT_LOG).split('\n').filter(Boolean).reverse()) {
    let o; try { o = JSON.parse(l); } catch { continue; }
    if (o.backup && exists(o.backup)) { fs.copyFileSync(o.backup, o.file); n++; }
    if (o.indexBackup && exists(o.indexBackup)) fs.copyFileSync(o.indexBackup, path.join(path.dirname(o.file), 'MEMORY.md'));
  }
  return n;
}
