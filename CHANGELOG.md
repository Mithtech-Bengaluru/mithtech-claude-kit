# Changelog

## 1.2.0
- Skill registry: `kit/registry/skills.json` is the master list; `SKILLS.md` (generated) says where each skill comes from and how to use it. New `skills.mjs sync|list|add|remove|docs`. Each computer installs missing skills, updates pinned commits and uninstalls skills that master dropped (daily SessionStart sync, every installer run, `--doctor` check). Removed skills go to `~/.claude/skills/.trash`; skills the kit did not install are never touched.
- First registry: founder-skill (11), rea, impeccable, fundraising-skills (10), brag (2), taste-skill, rasterless, anatomy.
- One branch: lessons and catalogue entries go to `inbox/` on main (no `inbox/<machine>` branches); `maintain.mjs` reads and clears `inbox/` on main. The `protect-main` ruleset no longer requires pull requests (deletion and force-push stay blocked).

## 1.1.1
- Installer updates a stale plugin cache even on a plain run; `--doctor` fails when the cached plugin version differs from the kit.

## 1.1.0
- GitHub Free: new rule E12 and a GITHUB FREE line in the global CLAUDE.md. No GitHub Actions or other paid features; gates run locally or on the home cluster (Offload). A conflict rule replaces memories that rely on CI.
- Display names: users see only the product name, never "Framith" or "Mithusa" (F01, M01, checker).
- 34 curated lessons from the Mac mini and MacBook Air inboxes: gotchas for Frappe, business logic, Next.js, Rust and other stacks; orchestrate rules for shared-site tests, briefs, checker sessions, landing and G0/G2 audits.
- maintain.mjs pushes main and the tag atomically.

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
