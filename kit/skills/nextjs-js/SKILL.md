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
<!-- kit-lessons:nextjs:end -->
