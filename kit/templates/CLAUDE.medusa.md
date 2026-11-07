# {{PROJECT}}
Purpose: {{PURPOSE}}

## Stack and versions
- Medusa {{MEDUSA_VERSION}} (v2), Node {{NODE}}, package manager {{PM}}
- Package: {{PACKAGE}}

## Gate (must pass before "done")
- `{{PM}} run lint`, `{{PM}} run typecheck` (if present), `{{PM}} test`
- Plugins: `npx medusa plugin:build`
- `node <kit>/dupcheck.mjs` before commit

## Where things live
- Modules: `src/modules/`, workflows: `src/workflows/`, routes: `src/api/`, subscribers: `src/subscribers/`, links: `src/links/`, admin: `src/admin/`. Index: `.claude/index/medusa.txt`.
{{WHERE}}

## Generic vs customer apps
- Generic plugins: `mithusa-<feature>` (scope `@mithtech-medusa`). Customer-only code: the customer project `src/`, or `mithusa-<customer>`.

## OWN vs VENDORED
- OWN: {{OWN}}
- VENDORED: `@medusajs/*`, `node_modules/`, generated `.medusa/`
Vendored paths are listed in `.claude/vendored.txt`; the kit guard blocks edits there.

## Project hard rules
- Follow the Mithtech kit rules (global CLAUDE.md) and the medusa-dev skill.
{{HARD_RULES}}

## Data home and deploy
- Data home: {{DATA_HOME}}
- Default branch: {{BRANCH}}. Staging: {{STAGING}}. Production: {{PRODUCTION}} (needs an explicit yes).

## Gotchas (max 15 lines)
{{GOTCHAS}}

Current state and history: [HANDOFF.md](HANDOFF.md).
