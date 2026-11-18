#!/usr/bin/env node
// Generates RULES.md (for people), the global CLAUDE.md template and the rule and lesson blocks in the
// stack skills (for Claude) from kit/rules.json, so they never disagree. `--check` exits 1 when anything is stale.
import fs from 'node:fs';
import path from 'node:path';
import { KIT, REPO, readJSON, readText } from '../lib/common.mjs';

const check = process.argv.includes('--check');
const src = readJSON(path.join(KIT, 'rules.json'));
let stale = [];
const die = (m) => { console.error(m); process.exit(1); };
const lessons = src.lessons || [];
const groupOf = Object.fromEntries(src.groups.map((g) => [g.id, g]));
const ids = [...src.groups.flatMap((g) => g.rules.map((r) => r.id)), ...lessons.map((l) => l.id)];
const dup = ids.find((id, i) => ids.indexOf(id) !== i);
if (dup) die(`duplicate id ${dup} in kit/rules.json`);
for (const l of lessons) if (!groupOf[l.stack]?.skill) die(`lesson ${l.id}: stack "${l.stack}" has no skill group`);

const md = [
  '# Mithtech development rules',
  '',
  'The rules every Mithtech developer follows, with or without Claude, grouped by concept. Each rule has a fixed id.',
  'The sections up to Communication apply to every session (the global CLAUDE.md); each stack section loads with its skill.',
  'Generated from `kit/rules.json` by `node kit/scripts/rules.mjs`; edit that file, not this one.',
];
const always = src.groups.filter((g) => !g.skill), stacks = src.groups.filter((g) => g.skill);
for (const g of always) { md.push('', `## ${g.title}`); for (const r of g.rules) md.push(`- ${r.id}: ${r.text}`); }
for (const g of stacks) { md.push('', `## ${g.title} (skill ${g.skill})`); for (const r of g.rules) md.push(`- ${r.id}: ${r.text}`); }
md.push('', `Lessons and gotchas (${lessons.length}): \`lessons\` in kit/rules.json, shown in each stack skill.`);
const rulesMd = md.join('\n') + '\n';
const lines = rulesMd.split('\n').length;
if (lines > 150) die(`RULES.md would be ${lines} lines (limit 150). Merge rules first.`);
write(path.join(REPO, 'RULES.md'), rulesMd);

// Global CLAUDE.md template: only the rules for every session, one line per concept.
// install.mjs fills {{VERSION}}, {{KIT}} and <coding root>.
const tpl = ['# Mithtech kit v{{VERSION}}: rules for every session. Kit folder `<kit>` = {{KIT}}. Ids: <kit>/rules.json; stack rules load with their skill.'];
for (const g of always) tpl.push(`- ${g.title.toUpperCase()}: ${g.rules.map((r) => `${r.id} ${r.text}`).join(' ')}`);
write(path.join(KIT, 'templates', 'global-CLAUDE.md'), tpl.join('\n') + '\n');

for (const g of src.groups.filter((x) => x.skill)) {
  const f = path.join(KIT, 'skills', g.skill, 'SKILL.md');
  let text = readText(f);
  text = block(text, `kit-rules:${g.id}`, g.rules, f);
  text = block(text, `kit-lessons:${g.id}`, lessons.filter((l) => l.stack === g.id), f);
  write(f, text);
}

function block(text, tag, rules, f) {
  const start = `<!-- ${tag}:start -->`, end = `<!-- ${tag}:end -->`;
  const i = text.indexOf(start), j = text.indexOf(end);
  if (i < 0 || j < 0) die(`missing ${tag} markers in ${f}`);
  const body = rules.map((r) => `- ${r.id}: ${r.text}`).join('\n');
  return text.slice(0, i + start.length) + '\n' + (body ? body + '\n' : '') + text.slice(j);
}

function write(f, content) {
  if (readText(f) === content) return;
  if (check) { stale.push(path.relative(REPO, f)); return; }
  fs.writeFileSync(f, content);
  console.log(`wrote ${path.relative(REPO, f)}`);
}
if (check && stale.length) { console.error(`stale: ${stale.join(', ')} (run node kit/scripts/rules.mjs)`); process.exit(1); }
