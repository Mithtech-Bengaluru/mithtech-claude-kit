---
name: rust-dev
description: Rules for Rust work, including Tauri desktop and mobile apps, servers, CLIs and core crates. Use for any change in a Cargo workspace.
---

# rust-dev

## Before building
1. Grep the index (`.claude/index/rust.txt`: crates, public types, routes) before reading code.
2. Find the owning crate (rules E03 and R01).

## Gate
- While working: `cargo check -p <crate>` and `cargo test -p <crate>`.
- Before push: `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings` (respect the repo config), `cargo test --workspace`.
- Limit parallelism (rule R04).

## Rules
<!-- kit-rules:rust:start -->
- R01: Keep core crates free of network and connector dependencies.
- R02: Use no unwrap or todo!() on feature paths.
- R03: Keep clippy clean with the repo's config.
- R04: Limit build parallelism with `CARGO_BUILD_JOBS=4` (or `-j 4`).
- R05: Keep Tauri commands as thin wrappers over core. Commit the generated TypeScript types.
<!-- kit-rules:rust:end -->

## Gotchas (from lessons)
<!-- kit-lessons:rust:start -->
- RG01: Add the register and remove listener commands to the command list and default permissions of a Tauri 2 mobile plugin. Then test on an emulator. Without them, events never reach the UI.
- RG02: Request the local network permission in Android 17 (API 37) apps that reach private addresses. Debug builds always need it; release builds need it only for private LAN servers.
<!-- kit-lessons:rust:end -->
