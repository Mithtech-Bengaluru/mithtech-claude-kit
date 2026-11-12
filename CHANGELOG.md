# Changelog

## 1.0.2
- Routing: every session or subagent gets an explicit model and effort from `routing.json`; it never inherits the parent setting.
- Routing: new `marketing` (sonnet/medium) and `marketing-money` (sonnet/high) routes for channel plans, copy, budgets, paid ads and partner terms.
- Routing: Fable model ID updated to `claude-fable-5-2`.
- Global template: matching ROUTING line.

## 1.0.1
- Guard hook reads the command structure: quoted text and here-docs are data, so searches and commit messages that mention "git push" or "migrate" are no longer blocked. `git -C`, `cd … &&`, quoted branch names, `-uf` and `+refspec` pushes are now caught.
- Dev-site `bench migrate`, `backup` and `run-tests` are pre-approved by the hook; the wildcard `bench --site *` allow rules are removed.
- Conflict check now covers permission rules: allow rules that skip a kit "ask" (git push, publish, deploys, database restores) are removed, with a backup.
- The installer removes allow rules an older kit version added and this version dropped.

## 1.0.0
- First release.
