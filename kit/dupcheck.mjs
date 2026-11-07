#!/usr/bin/env node
// Duplicate checker (zero tokens). Compares new or changed DocTypes, fields and models with the
// reuse index by name and label similarity, type and options. Exit 1 on a hit unless intended.
//   node kit/dupcheck.mjs                      staged changes in this repo (pre-commit)
//   node kit/dupcheck.mjs --base <ref>         changes since <ref> (CI, checker)
//   node kit/dupcheck.mjs --field Customer.gst_no[:Data[:GST No]]   one explicit field
// Intended duplicates: `.claude/dupcheck-allow.txt` or a brief line `dupcheck-intended: DocType.field - reason`.
import fs from 'node:fs';
import path from 'node:path';
import { readJSON, readText, findUp, git, exists } from './lib/common.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const cwd = process.cwd();
const top = git(cwd, 'rev-parse', '--show-toplevel').out || cwd;

const SYN = { gst: 'gstin', gstn: 'gstin', gstno: 'gstin', mobile: 'phone', mob: 'phone', cell: 'phone', tel: 'phone', telephone: 'phone', contact: 'phone',
  cust: 'customer', client: 'customer', addr: 'address', qty: 'quantity', amt: 'amount', mail: 'email', pincode: 'pincode', pin: 'pincode', zip: 'pincode', postal: 'pincode', postcode: 'pincode',
  dob: 'birthdate', supp: 'supplier', vendor: 'supplier', emp: 'employee', desc: 'description', ref: 'reference', bal: 'balance', acc: 'account', acct: 'account', inv: 'invoice', txn: 'transaction', trans: 'transaction' };
const DROP = new Set(['no', 'num', 'number', 'nbr', 'the', 'of', 'a', 'value', 'field', 'custom', 'mithtech', 'framith']);
const tokens = (s, dt = '') => {
  const dtT = new Set(String(dt).toLowerCase().split(/[\s_-]+/).map((t) => SYN[t] || t));
  return String(s).replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
    .map((t) => SYN[t] || t).filter((t) => !DROP.has(t) && !dtT.has(t));
};
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length, 1);
}
function sim(a, b, dt) {
  const ta = tokens(a, dt), tb = tokens(b, dt);
  if (!ta.length || !tb.length) return 0;
  const A = new Set(ta), B = new Set(tb);
  const inter = [...A].filter((x) => B.has(x)).length;
  const jac = inter / new Set([...A, ...B]).size;
  return Math.max(jac, lev(ta.join(''), tb.join('')));
}

// ---- load index ----
const fIdx = findUp(cwd, '.claude/index/frappe.json') || (opt('--index') && path.resolve(opt('--index')));
const mIdx = findUp(cwd, '.claude/index/medusa.json');
const F = fIdx ? readJSON(fIdx, {}) : null;
const M = mIdx ? readJSON(mIdx, {}) : null;
if (!F && !M) { console.log('dupcheck: no index found (.claude/index/); run node <kit>/index.mjs. Skipped.'); process.exit(0); }
const existingFields = (dt) => {
  if (!F) return [];
  const own = (F.doctypes?.[dt]?.fields || []).map((x) => ({ ...x, app: F.doctypes[dt].app, src: 'doctype' }));
  return own.concat((F.custom || []).filter((c) => c.dt === dt));
};

