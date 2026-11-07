#!/usr/bin/env node
// Builds the reuse index in <project>/.claude/index/ (gitignored). Zero tokens.
//   node kit/index.mjs [--project <dir>] [--site <dev-site>] [--force] [--catalog]
// Frappe bench: DocTypes, fields, custom fields (fixtures, app code, and the live site with --site),
// property setters, hooks, reports, workspaces, print formats. Medusa: modules, models, links,
// workflows, steps, routes, subscribers, widgets, plugins. Others: packages, crates, routes, tables.
// Refreshes only when the source files it was built from changed (hashes in meta.json).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { KIT, REPO, readJSON, writeJSON, readText, exists, git, run, localConfig } from './lib/common.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const root = path.resolve(opt('--project') || process.cwd());
const site = opt('--site');
const force = args.includes('--force');
const outDir = opt('--out') ? path.resolve(opt('--out')) : path.join(root, '.claude', 'index');
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.medusa', 'target', '__pycache__', 'public', 'env', '.venv', 'venv', 'sites', 'coverage']);

export function detect(dir) {
  const has = (f) => exists(path.join(dir, f));
  if (has('apps') && has('sites/apps.txt')) return 'frappe';
  const pkg = readText(path.join(dir, 'package.json'));
  if (/@medusajs\//.test(pkg)) return 'medusa';
  if (has('Cargo.toml')) return 'rust';
  if (pkg) return 'web';
  return 'other';
}

function walk(dir, test, out = [], depth = 0) {
  if (depth > 9) return out;
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.name.startsWith('.') && e.name !== '.claude-plugin') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p, test, out, depth + 1); }
    else if (test(p)) out.push(p);
  }
  return out;
}

function sourceHash(stack) {
  const h = crypto.createHash('sha1');
  const repos = stack === 'frappe' ? fs.readdirSync(path.join(root, 'apps')).map((a) => path.join(root, 'apps', a)) : [root];
  for (const r of repos) {
    const head = git(r, 'rev-parse', 'HEAD').out;
    const dirty = git(r, 'status', '--porcelain').out;
    h.update(r + head + dirty);
  }
  if (site) h.update('site:' + site);
  return h.digest('hex');
}

