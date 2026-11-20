# Live git sync: one person, two Macs

For one person who works on the same projects on two Macs (here a MacBook Air and a Mac mini), sometimes on both at once. It is opt-in per machine: other kit users are not affected.

## The model

- **Code moves only through GitHub.** Syncthing never shares the coding folder. Each Mac has its own clones at the same paths, relative to its own coding root (`/Volumes/Extreme/Coding` on one Mac, `/Volumes/bay/Coding` on the other). The kit sets `CODING_ROOT` per Mac.
- **Each repo has two branches:**
  - `wip` is the shared live branch. Both Macs commit, rebase and push it automatically.
  - `main` holds finished work only. It changes only through `git ship`.
- **The live sync job** (launchd `in.mithtech.livesync`, every 10 minutes) needs no Claude and costs no tokens. For each `live` repo it:
  - waits until your last edit is 10 minutes old;
  - skips a repo with an open Claude session, a merge or rebase in progress, or a pause marker;
  - commits everything except secrets (`.env*`, keys, token files, private key content) and files over 50 MB, and sends one notification for each refused file;
  - rebases on `origin/wip` and pushes;
  - on a conflict: aborts the rebase, writes `.git/live-sync-paused`, sends a notification, and goes on with the other repos.

  It also syncs linked worktrees, and it never pushes `main`.
- **The Claude hooks:**
  - SessionStart commits leftovers and pulls first. It clones a placeholder folder on demand, and it shows a paused repo so Claude can help clear it.
  - Stop (end of each turn) commits and pushes. On a conflict it asks Claude once to resolve it.
  - SessionEnd folds a temporary device worktree (`air/<task>`) into `wip` and removes it.
- **The shared root** is the subfolder `0000.codesync` of the Syncthing "default" folder on each Mac (here `/Volumes/Extreme/Sync/0000.codesync`, on the mini `/Volumes/bay/Sync/0000.codesync`). The kit finds it from the Syncthing config; `--shared-root <dir>` overrides it. It holds the registry (`coding/repos.json`), secrets (`secrets/`), non-code folders and the Mac mini freeze (`_mini-freeze/`). Nothing else in the "default" folder is touched.
- **The registry** `<shared root>/coding/repos.json` lists every repo: its path relative to the coding root, the remote, the main branch, and a mode. `live` syncs `wip`. `pull` is for third-party clones: fetch and fast-forward only, never committed. `off` is not synced. The shared root syncs through Syncthing. A Syncthing conflict copy of the registry is merged automatically.
- **Only active projects are cloned.**
  - A registry repo missing on a Mac is an empty placeholder folder. Opening it in Claude makes a partial clone (`--filter=blob:none`; Scalar for repos with more than 5,000 files).
  - A `live` repo untouched for 30 days goes back to a placeholder, but only when it is clean and pushed, with no stash, no worktree and no ignored files other than caches. `keep: true` and `frappe*/` repos are never pruned.
  - Each week, git-ignored `.next`, `dist` and `.turbo` folders are removed in projects idle for 14 days.
- **The disk sweep** (interim, until the NEXUS cleaner ships) runs in the same job, once a day. Its settings are per Mac and never sync.
  - It looks only at the direct children of the folders in `sweep.targetRoots` (local config). Add one with `livesync.mjs sweep --add-root <dir>`.
  - It deletes a child only when it holds cargo's `CACHEDIR.TAG`, its last build is over 3 days old (`targetDays`), and no process has a file open in it.
  - Under 30 GB free (`floorGB`) it runs on every job run with a 1-day limit, and sends one notification a day while the disk stays low.
  - It refuses a root that holds the home folder, overlaps the coding root, or is a git repo.
- **Secrets** live in `<shared root>/secrets/<repo path>/` and are linked into the repo. `secrets.mjs adopt` moves them there; `secrets.mjs link` recreates the links on the other Mac. Git never sees them.

## Setup (once per Mac)

```bash
node ~/mithtech-claude-kit/kit/install.mjs --live-sync --shared-root auto
node ~/mithtech-claude-kit/kit/scripts/livesync.mjs register --mode off
node ~/mithtech-claude-kit/kit/install.mjs --doctor
```

- `--live-sync` loads the job, sets `CODING_ROOT` and `SHARED_ROOT`, and installs pnpm and gh if they are missing. Turn it off with `--no-live-sync`.
- `--shared-root auto` uses `<Syncthing "default" folder>/0000.codesync`. Create that folder once; Syncthing then syncs it to the other Mac.
- `register --mode off` adds every local repo with a remote as `off`. Switch a repo on when its `main` is clean: `livesync.mjs register --set <path>=live`.
- In the Claude desktop app, set the Code tab branch prefix to the device prefix (`air` or `mini`).

