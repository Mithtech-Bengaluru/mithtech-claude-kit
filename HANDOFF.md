# setupClaude: handoff

Updated 2026-11-19.

## What it is
The source of the Mithtech Claude kit. Releases go to `Mithtech-Bengaluru/mithtech-claude-kit`, which every Mac clones to `~/mithtech-claude-kit`.

## State
- Default branch `main`. Work on `wip`. Ship with `git ship`.
- Gate: `.claude/gate` (kit tests, `rules.mjs --check`, `skills.mjs docs --check`).
- Latest release: v1.6.0 (#19). Release notes: `CHANGELOG.md`.

## Open work
- Doctor prints an empty scalar version line. Fix the version probe.
- The gate sometimes fails during `git ship` with an uncaught Node exception, then passes on a rerun. Find the flaky test.
- `git ship` should fail when live sync refuses a tracked file (secret or over 50 MB), instead of shipping without it.
- Registry: deleted repos come back when the other Mac still has the folder (hourly register). Add tombstones, or skip paths marked deleted.
- The Mac mini fails 1 kit test (207 of 208). Get the name from the mini's doctor output and fix it.

## Read next
- `README.md`, `RULES.md`, `SKILLS.md`, `CHANGELOG.md`.
- Two-Mac design: `kit/docs/two-macs.md`. Original program spec: `ClaudeSetup.md` (historical).
