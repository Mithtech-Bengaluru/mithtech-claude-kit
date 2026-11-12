#!/usr/bin/env node
// The one router CLI. Prints JSON: {routeId, model, effort, reason}.
//   node kit/scripts/route.mjs <route-id | "describe:<work>" | model/effort> [--floor money,permissions,production,contracts]
//        [--label <unit>] [--program <slug>] [--no-log]
//   node kit/scripts/route.mjs --escalate <model>/<effort> --failures N     retry | raise | park
//   node kit/scripts/route.mjs --sync-agents [--check]                      agent frontmatter from routing.json
//   node kit/scripts/route.mjs --check                                      validate routing.json and agents
import { loadRouting, resolve, escalate, syncAgents, checkRouting, logRoute } from '../lib/route.mjs';

const args = process.argv.slice(2);
const has = (k) => args.includes(k);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const fail = (m) => { console.error(`route.mjs: ${m}`); process.exit(2); };

try {
  const routing = loadRouting();
  if (has('--check')) {
    const bad = checkRouting(routing);
    for (const b of bad) console.error(b);
    console.log(bad.length ? `${bad.length} routing problem(s)` : 'routing ok');
    process.exit(bad.length ? 1 : 0);
  }
  if (has('--sync-agents')) {
    const changed = syncAgents(routing, { check: has('--check') });
    console.log(changed.length ? `${has('--check') ? 'stale' : 'wrote'}: ${changed.join(', ')}` : 'agents in sync');
    process.exit(has('--check') && changed.length ? 1 : 0);
  }
  if (has('--escalate')) {
    const [m, e] = (val('--escalate') || '').split('/');
    if (!m || !e) fail('--escalate needs <model>/<effort>');
    console.log(JSON.stringify(escalate({ model: m, effort: e }, Number(val('--failures') ?? 1), { routing })));
    process.exit(0);
  }
  const spec = args.find((a, i) => !a.startsWith('--') && !['--floor', '--label', '--program'].includes(args[i - 1]));
  if (!spec) fail('usage: route.mjs <route-id | "describe:<work>" | model/effort> [--floor id[,id]]');
  const floors = (val('--floor') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const r = resolve(spec, { floors, routing });
  if (!has('--no-log')) logRoute({ cwd: process.cwd(), program: val('--program'), label: val('--label') || spec, model: r.model, effort: r.effort, reason: r.reason });
  console.log(JSON.stringify({ routeId: r.routeId, model: r.model, effort: r.effort, reason: r.reason }));
} catch (e) { fail(e.message); }
