---
name: other-stack
description: Rules for Go, Flutter, Python, Tally TDL, Docker/k3s and any stack without its own skill. Use when the project is not Frappe, Medusa, Next.js/JS or Rust.
---

# other-stack

## Before building
1. Find the gate command (rule O01).
2. Read the official docs for an unfamiliar API (rule O03; route `unfamiliar`).
3. Grep the index (`.claude/index/other.txt`) and the catalogue first.

## Common gates (verify in the project)
- Go: `go vet ./...`, `go test ./...`. Flutter: `flutter analyze`, `flutter test`. Python: `ruff check`, `pytest`.

## Rules
<!-- kit-rules:other:start -->
- O01: Read the project's CLAUDE.md for its gate command. If it has none, propose one and ask.
- O02: Follow the stack's official style guide and linters.
- O03: Read the official docs before you use an unfamiliar API.
<!-- kit-rules:other:end -->

## Gotchas (from lessons)
<!-- kit-lessons:other:start -->
<!-- kit-lessons:other:end -->
