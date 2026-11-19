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
- `git ship` trusts a stale local `origin/HEAD`. Make it refresh the remote head and check that the registry `main` exists on origin.
- Single-branch clones never fetch `origin/wip`. Make doctor detect a narrow `remote.origin.fetch` and widen it.
- `writeRegistry` accepts a folder path. Make it reject any path that does not end in `repos.json`.
- The installed kit at `~/mithtech-claude-kit` has a local SKILLS.md edit: the impeccable entry adds "Pair it with rule E25 (TonalDepth) for Mithtech UIs." Move it into the skill registry source, then regenerate SKILLS.md.
- Ship fixes from 2026-11-19 (origin targeting, exact sync-conflict match) are in #21 but not yet released as a version.

## Read next
- `README.md`, `RULES.md`, `SKILLS.md`, `CHANGELOG.md`.
- Two-Mac design: `kit/docs/two-macs.md`. Original program spec: `ClaudeSetup.md` (historical).
