#!/usr/bin/env node
// Mithtech kit installer. Zero tokens, about a minute, safe to re-run.
//   node kit/install.mjs                install or repair
//   node kit/install.mjs --update       after a pull (also run by the self-updater)
//   node kit/install.mjs --doctor [--probe-models]   checks and fixes new conflicts
//   node kit/install.mjs --uninstall    remove the kit and restore backups
// Options: --coding-root <dir>, --machine <name>, --quiet, --dry-run
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  KIT, REPO, HOME, CLAUDE_DIR, LOCAL_CFG, MANIFEST, CONFLICT_LOG, IS_WIN, readJSON, writeJSON, readText, exists,
  backup, recordCreated, run, git, localConfig, saveLocalConfig, kitVersion, semverCmp, today,
} from './lib/common.mjs';
import { scanConflicts, restoreConflicts } from './lib/conflicts.mjs';

const args = process.argv.slice(2);
const has = (k) => args.includes(k);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const quiet = has('--quiet'), dry = has('--dry-run');
const say = (...m) => { if (!quiet) console.log(...m); };
const SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const GLOBAL_MD = path.join(CLAUDE_DIR, 'CLAUDE.md');
const MKT = 'mithtech-kit', PLUGIN = 'mithtech@mithtech-kit';
const KS = '<!-- mithtech-kit:start -->', KE = '<!-- mithtech-kit:end -->';
const kitPathFwd = REPO.replace(/\\/g, '/');

function claude(...a) { return run('claude', a, { timeout: 120000 }); }

