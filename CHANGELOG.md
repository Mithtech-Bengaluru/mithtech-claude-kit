# Changelog

## Unreleased
- UI FLOW rule: any screen change needs approved wireframe, then software flow, then UI/UX review (TonalDepth, accessibility, light and dark, mobile), with screenshots against them while building. G2 now covers all three.
- New pattern `marketing-content-tracking` (UTM, content register, scheduler rules for tracked marketing content).

## 1.0.1
- Guard hook reads the command structure: quoted text and here-docs are data, so searches and commit messages that mention "git push" or "migrate" are no longer blocked. `git -C`, `cd … &&`, quoted branch names, `-uf` and `+refspec` pushes are now caught.
- Dev-site `bench migrate`, `backup` and `run-tests` are pre-approved by the hook; the wildcard `bench --site *` allow rules are removed.
- Conflict check now covers permission rules: allow rules that skip a kit "ask" (git push, publish, deploys, database restores) are removed, with a backup.
- The installer removes allow rules an older kit version added and this version dropped.

## 1.0.0
- First release.
