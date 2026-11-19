// Disk sweep tests: fake cargo target folders in a temp root. Zero tokens, temp dirs only.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT } from '../lib/common.mjs';
import * as S from '../lib/sweep.mjs';

const SIG = 'Signature: 8a477f597d28d172789f06886806bc55\n# made by a test\n';

export function sweepTests(t, tmp, baseEnv) {
  const T = path.join(tmp, 'sweep'), home = path.join(T, 'home'), coding = path.join(T, 'coding');
  const root = path.join(T, 'caches', 'targets');
  for (const d of [home, coding, root]) fs.mkdirSync(d, { recursive: true });
  // a target folder whose newest file is `days` old
  const mk = (name, { tag = SIG, days = 10, base = root } = {}) => {
    const d = path.join(base, name), deps = path.join(d, 'debug', 'deps');
    fs.mkdirSync(deps, { recursive: true });
    fs.writeFileSync(path.join(deps, 'x.rlib'), 'x');
    if (tag) fs.writeFileSync(path.join(d, 'CACHEDIR.TAG'), tag);
    const at = new Date(Date.now() - days * 864e5);
    for (const p of [path.join(deps, 'x.rlib'), deps, path.join(d, 'debug'), ...(tag ? [path.join(d, 'CACHEDIR.TAG')] : []), d]) fs.utimesSync(p, at, at);
    return d;
  };
  const has = (d) => fs.existsSync(d);
  const cfg = { targetRoots: [root] };
  const opts = { home, codingRoot: coding, free: () => 100, inUse: () => false };

  const old = mk('old'), fresh = mk('fresh', { days: 1.5 }), untagged = mk('untagged', { tag: null });
  const wrongTag = mk('wrongtag', { tag: 'not a cache tag\n' }), busy = mk('busy');
  fs.writeFileSync(path.join(root, 'notes.log'), 'x');

  const dry = S.sweep(cfg, { ...opts, dry: true, inUse: (p) => p === busy });
  t('sweep dry run deletes nothing', has(old) && dry.removed.length === 1 && dry.removed[0].path === old, JSON.stringify(dry.removed));
  t('sweep dry run reports why it keeps', ['fresh', 'untagged', 'wrongtag', 'busy'].every((n) => dry.kept.some((k) => k.path === path.join(root, n))), JSON.stringify(dry.kept));

  const r = S.sweep(cfg, { ...opts, inUse: (p) => p === busy });
  t('sweep removes an old cargo target', !has(old) && r.removed.length === 1);
  t('sweep keeps a fresh target', has(fresh));
  t('sweep keeps a folder without the cargo tag', has(untagged) && has(wrongTag) && has(path.join(root, 'notes.log')));
  t('sweep keeps a target in use', has(busy) && r.kept.some((k) => k.path === busy && k.why === 'in use'));

  if (process.platform === 'darwin') {
    const fd = fs.openSync(path.join(busy, 'debug', 'deps', 'x.rlib'), 'r');
    const open = S.openFiles(busy);
    fs.closeSync(fd);
    t('open file check sees an open file', open === true);
    t('open file check passes an idle folder', S.openFiles(fresh) === false);
  }

  const low = S.sweep(cfg, { ...opts, free: () => 5, inUse: (p) => p === busy });
  t('sweep under the free-space floor uses the short limit', !has(fresh) && low.removed.some((x) => x.path === fresh));
  t('sweep reports a disk still under the floor', low.low.length === 1 && low.low[0].freeGB === 5);

  t('sweep root: home refused', S.rootProblem(home, { home, codingRoot: coding }) === 'holds the home folder');
  t('sweep root: parent of home refused', S.rootProblem(T, { home, codingRoot: coding }) === 'holds the home folder');
  t('sweep root: coding root and its subfolders refused', [coding, path.join(coding, 'proj')].every((p) => S.rootProblem(p, { home, codingRoot: coding }) === 'overlaps the coding root'));
  t('sweep root: relative and shallow paths refused', S.rootProblem('caches', { home }) === 'not an absolute path' && S.rootProblem('/tmp', { home }) === 'too close to the disk root');
  const repoRoot = path.join(T, 'caches', 'repo');
  fs.mkdirSync(path.join(repoRoot, '.git'), { recursive: true });
  const inRepo = mk('old', { base: repoRoot });
  t('sweep root: a git repo is refused and nothing is deleted', S.sweep({ targetRoots: [repoRoot] }, opts).refused.length === 1 && has(inRepo));
  t('sweep root: a good root passes', S.rootProblem(root, { home, codingRoot: coding }) === null);
  t('sweep paths: ~ expands and collapses', S.expand('~/Library/Caches/x', home) === path.join(home, 'Library', 'Caches', 'x') && S.collapse(path.join(home, 'a'), home) === '~/a' && S.collapse('/other/a', home) === '/other/a');

  // CLI: per-Mac setting, dry run, real run (HOME points at the temp home so the root check passes)
  const cfgDir = path.join(T, 'claude');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(path.join(cfgDir, 'mithtech-kit.local.json'), JSON.stringify({ codingRoot: coding }));
  const env = { ...baseEnv, CLAUDE_CONFIG_DIR: cfgDir, HOME: home, MITHTECH_NO_NOTIFY: '1', CODING_ROOT: '', SHARED_ROOT: '' };
  const cli = (...a) => spawnSync(process.execPath, [path.join(KIT, 'scripts', 'livesync.mjs'), 'sweep', ...a], { env, encoding: 'utf8' });
  const readCfg = () => JSON.parse(fs.readFileSync(path.join(cfgDir, 'mithtech-kit.local.json'), 'utf8'));
  t('sweep cli: no roots says so', /no build target roots/.test(cli('--dry-run').stdout));
  const bad = cli('--add-root', coding);
  t('sweep cli: unsafe root rejected', bad.status === 1 && /overlaps the coding root/.test(bad.stderr) && !readCfg().sweep);
  const added = cli('--add-root', root);
  t('sweep cli: root saved in the per-Mac config', added.status === 0 && readCfg().sweep.targetRoots.length === 1 && readCfg().codingRoot === coding, added.stdout + added.stderr);
  cli('--add-root', root);
  t('sweep cli: same root is not added twice', readCfg().sweep.targetRoots.length === 1);
  const old2 = mk('old2');
  const d2 = cli('--dry-run');
  t('sweep cli: dry run lists and keeps', /would remove .*old2/.test(d2.stdout) && has(old2), d2.stdout + d2.stderr);
  const real = cli();
  t('sweep cli: run removes the stale target', /removed .*old2/.test(real.stdout) && !has(old2) && has(untagged), real.stdout + real.stderr);
}
