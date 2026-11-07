---
name: medusa-dev
description: Rules for Medusa v2 commerce work, mithusa- plugins and modules, workflows, links, routes, subscribers and admin widgets. Use for any change in a Medusa backend, plugin or storefront integration.
---

# medusa-dev

## Before building (G0, every size)
1. Detect the version from `package.json` (`@medusajs/medusa` or `@medusajs/framework`). v1: say so; these rules are for v2.
2. Grep the index: `rg -i '<term>' .claude/index/medusa.txt`. Missing or stale: `node <kit>/index.mjs`.
3. Grep the catalogue for our plugins: `rg -i '<term>' <kit>/../catalog/` (reviews, wallet, GST, marketing, pages, social auth, payments, communication, ERPNext sync and more exist).
4. Check built-in commerce modules first, then installed plugins, `src/modules`, `src/workflows`, `src/api`.
5. New project: check medusa-factory before hand-assembling.
6. Exists or extendable? STOP. Say what and where, with extend-or-rebuild advice.

## Commands (verify against the project's scripts)
- Migrations: `npx medusa db:generate <module>` then `npx medusa db:migrate` (development only).
- Plugin dev: `npx medusa plugin:develop`; build: `npx medusa plugin:build`.
- Run dev servers per the coding root CLAUDE.md (Offload) when present.

## Rules
<!-- kit-rules:medusa:start -->
- M01: Name every Mithtech plugin, module or extension `mithusa-<name>` and keep our npm scope (`@mithtech-medusa/mithusa-<name>`).
- M02: Build generic `mithusa-` plugins first. Put customer-only code in the customer's Medusa project, or in `mithusa-<customer>` if several of their stores share it.
- M03: Detect the Medusa version. These rules are for v2; say so when a project is v1.
- M04: Check built-in commerce modules, installed plugins, our mithusa- plugins, src/modules, workflows and routes before building. For a new project, check medusa-factory first.
- M05: Place code in this order and say which and why: the module or plugin that owns the domain, a generic mithusa- plugin, then the customer project's src/. A new module or plugin needs approval.
- M06: Extend, never fork core: module links, workflow hooks and steps, subscribers, src/api routes, admin widgets, Query for cross-module reads.
- M07: Treat ERPNext as the book of record for invoices and tax when connected. Medusa never recalculates statutory tax.
- M08: Put business logic in workflows with compensation. Keep routes thin and zod-validated.
- M09: Define models with model.define and generate migrations with the CLI. No cross-module database access.
- M10: Use strict TypeScript with no `any`. Verify webhooks and make them idempotent.
- M11: Publish plugins with semver, @medusajs/* as peerDependencies, README and CHANGELOG, to the private registry with your own npm config; never put a token in a file.
<!-- kit-rules:medusa:end -->

## Gotchas (from lessons)
<!-- kit-lessons:medusa:start -->
<!-- kit-lessons:medusa:end -->
