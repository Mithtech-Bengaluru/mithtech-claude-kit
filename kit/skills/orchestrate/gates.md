# Gates for size-L work (loaded only for L tasks)

Every output is one page at most. Diagrams are Mermaid. Templates: `<kit>/templates/pack.md`, `wireframe.html`, `tracker.md`, `brief.md`, `approvals.md`.

## G0 REUSE (route `intake`, haiku/medium)
Read `.claude/index/` (run `node <kit>/index.mjs` first if it is missing or stale) and `<kit>/../catalog/`. Per requirement ID: `exists | extend | new`, with the owner (app/module/plugin/crate) and where. If it exists or is easy to extend, STOP and tell the user what and where, with extend-or-rebuild advice.

## G1 ARCHITECTURE (route `architecture`, opus/high; one pack per module, `modules/<m>/G1.md`)
TOGAF-lite: business capabilities, application placement (generic framith_/mithusa- app vs customer app), data model marking each entity reused / extended / new with its single owner, integration flows, key decisions as ADRs (`adr/ADR-NNN-<title>.md`).

## G2 WIREFRAMES (route `orchestrator`, sonnet/medium; `modules/<m>/G2.html`)
One low-fidelity greyscale wireframe per page, all pages of a module in one static HTML file. Each page has a table: functions, fields, roles, permissions.

## G3 BUILD PLAN (`modules/<m>/G3.md` + `plan.md` + `tracker.md` + `briefs/`)
Waves in dependency order (data model and contracts first), one brief per unit with a token estimate, a tracker mapping every requirement ID to a brief, an owner (session or person) and a test.

## Approval
The user approves G1, then G2, then G3, per module, in `node <kit>/review.mjs <slug>`. review.mjs refuses out-of-order approvals. Do not build until G3 of the module is approved.

## TOGAF ADM mapping
| ADM phase | Our output | Sizes |
|---|---|---|
| A Architecture Vision | the confirmed CONFIRM FIRST bullets, stakeholders, constraints | M, L |
| B Business | capabilities, processes, roles | L |
| C Data | entities marked reused, extended or new; single owner per entity | M, L |
| C Application | placement: framith_/mithusa-, generic or customer app | M, L |
| D Technology | stack, hosting, integrations | L |
| E Opportunities and Solutions | G0 reuse or build per requirement | M, L |
| F Migration Planning | G3 waves, data migration, cut-over plan | L |
| G Implementation Governance | checker compares the build with the approved pack | M, L |
| H Change Management | change requests and lessons | L |
| Requirements Management | requirement IDs tracked from G0 to tests | all |

- G1 covers phases B, C and D. G2 wireframes follow phase C. G3 covers phases E and F.
- The catalogue is the architecture repository: the generic framith_ and mithusa- apps are the reusable building blocks.
- Label each G1 section with its phase, for example `## B Business`, `## C Data`, `## C Application`, `## D Technology`.
