# {{PROJECT}}
Purpose: {{PURPOSE}}

## Stack and versions
- Frappe {{FRAPPE_VERSION}}, ERPNext {{ERPNEXT_VERSION}}, Python {{PYTHON}}, Node {{NODE}}
- Bench: {{BENCH_PATH}}; dev sites: {{DEV_SITES}}

## Gate (must pass before "done")
- While working: `bench --site {{DEV_SITE}} run-tests --app <app> --module <module>`
- Before push: `bench --site {{DEV_SITE}} run-tests --app <app>`; `bench build --app <app>` for changed apps only
- Before release: `node <kit>/driftcheck.mjs {{DEV_SITE}}` and `node <kit>/dupcheck.mjs`

## Where things live
- Apps: `apps/<app>` (each its own repo). Sites: `sites/<site>`. Index: `.claude/index/frappe.txt`.
{{WHERE}}

## Generic vs customer apps
- Generic product apps: {{GENERIC_APPS}}
- Customer apps: {{CUSTOMER_APPS}}
- New customer work: `framith_<customer>`; reusable work: the generic app behind a Settings field.

## OWN vs VENDORED
- OWN: {{OWN_APPS}}
- VENDORED: {{VENDORED_APPS}}
Vendored paths are listed in `.claude/vendored.txt`; the kit guard blocks edits there.

## Project hard rules
- Follow the Mithtech kit rules (global CLAUDE.md) and the frappe-dev skill.
{{HARD_RULES}}

## Data home and deploy
- Data home: {{DATA_HOME}}
- Default branch: {{BRANCH}}. Staging: {{STAGING}}. Production: {{PRODUCTION}} (needs an explicit yes).

## Gotchas (max 15 lines)
{{GOTCHAS}}

Current state and history: [HANDOFF.md](HANDOFF.md).