## Daily flow

1. Open a project in Claude (a placeholder folder clones itself). The session starts with a pull.
2. Work. You do not need to commit; the hooks and the job keep `wip` the same on both Macs. Commits with clear messages are still welcome.
3. When the work is finished: `git ship`. It syncs, merges the latest `main` into `wip`, runs the gate, opens a PR with the gate result, squash-merges it, then merges `main` back into `wip`. `main` gets one clean commit, and `wip` goes on without a force-push.
4. Two Claude sessions on one project on the same Mac: give the second one a worktree, `git worktree add ../<repo>-<task> -b air/<task>`. At session end it is rebased onto `wip`, pushed and removed. `git ship` also works from a feature branch.

Gate lookup for `git ship`: `--gate "<cmd>"`, then the first line of `.claude/gate`, then the npm or pnpm `gate` script. Without a gate, ship stops. `--no-gate` writes "no gate" into the PR. `git ship --dry-run` shows what it would do.

## When a repo is paused

You get a notification "<repo> paused: rebase conflict …". The other repos keep syncing. Open the repo in Claude: SessionStart shows the pause, and Claude helps you resolve it.
1. On `wip`: `git pull --rebase`, then fix the conflicts. Ask only if two changes contradict.
2. Run the gate if one exists, then `git rebase --continue` and `git push`.
3. `node ~/mithtech-claude-kit/kit/scripts/livesync.mjs resume`.

## Commands

| Command | What |
|---|---|
| `livesync.mjs status` | mode and local state of every registry repo |
| `livesync.mjs audit` | uncommitted work, unpushed commits, stashes, paused repos, worktrees older than 1 day. Run it before any destructive step. |
| `livesync.mjs repo --now` | sync this repo now |
| `livesync.mjs clone <path>` | partial clone of a registry repo |
| `livesync.mjs prune --dry-run` | what the daily prune would remove |
| `livesync.mjs sweep --dry-run` | which stale build targets the disk sweep would remove, and why it keeps the rest |
| `livesync.mjs sweep --add-root <dir>` | add a folder of per-unit build targets on this Mac |
| `secrets.mjs adopt` / `link` / `check` | secrets in the shared folder |
| `install.mjs --doctor` | gh, pnpm, scalar, job loaded, `CODING_ROOT`, coding folder not shared by Syncthing, registry complete, no paused repos, device prefix, unpushed or uncommitted work, old worktrees |

Log: `~/.claude/mithtech-livesync.log`.

## Rules

- Rules E07, E10 and E13 in `kit/rules.json` apply.
- Never reset, delete or re-clone a repo before `livesync.mjs audit` shows it clean and pushed.

## Mac mini adopt

Run these steps on the Mac mini after the MacBook Air has consolidated every repo onto `main` and switched it to `live`. Work may have happened on the mini after its freeze, so capture it before any reset.

1. Pull the kit and install it with live sync: `git -C ~/mithtech-claude-kit pull --ff-only`, then `node ~/mithtech-claude-kit/kit/install.mjs --live-sync --shared-root auto`. Check that the device prefix is `mini` and that doctor shows the shared root `/Volumes/bay/Sync/0000.codesync`.
2. Syncthing: remove the "coding" folder. Add no other folder: the existing "default" folder carries `0000.codesync`. Do not change, move or delete anything else in the "default" folder. Wait until `Sync/0000.codesync/coding/repos.json` has arrived.
3. Capture post-freeze work in every repo, before any reset:
   - compare local refs and the working tree with the freeze (the `mini/*` branches on GitHub and the bundles);
   - commit any new dirty work;
   - push each branch with new commits as `mini/post-freeze/<branch>`;
   - report the list, so it can be merged before the reset.

   Never reset a repo that has unpushed commits or uncommitted changes. `livesync.mjs audit` must show it clean.
4. For each repo that is captured and clean: `git fetch origin`, then `git switch wip` (or `git switch -c wip --track origin/wip`), then `git reset --hard origin/wip`. A repo you do not use on the mini can be deleted instead; it comes back as a placeholder.
5. Delete the mini worktrees (`git worktree remove`, then `git worktree prune`), `.stversions`, `.stfolder`, `.stignore` and `.stglobalignore` in the coding folder.
6. Set the Claude desktop app Code tab branch prefix to `mini`.
7. Run `node ~/mithtech-claude-kit/kit/install.mjs --doctor`. Every live sync line must say ok.
