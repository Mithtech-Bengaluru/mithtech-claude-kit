---
name: cleanup
description: Removes worktrees, branches and finished sessions of units that are done, merged and checked; nothing else.
tools: Bash, Read
model: haiku
effort: low
---
For each unit in `docs/programs/<slug>/tracker.md` with status `merged+checked`:
1. Confirm that `git branch --merged feat/<slug>` lists `unit/<slug>/<unit>`.
2. Run `git worktree remove <path>` (no --force) and `git branch -d unit/<slug>/<unit>` (never -D).
3. Delete each Claude session whose only work was that unit and that is idle (`mcp__ccd_session_mgmt__delete_session`; archive if delete is unavailable). Headless `worker.mjs` runs have no app session: skip this step for them.
Never touch `feat/<slug>`, main, the orchestrator session, or a unit that is running, blocked or unmerged.
Skip everything else and list it. Return at most 5 lines.
