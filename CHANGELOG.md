# Changelog

## Unreleased
- `git ship` opens and merges the PR on `origin`, even when the repo has an `upstream` remote.
- `git ship` blocks only real `*.sync-conflict-*` files, not file names that contain "sync-conflict".
- Interim disk sweep in the live sync job (`livesync.mjs sweep [--dry-run] [--add-root <dir>]`). Once a day it deletes cargo build targets that are over 3 days old and not in use, under the per-Mac `sweep.targetRoots`. Under 30 GB free it runs every 10 minutes with a 1-day limit. Doctor warns while a Mac has no root. Retire it when the NEXUS cleaner ships.
- Kit tests no longer leak temp folders. `MITHTECH_NO_BACKGROUND` stops the SessionStart hook from starting detached update and skill-sync children, which refilled the deleted temp folder with about 1 GB a run. The temp folder is removed on every exit path, and leftovers older than a day are removed at start.
- The cleanup agent also deletes a merged unit's own build target folder.

## 1.6.0
- `install.mjs --update-projects [--dry-run] [--adopt <CLAUDE.md>]` keeps project CLAUDE.md files current. It rewrites only the kit block (`<!-- mithtech-kit:project ... -->`), fills `{{KIT_BLOCK}}` in new files, and converts an old-template file only with `--adopt`. Each change gets a dated backup.
- It skips work in progress: uncommitted edits to the file, a merge or rebase, an open Claude session, third-party (`pull`) repos and free-form files.
- The five project templates end with the kit block placeholder.

## 1.5.0
- Rules refactor: `kit/rules.json` is the one home of every rule. Rules are grouped by concept (session start, reuse, single owner, placement, task size and approvals, screens and UI, git, secrets, databases, third-party code, testing and done, tokens, communication, then each stack). Each rule has a fixed id and, where one exists, the `check` that enforces it.
- `rules.mjs` now also generates the global CLAUDE.md template from the every-session groups. Stack rules and lessons load only with their skill. Other files (skills, gates.md, two-macs.md, README, ClaudeSetup.md, project templates, SKILLS.md, guard messages, conflicts.json) cite rule ids instead of restating rules.
- One-off gotchas moved to a `lessons` list, filed by stack. The Meta Embedded Signup and Playwright WebView lessons moved to Next.js (NG07, NG08), and the Android 17 lesson moved to Rust (RG02).
- Push-to-main block removed for everyone (guard, deny rules, conflict rule, tests). Force-push and `--all/--mirror` stay blocked. E07 now asks for the gate before a push to main. Design questions for a later control: `pending_work/push-main-block.md`.
- Contradiction resolved toward the enforced behaviour: never edit vendored code (no "unless asked"). Merged: one-question and confirm-first (C01), backups (E28), tax (B12), vendored code (E09). Dropped O04 (it only repeated the every-session rules).
- The TonalDepth path is now `<coding root>/tonaldepth`; install fills each Mac's coding root.

## 1.4.3
- Live sync: the shared root defaults to `<Syncthing "default" folder>/0000.codesync`, found per Mac from the Syncthing config (`--shared-root auto`; an explicit `--shared-root <dir>` still wins). No separate Syncthing folder is needed. Doctor shows the resolved root, checks `SHARED_ROOT` and warns when the root is not inside a Syncthing folder. Docs and Mac mini adopt steps use only the "default" folder.

## 1.4.2
- Live sync: sync commits use local time; a first push reports only new commits. Doctor checks Scalar with `scalar version`. The installer reloads the live sync job when it is not loaded. Kit gate in `.claude/gate` for `git ship`. First release shipped through live sync and `git ship`.

## 1.4.1
- Live sync: repos the job (or `register`) finds start as `off`, never `live`; a repo goes live only by `livesync.mjs register --set <path>=live` (or `newRepoMode` in the local config). Found when the first job run on an empty registry marked 82 own repos live (stopped before it touched any repo).

## 1.4.0
- Live git sync between one person's Macs (`kit/docs/two-macs.md`), opt-in per machine (`install.mjs --live-sync --shared-root <dir>`). Replaces the 1.3.0 Git Town flow and the Syncthing ignore generator (removed; git-town itself is not uninstalled).
- `scripts/livesync.mjs`: launchd job `in.mithtech.livesync` every 10 min commits idle edits on the sync branch `wip`, rebases and pushes; pauses a repo on conflict (`.git/live-sync-paused`, notification) and goes on with the rest; refuses secrets and files over 50 MB; never pushes main. Registry `<shared>/coding/repos.json` (relative paths; live / pull / off), placeholders with partial clone on demand, 30-day prune of clean pushed clones, weekly cache clean, `audit` for unpushed or uncommitted work.
- `git ship` (`scripts/ship.mjs`, plain git + gh): sync, merge main in, local gate, PR with the gate result, squash-merge, main merged back into wip.
- `scripts/secrets.mjs`: secrets in `<shared>/secrets/<repo>/`, linked into repos and kept out of git.
- Hooks: SessionStart pulls first, clones placeholders, shows paused repos; new Stop hook commits and pushes each turn and hands a conflict to Claude once; new SessionEnd hook folds a temporary device worktree into wip.
- Installer sets `CODING_ROOT` / `SHARED_ROOT` in settings and the `git ship` alias; doctor checks live sync (job, tools, registry, paused repos, Syncthing not sharing the coding folder, unpushed work, old worktrees). Rule E13 and the global CLAUDE.md line now describe live git sync.

