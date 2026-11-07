# mithtech-claude-kit

Mithtech's Claude Code development kit: one orchestrator session that plans with approval gates and runs worker sessions, reuse-first and single-source-of-truth rules for Frappe, Medusa, Next.js, Rust and other stacks, model and effort routing for low token use, and guardrail hooks.

## Status
The kit is not built yet. `ClaudeSetup.md` is the prompt that builds it into `kit/` on the first computer.

## First computer (builds the kit)
1. Clone this repo into your coding folder.
2. Open Claude Code in this folder and paste the contents of `ClaudeSetup.md`.
3. Approve the plan it shows. It builds `kit/`, runs a pilot, and pushes after your yes.

## Other computers (after `kit/` exists)
```
gh repo clone Mithtech-Bengaluru/mithtech-claude-kit
node mithtech-claude-kit/kit/install.mjs
```
Then restart Claude Code. Check the install with `node mithtech-claude-kit/kit/install.mjs --doctor`.

## Improving the kit
Every device pushes its lessons and catalogue entries to its own `inbox/<machine>` branch. Nothing is accepted automatically. To collect them from all devices, review and publish (maintainer only):
```
cd mithtech-claude-kit && git pull && node kit/maintain.mjs
```
`RULES.md` is the human-readable version of the rules.

`archive/ClaudeSetup.v1.md` is the first version of the prompt.
