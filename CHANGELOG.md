# Changelog

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
