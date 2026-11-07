---
name: rust-dev
description: Rules for Rust work, including Tauri desktop and mobile apps, servers, CLIs and core crates. Use for any change in a Cargo workspace.
---

# rust-dev

## Before building
1. Grep the index (`.claude/index/rust.txt`: crates, public types, routes) before reading code.
2. Find the owning crate; core crates stay free of network and connectors.

## Gate
- While working: `cargo check -p <crate>` and `cargo test -p <crate>`.
- Before push: `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings` (respect the repo config), `cargo test --workspace`.
- Limit parallelism on small machines: `CARGO_BUILD_JOBS=4` (or `-j 4`).

## Rules
<!-- kit-rules:rust:start -->
- R01: Keep core crates free of network and connector dependencies.
- R02: Use no unwrap or todo!() on feature paths.
- R03: Keep clippy clean with the repo's config.
- R04: Run `cargo test -p <crate>` while working and the full gate before push. Limit build parallelism.
- R05: Keep Tauri commands as thin wrappers over core. Commit generated TypeScript types.
<!-- kit-rules:rust:end -->

## Gotchas (from lessons)
<!-- kit-lessons:rust:start -->
<!-- kit-lessons:rust:end -->
