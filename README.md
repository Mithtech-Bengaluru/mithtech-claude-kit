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
- Lessons and catalogue entries go to your own `inbox/<machine>` branch: `node <kit>/scripts/contribute.mjs ...`. Nobody pushes to main.
- Maintainer only: `cd mithtech-claude-kit && git pull && node kit/maintain.mjs` validates all inbox branches, shows a summary and accepts nothing without a yes.

## Layout
- `kit/`: the plugin (`skills/`, `agents/`, `hooks/`), `install.mjs`, `maintain.mjs`, `review.mjs`, `dupcheck.mjs`, `driftcheck.mjs`, `index.mjs`, `routing.json`, `rules.json` (source of `RULES.md`), `templates/`, `patterns/`, `tests/`.
- `catalog/`: Mithtech apps and plugins (G0 searches it). `docs/naming-audit.md`: naming report.
- `RULES.md`: the same rules for people, generated from `kit/rules.json`.
- `ClaudeSetup.md`: the prompt that built this kit. `archive/`: older versions.

## Security
The repo is public and its code runs on every developer's machine. main is protected (pull requests with review, no force-push); only maintainers create release tags; the updater refuses tags whose commit is not on main. No hostnames, IPs, customer names, registry URLs or secrets in this repo: those go in each machine's local config.
