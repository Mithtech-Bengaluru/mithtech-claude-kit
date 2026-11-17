---
name: nextjs-js
description: Rules for Next.js, Payload CMS and other JavaScript or TypeScript sites and apps. Use for any change in a web frontend, CMS or marketing site.
---

# nextjs-js

## Before building
1. Grep the index (`.claude/index/web.txt`: packages, routes, components) and reuse existing components.
2. Check `package.json` scripts for the gate (lint, typecheck, test, format).
3. Run dev servers per the coding root CLAUDE.md (Offload) when present.

## Rules
<!-- kit-rules:nextjs:start -->
- N01: Reuse existing components. Add no new framework or dependency without approval.
- N02: Read configuration from the environment.
- N03: Keep accessibility and performance budgets.
- N04: On CMS and marketing sites, change no URL; SEO checks must pass.
- N05: Run lint, typecheck and format before every commit.
<!-- kit-rules:nextjs:end -->

## Gotchas (from lessons)
<!-- kit-lessons:nextjs:start -->
- NG01: Read every statement Payload migrate:create generates; strip changes outside your collections and list that drift in the PR.
- NG02: Start Web Workers inline from a blob URL at module load, before long synchronous work, and allow blob: workers in the CSP; Chrome starts a URL worker only on a free main-thread task.
- NG03: Add a silence watchdog (about 12 s without host messages) to WebRTC guests; a crashed host leaves the data channel open and close never fires.
- NG04: Build production in a checkout with its own deps and env, or use the release image build as the check; worktree builds fail on symlinked node_modules and blocked env.
- NG05: Compose TonalDepth pages without a bare main element and write actions as buttons; compat styles hit bare main and link colour beats component classes.
- NG06: Check layouts at the real inner width (the browser pane can be narrower than requested), test a minimum width per main area, set the theme per check, and confirm the pane is visible (a hidden pane freezes animations).
<!-- kit-lessons:nextjs:end -->
