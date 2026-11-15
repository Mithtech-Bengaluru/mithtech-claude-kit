// The one router. Every path that starts work (worker.mjs, the route-guard hook, the CLI, --doctor) uses this file.
// Source data: kit/routing.json. Per-machine remap: ~/.claude/mithtech-kit.local.json (modelRemap).
import fs from 'node:fs';
import path from 'node:path';
import { KIT, readJSON, readText, exists, localConfig } from './common.mjs';

export const MODEL_ORDER = ['haiku', 'sonnet', 'opus', 'fable'];
export const loadRouting = () => readJSON(path.join(KIT, 'routing.json'));

const effRank = (r, e) => r.effortLevels.indexOf(e);
const modRank = (a) => MODEL_ORDER.indexOf(a);
const rank = (r, s) => modRank(s.alias) * 100 + effRank(r, s.effort);

// Map a model name from a call (alias, id, id with [1m], or a dated id) to a routing alias; null when unknown.
export function toAlias(routing, name) {
  if (!name) return null;
  const n = String(name).toLowerCase().replace(/\[.*\]$/, '').trim();
  if (routing.models[n]) return n;
  for (const [a, m] of Object.entries(routing.models)) if (m.id === n) return a;
  return MODEL_ORDER.find((a) => n.includes(a)) || null;
}

export function remapAlias(routing, alias, cfg = localConfig()) {
  const seen = new Set();
  let a = alias;
  while (cfg.modelRemap?.[a] && !seen.has(a) && routing.models[cfg.modelRemap[a]]) { seen.add(a); a = cfg.modelRemap[a]; }
  return a;
}
export const idOf = (routing, alias) => routing.models[alias].id;

export function floorIds(routing) { return routing.floors.flatMap((f) => f.ids || []); }
export function floorMin(routing, id) {
  const f = routing.floors.find((x) => (x.ids || []).includes(id));
  return f ? { alias: f.min.model, effort: f.min.effort } : null;
}

// Raise a setting to the floors. Model and effort rise on their own axes.
export function applyFloors(routing, setting, ids = []) {
  let { alias, effort } = setting;
  const applied = [];
  for (const id of ids) {
    const m = floorMin(routing, id);
    if (!m) throw new Error(`unknown floor "${id}" (known: ${floorIds(routing).join(', ')})`);
    if (modRank(alias) < modRank(m.alias)) { alias = m.alias; applied.push(id); }
    if (effRank(routing, effort) < effRank(routing, m.effort)) { effort = m.effort; if (!applied.includes(id)) applied.push(id); }
  }
  return { alias, effort, applied };
}
export function belowFloors(routing, setting, ids = []) {
  return ids.filter((id) => {
    const m = floorMin(routing, id);
    return m && (modRank(setting.alias) < modRank(m.alias) || effRank(routing, setting.effort) < effRank(routing, m.effort));
  });
}

// "describe:<work>" -> best route by shared word stems with each route's work text; default `feature`.
const STOP = new Set(['with', 'from', 'that', 'this', 'into', 'than', 'then', 'first', 'work', 'fix', 'add', 'make', 'change']);
const stems = (s) => new Set(String(s).toLowerCase().match(/[a-z]{4,}/g)?.filter((w) => !STOP.has(w)).map((w) => w.slice(0, 5)) || []);
export function pickRoute(routing, text) {
  const t = stems(text);
  let best = null, bestScore = 0;
  for (const r of routing.routes) {
    const idHit = stems(r.id.replace(/-/g, ' '));
    let s = 0;
    for (const w of stems(r.work)) if (t.has(w)) s++;
    for (const w of idHit) if (t.has(w)) s += 2;
    if (s > bestScore) { best = r; bestScore = s; }
  }
  return best ? { route: best, why: `matched route "${best.id}" by work words` } : { route: routing.routes.find((r) => r.id === 'feature'), why: 'no match; default route "feature"' };
}

