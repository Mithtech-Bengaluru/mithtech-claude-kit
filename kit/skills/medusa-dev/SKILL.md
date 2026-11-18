---
name: medusa-dev
description: Rules for Medusa v2 commerce work, mithusa- plugins and modules, workflows, links, routes, subscribers and admin widgets. Use for any change in a Medusa backend, plugin or storefront integration.
---

# medusa-dev

## Before building (G0, every size)
1. Detect the version (rule M03) from `package.json` (`@medusajs/medusa` or `@medusajs/framework`).
2. Grep the index: `rg -i '<term>' .claude/index/medusa.txt`. Missing or stale: `node <kit>/index.mjs`.
3. Grep the catalogue for our plugins: `rg -i '<term>' <kit>/../catalog/` (reviews, wallet, GST, marketing, pages, social auth, payments, communication, ERPNext sync and more exist).
4. Check the places of rule M04, then apply rule E01.

## Commands (verify against the project's scripts)
- Migrations: `npx medusa db:generate <module>` then `npx medusa db:migrate` (development only).
- Plugin dev: `npx medusa plugin:develop`; build: `npx medusa plugin:build`.
- Run dev servers per rule E21.

## Rules
<!-- kit-rules:medusa:start -->
- M01: Name every Mithtech plugin, module or extension `mithusa-<name>`. Show users only the product name in admin labels, page titles and the README.
- M03: Detect the Medusa version. These rules are for v2; say so when a project is v1.
- M04: Before you build, check the built-in commerce modules, installed plugins, our mithusa- plugins, src/modules, workflows and routes. For a new project, check medusa-factory first.
- M05: Place code in this order: the module or plugin that owns the domain, a generic mithusa- plugin, then the customer project's src/. Say which and why.
- M02: Put customer-only code in the customer's Medusa project, or in `mithusa-<customer>` when several of their stores share it.
- M06: Extend core, never fork it: module links, workflow hooks and steps, subscribers, src/api routes, admin widgets, and Query for cross-module reads.
- M08: Put business logic in workflows with compensation. Keep routes thin and validate them with zod.
- M09: Define models with model.define and generate migrations with the CLI. Never access another module's tables.
- M10: Use strict TypeScript with no `any`. Verify the signature of every webhook.
- M11: Publish plugins as `@mithtech-medusa/mithusa-<name>` to the private registry, with your own npm config. Use semver, @medusajs/* as peerDependencies, a README and a CHANGELOG.
<!-- kit-rules:medusa:end -->

## Gotchas (from lessons)
<!-- kit-lessons:medusa:start -->
<!-- kit-lessons:medusa:end -->
