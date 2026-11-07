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
Vendored paths are listed in `.claude/vendored.txt`; the kit guard blocks edits there.

## Project hard rules
- Follow the Mithtech kit rules (global CLAUDE.md) and the rust-dev skill.
{{HARD_RULES}}

## Data home and deploy
- Data home: {{DATA_HOME}}
- Default branch: {{BRANCH}}. Staging: {{STAGING}}. Production: {{PRODUCTION}} (needs an explicit yes).

## Gotchas (max 15 lines)
{{GOTCHAS}}

Current state and history: [HANDOFF.md](HANDOFF.md).
