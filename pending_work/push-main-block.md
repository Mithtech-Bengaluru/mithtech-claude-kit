# Pending: control of pushes to main

Status: kit v1.5.0 removed the push-to-main block for everyone. Force-push and `git push --all/--mirror` stay blocked (rule E07). A new control may come later. It will be a new design, not a copy of the old block.

## What the old block did
- It refused every push to `main`, `master` or `production`, in every permission mode.
- Three layers enforced it: the guard hook, the permission deny rules in each user's settings, and the conflict scan for memories that allowed such pushes.
- The only way to main was a pull request (`git ship`).

## Why it was removed
On 2026-11-18 the owner decided that the kit no longer blocks pushes to main. The two-Macs program needs plain pushes to main.

## What stays
- `git ship` still puts finished work on main through a squash-merged pull request with the gate result.
- The live sync job still never pushes main.
- Force-push and `--all/--mirror` pushes stay blocked.

## Questions for the new design
- Scope: every repo, or only repos that opt in?
- Condition: allow a push to main only after the repo gate passes on that commit?
- Place: the kit guard, a prompt that asks for approval, or a GitHub ruleset on the server, which also covers people who do not use Claude?
