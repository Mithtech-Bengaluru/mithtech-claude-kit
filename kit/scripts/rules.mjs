#!/usr/bin/env node
// Generates RULES.md (for people) and the rule blocks in the stack skills (for Claude)
// from kit/rules.json, so the two never disagree. `--check` exits 1 when anything is stale.
import fs from 'node:fs';
import path from 'node:path';
import { KIT, REPO, readJSON, readText } from '../lib/common.mjs';

const check = process.argv.includes('--check');
const src = readJSON(path.join(KIT, 'rules.json'));
let stale = [];

const md = [
  '# Mithtech development rules',
  '',
  'The rules every Mithtech developer follows, with or without Claude. One line each. Updated as we learn.',
  'Generated from `kit/rules.json` by `node kit/scripts/rules.mjs`; edit that file, not this one.',
];
for (const g of src.groups) {
  md.push('', `## ${g.title}`);
  for (const r of g.rules) md.push(`- ${r.text}`);
}
const rulesMd = md.join('\n') + '\n';
const lines = rulesMd.split('\n').length;
if (lines > 150) { console.error(`RULES.md would be ${lines} lines (limit 150). Merge rules first.`); process.exit(1); }
write(path.join(REPO, 'RULES.md'), rulesMd);

for (const g of src.groups.filter((x) => x.skill)) {
  const f = path.join(KIT, 'skills', g.skill, 'SKILL.md');
  let text = readText(f);
  text = block(text, `kit-rules:${g.id}`, g.rules.filter((r) => r.kind !== 'gotcha'), f);
  text = block(text, `kit-lessons:${g.id}`, g.rules.filter((r) => r.kind === 'gotcha'), f);
  write(f, text);
}

function block(text, tag, rules, f) {
  const start = `<!-- ${tag}:start -->`, end = `<!-- ${tag}:end -->`;
  const i = text.indexOf(start), j = text.indexOf(end);
  if (i < 0 || j < 0) { console.error(`missing ${tag} markers in ${f}`); process.exit(1); }
  const body = rules.map((r) => `- ${r.id}: ${r.claude || r.text}`).join('\n');
  return text.slice(0, i + start.length) + '\n' + (body ? body + '\n' : '') + text.slice(j);
}

function write(f, content) {
  if (readText(f) === content) return;
  if (check) { stale.push(path.relative(REPO, f)); return; }
  fs.writeFileSync(f, content);
  console.log(`wrote ${path.relative(REPO, f)}`);
}
if (check && stale.length) { console.error(`stale: ${stale.join(', ')} (run node kit/scripts/rules.mjs)`); process.exit(1); }
