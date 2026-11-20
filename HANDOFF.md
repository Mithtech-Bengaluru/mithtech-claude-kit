# setupClaude: handoff

Updated 2026-11-19.

## What it is
The source of the Mithtech Claude kit. Releases go to `Mithtech-Bengaluru/mithtech-claude-kit`, which every Mac clones to `~/mithtech-claude-kit`.

## State
- Default branch `main`. Work on `wip`. Ship with `git ship`.
- Gate: `.claude/gate` (kit tests, `rules.mjs --check`, `skills.mjs docs --check`).
- Latest release: v1.6.1 (#24, #25). Release notes: `CHANGELOG.md`.

## Open work
- Doctor prints an empty scalar version line. Fix the version probe.
- The gate sometimes fails during `git ship` with an uncaught Node exception, then passes on a rerun. Find the flaky test.
- `git ship` should fail when live sync refuses a tracked file (secret or over 50 MB), instead of shipping without it.
- Registry: deleted repos come back when the other Mac still has the folder (hourly register). Add tombstones, or skip paths marked deleted.
- `git ship` trusts a stale local `origin/HEAD`. Make it refresh the remote head and check that the registry `main` exists on origin.
- Single-branch clones never fetch `origin/wip`. Make doctor detect a narrow `remote.origin.fetch` and widen it.
- `writeRegistry` accepts a folder path. Make it reject any path that does not end in `repos.json`.
- `skills.mjs docs --check` checks the installed kit (`cfg.kitPath`), not the repo it runs in, so the source gate missed a stale SKILLS.md. Make docs use the script's own repo.

## Read next
- `README.md`, `RULES.md`, `SKILLS.md`, `CHANGELOG.md`.
- Two-Mac design: `kit/docs/two-macs.md`. Original program spec: `ClaudeSetup.md` (historical).
