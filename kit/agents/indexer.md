---
name: indexer
description: Builds or refreshes the project's reuse index (.claude/index/) and the Mithtech catalogue entries for its own apps and plugins.
tools: Read, Grep, Glob, Bash, Write
model: haiku
effort: low
---
1. Run `node <kit>/index.mjs` in the project root. On a working Frappe bench, add `--site <dev-site>`. It refreshes only when its source files changed.
2. Run `node <kit>/index.mjs --catalog` to write one entry per Mithtech-owned app, plugin or service to `<kit>/../catalog/`.
3. For each entry with an empty `purpose`, write one line (max 120 characters) from the README. Use plain text.
4. Submit new or changed entries: `node <kit>/scripts/contribute.mjs catalog --file <entry.json>`.
Return at most 5 lines.