// ---- collect candidates ----
const cands = []; // {kind:'field'|'doctype'|'model', dt, f, l, t, o, file}
const explicit = opt('--field');
if (explicit) {
  const [dtf, t = '', l = ''] = explicit.split(':');
  const i = dtf.lastIndexOf('.');
  cands.push({ kind: 'field', dt: dtf.slice(0, i), f: dtf.slice(i + 1), t, l, file: '(cli)' });
} else {
  const base = opt('--base');
  const diffArgs = base ? ['diff', '--name-only', '--diff-filter=AM', `${base}...HEAD`] : ['diff', '--cached', '--name-only', '--diff-filter=AM'];
  const files = git(top, ...diffArgs).out.split('\n').filter(Boolean);
  const oldOf = (f) => git(top, 'show', `${base || 'HEAD'}:${f}`).out;
  for (const f of files) {
    const abs = path.join(top, f);
    const now = base ? readText(abs) : git(top, 'show', `:${f}`).out;
    const m = f.match(/\/doctype\/([^/]+)\/\1\.json$/);
    if (m) {
      const j = safe(now), o = safe(oldOf(f));
      if (!j || j.doctype !== 'DocType') continue;
      if (!o) cands.push({ kind: 'doctype', dt: j.name, f: '', l: j.name, file: f });
      const had = new Set((o?.fields || []).map((x) => x.fieldname));
      for (const x of j.fields || []) if (x.fieldname && !had.has(x.fieldname) && !/Break$/.test(x.fieldtype)) cands.push({ kind: 'field', dt: j.name, f: x.fieldname, l: x.label || '', t: x.fieldtype, o: x.options || '', file: f, sameDoc: !o });
    } else if (/fixtures\/custom_field\.json$/.test(f)) {
      const had = new Set((safe(oldOf(f)) || []).map((r) => r.name));
      for (const r of safe(now) || []) if (!had.has(r.name)) cands.push({ kind: 'field', dt: r.dt, f: r.fieldname, l: r.label || '', t: r.fieldtype, o: r.options || '', file: f });
    } else if (/\.(ts|js)$/.test(f) && /model\.define\(/.test(now)) {
      const old = oldOf(f);
      for (const mm of now.matchAll(/model\.define\(\s*["'`]([\w-]+)["'`]/g)) if (!old.includes(mm[0])) cands.push({ kind: 'model', dt: mm[1], f: '', l: mm[1], file: f });
      const mdl = (now.match(/model\.define\(\s*["'`]([\w-]+)/) || [])[1] || '';
      for (const fm of now.matchAll(/^\s{2,4}(\w+)\s*:\s*model\.(\w+)/gm)) if (!new RegExp(`^\\s{2,4}${fm[1]}\\s*:`, 'm').test(old)) cands.push({ kind: 'mfield', dt: mdl, f: fm[1], t: fm[2], l: '', file: f });
    }
  }
}
function safe(s) { try { return JSON.parse(s); } catch { return null; } }

// ---- allow list ----
const allow = new Map();
for (const l of readText(path.join(top, '.claude', 'dupcheck-allow.txt')).split('\n')) {
  const m = l.match(/^\s*([\w .-]+\.\w+|[\w .-]+)\s+-\s+(.{5,})$/); if (m) allow.set(m[1].trim(), m[2].trim());
}
const progs = path.join(top, 'docs', 'programs');
if (exists(progs)) for (const p of fs.readdirSync(progs)) {
  const bd = path.join(progs, p, 'briefs');
  if (exists(bd)) for (const b of fs.readdirSync(bd)) for (const m of readText(path.join(bd, b)).matchAll(/dupcheck-intended:\s*([\w .-]+\.\w+|[\w .-]+)\s+-\s+(.{5,}?)\s*(-->|$)/gm)) allow.set(m[1].trim(), m[2].trim());
}

// ---- compare ----
const hits = [];
for (const c of cands) {
  if (c.kind === 'field') {
    for (const e of existingFields(c.dt)) {
      if (c.sameDoc && e.src === 'doctype') continue;
      if (e.f === c.f && e.src !== 'doctype' && c.file === '(cli)') { hits.push([c, e, 1, 'same fieldname exists']); continue; }
      if (e.f === c.f) continue; // the field itself
      const s = Math.max(sim(c.f, e.f, c.dt), c.l && e.l ? sim(c.l, e.l, c.dt) : 0, c.l ? sim(c.l, e.f, c.dt) : 0, e.l ? sim(c.f, e.l, c.dt) : 0);
      const typeBoost = c.t && e.t && c.t === e.t ? 0.05 : 0;
      if (s + typeBoost >= 0.8) hits.push([c, e, +(s + typeBoost).toFixed(2), 'similar name/label']);
    }
  } else if (c.kind === 'doctype' || c.kind === 'model') {
    const pool = c.kind === 'doctype' ? Object.keys(F?.doctypes || {}) : (M?.models || []).map((m) => m.name).concat(Object.keys(F?.doctypes || {}));
    for (const n of pool) if (n !== c.dt) { const s = sim(c.dt, n); if (s >= 0.85) hits.push([c, { f: n, app: F?.doctypes?.[n]?.app || 'medusa' }, +s.toFixed(2), 'similar DocType/model']); }
  } else if (c.kind === 'mfield') {
    const m = (M?.models || []).find((x) => x.name === c.dt);
    for (const fs2 of m?.fields || []) { const [n] = fs2.split(':'); if (n !== c.f && sim(c.f, n) >= 0.85) hits.push([c, { f: n, app: 'medusa' }, 1, 'similar model field']); }
  }
}

const blocking = hits.filter(([c]) => !allow.has(c.f ? `${c.dt}.${c.f}` : c.dt));
for (const [c, e, s, why] of hits) {
  const key = c.f ? `${c.dt}.${c.f}` : c.dt;
  const ok = allow.get(key);
  console.log(`${ok ? 'intended' : 'DUPLICATE'} ${key} ~ ${c.kind === 'field' ? c.dt + '.' : ''}${e.f}${e.l ? ` "${e.l}"` : ''} (app ${e.app}${e.src ? ', ' + e.src : ''}) score ${s}: ${why}${ok ? ` | reason: ${ok}` : ''} [${c.file}]`);
}
console.log(`dupcheck: ${cands.length} new item(s), ${blocking.length} duplicate(s)${blocking.length ? '. Link to the owner instead, or mark it intended with a reason.' : ''}`);
process.exit(blocking.length ? 1 : 0);