// spec: route-id | "describe:<work>" | "<model>/<effort>" (explicit; alias or id)
// -> { routeId, alias, effort, model (id after remap), reason, floors }
export function resolve(spec, { floors = [], routing = loadRouting(), cfg = localConfig() } = {}) {
  let base, routeId = null, why;
  if (/^describe:/i.test(spec)) {
    const p = pickRoute(routing, spec.slice(9));
    base = { alias: p.route.model, effort: p.route.effort }; routeId = p.route.id; why = p.why;
  } else if (spec.includes('/')) {
    const [m, e] = spec.split('/');
    const alias = toAlias(routing, m);
    if (!alias) throw new Error(`unknown model "${m}"`);
    if (!routing.effortLevels.includes(e)) throw new Error(`unknown effort "${e}" (known: ${routing.effortLevels.join(', ')})`);
    base = { alias, effort: e }; why = 'explicit model/effort';
  } else {
    const r = routing.routes.find((x) => x.id === spec);
    if (!r) throw new Error(`unknown route "${spec}" (known: ${routing.routes.map((x) => x.id).join(', ')})`);
    base = { alias: r.model, effort: r.effort }; routeId = r.id; why = `route "${r.id}": ${r.work}`;
  }
  const fl = applyFloors(routing, base, floors);
  const alias = remapAlias(routing, fl.alias, cfg);
  const notes = [why];
  if (fl.applied.length) notes.push(`raised to ${fl.alias}/${fl.effort} by floor ${fl.applied.join(', ')}`);
  if (alias !== fl.alias) notes.push(`${fl.alias} remapped to ${alias} on this machine`);
  return { routeId, alias, effort: fl.effort, model: idOf(routing, alias), reason: notes.join('; '), floors };
}

// Does a call (model name, effort) match an expected resolved setting? Remap-aware.
export function matches(routing, expected, model, effort, cfg = localConfig()) {
  const a = toAlias(routing, model);
  return !!a && remapAlias(routing, a, cfg) === expected.alias && effort === expected.effort;
}

// Escalation ladder. failures = failed runs so far at the current setting.
//   0 -> run; 1 -> retry (same setting); 2+ -> raise (failures-1) steps on the ladder; past the end -> park.
export function escalate(current, failures, { routing = loadRouting(), cfg = localConfig() } = {}) {
  const alias = toAlias(routing, current.model);
  if (!alias) throw new Error(`unknown model "${current.model}"`);
  const cur = { alias, effort: current.effort };
  const out = (action, s, reason) => ({ action, model: idOf(routing, s.alias), alias: s.alias, effort: s.effort, reason });
  if (failures <= 0) return out('run', cur, 'no failure yet');
  if (failures === 1) return out('retry', cur, 'first failure: retry once at the same setting');
  const ladder = routing.escalation.map(([a, e]) => ({ alias: a, effort: e }));
  let idx = -1;
  ladder.forEach((s, i) => { if (rank(routing, s) <= rank(routing, cur)) idx = i; });
  const next = ladder[idx + (failures - 1)];
  if (!next) return out('park', cur, 'ladder ends here: park as a question');
  const mapped = { alias: remapAlias(routing, next.alias, cfg), effort: next.effort };
  if (rank(routing, mapped) <= rank(routing, cur)) return out('park', cur, `next step ${next.alias}/${next.effort} maps to ${mapped.alias}/${mapped.effort} on this machine; no higher setting: park as a question`);
  return out('raise', mapped, `failure ${failures}: raise to ${mapped.alias}/${mapped.effort}${mapped.alias !== next.alias ? ` (${next.alias} remapped)` : ''}`);
}