// ---------- Frappe ----------
function frappe() {
  const idx = { doctypes: {}, custom: [], propertySetters: [], hooks: {}, reports: [], workspaces: [], printFormats: [], apps: {} };
  const appsDir = path.join(root, 'apps');
  for (const app of fs.readdirSync(appsDir)) {
    const ar = path.join(appsDir, app, app);
    if (!exists(ar)) continue;
    const remote = git(path.join(appsDir, app), 'remote', 'get-url', 'origin').out || git(path.join(appsDir, app), 'remote', 'get-url', 'upstream').out;
    idx.apps[app] = { remote: remote.replace(/^https:\/\/github.com\/|^git@github.com:|\.git$/g, ''), modules: readText(path.join(ar, 'modules.txt')).split('\n').map((s) => s.trim()).filter(Boolean) };
    for (const f of walk(ar, (p) => /\/doctype\/([^/]+)\/\1\.json$/.test(p) || /\/(report|workspace|print_format)\/([^/]+)\/\2\.json$/.test(p))) {
      const j = readJSON(f, {});
      if (j.doctype === 'DocType') {
        idx.doctypes[j.name] = { app, module: j.module, table: j.istable ? 1 : 0, single: j.issingle ? 1 : 0,
          fields: (j.fields || []).filter((x) => x.fieldname && !/Break$|^HTML$|^Heading$/.test(x.fieldtype)).map((x) => ({ f: x.fieldname, l: x.label || '', t: x.fieldtype, o: String(x.options || '').slice(0, 80) })) };
      } else if (j.doctype === 'Report') idx.reports.push({ name: j.name, app, ref: j.ref_doctype, type: j.report_type });
      else if (j.doctype === 'Workspace') idx.workspaces.push({ name: j.name, app });
      else if (j.doctype === 'Print Format') idx.printFormats.push({ name: j.name, app, dt: j.doc_type });
    }
    for (const fx of ['custom_field', 'property_setter']) {
      const rows = readJSON(path.join(ar, 'fixtures', `${fx}.json`), []);
      for (const r of rows) {
        if (fx === 'custom_field') idx.custom.push({ app, dt: r.dt, f: r.fieldname, l: r.label || '', t: r.fieldtype, o: String(r.options || '').slice(0, 80), src: 'fixture' });
        else idx.propertySetters.push({ app, dt: r.doc_type, f: r.field_name, p: r.property, v: String(r.value).slice(0, 60) });
      }
    }
    const hooks = readText(path.join(ar, 'hooks.py'));
    const de = hooks.match(/doc_events\s*=\s*\{([\s\S]*?)\n\}/);
    const ov = hooks.match(/override_doctype_class\s*=\s*\{([\s\S]*?)\}/);
    const req = hooks.match(/required_apps\s*=\s*\[([^\]]*)\]/);
    idx.hooks[app] = {
      doc_events: de ? [...de[1].matchAll(/^\s{1,8}["']([^"']+)["']\s*:/gm)].map((m) => m[1]) : [],
      overrides: ov ? [...ov[1].matchAll(/["']([^"']+)["']\s*:/g)].map((m) => m[1]) : [],
      required_apps: req ? [...req[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]) : [],
    };
  }
  // custom fields declared in app code (India Compliance, HRMS, ...)
  const py = path.join(root, 'env', 'bin', 'python');
  if (exists(py)) {
    const r = run(py, [path.join(KIT, 'lib', 'frappe_meta.py'), 'constants', root], { cwd: path.join(root, 'sites'), timeout: 120000 });
    try { for (const c of JSON.parse(r.out || '[]')) if (!c.error) idx.custom.push(c); } catch {}
  }
  // live site metadata (truth) when the bench works
  if (site) {
    const q = (dt, fields) => {
      const kw = JSON.stringify({ doctype: dt, fields, limit_page_length: 0 });
      const r = run('bench', ['--site', site, 'execute', 'frappe.get_all', '--kwargs', kw], { cwd: root, timeout: 120000 });
      if (r.code === 0 && r.out.indexOf('[') < 0) return [];
      try { return JSON.parse(r.out.slice(r.out.indexOf('['))); } catch { idx.siteError = (r.err || r.out).split('\n').slice(-1)[0]; return []; }
    };
    for (const c of q('Custom Field', ['dt', 'fieldname', 'label', 'fieldtype', 'options', 'module'])) idx.custom.push({ app: c.module || '(site)', dt: c.dt, f: c.fieldname, l: c.label || '', t: c.fieldtype, o: String(c.options || '').slice(0, 80), src: `site:${site}` });
    idx.site = site;
  }
  const lines = [];
  for (const [n, d] of Object.entries(idx.doctypes)) {
    lines.push(`doctype ${n} | app ${d.app} | module ${d.module}${d.single ? ' | single' : ''}${d.table ? ' | child' : ''}`);
    for (const f of d.fields) lines.push(`field ${n}.${f.f} | ${f.l} | ${f.t}${f.o ? ' ' + f.o : ''} | app ${d.app}`);
  }
  for (const c of idx.custom) lines.push(`custom ${c.dt}.${c.f} | ${c.l} | ${c.t}${c.o ? ' ' + c.o : ''} | app ${c.app} | ${c.src}`);
  for (const p of idx.propertySetters) lines.push(`propset ${p.dt}.${p.f || ''} ${p.p}=${p.v} | app ${p.app}`);
  for (const [a, h] of Object.entries(idx.hooks)) {
    if (h.doc_events.length) lines.push(`hooks ${a} doc_events: ${h.doc_events.join(', ')}`);
    if (h.overrides.length) lines.push(`hooks ${a} overrides: ${h.overrides.join(', ')}`);
  }
  for (const r of idx.reports) lines.push(`report ${r.name} | ${r.type} on ${r.ref} | app ${r.app}`);
  for (const w of idx.workspaces) lines.push(`workspace ${w.name} | app ${w.app}`);
  for (const p of idx.printFormats) lines.push(`printformat ${p.name} | ${p.dt} | app ${p.app}`);
  for (const [a, x] of Object.entries(idx.apps)) lines.push(`app ${a} | ${x.remote || 'local'} | modules: ${x.modules.join(', ')}`);
  return { idx, lines };
}

