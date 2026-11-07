#!/usr/bin/env node
// One review page for a program's gates (zero tokens). Serves on 127.0.0.1 only.
//   node kit/review.mjs <slug> [--port 4377]   (run from the project root)
// Shows G1 packs (Mermaid rendered), G2 wireframes and G3 plans per module, with Approve / Comment.
// Writes decisions to docs/programs/<slug>/approvals.md (gate, module, date, git hash) and
// comments to .claude/tasks/<slug>/questions.md. Enforces the order G1 -> G2 -> G3 per module.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { KIT, readText, exists, git } from './lib/common.mjs';

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
const port = Number((args[args.indexOf('--port') + 1]) || 4377);
const root = git(process.cwd(), 'rev-parse', '--show-toplevel').out || process.cwd();
const prog = path.join(root, 'docs', 'programs', slug || '');
if (!slug || !exists(prog)) { console.error(`usage: node kit/review.mjs <slug>  (no docs/programs/${slug || '<slug>'} here)`); process.exit(2); }
const approvalsFile = path.join(prog, 'approvals.md');
const questionsFile = path.join(root, '.claude', 'tasks', slug, 'questions.md');
const GATES = [['G1', 'G1.md'], ['G2', 'G2.html'], ['G3', 'G3.md']];

const modules = () => (exists(path.join(prog, 'modules')) ? fs.readdirSync(path.join(prog, 'modules')).filter((m) => fs.statSync(path.join(prog, 'modules', m)).isDirectory()).sort() : []);
const sha = (f) => crypto.createHash('sha1').update(readText(f)).digest('hex').slice(0, 8);
function decisions() {
  const out = {};
  for (const l of readText(approvalsFile).split('\n')) {
    const c = l.split('|').map((s) => s.trim());
    if (c.length >= 7 && /^G\d$/.test(c[1])) out[`${c[1]}/${c[2]}`] = { decision: c[4], date: c[5], item: c[3] };
  }
  return out;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function md(src) {
  const out = []; let inCode = null, buf = [], table = [];
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const flushTable = () => { if (!table.length) return; const rows = table.filter((r) => !/^\|?\s*:?-{3,}/.test(r)); out.push('<table>' + rows.map((r, i) => '<tr>' + r.replace(/^\||\|$/g, '').split('|').map((c) => `<${i ? 'td' : 'th'}>${inline(c.trim())}</${i ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>'); table = []; };
  for (const line of src.split('\n')) {
    if (inCode !== null) { if (/^```/.test(line)) { out.push(inCode === 'mermaid' ? `<pre class="mermaid">${esc(buf.join('\n'))}</pre>` : `<pre>${esc(buf.join('\n'))}</pre>`); inCode = null; buf = []; } else buf.push(line); continue; }
    const fence = line.match(/^```(\w*)/); if (fence) { flushTable(); inCode = fence[1]; continue; }
    if (/^\s*\|/.test(line)) { table.push(line.trim()); continue; } flushTable();
    const h = line.match(/^(#{1,4})\s+(.*)/); if (h) { out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`); continue; }
    if (/^\s*[-*]\s+/.test(line)) { out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`); continue; }
    if (/^<!--/.test(line.trim())) continue;
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  flushTable();
  return out.join('\n');
}

function page() {
  const d = decisions();
  let body = `<h1>Review: ${esc(slug)}</h1><p class="muted">Approve G1, then G2, then G3 for each module. Decisions go to approvals.md; comments to questions.md. No tokens are used.</p>`;
  for (const m of modules()) {
    body += `<section><h2>Module: ${esc(m)}</h2>`;
    GATES.forEach(([g, file], i) => {
      const f = path.join(prog, 'modules', m, file);
      if (!exists(f)) { body += `<div class="item missing"><h3>${g}</h3><p class="muted">${file} not written yet.</p></div>`; return; }
      const dec = d[`${g}/${m}`];
      const prev = i === 0 || d[`${GATES[i - 1][0]}/${m}`]?.decision === 'Approved';
      const changed = dec && dec.item && !dec.item.includes(sha(f));
      const state = dec ? `${dec.decision} ${dec.date}${changed ? ' — file changed since then' : ''}` : 'pending';
      const content = file.endsWith('.html') ? `<iframe src="/file/${encodeURIComponent(m)}/${file}" sandbox=""></iframe>` : `<div class="md">${md(readText(f))}</div>`;
      body += `<div class="item"><h3>${g} <span class="state ${dec?.decision === 'Approved' && !changed ? 'ok' : ''}">${esc(state)}</span></h3>${content}
        <form data-gate="${g}" data-module="${esc(m)}"><textarea name="text" placeholder="Comment (optional for approve)"></textarea>
        <button name="d" value="Approved" ${prev ? '' : 'disabled title="Approve the previous gate first"'}>Approve</button>
        <button name="d" value="Comment">Comment</button></form></div>`;
    });
    body += '</section>';
  }
  if (!modules().length) body += '<p>No modules yet (expected docs/programs/&lt;slug&gt;/modules/&lt;module&gt;/G1.md).</p>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Gate review</title>
<style>:root{--bg:#fafafa;--fg:#1d1d1d;--muted:#666;--line:#ccc;--card:#fff;--ok:#1a7f37}
@media (prefers-color-scheme: dark){:root{--bg:#161616;--fg:#e8e8e8;--muted:#9a9a9a;--line:#3a3a3a;--card:#1f1f1f;--ok:#4ac26b}}
body{font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg);max-width:1100px;margin:0 auto;padding:16px}
section{border-top:2px solid var(--line);margin-top:24px}.item{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:12px;margin:12px 0}
.muted{color:var(--muted)}.state{font-size:13px;color:var(--muted);font-weight:normal}.state.ok{color:var(--ok)}
table{border-collapse:collapse;margin:8px 0;max-width:100%;display:block;overflow-x:auto}td,th{border:1px solid var(--line);padding:4px 8px;text-align:left}
iframe{width:100%;height:520px;border:1px solid var(--line);background:#fff}textarea{width:100%;min-height:48px;box-sizing:border-box}
pre{overflow-x:auto}button{margin:6px 6px 0 0;padding:6px 14px}</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script></head><body>${body}
<script>try{mermaid.initialize({startOnLoad:true,theme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'neutral'})}catch(e){}
document.querySelectorAll('form').forEach(f=>f.addEventListener('submit',async e=>{e.preventDefault();const d=e.submitter.value;
const r=await fetch('/api/decide',{method:'POST',headers:{'content-type':'application/json','x-review':'1'},body:JSON.stringify({gate:f.dataset.gate,module:f.dataset.module,decision:d,text:f.text.value})});
if(!r.ok)alert(await r.text());location.reload()}))</script></body></html>`;
}

function decide({ gate, module, decision, text }) {
  const gi = GATES.findIndex(([g]) => g === gate);
  if (gi < 0 || !modules().includes(module) || !['Approved', 'Comment'].includes(decision)) throw new Error('bad request');
  const f = path.join(prog, 'modules', module, GATES[gi][1]);
  if (!exists(f)) throw new Error(`${GATES[gi][1]} does not exist`);
  const d = decisions();
  if (decision === 'Approved' && gi > 0 && d[`${GATES[gi - 1][0]}/${module}`]?.decision !== 'Approved') throw new Error(`approve ${GATES[gi - 1][0]} for ${module} first`);
  const hash = git(root, 'rev-parse', '--short', 'HEAD').out || 'uncommitted';
  if (!exists(approvalsFile)) fs.writeFileSync(approvalsFile, readText(path.join(KIT, 'templates', 'approvals.md')).replace('{{slug}}', slug));
  const date = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const clean = String(text || '').replace(/[\r\n|]+/g, ' ').slice(0, 500);
  if (decision === 'Approved') fs.appendFileSync(approvalsFile, `| ${gate} | ${module} | ${GATES[gi][1]}@${sha(f)} | Approved | ${date} | ${hash} |\n`);
  if (clean) {
    fs.mkdirSync(path.dirname(questionsFile), { recursive: true });
    fs.appendFileSync(questionsFile, `- [review][${gate}][${module}] ${clean} (${date})\n`);
  }
}

const server = http.createServer((req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  if (!['127.0.0.1', 'localhost'].includes(host)) { res.writeHead(403); return res.end('localhost only'); }
  if (req.method === 'GET' && req.url === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(page()); }
  const fm = req.url.match(/^\/file\/([^/]+)\/(G2\.html)$/);
  if (req.method === 'GET' && fm) {
    const f = path.join(prog, 'modules', decodeURIComponent(fm[1]), fm[2]);
    if (!f.startsWith(path.join(prog, 'modules')) || !exists(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(readText(f));
  }
  if (req.method === 'POST' && req.url === '/api/decide' && req.headers['x-review'] === '1') {
    let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e5) req.destroy(); });
    return req.on('end', () => { try { decide(JSON.parse(b)); res.writeHead(200); res.end('ok'); } catch (e) { res.writeHead(400); res.end(e.message); } });
  }
  res.writeHead(404); res.end();
});
server.listen(port, '127.0.0.1', () => console.log(`review page: http://127.0.0.1:${port}/  (Ctrl-C to stop)`));
server.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `port ${port} is busy; use --port <n>` : e.message); process.exit(1); });
