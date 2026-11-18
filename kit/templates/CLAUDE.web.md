# {{PROJECT}}
Purpose: {{PURPOSE}}

## Stack and versions
- {{FRAMEWORK}} {{FRAMEWORK_VERSION}}, Node {{NODE}}, package manager {{PM}}

## Gate (must pass before "done")
- `{{PM}} run lint`, `{{PM}} run typecheck` (if present), `{{PM}} test` (if present), `{{PM}} run build` once before push

## Where things live
- Routes: {{ROUTES}}. Components: {{COMPONENTS}}. Index: `.claude/index/web.txt`.
{{WHERE}}

## Generic vs customer apps
- Not applicable unless this site serves several customers; then customer config lives in {{CUSTOMER_CONFIG}}.

## OWN vs VENDORED
- OWN: `src/` and project config
- VENDORED: `node_modules/`, generated files ({{GENERATED}})

## Project hard rules
{{HARD_RULES}}

## Data home and deploy
- Data home: {{DATA_HOME}}
- Default branch: {{BRANCH}}. Staging: {{STAGING}}. Production: {{PRODUCTION}}.

## Gotchas (max 15 lines)
{{GOTCHAS}}

{{KIT_BLOCK}}