// ---------- Medusa ----------
function medusa() {
  const src = path.join(root, 'src');
  const idx = { models: [], links: [], workflows: [], steps: [], routes: [], subscribers: [], widgets: [], jobs: [], plugins: [] };
  const lines = [];
  for (const f of walk(src, (p) => /\.(ts|tsx|js)$/.test(p) && !/\.(test|spec)\./.test(p))) {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    const t = readText(f);
    for (const m of t.matchAll(/model\.define\(\s*["'`]([\w-]+)["'`]\s*,\s*\{([\s\S]*?)\n\}\)/g)) {
      const fields = [...m[2].matchAll(/^\s{2,4}(\w+)\s*:\s*model\.(\w+)/gm)].map((x) => `${x[1]}:${x[2]}`);
      idx.models.push({ name: m[1], file: rel, fields }); lines.push(`model ${m[1]} | ${fields.join(', ')} | ${rel}`);
    }
    if (/defineLink\(/.test(t)) { idx.links.push(rel); lines.push(`link ${rel}`); }
    for (const m of t.matchAll(/createWorkflow\(\s*["'`]([\w-]+)/g)) { idx.workflows.push(m[1]); lines.push(`workflow ${m[1]} | ${rel}`); }
    for (const m of t.matchAll(/createStep\(\s*["'`]([\w-]+)/g)) { idx.steps.push(m[1]); lines.push(`step ${m[1]} | ${rel}`); }
    if (/\/api\/.*route\.(ts|js)$/.test(rel)) { const verbs = [...t.matchAll(/export\s+(?:const|async function|function)\s+(GET|POST|PUT|PATCH|DELETE)/g)].map((x) => x[1]); idx.routes.push(rel); lines.push(`route ${rel.replace(/^src\/api/, '').replace(/\/route\.(ts|js)$/, '')} | ${verbs.join(',')}`); }
    if (/\/subscribers\//.test(rel)) { const ev = (t.match(/event\s*:\s*\[?([^\]\n}]+)/) || [])[1] || ''; lines.push(`subscriber ${rel} | ${ev.trim()}`); }
    if (/\/admin\/widgets\//.test(rel)) { const z = (t.match(/zone\s*:\s*([^\n}]+)/) || [])[1] || ''; lines.push(`widget ${rel} | ${z.trim()}`); }
    if (/\/jobs\//.test(rel)) lines.push(`job ${rel}`);
    if (/\/admin\/routes\/.*page\.tsx$/.test(rel)) lines.push(`admin-page /${rel.replace(/^src\/admin\/routes\//, '').replace(/\/?page\.tsx$/, '')} | ${rel}`);
    if (/\/modules\/[^/]+\/service\.(ts|js)$/.test(rel)) lines.push(`module ${rel.split('/')[2]} | ${rel}`);
  }
  const pkg = readJSON(path.join(root, 'package.json'), {});
  for (const d of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) if (/^@medusajs\/|^@mithtech-medusa\/|medusa-plugin|mithusa-/.test(d)) { idx.plugins.push(d); lines.push(`dependency ${d}`); }
  const cfg = readText(path.join(root, 'medusa-config.ts')) || readText(path.join(root, 'medusa-config.js'));
  for (const m of cfg.matchAll(/resolve\s*:\s*["'`]([^"'`]+)/g)) lines.push(`configured ${m[1]}`);
  lines.push(`package ${pkg.name || path.basename(root)} ${pkg.version || ''} | ${pkg.description || ''}`);
  return { idx, lines };
}

// ---------- Others ----------
function generic(stack) {
  const lines = [];
  const pkg = readJSON(path.join(root, 'package.json'), null);
  if (pkg) {
    lines.push(`package ${pkg.name || path.basename(root)} ${pkg.version || ''} | ${pkg.description || ''}`);
    for (const d of Object.keys({ ...pkg.dependencies })) lines.push(`dependency ${d}`);
  }
  for (const f of walk(root, (p) => /(Cargo\.toml|go\.mod|pubspec\.yaml|pyproject\.toml|package\.json)$/.test(p))) {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    const t = readText(f);
    const name = (t.match(/^name\s*=\s*"([^"]+)"/m) || t.match(/^module\s+(\S+)/m) || t.match(/^name:\s*(\S+)/m) || t.match(/"name"\s*:\s*"([^"]+)"/) || [])[1];
    if (name && rel !== 'package.json') lines.push(`package ${name} | ${rel}`);
  }
  for (const f of walk(root, (p) => /\.(rs|ts|tsx|go|py|dart|sql)$/.test(p) && !/\.(test|spec)\./.test(p))) {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    if (/(^|\/)app\/(.*\/)?(page|route)\.(tsx?|jsx?)$/.test(rel)) lines.push(`route /${rel.replace(/^(src\/)?app\/?/, '').replace(/\/?(page|route)\.\w+$/, '')} | ${rel}`);
    const t = readText(f);
    if (rel.endsWith('.rs')) for (const m of t.matchAll(/^pub (?:struct|enum|trait|fn) (\w+)/gm)) lines.push(`pub ${m[1]} | ${rel}`);
    for (const m of t.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?(\w+)/gi)) lines.push(`table ${m[1]} | ${rel}`);
    if (/\.(ts|tsx)$/.test(rel) && /\/(components|ui)\//.test(rel)) for (const m of t.matchAll(/^export (?:default )?function ([A-Z]\w+)/gm)) lines.push(`component ${m[1]} | ${rel}`);
  }
  return { idx: { stack }, lines };
}

// ---------- Catalogue ----------
function catalog(stack, idx) {
  const cfg = localConfig();
  const owners = (cfg.ownGitOwners || []).map((s) => s.toLowerCase());
  const vend = readText(path.join(root, '.claude', 'vendored.txt'));
  const priv = (cfg.privateNames || []).map((s) => s.toLowerCase());
  const entries = [];
  if (stack === 'frappe') {
    for (const [app, a] of Object.entries(idx.apps)) {
      const owner = (a.remote.split('/')[0] || '').toLowerCase();
      if (!owners.includes(owner) || new RegExp(`apps/${app}(/|\\b)`).test(vend)) continue;
      const dts = Object.entries(idx.doctypes).filter(([, d]) => d.app === app && !d.table).map(([n]) => n);
      entries.push({ name: app, stack: 'frappe', repo: a.remote, purpose: purpose(path.join(root, 'apps', app)), main: dts.slice(0, 12), domain: a.modules.slice(0, 4).join(', '), status: 'active' });
    }
  } else {
    const pkg = readJSON(path.join(root, 'package.json'), {});
    const remote = git(root, 'remote', 'get-url', 'origin').out.replace(/^https:\/\/github.com\/|^git@github.com:|\.git$/g, '');
    entries.push({ name: pkg.name || path.basename(root), stack, repo: remote, purpose: purpose(root), main: (idx.models || []).map((m) => m.name).slice(0, 12), domain: '', status: 'active' });
  }
  for (const e of entries) {
    const isPriv = priv.some((p) => e.name.toLowerCase().includes(p) || e.purpose.toLowerCase().includes(p));
    const dir = path.join(REPO, 'catalog', isPriv ? 'private' : '');
    const file = path.join(dir, e.name.replace(/^@/, '').replace(/\//g, '__') + '.json');
    const old = readJSON(file, {});
    writeJSON(file, { ...e, purpose: old.purpose || e.purpose, updated: new Date().toISOString().slice(0, 10) });
  }
  console.log(`catalog: ${entries.length} entries`);
}
function purpose(dir) {
  const pkg = readJSON(path.join(dir, 'package.json'), {});
  const py = readText(path.join(dir, 'pyproject.toml')).match(/^description\s*=\s*"([^"]+)"/m);
  const rd = readText(path.join(dir, 'README.md')).split('\n').map((l) => l.replace(/[#*>_]/g, '').trim()).filter((l) => l.length > 20)[0] || '';
  // plain text only: no links, URLs or code (catalogue entries end up in everyone's context)
  return (pkg.description || py?.[1] || rd).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`[^`]*`/g, '').replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 120);
}

// ---------- main ----------
const stack = detect(root);
const meta = readJSON(path.join(outDir, 'meta.json'), {});
const hash = sourceHash(stack);
const name = { frappe: 'frappe', medusa: 'medusa', rust: 'rust', web: 'web', other: 'other' }[stack];
if (!force && meta.hash === hash && exists(path.join(outDir, `${name}.txt`))) {
  console.log(`index up to date (${stack}, ${meta.lines} lines)`);
} else {
  const { idx, lines } = stack === 'frappe' ? frappe() : stack === 'medusa' ? medusa() : generic(stack);
  fs.mkdirSync(outDir, { recursive: true });
  writeJSON(path.join(outDir, `${name}.json`), idx);
  fs.writeFileSync(path.join(outDir, `${name}.txt`), lines.join('\n') + '\n');
  writeJSON(path.join(outDir, 'meta.json'), { stack, hash, lines: lines.length, built: new Date().toISOString(), site: site || null });
  console.log(`index built: ${stack}, ${lines.length} lines -> .claude/index/${name}.txt${idx.siteError ? ` (site read failed: ${idx.siteError})` : ''}`);
}
if (args.includes('--catalog')) catalog(stack, readJSON(path.join(outDir, `${name}.json`), {}));
