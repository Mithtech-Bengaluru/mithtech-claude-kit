# mithtech-claude-kit

Mithtech's Claude Code development kit: one orchestrator session that plans with approval gates and runs worker sessions, reuse-first and single-source-of-truth rules for Frappe, Medusa, Next.js, Rust and other stacks, model and effort routing for low token use, and guardrail hooks.

## Install (every computer)
```
gh repo clone Mithtech-Bengaluru/mithtech-claude-kit
node mithtech-claude-kit/kit/install.mjs
```
Then restart Claude Code. Requirements: Node 20+, git, the `claude` CLI (log it in once with `claude auth login`), `gh` logged in with an account in the Mithtech-Bengaluru org.
Check the install with `node mithtech-claude-kit/kit/install.mjs --doctor`. Remove it with `--uninstall` (restores the backups).

The installer adds the `mithtech` plugin (skills, agents, hooks) from your local clone, merges permission rules into `~/.claude/settings.json`, writes the kit block in `~/.claude/CLAUDE.md`, and replaces rules and memories that contradict the kit (backups `*.bak-<date>`, log `~/.claude/mithtech-kit-conflicts.log`). Machine settings live in `~/.claude/mithtech-kit.local.json` (never committed).

### Claude Settings > Instructions (account level)
The kit cannot read these. Replace them with these 2 lines:
```
Follow the Mithtech kit rules in ~/.claude/CLAUDE.md (installed from Mithtech-Bengaluru/mithtech-claude-kit).
If they are missing, ask me to run: node <kit clone>/kit/install.mjs
```

## Use
- Any task: just ask. Claude sizes it (S/M/L), checks reuse first and follows the gates.
- Large or parallel work: write `ORCHESTRATE <request>`. Review gates on one page: `node <kit>/review.mjs <slug>`.
- Checks without tokens: `node <kit>/dupcheck.mjs` (duplicate fields/DocTypes/models), `node <kit>/driftcheck.mjs <site>` (site-only Frappe customisations), `node <kit>/index.mjs` (reuse index).

## Updates and contributions
- Updates are automatic: once a day a SessionStart hook moves your clone to the newest release tag whose commit is on protected main (never to unreleased main), then re-runs the installer. It never updates over local edits.
- The repo has one branch, `main`. Lessons and catalogue entries are committed to `inbox/` on main by `node <kit>/scripts/contribute.mjs ...` (rebase-retry if another computer pushed first).
- Maintainer only: `cd mithtech-claude-kit && git pull && node kit/maintain.mjs` validates `inbox/`, shows a summary, accepts nothing without a yes, then releases and clears the inbox files.
- Skills have their own daily sync (see Skills below). It reads the master list straight from main, so it needs no release tag.

## Skills
`kit/registry/skills.json` on main is the one master list of third-party Claude skills. Every computer installs what is missing and uninstalls what master dropped (daily SessionStart sync and every `install.mjs` run). `SKILLS.md` lists every skill, where it comes from (pinned commit) and how to use it; it is generated, never edited.
```
node kit/scripts/skills.mjs list                    # master vs this computer
node kit/scripts/skills.mjs add <owner/repo> --use "how to use it"   # install here, add to master
node kit/scripts/skills.mjs remove <skill-or-source> # delete from master: all computers uninstall it
node kit/scripts/skills.mjs sync [--dry-run] [--force]
```
This computer's own record is `~/.claude/mithtech-skills.local.json`. Skills the kit did not install are never touched; existing ones are adopted. Removed skills go to `~/.claude/skills/.trash`. Opt a computer out of a skill with `skillsExclude` in `~/.claude/mithtech-kit.local.json`. Sync only copies files from the pinned commit and runs no third-party script. Anyone who can push to main can add a source, so review `git log -- kit/registry` and read a new skill before you trust it.

## Layout
- `kit/`: the plugin (`skills/`, `agents/`, `hooks/`, `registry/`), `install.mjs`, `maintain.mjs`, `review.mjs`, `dupcheck.mjs`, `driftcheck.mjs`, `index.mjs`, `routing.json`, `rules.json` (source of `RULES.md`), `templates/`, `patterns/`, `tests/`.
- `catalog/`: Mithtech apps and plugins (G0 searches it). `docs/naming-audit.md`: naming report.
- `RULES.md`: the same rules for people, generated from `kit/rules.json`. `SKILLS.md`: the skill list and how to use each skill, generated from `kit/registry/skills.json`.
- `ClaudeSetup.md`: the prompt that built this kit. `archive/`: older versions.

## GitHub plan
Mithtech uses GitHub Free. No GitHub Actions CI, required status checks, Codespaces, Copilot or other paid features. Every test and gate runs locally (or on the home cluster with Offload) before a push to main; the commit message records the gate result. Kit tests: `node kit/tests/run.mjs`.

## Security
The repo is public and its code runs on every developer's machine. `main` is the only branch: no force-push and no deletion (repository ruleset), but any org member with write access commits to it directly, so read every diff you pull; only maintainers create release tags; the updater refuses tags whose commit is not on main. No hostnames, IPs, customer names, registry URLs or secrets in this repo: those go in each machine's local config.
