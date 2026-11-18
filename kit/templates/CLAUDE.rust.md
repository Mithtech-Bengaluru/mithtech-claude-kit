# {{PROJECT}}
Purpose: {{PURPOSE}}

## Stack and versions
- Rust {{RUST_VERSION}} (edition {{EDITION}}); workspace crates: {{CRATES}}

## Gate (must pass before "done")
- While working: `cargo test -p <crate>`
- Before push: `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`

## Where things live
- Crates: {{CRATE_MAP}}. Index: `.claude/index/rust.txt`.
{{WHERE}}

## Generic vs customer apps
- Core crates stay generic; customer or connector code lives in its own crate.

## OWN vs VENDORED
- OWN: all workspace crates
- VENDORED: `target/`, `vendor/` (if present), generated code

## Project hard rules
{{HARD_RULES}}

## Data home and deploy
- Data home: {{DATA_HOME}}
- Default branch: {{BRANCH}}. Staging: {{STAGING}}. Production: {{PRODUCTION}}.

## Gotchas (max 15 lines)
{{GOTCHAS}}

{{KIT_BLOCK}}
