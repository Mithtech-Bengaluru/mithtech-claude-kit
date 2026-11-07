# Brief: {{unit}}
- Program: {{slug}} | Wave: {{wave}} | Owner: session (or `person:<name>`)
- Route: {{model}}/{{effort}} | Reason: {{one line}}
- Token estimate: {{tokens}}

## Goal
{{one or two sentences}}

## Requirement IDs
- {{R-001}}: {{one line}}

## Owned files
<!-- One glob per line. worker.mjs copies these to .claude/owns.txt; the guard blocks edits elsewhere. -->
```owns
{{apps/framith_x/framith_x/doctype/x/**}}
```

## Contracts to read (read-only)
```contracts
{{docs/programs/<slug>/contracts/*.md}}
```

## Constraints
- {{placement, reuse decisions from G0, data owner}}

## Done criteria
- Every requirement ID above has code and a test.
- {{criteria}}

## Gate command
`{{command}}`

## Dupcheck intended (optional)
<!-- dupcheck-intended: <DocType>.<field> - <reason> -->
