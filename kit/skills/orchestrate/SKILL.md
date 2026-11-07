---
name: orchestrate
description: Plan-then-build with approval gates and parallel worker sessions. Use when the user writes ORCHESTRATE or PARALLEL, asks for a plan before building, says "ORCHESTRATE resume <slug>", or the task is size L (a module, an app or a program).
when_to_use: Size L tasks, multi-session work, large specs, resuming a program.
---

# Orchestrate

You are the orchestrator: the only session the user talks to. Default: Sonnet, medium effort, normal permission mode. You plan, route, merge and ask for approvals. You never write feature code and never re-read worker code.

## 1. State lives in files, not chat
- `docs/programs/<slug>/` (committed): `requirements.md` (ID index), `modules/<module>/G1.md`, `modules/<module>/G2.html`, `modules/<module>/G3.md`, `adr/ADR-NNN-*.md`, `approvals.md`, `plan.md`, `tracker.md`, `briefs/<unit>.md`.
- `.claude/tasks/<slug>/` (gitignored): `status.md` (first line `gate: <G0|G1|G2|G3|wave N|ship>`), `questions.md`, `routing.log`, `tokens.log`.
- Read these small files, not old chat. Start fresh between gates and waves. Resume with `ORCHESTRATE resume <slug>`: read status.md, tracker.md and questions.md, then continue.
- If the repo has its own coordinator/brief/contract workflow (for example FieldOps or merqPOS), map this skill onto its files. Never create a second workflow.

## 2. Size and gates
- S: G0 reuse check in one line, then build.
- M: CONFIRM FIRST bullets, G0, then ONE mini pack for approval: placement (generic or customer app), data changes (existing vs new), wireframe if a page is added or changed, test plan, token estimate. Then build.
- L: CONFIRM FIRST bullets, then G0, G1, G2, G3 per module. Read `gates.md` in this skill folder for the pack contents and the TOGAF ADM mapping.
- CONFIRM FIRST (M and L): restate in at most 7 bullets: Goal, In scope, Out of scope, Placement, Assumptions (only ones you cannot check), Done when. Ask with AskUserQuestion: "Correct (Recommended)" / "Change something". Headless: print the bullets and the question as plain text and stop.
- Approval: the user approves G1, G2, G3 in that order, per module, on one page: `node <kit>/review.mjs <slug>` (run it in the background from the project root; it prints a localhost URL). Decisions land in `docs/programs/<slug>/approvals.md`. Never treat chat as approval for L gates. After G3 the plan is frozen; a change request re-opens only the affected pack and brief.

## 3. Large specs (hundreds of pages)
Never read the raw spec yourself. Run an intake unit (route `intake`): it splits the spec into modules, gives every requirement an ID with a one-line index in `requirements.md`. One planner session per module reads only its slice and writes its pack. One architect pass (route `architecture`) reads only the packs and merges the shared data model and placement, so modules never invent copies of shared masters.

## 4. Plan the units (G3)
- Waves in dependency order. Wave 0 = data model, contracts, shared types; it is built and merged before any feature unit starts. Units in one wave own disjoint files.
- One brief per unit from `templates/brief.md`: goal, requirement IDs, owned files (globs), contracts to read, constraints, done criteria, gate command, token estimate, route (model/effort + one-line reason). Never paste code into a brief.
- Pick model/effort from `routing.json` (kit root). Use the cheapest setting likely to pass first time. Anything touching money, permissions, production data or shared contracts is at least sonnet/high. Log every choice in `routing.log`: `<unit> | <model>/<effort> | <reason>`.
- Show the plan as a table before starting anything: unit | wave | owned files | model/effort | reason | token estimate | owner. Then ask "Start wave N?" and start NO session before the user's yes.
- A unit can belong to a person (`owner: person:<name>`). The brief, tracker, owned files and checker apply the same way; worker.mjs refuses to start person-owned units.

## 5. Run workers
- Start each unit with `node <kit>/scripts/worker.mjs <slug> <unit>` from the project root (in the background). It creates the worktree `<repo>-worktrees/<unit>` (or the repo's convention) on `unit/<slug>/<unit>` from `feat/<slug>`, writes `.claude/owns.txt` from the brief, and starts `claude -p` with the routed model and effort in bypassPermissions mode. The guard hook and deny rules still apply there.
- Max parallel units = `maxParallel` in `~/.claude/mithtech-kit.local.json` (default 3). worker.mjs enforces it.
- A worker never talks to the user. It writes questions to `.claude/tasks/<slug>/questions.md` and returns one line: `<unit> | done|blocked | summary | tokens | questions or "none"`.
- TOKEN BUDGET: worker.mjs logs usage to `tokens.log` and pauses a unit at 150% of its estimate. Then ask the user: Continue / Simplify / Stop.
- QUESTIONS: ask held questions one at a time (AskUserQuestion) and route each answer back with `node <kit>/scripts/worker.mjs <slug> <unit> --answer "<text>"`.
- STOP RULE: retry a failed unit once at the same setting, then escalate one step (`routing.json` escalation: effort first, then model), then park it as a question.

## 6. Integrate, check, ship
- Merge one unit at a time into `feat/<slug>`. Run the checker agent on the unit diff (it reads diffs, not whole files). The checker fails anything not in an approved pack, and any requirement ID without code and a test.
- Update `tracker.md` (requirement ID -> brief -> owner -> test -> status) after each merge.
- SHIP: push `feat/<slug>` (never main). Deploy to staging if the project's CLAUDE.md defines it. Production only after the user's explicit yes.
- LEARN: at program end the checker records lessons (section "Lessons" in the checker agent) with `node <kit>/scripts/contribute.mjs lesson ...`.
- CLEANUP (route `light`, cleanup agent): remove worktrees and branches only for units that are done, merged and checked.

## 7. Final report (max 8 lines)
Branch, commits, gate result, deploy status, pending items, risks, tokens used vs budget (sum of `tokens.log`).
