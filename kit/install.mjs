#!/usr/bin/env node
// Mithtech kit installer. Zero tokens, about a minute, safe to re-run.
//   node kit/install.mjs                install or repair
//   node kit/install.mjs --update       after a pull (also run by the self-updater)
//   node kit/install.mjs --doctor [--probe-models]   checks and fixes new conflicts
//   node kit/install.mjs --uninstall    remove the kit and restore backups
//   Every run also syncs skills with the master list (kit/registry/skills.json on main).
// Options: --coding-root <dir>, --machine <name>, --device-prefix <air|mini|...>, --quiet, --dry-run
//   --live-sync / --no-live-sync, --shared-root <dir>: live git sync between one person's Macs (kit/docs/two-macs.md)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  KIT, REPO, HOME, CLAUDE_DIR, LOCAL_CFG, MANIFEST, CONFLICT_LOG, IS_WIN, readJSON, writeJSON, readText, exists,
  backup, recordCreated, run, git, localConfig, saveLocalConfig, kitVersion, semverCmp, today,
} from './lib/common.mjs';
import { scanConflicts, restoreConflicts } from './lib/conflicts.mjs';
import { checkRouting } from './lib/route.mjs';
import * as LS from './lib/livesync.mjs';
import { devicePrefix } from './lib/livesync.mjs';
import { auditAll, liveConfig } from './scripts/livesync.mjs';

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
    benchPath: cfg.benchPath || null, allowFable: cfg.allowFable ?? false,
    devicePrefix: val('--device-prefix') || cfg.devicePrefix || devicePrefix(os.hostname()),
    liveSync: has('--live-sync') ? true : has('--no-live-sync') ? false : cfg.liveSync ?? false,
    // --shared-root auto (or no value ever set): use <Syncthing "default" folder>/0000.codesync
    sharedRoot: val('--shared-root') === 'auto' ? undefined : val('--shared-root') || cfg.sharedRoot || undefined,
    ...pick(cfg, ['worktreeRoot', 'lastModelProbe', 'mainPushRepos', 'liveSyncOptions']),
  };
  if (!dry) { if (!exists(LOCAL_CFG)) recordCreated(LOCAL_CFG); saveLocalConfig(next); }
  return next;
}
const pick = (o, ks) => Object.fromEntries(ks.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

// ---------- plugin ----------
// Version Claude Code has cached for the kit plugin (null when not installed).
const pluginVersion = () => readJSON(path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'), {}).plugins?.[PLUGIN]?.[0]?.version || null;
function installPlugin(update) {
  const known = readJSON(path.join(CLAUDE_DIR, 'plugins', 'known_marketplaces.json'), {});
  update = update || (pluginVersion() && pluginVersion() !== kitVersion()); // a stale cache needs an update, even on a plain run
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
  let added = 0, removed = 0;
  for (const k of ['allow', 'deny', 'ask']) {
    const cur = new Set(s.permissions[k] || []);
    // rules an older kit version added and this version dropped
    for (const r of [...m.added[k]]) if (!kitS[k].includes(r)) { if (cur.delete(r)) removed++; m.added[k] = m.added[k].filter((x) => x !== r); }
    for (const r of kitS[k]) if (!cur.has(r)) { cur.add(r); added++; if (!m.added[k].includes(r)) m.added[k].push(r); }
    s.permissions[k] = [...cur];
  }
  added += removed;
  let statusNote = 'statusline kept';
  if (!s.statusLine) { s.statusLine = { type: 'command', command: `node "${kitPathFwd}/kit/scripts/statusline.mjs"`, padding: 0 }; m.statusLine = true; statusNote = 'statusline added'; }
  if (added || m.statusLine) {
    if (!dry) { backup(SETTINGS); writeJSON(SETTINGS, s); writeJSON(MANIFEST, m); }
  }
  return `${added - removed} permission rule(s) added, ${removed} outdated kit rule(s) removed; ${statusNote}`;
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

// ---------- skills (master list on main -> this computer) ----------
function skillSync() {
  if (dry) return 'skills: dry run, not synced';
  const r = run(process.execPath, [path.join(KIT, 'scripts', 'skills.mjs'), 'sync'], { timeout: 300000 });
  return r.code === 0 ? (r.out || 'skills: in sync') : `skills: sync problem: ${(r.err || r.out).split('\n')[0]}. Retry: node kit/scripts/skills.mjs sync`;
}

// ---------- live git sync between one person's Macs (kit/docs/two-macs.md; opt-in: --live-sync) ----------
const LS_AGENT = 'in.mithtech.livesync', OLD_AGENT = 'in.mithtech.stignore';
const plistPath = (label) => path.join(HOME, 'Library', 'LaunchAgents', `${label}.plist`);
const SHIP = path.join(KIT, 'scripts', 'ship.mjs').replace(/\\/g, '/');
const shipAlias = () => `!node "${SHIP}"`;
function plistXml() {
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LS_AGENT}</string>
  <key>ProgramArguments</key><array><string>${esc(process.execPath)}</string><string>${esc(path.join(KIT, 'scripts', 'livesync.mjs'))}</string><string>run</string><string>--quiet</string></array>
  <key>StartInterval</key><integer>600</integer>
  <key>RunAtLoad</key><true/>
  <key>LowPriorityIO</key><true/>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string><key>CLAUDE_CONFIG_DIR</key><string>${esc(CLAUDE_DIR)}</string></dict>
  <key>StandardErrorPath</key><string>${esc(path.join(CLAUDE_DIR, 'mithtech-livesync.err.log'))}</string>
</dict></plist>
`;
}
const launchctl = (...a) => run('launchctl', a);
function unloadAgent(label) {
  if (!exists(plistPath(label))) return false;
  launchctl('bootout', `gui/${process.getuid()}/${label}`);
  fs.rmSync(plistPath(label), { force: true });
  return true;
}
function liveSyncSetup(cfg) {
  if (dry) return 'live sync: dry run';
  const notes = [];
  // v1.3.0 leftovers (Git Town flow, Syncthing ignore job); git-town itself stays installed
  if (process.platform === 'darwin' && unloadAgent(OLD_AGENT)) notes.push('removed the old Syncthing ignore job');
  for (const a of ['start', 'sync', 'flow-setup']) if (/flow\.mjs/.test(run('git', ['config', '--global', `alias.${a}`]).out)) run('git', ['config', '--global', '--unset', `alias.${a}`]);
  if (run('git', ['config', '--global', 'git-town.branch-prefix']).out === `${cfg.devicePrefix}/`) run('git', ['config', '--global', '--unset', 'git-town.branch-prefix']);
  run('git', ['config', '--global', 'alias.ship', shipAlias()]);
  notes.push('git ship alias');
  // CODING_ROOT / SHARED_ROOT for sessions and scripts (paths differ per Mac)
  const s = readJSON(SETTINGS, {});
  const env = { ...(s.env || {}) };
  if (cfg.codingRoot) env.CODING_ROOT = cfg.codingRoot;
  const sharedRoot = liveConfig(cfg).shared;
  if (sharedRoot) env.SHARED_ROOT = sharedRoot; else delete env.SHARED_ROOT;
  if (JSON.stringify(env) !== JSON.stringify(s.env || {})) { backup(SETTINGS); writeJSON(SETTINGS, { ...s, env }); notes.push('CODING_ROOT in settings'); }
  if (process.platform === 'darwin') {
    if (cfg.liveSync) {
      const xml = plistXml();
      const loaded = launchctl('print', `gui/${process.getuid()}/${LS_AGENT}`).code === 0;
      if (readText(plistPath(LS_AGENT)) !== xml || !loaded) {
        fs.mkdirSync(path.dirname(plistPath(LS_AGENT)), { recursive: true });
        if (!exists(plistPath(LS_AGENT))) recordCreated(plistPath(LS_AGENT));
        launchctl('bootout', `gui/${process.getuid()}/${LS_AGENT}`);
        fs.writeFileSync(plistPath(LS_AGENT), xml);
        const r = launchctl('bootstrap', `gui/${process.getuid()}`, plistPath(LS_AGENT));
        notes.push(r.code === 0 ? 'live sync job loaded (every 10 min)' : `launchd: ${(r.err || r.out).split('\n')[0]}`);
      }
      for (const tool of ['pnpm', 'gh']) if (run(tool, ['--version']).code !== 0 && run('brew', ['--version']).code === 0) {
        const b = run('brew', ['install', tool], { timeout: 600000 });
        notes.push(b.code === 0 ? `${tool} installed` : `${tool} install failed`);
      }
    } else if (unloadAgent(LS_AGENT)) notes.push('live sync job removed (liveSync is off)');
  }
  return `live sync: ${cfg.liveSync ? 'on' : 'off'}; ${notes.join('; ')}`;
}
function liveSyncDoctor(cfg) {
  const out = [];
  const ok = (b, m) => out.push(`${b ? 'ok  ' : 'FAIL'} ${m}`);
  const warn = (b, m) => out.push(`${b ? 'ok  ' : 'warn'} ${m}`);
  ok(run('git', ['config', '--global', 'alias.ship']).out === shipAlias(), 'git ship alias points at this kit');
  ok(!exists(plistPath(OLD_AGENT)), exists(plistPath(OLD_AGENT)) ? 'old Syncthing ignore job still installed; run node kit/install.mjs' : 'no v1.3.0 leftovers');
  if (!cfg.liveSync) { out.push('ok   live sync: off on this machine (opt in with --live-sync)'); return out; }
  for (const tool of ['gh', 'pnpm', 'scalar']) { const r = run(tool, [tool === 'scalar' ? 'version' : '--version']); (tool === 'scalar' ? warn : ok)(r.code === 0, `${tool}: ${r.code === 0 ? r.out.split('\n')[0] : 'not installed'}`); }
  ok(!!cfg.devicePrefix, `device prefix: ${cfg.devicePrefix || 'not set'}`);
  const s = readJSON(SETTINGS, {});
  ok(s.env?.CODING_ROOT === cfg.codingRoot, `CODING_ROOT in settings: ${s.env?.CODING_ROOT || 'missing'}`);
  const shared = liveConfig(cfg).shared;
  ok(!!shared && exists(shared), `shared root: ${shared || 'none (no Syncthing "default" folder; or set --shared-root <dir>)'}${shared && !exists(shared) ? ' (missing; create it)' : ''}${cfg.sharedRoot ? ' (explicit)' : ' (Syncthing "default"/0000.codesync)'}`);
  ok(s.env?.SHARED_ROOT === shared, `SHARED_ROOT in settings: ${s.env?.SHARED_ROOT || 'missing'}${s.env?.SHARED_ROOT === shared ? '' : '; run node kit/install.mjs'}`);
  const inSt = !!shared && LS.syncthingFolders(HOME).some((f) => path.resolve(shared).startsWith(path.resolve(f) + path.sep) || path.resolve(shared) === path.resolve(f));
  warn(inSt, inSt ? 'shared root is inside a Syncthing folder' : 'shared root is not inside a Syncthing folder (the other Mac will not see the registry)');
  if (process.platform === 'darwin') ok(launchctl('print', `gui/${process.getuid()}/${LS_AGENT}`).code === 0, 'live sync job loaded (every 10 min)');
  if (!cfg.codingRoot || !exists(cfg.codingRoot)) { out.push(`warn coding root ${cfg.codingRoot || '(unset)'} not mounted; repo checks skipped`); return out; }
  const st = LS.syncthingFolders(HOME).filter((f) => path.resolve(f) === path.resolve(cfg.codingRoot) || path.resolve(cfg.codingRoot).startsWith(path.resolve(f) + path.sep) || path.resolve(f).startsWith(path.resolve(cfg.codingRoot) + path.sep));
  ok(!st.length, st.length ? `Syncthing still shares ${st.join(', ')}; remove it (code moves only through git)` : 'Syncthing does not share the coding folder');
  if (shared && exists(shared)) {
    const file = LS.registryFile(shared);
    const { repos, copies } = LS.readRegistry(file);
    const local = LS.findRepos(cfg.codingRoot).filter((r) => git(path.join(cfg.codingRoot, r), 'remote', 'get-url', 'origin').code === 0);
    const missing = local.filter((r) => !repos[r]);
    ok(exists(file) && !missing.length, !exists(file) ? 'registry missing; run node kit/scripts/livesync.mjs register --mode off' : missing.length ? `registry lacks ${missing.length} repo(s): ${missing.slice(0, 3).join(', ')}; run livesync.mjs register` : `registry covers ${local.length} local repos (${Object.values(repos).filter((e) => e.mode === 'live').length} live)`);
    warn(!copies.length, copies.length ? `${copies.length} Syncthing conflict copies of repos.json (merged on the next job run)` : 'no registry conflict copies');
    const paused = Object.keys(repos).filter((r) => { const i = LS.repoInfo(path.join(cfg.codingRoot, r)); return i && LS.pausedReason(i.gitDir); });
    ok(!paused.length, paused.length ? `paused repos: ${paused.join(', ')} (open a session there; Claude helps clear it)` : 'no paused repos');
  }
  const t0 = Date.now();
  const audit = auditAll(cfg.codingRoot);
  const work = audit.filter((a) => a.items.length), oldWt = audit.filter((a) => a.oldWorktrees.length);
  warn(!work.length, work.length ? `unpushed or uncommitted work in ${work.length} repo(s), e.g. ${work.slice(0, 3).map((a) => `${a.rel} (${a.items[0]})`).join(', ')}; full list: livesync.mjs audit (check before any destructive step)` : `every repo committed and pushed (${Math.round((Date.now() - t0) / 1000)} s)`);
  warn(!oldWt.length, oldWt.length ? `worktrees older than 1 day in ${oldWt.length} repo(s), e.g. ${oldWt[0].oldWorktrees[0]}` : 'no worktrees older than 1 day');
  return out;
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
  // skills match the master list
  const sk = run(process.execPath, [path.join(KIT, 'scripts', 'skills.mjs'), 'sync', '--dry-run']);
  ok(sk.code === 0 && /in sync/.test(sk.out), `skills ${sk.code === 0 && /in sync/.test(sk.out) ? 'match the master list' : `differ from master: ${sk.out || sk.err}; run node kit/scripts/skills.mjs sync`}`);
  // plugin loaded
  const list = claude('plugin', 'list');
  const loaded = list.out.includes(PLUGIN);
  ok(loaded, `plugin ${PLUGIN} ${loaded ? 'installed' : 'not listed by `claude plugin list`'}`);
  const pv = pluginVersion();
  ok(!loaded || pv === kitVersion(), `plugin cache v${pv || '?'} matches kit v${kitVersion()}${pv === kitVersion() ? '' : ': run node kit/install.mjs --update'}`);
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
      const r = run('claude', ['-p', 'Reply with OK only.', '--model', m, '--max-turns', '1', '--output-format', 'json'], { timeout: 90000 }); // no --bare: it skips the claude.ai (OAuth) login
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
  const routeBad = checkRouting(readJSON(path.join(KIT, 'routing.json'), {}), cfg);
  ok(routeBad.length === 0, routeBad.length ? `routing.json: ${routeBad.join('; ')}` : 'routing.json: every route, floor, ladder step and agent has a known model and effort');
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
  out.push(...liveSyncDoctor(cfg));
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
  out.push(liveSyncSetup(cfg));
  out.push(skillSync());
}
if (!quiet || out.some((l) => l.startsWith('FAIL'))) console.log(out.join('\n'));
if (!has('--doctor') && !has('--uninstall') && !quiet) {
  console.log('Account-level instructions (Claude Settings > Instructions) cannot be read by the kit: replace them with the 2-line kit pointer from README.md. Restart Claude Code.');
}
process.exit(out.some((l) => l.startsWith('FAIL')) ? 1 : 0);