// ---------- local config ----------
function ensureLocalConfig() {
  const cfg = localConfig();
  const codingRoot = val('--coding-root') || cfg.codingRoot || path.dirname(REPO);
  const next = {
    _doc: 'Per-machine kit config. Never committed. Holds machine-specific names (dev sites, customer apps, production patterns).',
    codingRoot, machine: val('--machine') || cfg.machine || os.hostname().split('.')[0].replace(/[^\w.-]/g, '-'),
    maxParallel: cfg.maxParallel ?? 3, modelRemap: cfg.modelRemap || {}, models: cfg.models || {},
    kitPath: REPO, os: process.platform, claudeDir: CLAUDE_DIR,
    devSites: cfg.devSites || [], customerApps: cfg.customerApps || {}, prodPatterns: cfg.prodPatterns || [],
    ownGitOwners: cfg.ownGitOwners || [], privateNames: cfg.privateNames || [], projects: cfg.projects || [],
    benchPath: cfg.benchPath || null, allowFable: cfg.allowFable ?? false, ...pick(cfg, ['worktreeRoot', 'lastModelProbe']),
  };
  if (!dry) { if (!exists(LOCAL_CFG)) recordCreated(LOCAL_CFG); saveLocalConfig(next); }
  return next;
}
const pick = (o, ks) => Object.fromEntries(ks.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

// ---------- plugin ----------
function installPlugin(update) {
  const known = readJSON(path.join(CLAUDE_DIR, 'plugins', 'known_marketplaces.json'), {});
  let r;
  if (!known[MKT]) r = claude('plugin', 'marketplace', 'add', REPO, '--scope', 'user');
  else if (update) r = claude('plugin', 'marketplace', 'update', MKT);
  const list = claude('plugin', 'list').out;
  if (!list.includes(PLUGIN)) r = claude('plugin', 'install', PLUGIN, '--scope', 'user', '-y');
  else if (update) r = claude('plugin', 'update', PLUGIN);
  const ok = claude('plugin', 'list').out.includes(PLUGIN);
  if (!ok) {
    // fallback: register through settings (supported keys); Claude Code installs it on next start
    const s = readJSON(SETTINGS, {});
    s.extraKnownMarketplaces = { ...(s.extraKnownMarketplaces || {}), [MKT]: { source: { source: 'directory', path: REPO } } };
    s.enabledPlugins = { ...(s.enabledPlugins || {}), [PLUGIN]: true };
    if (!dry) { backup(SETTINGS); writeJSON(SETTINGS, s); }
    return `plugin registered in settings (CLI said: ${(r?.err || r?.out || '').split('\n')[0] || 'n/a'})`;
  }
  return 'plugin installed';
}

// ---------- settings ----------
function mergeSettings() {
  const kitS = JSON.parse(readText(path.join(KIT, 'settings.kit.json')).replaceAll('{{KIT}}', `${kitPathFwd}/kit`));
  const s = readJSON(SETTINGS, {});
  const m = readJSON(MANIFEST, { backups: [], created: [] });
  m.added = m.added || { allow: [], deny: [], ask: [] };
  s.permissions = s.permissions || {};
  let added = 0;
  for (const k of ['allow', 'deny', 'ask']) {
    const cur = new Set(s.permissions[k] || []);
    for (const r of kitS[k]) if (!cur.has(r)) { cur.add(r); added++; if (!m.added[k].includes(r)) m.added[k].push(r); }
    s.permissions[k] = [...cur];
  }
  let statusNote = 'statusline kept';
  if (!s.statusLine) { s.statusLine = { type: 'command', command: `node "${kitPathFwd}/kit/scripts/statusline.mjs"`, padding: 0 }; m.statusLine = true; statusNote = 'statusline added'; }
  if (added || m.statusLine) {
    if (!dry) { backup(SETTINGS); writeJSON(SETTINGS, s); writeJSON(MANIFEST, m); }
  }
  return `${added} permission rule(s) added; ${statusNote}`;
}

// ---------- global CLAUDE.md ----------
function writeGlobalMd() {
  const tpl = readText(path.join(KIT, 'templates', 'global-CLAUDE.md')).replaceAll('{{KIT}}', `${kitPathFwd}/kit`).replaceAll('{{VERSION}}', kitVersion());
  const lines = tpl.trim().split('\n').length;
  if (lines > 58) throw new Error(`global CLAUDE.md template has ${lines} lines (limit 60)`);
  const block = `${KS}\n${tpl.trim()}\n${KE}`;
  const cur = readText(GLOBAL_MD);
  let next;
  if (cur.includes(KS) && cur.includes(KE)) next = cur.slice(0, cur.indexOf(KS)) + block + cur.slice(cur.indexOf(KE) + KE.length);
  else next = (cur.trim() ? cur.trimEnd() + '\n\n' : '') + block + '\n';
  if (next === cur) return 'global CLAUDE.md up to date';
  if (!dry) { if (cur) backup(GLOBAL_MD); else recordCreated(GLOBAL_MD); fs.writeFileSync(GLOBAL_MD, next); }
  return cur ? 'global CLAUDE.md updated' : 'global CLAUDE.md created';
}

// ---------- conflicts ----------
function conflicts() {
  const ch = scanConflicts(localConfig(), { dry });
  const out = [`conflicts: ${ch.length} replaced${ch.length ? ` (log: ${CONFLICT_LOG})` : ''}`];
  for (const c of ch.slice(0, 4)) out.push(`  ${c.scope} ${path.basename(path.dirname(c.file)) === 'memory' ? path.basename(path.dirname(path.dirname(c.file))) + '/' : ''}${path.basename(c.file)}: "${c.old.slice(0, 70)}" -> ${c.new.slice(0, 50)}`);
  return out.slice(0, 5);
}

// ---------- doctor ----------
function doctor() {
  const cfg = localConfig();
  const out = [];
  const ok = (b, m) => out.push(`${b ? 'ok  ' : 'FAIL'} ${m}`);
  // version vs GitHub
  const tags = git(REPO, 'ls-remote', '--tags', '--refs', 'origin', 'v*').out.split('\n').map((l) => l.split('refs/tags/')[1]).filter((t) => /^v\d+\.\d+\.\d+$/.test(t || '')).sort(semverCmp);
  const newest = tags.at(-1);
  ok(!newest || semverCmp(newest, 'v' + kitVersion()) <= 0, `kit v${kitVersion()}; newest release on GitHub: ${newest || 'none yet'}`);
  // hooks fire on sample input
  const tests = run(process.execPath, [path.join(KIT, 'tests', 'run.mjs'), '--quiet']);
  ok(tests.code === 0, `hook and script tests: ${tests.out.split('\n').pop() || tests.err.split('\n').pop()}`);
  // plugin loaded
  const list = claude('plugin', 'list');
  const loaded = list.out.includes(PLUGIN);
  ok(loaded, `plugin ${PLUGIN} ${loaded ? 'installed' : 'not listed by `claude plugin list`'}`);
  // the CLI must be logged in for worker sessions (claude -p); the desktop app's login does not carry over
  const auth = run('claude', ['auth', 'status']);
  let authJ = {}; try { authJ = JSON.parse(auth.out); } catch {}
  ok(authJ.loggedIn === true, `claude CLI login: ${authJ.loggedIn ? authJ.authMethod || 'yes' : 'not logged in; run "claude auth login" in a terminal (workers and model checks need it)'}`);
  // models and effort
  const stale = !cfg.lastModelProbe || Date.now() - Date.parse(cfg.lastModelProbe) > 7 * 864e5;
  if ((has('--probe-models') || stale) && authJ.loggedIn) {
    const routing = readJSON(path.join(KIT, 'routing.json'));
    const models = {};
    for (const m of Object.keys(routing.models)) {
      const r = run('claude', ['-p', 'Reply with OK only.', '--model', m, '--max-turns', '1', '--output-format', 'json', '--bare'], { timeout: 90000 });
      let j = {}; try { j = JSON.parse(r.out); } catch {}
      models[m] = r.code === 0 && !j.is_error;
    }
    const remap = {};
    const order = ['fable', 'opus', 'sonnet', 'haiku'];
    for (const m of order) if (!models[m]) remap[m] = order.slice(order.indexOf(m) + 1).find((x) => models[x]) || 'sonnet';
    if (!cfg.allowFable) remap.fable = remap.fable || (models.opus ? 'opus' : remap.opus);
    cfg.models = Object.fromEntries(Object.entries(models).map(([m, b]) => [m, b ? routing.effortLevels : []]));
    cfg.modelRemap = remap; cfg.lastModelProbe = new Date().toISOString();
    if (!dry) saveLocalConfig(cfg);
  }
  const avail = Object.entries(cfg.models || {}).filter(([, e]) => e.length).map(([m]) => m);
  ok(avail.length > 0, `models: ${avail.join(', ') || 'none probed'}; effort low..max; remap ${JSON.stringify(cfg.modelRemap || {})}`);
  // gh login and git identity
  const gh = run('gh', ['auth', 'status']);
  const ghUser = (gh.out + gh.err).match(/account (\S+)[^\n]*\n[^\n]*\n\s*- Active account: true/)?.[1] || (gh.out + gh.err).match(/account (\S+)/)?.[1];
  const slug = git(REPO, 'remote', 'get-url', 'origin').out.replace(/^https:\/\/github.com\/|^git@github.com:|\.git$/g, '');
  const push = gh.code === 0 ? run('gh', ['api', `repos/${slug}`, '--jq', '.permissions.push']).out : '';
  ok(gh.code === 0, `gh login: ${gh.code === 0 ? `${ghUser || 'yes'}; push access to ${slug}: ${push === 'true' ? 'yes' : 'no (lessons are saved locally until an account with access is active)'}` : 'not logged in (run gh auth login)'}`);
  const email = git(REPO, 'config', 'user.email').out, name = git(REPO, 'config', 'user.name').out;
  ok(!!name && /users\.noreply\.github\.com$/.test(email), `git identity: ${name || '(no name)'} <${email ? email.replace(/^[^@]{0,3}[^@]*@/, (m) => m.slice(0, 3) + '...@') : 'none'}>${/noreply/.test(email) ? '' : ' (use your GitHub noreply email for kit commits)'}`);
  // rules in sync, JSON valid
  const rc = run(process.execPath, [path.join(KIT, 'scripts', 'rules.mjs'), '--check']);
  ok(rc.code === 0, `RULES.md and skill rule blocks ${rc.code === 0 ? 'in sync' : 'stale: ' + rc.err}`);
  ok(exists(GLOBAL_MD) && readText(GLOBAL_MD).includes(KS), 'global CLAUDE.md has the kit block');
  out.push(...conflicts());
  return out;
}

// ---------- uninstall ----------
function uninstall() {
  const m = readJSON(MANIFEST, { backups: [], created: [], added: { allow: [], deny: [], ask: [] } });
  claude('plugin', 'uninstall', PLUGIN, '--scope', 'user', '-y');
  claude('plugin', 'marketplace', 'remove', MKT);
  const s = readJSON(SETTINGS, {});
  backup(SETTINGS);
  for (const k of ['allow', 'deny', 'ask']) if (s.permissions?.[k]) s.permissions[k] = s.permissions[k].filter((r) => !(m.added?.[k] || []).includes(r));
  if (m.statusLine && /mithtech|statusline\.mjs/.test(s.statusLine?.command || '')) delete s.statusLine;
  if (s.enabledPlugins) delete s.enabledPlugins[PLUGIN];
  if (s.extraKnownMarketplaces) delete s.extraKnownMarketplaces[MKT];
  writeJSON(SETTINGS, s);
  const md = readText(GLOBAL_MD);
  if (md.includes(KS)) {
    const rest = (md.slice(0, md.indexOf(KS)) + md.slice(md.indexOf(KE) + KE.length)).trim();
    if (!rest && m.created.includes(GLOBAL_MD)) fs.rmSync(GLOBAL_MD); else fs.writeFileSync(GLOBAL_MD, rest + '\n');
  }
  const n = restoreConflicts();
  if (exists(LOCAL_CFG)) fs.rmSync(LOCAL_CFG);
  return [`kit removed: plugin, ${Object.values(m.added || {}).flat().length} permission rule(s), CLAUDE.md block; ${n} conflict backup(s) restored.`, 'Backups (*.bak-<date>) are kept. Restart Claude Code.'];
}

// ---------- main ----------
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 20) { console.error(`Node ${process.versions.node} is too old; install Node 20 or newer.`); process.exit(1); }
if (!exists(CLAUDE_DIR)) fs.mkdirSync(CLAUDE_DIR, { recursive: true });

let out = [];
if (has('--uninstall')) out = uninstall();
else if (has('--doctor')) { ensureLocalConfig(); out = doctor(); }
else {
  const cfg = ensureLocalConfig();
  out.push(`kit v${kitVersion()} on ${cfg.machine} (${process.platform}); coding root ${cfg.codingRoot}`);
  out.push(`${installPlugin(has('--update'))}; ${mergeSettings()}; ${writeGlobalMd()}`);
  out.push(...conflicts());
}
if (!quiet || out.some((l) => l.startsWith('FAIL'))) console.log(out.join('\n'));
if (!has('--doctor') && !has('--uninstall') && !quiet) {
  console.log('Account-level instructions (Claude Settings > Instructions) cannot be read by the kit: replace them with the 2-line kit pointer from README.md. Restart Claude Code.');
}
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