// ---------- log ----------
export function projectRoot(cwd) {
  let d = path.resolve(cwd || process.cwd());
  for (;;) {
    if (exists(path.join(d, '.git'))) return d;
    const up = path.dirname(d);
    if (up === d) return path.resolve(cwd || process.cwd());
    d = up;
  }
}
export function logPath(cwd, program) {
  const root = projectRoot(cwd);
  return program ? path.join(root, '.claude', 'tasks', program, 'routing.log') : path.join(root, '.claude', 'routing.log');
}
// Never throws: a log failure must not stop work.
export function logRoute({ cwd, program, label, model, effort, reason }) {
  try {
    const p = logPath(cwd, program);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, `${new Date().toISOString()} | ${label || '-'} | ${model}/${effort} | ${String(reason).replace(/\s*\n\s*/g, ' ')}\n`);
    const gitDir = path.join(projectRoot(cwd), '.git');
    if (!program && exists(gitDir) && fs.statSync(gitDir).isDirectory()) {
      const ex = path.join(gitDir, 'info', 'exclude');
      if (!readText(ex).includes('.claude/routing.log')) { fs.mkdirSync(path.dirname(ex), { recursive: true }); fs.appendFileSync(ex, '\n.claude/routing.log\n'); }
    }
    return p;
  } catch { return null; }
}

// ---------- checks (used by --doctor and tests) ----------
const fm = (text) => { const m = text.match(/^---\n([\s\S]*?)\n---/); return m ? m[1] : ''; };
export function agentSetting(file) {
  const f = fm(readText(file));
  return { model: (f.match(/^model:\s*(\S+)/m) || [])[1], effort: (f.match(/^effort:\s*(\S+)/m) || [])[1] };
}
export function agentRoute(routing, name) {
  return routing.routes.find((r) => (r.agents || []).includes(name));
}
export function checkRouting(routing = loadRouting(), cfg = localConfig()) {
  const bad = [];
  const E = routing.effortLevels || [];
  for (const [a, m] of Object.entries(routing.models || {})) if (!/^claude-[a-z0-9.-]+$/.test(m.id || '')) bad.push(`model ${a}: id "${m.id}" is not a claude-* model id`);
  for (const r of routing.routes || []) {
    if (!routing.models[r.model]) bad.push(`route ${r.id}: unknown model "${r.model}"`);
    if (!E.includes(r.effort)) bad.push(`route ${r.id}: unknown effort "${r.effort}"`);
  }
  for (const f of routing.floors || []) if (!routing.models[f.min.model] || !E.includes(f.min.effort)) bad.push(`floor ${(f.ids || []).join('/')}: bad min ${f.min.model}/${f.min.effort}`);
  for (const [a, e] of routing.escalation || []) if (!routing.models[a] || !E.includes(e)) bad.push(`escalation step ${a}/${e} is unknown`);
  for (const [k, v] of Object.entries(cfg.modelRemap || {})) if (!routing.models[k] || !routing.models[v]) bad.push(`modelRemap ${k} -> ${v}: unknown model`);
  const dir = path.join(KIT, 'agents');
  const files = exists(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : [];
  for (const f of files) {
    const name = f.slice(0, -3), r = agentRoute(routing, name);
    if (!r) { bad.push(`agent ${name}: no route lists it in "agents"`); continue; }
    const s = agentSetting(path.join(dir, f));
    if (s.model !== r.model || s.effort !== r.effort) bad.push(`agent ${name}: frontmatter ${s.model}/${s.effort} differs from route ${r.id} (${r.model}/${r.effort}); run route.mjs --sync-agents`);
  }
  return bad;
}
export function syncAgents(routing = loadRouting(), { check = false } = {}) {
  const dir = path.join(KIT, 'agents'), changed = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const r = agentRoute(routing, f.slice(0, -3));
    if (!r) continue;
    const p = path.join(dir, f);
    let t = readText(p);
    const head = t.match(/^---\n([\s\S]*?)\n---/);
    if (!head) continue;
    let h = head[1];
    h = /^model:/m.test(h) ? h.replace(/^model:.*$/m, `model: ${r.model}`) : h + `\nmodel: ${r.model}`;
    h = /^effort:/m.test(h) ? h.replace(/^effort:.*$/m, `effort: ${r.effort}`) : h + `\neffort: ${r.effort}`;
    const n = t.replace(head[1], h);
    if (n !== t) { changed.push(f); if (!check) fs.writeFileSync(p, n); }
  }
  return changed;
}
