// Live git sync tests: two clones of one bare remote stand in for the two Macs. Zero tokens, temp dirs only.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT } from '../lib/common.mjs';
import * as L from '../lib/livesync.mjs';
import { findGate, prBody } from '../scripts/ship.mjs';
import { adopt, link } from '../scripts/secrets.mjs';

export function liveSyncTests(t, tmp, baseEnv) {
  const T = path.join(tmp, 'live');
  fs.mkdirSync(T, { recursive: true });
  const git = (cwd, ...a) => { const r = spawnSync('git', a, { cwd, encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '').trim(), err: r.stderr }; };
  const ident = (d) => { git(d, 'config', 'user.name', 'Test'); git(d, 'config', 'user.email', 'test@example.com'); git(d, 'config', 'commit.gpgsign', 'false'); };
  const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
  const age = (p, min) => { const d = new Date(Date.now() - min * 60e3); fs.utimesSync(p, d, d); };
  const opts = { noIdle: true, force: true, device: 't', maxMB: 1 };

  // remote with main, two "Macs" (roots), a repo in each
  const src = path.join(T, 'src');
  git(T, 'init', '-q', '-b', 'main', src); ident(src);
  write(path.join(src, 'a.txt'), 'line1\n'); write(path.join(src, '.gitignore'), '.next/\ndata.db\n');
  git(src, 'add', '-A'); git(src, 'commit', '-q', '-m', 'init');
  const bare = path.join(T, 'proj.git');
  git(T, 'clone', '-q', '--bare', src, bare);
  const air = path.join(T, 'air'), mini = path.join(T, 'mini'), shared = path.join(T, 'shared');
  const A = path.join(air, 'proj'), M = path.join(mini, 'proj');
  fs.mkdirSync(air); fs.mkdirSync(mini); fs.mkdirSync(shared);
  git(air, 'clone', '-q', bare, A); git(mini, 'clone', '-q', bare, M); ident(A); ident(M);
  const mainSha = git(bare, 'rev-parse', 'main').out;

  write(path.join(A, 'b.txt'), 'from air\n');
  let r = L.syncRepo(A, opts);
  t('live: changes on main move to wip, commit and push', r.status === 'ok' && r.committed === 1 && git(A, 'branch', '--show-current').out === 'wip' && git(bare, 'rev-parse', '--verify', 'wip').code === 0, JSON.stringify(r));
  r = L.syncRepo(M, opts);
  t('live: the other Mac switches to wip and pulls it', r.status === 'ok' && fs.existsSync(path.join(M, 'b.txt')) && git(M, 'branch', '--show-current').out === 'wip', JSON.stringify(r));

  write(path.join(M, 'c.txt'), 'mini\n');
  r = L.syncRepo(M, { ...opts, noIdle: false, idleMin: 10 });
  t('live: waits until edits are 10 minutes old', r.status === 'skip' && /edited/.test(r.note));
  age(path.join(M, 'c.txt'), 20);
  r = L.syncRepo(M, { ...opts, noIdle: false, idleMin: 10 });
  t('live: commits idle edits', r.status === 'ok' && r.committed === 1 && r.pushed === 1, JSON.stringify(r));

  // conflict: both edit the same line
  L.syncRepo(A, opts);
  write(path.join(A, 'a.txt'), 'air version\n'); write(path.join(M, 'a.txt'), 'mini version\n');
  L.syncRepo(A, opts);
  r = L.syncRepo(M, opts);
  const mInfo = L.repoInfo(M);
  t('live: a conflict pauses the repo, aborts the rebase', r.status === 'paused' && !!L.pausedReason(mInfo.gitDir) && !L.busy(mInfo.gitDir), JSON.stringify(r));
  t('live: a paused repo is left alone', L.syncRepo(M, opts).status === 'paused');

  // a second repo keeps syncing (independent of the paused one)
  const B2 = path.join(air, 'proj2');
  git(air, 'clone', '-q', bare, B2); ident(B2);
  write(path.join(B2, 'z.txt'), 'z\n');
  t('live: other repos keep syncing while one is paused', L.syncRepo(B2, opts).status === 'ok');

  // resolve by hand, resume
  git(M, 'pull', '-q', '--rebase', '--autostash');
  write(path.join(M, 'a.txt'), 'merged\n'); git(M, 'add', 'a.txt');
  spawnSync('git', ['-c', 'core.editor=true', 'rebase', '--continue'], { cwd: M, encoding: 'utf8', env: { ...process.env, GIT_EDITOR: 'true' } });
  L.resume(mInfo.gitDir);
  r = L.syncRepo(M, opts);
  t('live: resume after a manual fix pushes again', r.status === 'ok' && !L.pausedReason(mInfo.gitDir), JSON.stringify(r));

  // busy and session markers
  fs.writeFileSync(path.join(mInfo.gitDir, 'MERGE_HEAD'), 'x');
  t('live: skips a repo mid-merge', /in progress/.test(L.syncRepo(M, opts).note));
  fs.rmSync(path.join(mInfo.gitDir, 'MERGE_HEAD'));
  L.markSession(mInfo.gitDir, 's1');
  t('live: the job skips a repo with an open Claude session', /session/.test(L.syncRepo(M, opts).note));
  t('live: the hooks can still sync it', L.syncRepo(M, { ...opts, ignoreSessions: true }).status === 'ok');
  L.unmarkSession(mInfo.gitDir, 's1');

  // refusals
  write(path.join(M, '.env.local'), 'KEY=1\n'); write(path.join(M, '.env.example'), 'KEY=\n');
  write(path.join(M, 'keys/id.txt'), '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n');
  write(path.join(M, 'big.bin'), Buffer.alloc(1.5 * 1024 * 1024));
  write(path.join(M, 'ok.txt'), 'fine\n');
  r = L.syncRepo(M, opts);
  const committed = git(M, 'ls-files').out.split('\n');
  t('live: secrets and big files are not committed; the rest is', r.status === 'ok' && committed.includes('ok.txt') && committed.includes('.env.example') && !committed.includes('.env.local') && !committed.includes('keys/id.txt') && !committed.includes('big.bin') && r.refused.length === 3, JSON.stringify(r.refused));
  t('live: secret name rules', L.secretName('.env') && L.secretName('certs/server.pem') && L.secretName('token.json') && !L.secretName('reset-password.tsx') && !L.secretName('secrets.mjs') && !L.secretName('.env.sample'));
  for (const f of ['.env.local', 'keys/id.txt', 'big.bin']) fs.rmSync(path.join(M, f), { recursive: true, force: true });
  fs.rmSync(path.join(M, 'keys'), { recursive: true, force: true });

  t('live: main on the remote never moved', git(bare, 'rev-parse', 'main').out === mainSha);

  // pull-only (third-party) repos
  const P = path.join(mini, 'third');
  git(mini, 'clone', '-q', bare, P); ident(P);
  write(path.join(P, 'local.txt'), 'x\n');
  r = L.syncRepo(P, { ...opts, mode: 'pull' });
  t('live: a pull-only repo with changes is never committed', r.status === 'skip' && !git(P, 'ls-files').out.includes('local.txt'));

  // registry: union of Syncthing conflict copies, one line per repo
  const reg = L.registryFile(shared);
  L.writeRegistry(reg, { proj: { remote: bare, main: 'main', mode: 'live', updated: '2026-01-01' } });
  write(path.join(path.dirname(reg), 'repos.sync-conflict-20261118-000000-ABC.json'), JSON.stringify({ repos: { proj: { remote: bare, main: 'main', mode: 'off', updated: '2026-02-01' }, other: { remote: bare, main: 'main', mode: 'live', updated: '2026-01-01' } } }));
  const rr = L.readRegistry(reg);
  t('registry: merges conflict copies, newest entry wins', rr.repos.proj.mode === 'off' && !!rr.repos.other && rr.copies.length === 1);
  L.writeRegistry(reg, rr.repos, rr.copies);
  const regText = fs.readFileSync(reg, 'utf8');
  t('registry: one line per repo, copies removed', regText.split('\n').filter((l) => /"remote"/.test(l)).length === 2 && !fs.readdirSync(path.dirname(reg)).some((f) => f.includes('sync-conflict')) && !!JSON.parse(regText));
  fs.mkdirSync(path.join(air, 'noremote')); git(path.join(air, 'noremote'), 'init', '-q');
  const repos = {};
  const reg1 = L.register(air, repos, { ownOwners: ['me'] });
  t('registry: register adds repos with a remote, lists the rest', reg1.added.join() === 'proj,proj2' && reg1.noRemote.join() === 'noremote' && repos.proj.mode === 'pull');
  const repos2 = {}; L.register(air, repos2, { mode: 'off' });
  t('registry: register --mode off', repos2.proj.mode === 'off');
  t('registry: owner from a GitHub URL', L.ownerOf('https://github.com/suparikoli/FieldOps.git') === 'suparikoli' && L.ownerOf('git@github.com:Org/x.git') === 'Org');

  // placeholders and on-demand partial clone
  const made = L.placeholders(mini, { 'apps/newproj': { remote: bare, main: 'main', mode: 'live' }, offrepo: { remote: bare, mode: 'off' } });
  const NP = path.join(mini, 'apps', 'newproj');
  t('placeholder: an empty marked folder for a missing repo (not for mode off)', made.join() === 'apps/newproj' && L.isPlaceholder(NP));
  const cl = L.cloneRepo(mini, 'apps/newproj', { remote: bare, main: 'main' });
  t('placeholder: clone fills it and checks out wip', cl.ok && fs.existsSync(path.join(NP, '.git')) && git(NP, 'branch', '--show-current').out === 'wip', cl.note);

  // prune: only idle, clean, pushed, no non-cache ignored files
  ident(NP);
  t('prune: a clean, pushed clone may be pruned', L.pruneCheck(NP, { pruneDays: 0 }).ok);
  write(path.join(NP, 'data.db'), 'local data');
  t('prune: keeps a clone with ignored non-cache files', /ignored files/.test(L.pruneCheck(NP, { pruneDays: 0 }).why || ''));
  fs.rmSync(path.join(NP, 'data.db'));
  write(path.join(NP, 'n.txt'), 'n'); git(NP, 'add', '-A'); git(NP, 'commit', '-q', '-m', 'local');
  t('prune: keeps a clone with unpushed commits', /unpushed/.test(L.pruneCheck(NP, { pruneDays: 0 }).why || ''));
  git(NP, 'reset', '-q', '--hard', 'origin/wip');
  t('prune: keeps an active clone', L.pruneCheck(NP, { pruneDays: 30 }).why === 'active');
  const pr = L.prune(mini, 'apps/newproj', { remote: bare, main: 'main', mode: 'live' }, { pruneDays: 0 });
  t('prune: replaces the clone with a placeholder', pr.ok && L.isPlaceholder(NP));

  // cache clean: only git-ignored cache folders
  write(path.join(A, '.next', 'x.js'), 'x'); write(path.join(A, 'dist', 'keep.js'), 'x');
  git(A, 'add', 'dist/keep.js'); git(A, 'commit', '-q', '-m', 'tracked dist');
  const rm = L.cleanCaches(A, { cacheDays: 0 });
  t('caches: removes ignored .next, keeps tracked dist', rm.join() === '.next' && fs.existsSync(path.join(A, 'dist', 'keep.js')));

  // audit
  write(path.join(B2, 'dirty.txt'), 'd');
  const au = L.auditRepo(B2);
  t('audit: reports uncommitted work', au.items.some((i) => /uncommitted/.test(i)));
  git(B2, 'stash', '-u', '-q');
  t('audit: reports stashes', L.auditRepo(B2).items.some((i) => /stash/.test(i)));

  // secrets: adopt into Shared, link on the other Mac
  write(path.join(A, '.env'), 'SECRET=1\n');
  const ad = adopt(A, air, shared);
  const stored = path.join(shared, 'secrets', 'proj', '.env');
  t('secrets: adopt moves .env to Shared and links it back', ad.moved.join() === '.env' && fs.existsSync(stored) && fs.lstatSync(path.join(A, '.env')).isSymbolicLink());
  t('secrets: the link is never committed', L.commitAll(A, { shared }).committed === 0 && !git(A, 'ls-files').out.includes('.env'));
  const lk = link(M, mini, shared);
  t('secrets: link creates the link on the other Mac', lk.linked.join() === '.env' && fs.readFileSync(path.join(M, '.env'), 'utf8') === 'SECRET=1\n');

  // hooks: Stop asks Claude once on a conflict
  const cfgDir = path.join(T, 'claude'); fs.mkdirSync(cfgDir);
  fs.writeFileSync(path.join(cfgDir, 'mithtech-kit.local.json'), JSON.stringify({ liveSync: true, codingRoot: mini, sharedRoot: shared, devicePrefix: 'mini' }));
  L.writeRegistry(reg, { proj: { remote: bare, main: 'main', mode: 'live' } });
  const env = { ...baseEnv, CLAUDE_CONFIG_DIR: cfgDir, MITHTECH_NO_NOTIFY: '1', CODING_ROOT: '', SHARED_ROOT: '' };
  delete env.CODING_ROOT; delete env.SHARED_ROOT;
  const hook = (f, input) => spawnSync(process.execPath, [path.join(KIT, 'hooks', f)], { input: JSON.stringify(input), env, encoding: 'utf8' });
  L.syncRepo(A, opts); L.syncRepo(M, opts);
  write(path.join(A, 'a.txt'), 'air2\n'); L.syncRepo(A, opts);
  write(path.join(M, 'a.txt'), 'mini2\n');
  const h1 = hook('session-stop.mjs', { cwd: M, session_id: 'x' });
  t('hook Stop: a conflict blocks once with steps for Claude', h1.status === 2 && /rebase --continue/.test(h1.stderr), h1.stderr + h1.stdout);
  const h2 = hook('session-stop.mjs', { cwd: M, session_id: 'x', stop_hook_active: true });
  t('hook Stop: no second block (stop_hook_active)', h2.status === 0);
  const h3 = hook('session-start.mjs', { cwd: M, session_id: 'y' });
  t('hook SessionStart: shows a paused repo', /PAUSED/.test(h3.stdout), h3.stdout);
  L.resume(L.repoInfo(M).gitDir); git(M, 'reset', '-q', '--hard', 'origin/wip');
  const h4 = hook('session-start.mjs', { cwd: M, session_id: 'y' });
  t('hook SessionStart: pulls first and marks the session', /live sync: proj on wip ok/.test(h4.stdout) && fs.readFileSync(path.join(M, 'a.txt'), 'utf8') === 'air2\n' && L.activeSession(L.repoInfo(M).gitDir), h4.stdout);
  hook('session-end.mjs', { cwd: M, session_id: 'y' });
  t('hook SessionEnd: removes the session marker', !L.activeSession(L.repoInfo(M).gitDir));
  L.placeholders(mini, { later: { remote: bare, main: 'main', mode: 'live' } });
  L.writeRegistry(reg, { proj: { remote: bare, main: 'main', mode: 'live' }, later: { remote: bare, main: 'main', mode: 'live' } });
  const h5 = hook('session-start.mjs', { cwd: path.join(mini, 'later'), session_id: 'z' });
  t('hook SessionStart: clones a placeholder on demand', /cloned/.test(h5.stdout) && fs.existsSync(path.join(mini, 'later', '.git')), h5.stdout);
  const off = { ...env, CLAUDE_CONFIG_DIR: path.join(T, 'claude-off') }; fs.mkdirSync(off.CLAUDE_CONFIG_DIR);
  write(path.join(M, 'off.txt'), 'x');
  const h6 = spawnSync(process.execPath, [path.join(KIT, 'hooks', 'session-stop.mjs')], { input: JSON.stringify({ cwd: M }), env: off, encoding: 'utf8' });
  t('hook Stop: does nothing where live sync is off', h6.status === 0 && !git(M, 'ls-files').out.includes('off.txt'));
  fs.rmSync(path.join(M, 'off.txt'));

  // ship: gate lookup, PR body, dry run
  const gr = path.join(T, 'gaterepo'); fs.mkdirSync(path.join(gr, '.claude'), { recursive: true });
  t('ship gate: none defined', findGate(gr, null) === null);
  fs.writeFileSync(path.join(gr, 'package.json'), JSON.stringify({ scripts: { gate: 'node t.js' } }));
  t('ship gate: npm gate script', findGate(gr, null)?.cmd === 'npm run -s gate');
  fs.writeFileSync(path.join(gr, 'pnpm-lock.yaml'), '');
  t('ship gate: pnpm when the repo uses it', findGate(gr, null)?.cmd === 'pnpm run -s gate');
  fs.writeFileSync(path.join(gr, '.claude', 'gate'), '# gate\nmake check\n');
  t('ship gate: .claude/gate wins, then --gate', findGate(gr, null)?.cmd === 'make check' && findGate(gr, 'x')?.from === '--gate');
  t('ship PR body: gate result and change list', /PASS/.test(prBody({ cmd: 'c', from: 'f' }, { code: 0, out: '' }, ['add x'])) && /- add x/.test(prBody(null, null, ['add x'])) && /not run/.test(prBody({ cmd: 'c', from: 'f' }, null)));
  const sd = spawnSync(process.execPath, [path.join(KIT, 'scripts', 'ship.mjs'), '--dry-run', '--no-gate'], { cwd: A, env, encoding: 'utf8' });
  t('ship: dry run on wip shows the PR into main', sd.status === 0 && /would push wip, open PR/.test(sd.stdout), sd.stdout + sd.stderr);
  const sm = spawnSync(process.execPath, [path.join(KIT, 'scripts', 'ship.mjs'), '--dry-run'], { cwd: src, env, encoding: 'utf8' });
  t('ship: refuses to run on main', sm.status === 1 && /not main/.test(sm.stderr));

  // the job never makes a repo live by itself
  {
    const jr = path.join(T, 'jobroot'), js = path.join(T, 'jobshared'), jc = path.join(T, 'jobclaude');
    fs.mkdirSync(jr); fs.mkdirSync(js); fs.mkdirSync(jc);
    const JP = path.join(jr, 'own'); git(jr, 'clone', '-q', bare, JP); ident(JP);
    git(JP, 'remote', 'set-url', 'origin', bare);
    write(path.join(JP, 'dirty.txt'), 'x'); age(path.join(JP, 'dirty.txt'), 60);
    fs.writeFileSync(path.join(jc, 'mithtech-kit.local.json'), JSON.stringify({ liveSync: true, codingRoot: jr, sharedRoot: js, devicePrefix: 't', ownGitOwners: ['me'] }));
    const jenv = { ...env, CLAUDE_CONFIG_DIR: jc };
    spawnSync(process.execPath, [path.join(KIT, 'scripts', 'livesync.mjs'), 'run', '--quiet'], { env: jenv, encoding: 'utf8' });
    const jreg = L.readRegistry(L.registryFile(js)).repos;
    t('job: a first run registers repos as off and commits nothing', jreg.own?.mode === 'off' && !git(JP, 'ls-files').out.includes('dirty.txt') && git(JP, 'branch', '--show-current').out === 'main', JSON.stringify(jreg));
  }

  // misc
  t('device prefix from host name', L.devicePrefix('Manojs-MacBook-Air.local') === 'air' && L.devicePrefix("Manoj's Mac mini") === 'mini' && L.devicePrefix('Studio.lan') === 'studio');
  const fh = path.join(T, 'home'); write(path.join(fh, 'Library', 'Application Support', 'Syncthing', 'config.xml'), '<configuration><folder id="default" label="Default" path="/Volumes/X/Sync" type="sendreceive"></folder><folder id="c" path="~/Coding"></folder></configuration>');
  t('syncthing: reads shared folder paths', L.syncthingFolders(fh).join() === `/Volumes/X/Sync,${fh}/Coding`);
  t('main on the remote never moved (whole suite)', git(bare, 'rev-parse', 'main').out === mainSha);
}