## 1.3.0
- Two Macs, one main branch (`kit/docs/two-macs.md`): Git Town on every repo. New `kit/scripts/flow.mjs` behind the git aliases `git start <task>` (device branch `air/` or `mini/`), `git sync` and `git ship` (sync, local gate, PR with the gate result, squash-merge on GitHub, prune; never pushes main). `git flow-setup` writes the shared `git-town.toml`.
- Syncthing never syncs a git repo: `kit/scripts/stignore.mjs` writes one ignore line per repo (any depth) into a marked block in `<coding>/.stglobalignore` and keeps the user's lines. Runs from the installer, the SessionStart hook (hourly at most) and the launchd job `in.mithtech.stignore` (hourly). `--check` names repo folders that are not ignored.
- Installer: installs git-town, the aliases, the device prefix (`devicePrefix` in the local config, from the host name) and the launchd job. Doctor checks all of them, the ignore block and `git-town.toml` coverage. The local config now keeps `mainPushRepos` across reinstalls.
- Rule E13 and a TWO MACS line in the global CLAUDE.md. The guard blocks `git add`/`git commit` that would stage a `*.sync-conflict-*` file.

## 1.2.0
- Skill registry: `kit/registry/skills.json` is the master list; `SKILLS.md` (generated) says where each skill comes from and how to use it. New `skills.mjs sync|list|add|remove|docs`. Each computer installs missing skills, updates pinned commits and uninstalls skills that master dropped (daily SessionStart sync, every installer run, `--doctor` check). Removed skills go to `~/.claude/skills/.trash`; skills the kit did not install are never touched.
- First registry: founder-skill (11), rea, impeccable, fundraising-skills (10), brag (2), taste-skill, rasterless, anatomy.
- One branch: lessons and catalogue entries go to `inbox/` on main (no `inbox/<machine>` branches); `maintain.mjs` reads and clears `inbox/` on main. The `protect-main` ruleset no longer requires pull requests (deletion and force-push stay blocked).

## 1.1.1
- Installer updates a stale plugin cache even on a plain run; `--doctor` fails when the cached plugin version differs from the kit.

## 1.1.0
- GitHub Free: new rule E12 and a GITHUB FREE line in the global CLAUDE.md. No GitHub Actions or other paid features; gates run locally or on the home cluster (Offload). A conflict rule replaces memories that rely on CI.
- Display names: users see only the product name, never "Framith" or "Mithusa" (F01, M01, checker).
- 34 curated lessons from the Mac mini and MacBook Air inboxes: gotchas for Frappe, business logic, Next.js, Rust and other stacks; orchestrate rules for shared-site tests, briefs, checker sessions, landing and G0/G2 audits.
- maintain.mjs pushes main and the tag atomically.

## 1.0.2
- Routing: every session or subagent gets an explicit model and effort from `routing.json` through `scripts/route.mjs`; a `route-guard` hook blocks calls without them. It never inherits the parent setting.
- Routing: new `marketing` and `marketing-money` routes; Fable model ID is `claude-fable-5-2`.
- UI FLOW rule: any screen change needs an approved wireframe, then software flow, then UI/UX review (TonalDepth, accessibility, light and dark, mobile), with screenshots against them while building. G2 now covers all three.
- Orchestrate starts units as visible Desktop sessions.
- Model probe no longer passes `--bare`, so `claude auth login` sessions work.
- Guard: per-repo `mainPushRepos` allowlist for a plain `git push` from the protected branch; force and explicit pushes stay blocked.
- New pattern `marketing-content-tracking`; catalogue entry `framith_leadtracker`.

## 1.0.1
- Guard hook reads the command structure: quoted text and here-docs are data, so searches and commit messages that mention "git push" or "migrate" are no longer blocked. `git -C`, `cd … &&`, quoted branch names, `-uf` and `+refspec` pushes are now caught.
- Dev-site `bench migrate`, `backup` and `run-tests` are pre-approved by the hook; the wildcard `bench --site *` allow rules are removed.
- Conflict check now covers permission rules: allow rules that skip a kit "ask" (git push, publish, deploys, database restores) are removed, with a backup.
- The installer removes allow rules an older kit version added and this version dropped.

## 1.0.0
- First release.
