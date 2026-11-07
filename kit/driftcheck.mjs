#!/usr/bin/env node
// Drift check (read-only, zero tokens): lists site customisations that live in no app, with a
// suggested app for each. It never moves or changes anything.
//   node kit/driftcheck.mjs <site> [--bench <path>] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, readText, exists, run, findUp, localConfig } from './lib/common.mjs';

const args = process.argv.slice(2);
const site = args.find((a) => !a.startsWith('--'));
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const cfg = localConfig();
const found = findUp(process.cwd(), 'sites/apps.txt');
const bench = path.resolve(opt('--bench') || (found && path.dirname(path.dirname(found))) || cfg.benchPath || '.');
if (!site || !exists(path.join(bench, 'sites', 'apps.txt'))) { console.error('usage: node kit/driftcheck.mjs <site> [--bench <bench path>] (run inside a bench)'); process.exit(2); }

function q(doctype, fields) {
  const kw = JSON.stringify({ doctype, fields, limit_page_length: 0 });
  const r = run('bench', ['--site', site, 'execute', 'frappe.get_all', '--kwargs', kw], { cwd: bench, timeout: 180000 });
  const i = r.out.indexOf('[');
  if (r.code === 0 && i < 0) return []; // bench execute prints nothing for an empty list
  if (r.code !== 0 || i < 0) { console.error(`cannot read ${doctype} from ${site}: ${(r.err || r.out).split('\n').filter(Boolean).slice(-1)[0] || 'bench failed'}`); process.exit(3); }
  return JSON.parse(r.out.slice(i));
}

// Which apps and modules exist; which are vendored.
const apps = readText(path.join(bench, 'sites', 'apps.txt')).split('\n').map((s) => s.trim()).filter(Boolean);
const vendored = readText(path.join(bench, '.claude', 'vendored.txt'));
const isVendored = (app) => new RegExp(`(^|/)apps/${app}(/|\\*|$)`, 'm').test(vendored);
const moduleApp = Object.fromEntries(q('Module Def', ['name', 'app_name']).map((m) => [m.name, m.app_name]));
const customerApp = (cfg.customerApps || {})[site];

// Names already packaged in some app: fixtures plus standard JSON exports.
const packaged = new Set();
const scrub = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_');
for (const app of apps) {
  const ar = path.join(bench, 'apps', app, app);
  const fx = path.join(ar, 'fixtures');
  if (exists(fx)) for (const f of fs.readdirSync(fx).filter((x) => x.endsWith('.json'))) for (const r of readJSON(path.join(fx, f), [])) if (r?.name) packaged.add(`${r.doctype}::${r.name}`);
}
const exported = (kind, name, module) => {
  const app = moduleApp[module];
  if (!app) return false;
  return exists(path.join(bench, 'apps', app, app, scrub(module), kind, scrub(name), `${scrub(name)}.json`));
};

const rows = [];
const add = (doctype, name, target, module, extra = '') => {
  if (packaged.has(`${doctype}::${name}`)) return;
  const own = module && moduleApp[module] && !isVendored(moduleApp[module]) ? moduleApp[module] : null;
  const suggest = own ? `${own} (module ${module} belongs to it)`
    : customerApp ? `${customerApp} (customer app of this site) or framith_<product> if other customers could use it`
    : `framith_<product> if other customers could use it, else framith_<customer>`;
  rows.push({ doctype, name, target, module: module || '', suggest, extra });
};

for (const r of q('Custom Field', ['name', 'dt', 'fieldname', 'module', 'is_system_generated'])) if (!r.is_system_generated) add('Custom Field', r.name, r.dt, r.module);
for (const r of q('Property Setter', ['name', 'doc_type', 'property', 'module', 'is_system_generated'])) if (!r.is_system_generated) add('Property Setter', r.name, r.doc_type, r.module, r.property);
for (const r of q('Server Script', ['name', 'reference_doctype', 'module', 'script_type'])) add('Server Script', r.name, r.reference_doctype || r.script_type, r.module, r.script_type);
for (const r of q('Client Script', ['name', 'dt', 'module'])) add('Client Script', r.name, r.dt, r.module);
for (const r of q('Print Format', ['name', 'doc_type', 'module', 'standard'])) if (r.standard !== 'Yes' || !exported('print_format', r.name, r.module)) add('Print Format', r.name, r.doc_type, r.module);
for (const r of q('Report', ['name', 'ref_doctype', 'module', 'is_standard'])) if (r.is_standard !== 'Yes' || !exported('report', r.name, r.module)) add('Report', r.name, r.ref_doctype, r.module);
for (const r of q('Workspace', ['name', 'module', 'public'])) if (r.public && !exported('workspace', r.name, r.module)) add('Workspace', r.name, '', r.module);

if (args.includes('--json')) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
console.log(`drift check ${site}: ${rows.length} item(s) live only in the database (not in any app)`);
for (const r of rows) console.log(`- ${r.doctype} "${r.name}"${r.target ? ` on ${r.target}` : ''}${r.extra ? ` [${r.extra}]` : ''} -> suggest ${r.suggest}`);
if (rows.length) console.log('Nothing was moved. Approve items one by one; see <kit>/patterns/package-site-customisations.md.');
