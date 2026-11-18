---
name: nextjs-js
description: Rules for Next.js, Payload CMS and other JavaScript or TypeScript sites and apps. Use for any change in a web frontend, CMS or marketing site.
---

# nextjs-js

## Before building
1. Grep the index (`.claude/index/web.txt`: packages, routes, components), then apply rule E01.
2. Check `package.json` scripts for the gate (lint, typecheck, test, format).
3. Run dev servers per rule E21.

## Rules
<!-- kit-rules:nextjs:start -->
- N03: Pass the project's accessibility and performance checks before every pull request.
- N04: Change no URL on CMS and marketing sites. Keep the SEO checks passing.
- N05: Run lint, typecheck and format before every commit.
<!-- kit-rules:nextjs:end -->

## Gotchas (from lessons)
<!-- kit-lessons:nextjs:start -->
- NG01: Read every statement that Payload migrate:create generates. Strip changes outside your collections, and list that drift in the PR.
- NG02: Start Web Workers inline from a blob URL at module load, before long synchronous work. Allow blob: workers in the CSP. Chrome starts a URL worker only on a free main-thread task.
- NG03: Add a silence watchdog to WebRTC guests (about 12 s without host messages). A crashed host leaves the data channel open, and close never fires.
- NG04: Build production in a checkout with its own dependencies and env, or use the release image build as the check. Worktree builds fail on symlinked node_modules and blocked env files.
- NG05: Compose TonalDepth pages without a bare main element, and write actions as buttons. Compat styles hit a bare main, and link colour beats component classes.
- NG06: Check layouts at the real inner width; the browser pane can be narrower than requested. Test a minimum width per main area, and set the theme per check. Confirm that the pane is visible; a hidden pane freezes animations.
- NG07: Read the Meta Embedded Signup phone and account IDs from the popup message event. Request contacts and history sync right after onboarding; that window closes after 24 hours.
- NG08: Attach Playwright to an Android WebView through its Android device API, not plain CDP. Clear colour-scheme emulation before theme checks.
<!-- kit-lessons:nextjs:end -->
