---
name: other-stack
description: Rules for Go, Flutter, Python, Tally TDL, Docker/k3s and any stack without its own skill. Use when the project is not Frappe, Medusa, Next.js/JS or Rust.
---

# other-stack

## Before building
1. Read the project's CLAUDE.md for its gate command. None? Propose one and ask.
2. Look up the official docs before writing an unfamiliar API (route `unfamiliar`: sonnet/high).
3. Grep the index (`.claude/index/other.txt`) and the catalogue first.

## Common gates (verify in the project)
- Go: `go vet ./...`, `go test ./...`. Flutter: `flutter analyze`, `flutter test`. Python: `ruff check`, `pytest`.

## Rules
<!-- kit-rules:other:start -->
- O01: Read the project's CLAUDE.md for its gate command.
- O02: Follow the stack's official style guide and linters.
- O03: Look up the official docs before using an unfamiliar API.
- O04: Apply the same reuse, single-owner, placement and safety rules as every other stack.
<!-- kit-rules:other:end -->

## Gotchas (from lessons)
<!-- kit-lessons:other:start -->
<!-- kit-lessons:other:end -->
