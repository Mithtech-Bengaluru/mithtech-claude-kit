Set up Mithtech's Claude Code development kit on this computer. The same kit must install on every Mithtech computer, under different Claude accounts, with one command, and it must keep improving from everyone's work.

Mithtech builds mostly on Frappe (Frappe, ERPNext, HRMS, India Compliance and our own apps), plus Medusa v2 commerce, Next.js and JS sites, Rust platforms (Tauri desktop/mobile, servers), and a few other stacks (Go, Flutter, Python, Tally TDL, Docker/k3s). We also build custom enterprise software: multi-tenant SaaS, offline-first field and POS apps, ledgers, integrations.

Goals, in order: 1) quality work that reuses what exists, keeps a single source of truth and ships complete features, 2) low token use, 3) speed. One orchestrator session runs all the other sessions.

# 0. RULES FOR THIS SETUP
- Detect OS, home folder, Claude config folder (~/.claude or %USERPROFILE%\.claude) and the coding root. Must work on macOS, Linux, Windows (Frappe on Windows = WSL). Scripts and hooks in Node, never bash.
- Check what exists before writing: ~/.claude (settings.json, skills, agents, plugins, hooks), the coding root CLAUDE.md, every project CLAUDE.md and HANDOFF.md, PROJECTS.md. Never overwrite: back up to <name>.bak-<date>, then merge. Keep existing hooks (for example the Offload hook), third-party skills/agents and project rules. A project rule beats a kit rule; report conflicts.
- Verify in the current Claude Code docs before writing: plugin and marketplace format (local folder and GitHub sources), SKILL.md frontmatter, agent files (model, effort, tools), settings permission syntax, hook events and whether hooks and deny rules still apply in bypassPermissions mode, how one session can start other sessions with their own model, effort and permission mode, what usage data a session exposes (statusline input, cost, OpenTelemetry), the current model list and effort levels. Verify Frappe, Medusa, Cargo and other CLI commands in their docs. Never guess syntax.
- No secrets in any file; name env variables only. Never read credentials folders or .env files.
- PHASE A (read-only): discover, then show me one short plan: files to create or change, and backups. Wait for my yes. PHASE B: write.
- During setup do not build, install project deps, migrate, start servers or run project tests.
- Talk to me in the kit's style (section 3.1, COMMUNICATION). One question at a time, as clickable options.

# 1. DISTRIBUTION AND SELF-UPDATE
- The folder holding this prompt is the git repo Mithtech-Bengaluru/mithtech-claude-kit (public, the only copy). Build the kit into `kit/` inside it. People install from a shared copy of the folder or a clone.
- Package skills, agents, hooks, templates and patterns as a Claude Code plugin in `kit/`, with a marketplace file so it installs from the local folder or from GitHub, IF the docs confirm plugins carry all of these. Whatever a plugin can't carry (permission rules, global CLAUDE.md, statusline) is merged by `node kit/install.mjs`: adds the plugin, backs up, merges, safe to re-run, `--update`, `--uninstall`, `--doctor`, no tokens, about a minute.
- `--doctor` checks: kit version vs GitHub, hooks fire on sample input, plugin loaded, which models and effort levels this account can use (writes the remap into the local config), gh login, git identity.
- Nothing account-specific in the kit: no emails, account IDs, memory files or absolute paths. Each computer gets a gitignored `~/.claude/mithtech-kit.local.json`: coding root, machine name, max parallel sessions (default 3), model remap.
- FIRST COMPUTER (this one): build the kit, run the pilot (section 5), push after my yes. OTHER COMPUTERS: `node kit/install.mjs`. Project CLAUDE.md files and approved plans live in each project's repo, so they are written once and never regenerated per computer.
- SELF-UPDATE (all scripts, zero Claude tokens):
  - PULL: a SessionStart hook checks GitHub at most once a day and updates only to the newest release tag (never to whatever is on main) that passes the integrity check below; it fast-forwards the local clone, re-runs the installer quietly and prints one line. Never pulls over local uncommitted kit edits; reports them instead.
  - CONTRIBUTE: lessons and catalogue entries (section 3.11) are written as one small JSON file each under `inbox/` (unique name per machine and time, so no conflicts) and pushed by a script to the branch `inbox/<machine>` with the user's own GitHub login. Nobody pushes to main directly.
  - COLLECT (manual, only me): `node kit/maintain.mjs` on my computer fetches every `inbox/*` branch from all devices, validates each entry (JSON schema, length caps, duplicates, secret scan), and shows me a summary of 10 lines or fewer. Nothing is accepted automatically. On my yes it writes the accepted entries (section 3.11), bumps the version, tags a release, pushes to main and deletes the processed inbox branches. No scheduled job, no GitHub Actions.
  - SAFETY: inbox entries are data from many people and end up in everyone's context. Only schema fields are kept, plain text, capped lengths, no URLs or commands in lessons, no instructions; anything else is rejected.
- SECURITY (the repo is public and its code runs on every developer's machine, so it is a supply-chain target):
  - main is protected: changes only by pull request with my review; no force-push; only org members can push inbox branches.
  - Release tags are created only by me (signed tags if set up); the updater refuses anything else, and refuses a tag whose commit isn't on protected main.
  - If GitHub Actions are added later: run only on pushes by members; never `pull_request_target`, no secrets exposed to fork pull requests, actions pinned to commit SHAs, minimal workflow permissions.
  - The public repo holds no internal hostnames, IPs, server names, customer names or registry URLs. Those go in each machine's local config or in a private repo the kit reads if present.
  - Commits use the GitHub noreply email.

# 2. DISCOVER (ask one at a time, only what you can't detect)
1. Does `kit/` already exist in this folder or on GitHub? If yes: run `node kit/install.mjs --doctor`, then install, then stop.
2. From PROJECTS.md, list ACTIVE projects grouped by stack. Ask which to onboard now. Default: one pilot per stack (Frappe bench, Medusa plugin, Next.js site, Rust repo).
3. `gh auth status`; if not logged in, tell me to run `gh auth login` and wait.
4. Only where HANDOFF.md/CLAUDE.md doesn't say: default branch, staging/production deploy method, site names.

# 3. KIT CONTENTS

## 3.0 Mithtech naming and app layering (applies to every project)
- FRAPPE: every Frappe app Mithtech builds is named `framith_<name>` (snake_case).
  - GENERIC FIRST: product features are built as generic, configurable apps, `framith_<product>` (for example framith_fieldops, framith_kyc). Behaviour that differs between customers is a setting in the app's Single Settings DocType, never a customer check in code.
  - CUSTOMER LAYER: each customer gets one app `framith_<customer>` that lists the generic apps in required_apps and holds only that customer's Custom Fields, Property Setters, print formats, workspaces, fixtures and small overrides. No generic logic in a customer app; no customer logic in a generic app; never fork a generic app per customer.
  - When a customer asks for something: if other customers could use it, build it in the generic app behind a setting; otherwise put it in the customer app. State which and why.
  - PACKAGE FOR PRODUCTION: Custom Fields, Property Setters, Server Scripts, Client Scripts and Customize Form changes made on a site are fine while working, but anything going to production must be packaged in an app: fixtures of the owning app (module set to that app's module, filtered fixtures) or install/patch code for fields and property setters; controllers, hooks and API files for server logic; the app's JS (doctype_js hooks) for client logic. Packaged changes are tested on a fresh site before release.
  - SUGGEST, DON'T MOVE: when site-only customisations exist, remind the user and suggest which app each belongs in (generic framith_<product> if other customers could use it, framith_<customer> if not; on a live customer site, the customer's app), with the reason. Move nothing until the user approves each item; never move items at random or in bulk. After a move is approved and tested, offer to remove the database-only copy; remove it only on a yes.
  - EXISTING NON-FRAMITH APPS (older customer or product apps with other names): be very careful. Report only: what's in them, what would change, the risk on live sites. Never rename, move, merge or delete their DocTypes, fields, fixtures or data without an approved plan, a backup, and a rehearsal on a copy of the site.
  - DRIFT CHECK (`node kit/driftcheck.mjs <site>`, read-only, no tokens): lists Custom Fields, Property Setters, Server Scripts, Client Scripts, Print Formats, Reports and Workspaces that exist on the site but in no app, with the suggested app for each. It only reports. Run it before every production release and on live customer sites weekly.
  - COMPLETE FEATURES: a generic app ships only when every requirement ID in its approved spec is built and tested. The checker blocks "done" while any ID is missing. Partial apps stay on a feature branch.
- MEDUSA: every Medusa plugin, module or extension Mithtech builds is named `mithusa-<name>` (npm package; keep the registry scope we already use, verify it). Same layering: generic `mithusa-<feature>` plugins first; customer-only code lives in that customer's Medusa project (or `mithusa-<customer>` if several of their stores share it).
- OTHER STACKS: no prefix rule yet; keep repo names. New rules are added here through the kit repo.
- NAMING AUDIT (report only): list every Mithtech-owned Frappe app and Medusa plugin that breaks these rules, with the proposed name, what a rename touches (Frappe: app and module names, DocType module fields, hooks, imports, fixtures, patches, installed apps on every site, repo name; Medusa: package name, imports, medusa-config, registry, dependants), the risk on live sites, and a suggested order. Write it to `docs/naming-audit.md` in the kit repo. Rename nothing; each rename is its own size-L program with gates and my approval.

## 3.1 Global CLAUDE.md (under 60 lines; loads in every session, so every line must earn its tokens)
- READ FIRST: project CLAUDE.md, then HANDOFF.md, then only the docs your task needs. If the repo has its own coordinator/brief/contract workflow (for example FieldOps, merqPOS), follow it.
- REUSE FIRST: before building anything, check the project's reuse index (.claude/index/), the Mithtech catalogue (kit `catalog/`), installed apps/modules/plugins and built-in platform features. If it exists or is easy to extend, STOP and tell me what and where, with extend-or-rebuild advice.
- SINGLE SOURCE OF TRUTH: every master record and setting has one owner (an existing DocType, module or table). Never create a duplicate DocType, model, field, table or setting; link to the owner instead of copying.
- NAMING AND LAYERING: section 3.0 rules (framith_, mithusa-, generic first, customer layer).
- PLACEMENT: code goes in the existing app/module/plugin/crate that owns the domain. State where and why, with one alternative. New app/module/plugin/service needs my yes.
- GATES: size every task (S/M/L, section 3.2) and pass its approval gates before building. Build only what was approved, and all of it.
- PATTERNS: if a task matches a recipe in the kit's patterns, follow it and skip planning.
- ROUTING: load the stack skill (frappe-dev, medusa-dev, nextjs-js, rust-dev, other-stack) plus enterprise-core for business logic. Multi-session work: orchestrate.
- TOKENS: grep the index before reading code; read only needed lines; never re-read unchanged files; diffs, not full files; no echoing code; briefs, not pasted code; targeted tests while working, full gate once; no speculative features or extra dependencies.
- SAFETY: never force-push or push to main/master/production unless I ask; production deploys and production data changes need my explicit yes; backup before migrate; never edit vendored/upstream code (frappe, erpnext, hrms, india_compliance and other third-party apps, @medusajs core, node_modules, generated code); never copy databases between machines without asking.
- DONE = the project's gate passes, every approved requirement built and tested, no stub/mock on a feature claimed done, status updated.
- RUNNING APPS: follow the coding root CLAUDE.md (Offload) when present.
- COMMUNICATION: answer first. Label blocks **Telling** (facts, results, recommendations) and **Asking** (one question). At most 10 lines unless I ask for detail. No narration, no recap of what I said, no repeated questions.
- QUESTIONS AS OPTIONS: ask with the clickable question tool (AskUserQuestion) whenever it is available: 2–4 options, the recommended one first and marked (Recommended), short labels. Use plain text only when the tool is unavailable (for example in headless runs).
- CONFIRM FIRST (M and L tasks): before any work, restate the request in at most 7 bullets: Goal, In scope, Out of scope, Placement, Assumptions (only ones you can't check), Done when. Ask me to confirm with options (Correct / Change something). Skip for S tasks.
- WRITING STYLE (ASD-STE100 writing rules, without the restricted dictionary): one idea per sentence; instructions max 20 words, descriptions max 25; active voice; instructions start with a verb; one term per meaning, used the same way every time; no noun clusters of more than 3 words. Applies to messages, RULES.md, briefs, packs and reports; not to code or logs.
- FINAL REPORT (max 8 lines): branch, commits, gate result, deploy status, pending items, risks, tokens used vs budget.

## 3.2 Task sizes and approval gates (the orchestrate skill owns these)
- S (bug fix, one field, one small change, or a pattern match): G0 reuse check in one line, then build.
- M (one feature): CONFIRM FIRST bullets, G0, then ONE mini pack for approval: placement (generic or customer app), data changes (existing vs new), wireframe if it adds or changes a page, test plan, token estimate. Then build.
- L (module, app or program): CONFIRM FIRST bullets, then the full gates, organised by TOGAF ADM (table below):
  - G0 REUSE: Haiku reads the reuse index and catalogue and lists, per requirement, exists / extend / new, with the owner.
  - G1 ARCHITECTURE (TOGAF-lite, one pack per module): business capabilities, application placement (generic framith_/mithusa- app vs customer app), data model marking reused vs extended vs new entities, integration flows, key decisions as ADRs. Diagrams in Mermaid.
  - G2 WIREFRAMES: one low-fidelity wireframe per page (a single static HTML file per module, greyscale), each with a table of its functions, fields, roles and permissions.
  - G3 BUILD PLAN: waves in dependency order (data model and contracts first), one brief per unit with a token estimate, a tracker mapping every requirement ID to a brief, an owner (session or person) and a test.
  - I approve G1, G2 and G3 in that order, per module, on ONE REVIEW PAGE: `node kit/review.mjs <slug>` serves a local page (localhost only) showing packs, rendered diagrams and wireframes, with Approve / Comment per item. It writes my decisions to `docs/programs/<slug>/approvals.md` (gate, module, date, git hash) and comments to questions.md. No tokens are spent on reviewing. The plan is then frozen; a change request re-opens only the affected pack and brief.
- TOGAF ADM MAPPING (lives in the orchestrate skill, so only large tasks load it; every output max one page, diagrams in Mermaid):
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
  | H Change Management | change requests and lessons (section 3.11) | L |
  | Requirements Management | requirement IDs tracked from G0 to tests | all |
  - G1 covers phases B, C and D; G2 wireframes follow phase C; G3 covers phases E and F.
  - The catalogue is the architecture repository: the generic framith_ and mithusa- apps are the reusable building blocks.
- LARGE SPECS (hundreds of pages): the orchestrator never reads the raw spec. An intake unit (Haiku) splits it into modules and gives every requirement an ID with a one-line index. Module planners (one session per module) read only their slice and write their pack. One architect pass (Opus) reads only the packs and merges the shared data model and placement, so modules never invent their own copies of shared masters.
- The checker fails any build that adds something not in an approved pack, or leaves a requirement ID without code and a test.

## 3.3 skills/orchestrate/SKILL.md (the most important part)
Trigger: I write ORCHESTRATE or PARALLEL, ask for a plan-then-build, or the task is size L.
- The orchestrator is the only session I talk to. Default Sonnet, medium effort, normal permission mode (it merges and asks me for approvals).
- STATE IN FILES, NOT CHAT: `docs/programs/<slug>/` (committed: requirements index, packs, wireframes, approvals, plan, tracker, ADRs) and `.claude/tasks/<slug>/` (gitignored: status.md, questions.md, routing log, token log). The orchestrator reads these small files instead of carrying a long history. It starts fresh between gates and waves and resumes with `ORCHESTRATE resume <slug>`.
- WORKER SESSIONS: started with the mechanism the current Claude Code supports (verified in section 0), each in its own worktree (`<repo>-worktrees/<unit>` or the repo's convention), in bypassPermissions mode, with the model and effort the routing table picks. Max parallel = the machine's local config. Each worker reads only its brief, the contracts it lists and the approved pack. A worker never talks to me: it writes questions to questions.md and returns one line: `<unit> | done or blocked | summary | tokens | questions or "none"`.
- PEOPLE AS WORKERS: a unit can be assigned to a developer instead of a session. The brief, tracker, owned-files rule and checker apply the same way.
- BRIEF FORMAT: goal, requirement IDs, owned files, contracts to read, constraints, done criteria, gate command, token estimate. Never paste code. The orchestrator writes the owned-file globs to `.claude/owns.txt` in the worker's worktree; the hook reads it.
- WAVES: wave 0 (data model, contracts, shared types) is built and merged before any feature unit starts. Units in a wave own disjoint files.
- INTEGRATE one unit at a time into feat/<slug>. The orchestrator never re-reads worker code; the checker reads diffs.
- TOKEN BUDGET: each unit's usage goes to the token log. When a unit passes 150% of its estimate, the orchestrator pauses it and asks me: continue, simplify or stop.
- QUESTIONS: the orchestrator asks me held questions one at a time and routes each answer back to its unit.
- STOP RULE: retry a failed unit once at the same setting, then escalate one step (effort first, then model), then park it as a question.
- SHIP: push feat/<slug>; deploy to staging if configured; production only after my yes.
- LEARN (end of each program, checker): write lessons per section 3.11.
- CLEANUP (Haiku): remove worktrees and branches only for units that are done, merged and checked.
- If a repo has its own coordinator workflow, map this skill onto it (its briefs, contracts and status files) instead of creating a second one.

## 3.4 Model and effort routing (one file: routing.json, so models can change without editing skills)
Verify the current models (Haiku 5.5, Sonnet 5.5, Opus 5.5, Fable 5.1 at the time of writing) and effort levels (low, medium, high, xhigh, max). Place Fable by its documented positioning; don't guess. Defaults:
| Work | Model / effort |
|---|---|
| File search, cleanup, status lines, index refresh | Haiku / low |
| Spec intake, G0 reuse check, docs, boilerplate | Haiku / medium |
| Orchestrator, wireframes, simple fixes, Next.js/JS sites | Sonnet / low to medium |
| Frappe features (Custom Fields, hooks, controllers, reports), Medusa features, tests, checker | Sonnet / medium |
| Rust features (fewer compile-fix loops), Medusa workflows with compensation, integrations, risky small changes | Sonnet / high |
| Unfamiliar stacks (Go, Flutter, TDL, others): docs lookup first | Sonnet / high |
| G1 architecture, contracts, data model, migrations | Opus / high |
| Accounting/ledgers, multi-company, payments, tenancy/security, offline sync, merge conflicts | Opus / xhigh |
| Hard bugs after escalation fails; final review of a large program | Opus / max |
- The orchestrator may move one step up or down for a specific task, with a one-line reason in the routing log. Anything touching money, permissions, production data or shared contracts is at least Sonnet / high.
- Pick the cheapest setting likely to succeed the first time; a retry costs more than one step up.
- The machine's local config may remap models the account doesn't have.

## 3.5 Reuse index and duplicate checker (the biggest token savers)
- A Haiku unit builds `.claude/index/` per project (gitignored), refreshed only when the files it was built from change (store their hashes).
- Frappe: a read-only dump from the site's metadata (verify the right bench command): every DocType with app, module, fields (fieldname, label, type, options), Custom Fields, Property Setters, Reports, Workflows, Workspaces, Print Formats, Single settings, hooks (doc_events, overrides) per app. Grep it; never open DocType JSON to check whether something exists.
- Medusa: modules, data models, links, workflows, steps, routes, subscribers, admin widgets, installed plugins and their options.
- Others: packages/crates/modules, public types, routes, DB tables from migrations.
- DUPLICATE CHECKER (`node kit/dupcheck.mjs`, no tokens): compares new or changed DocTypes, fields, models and settings against the index with name and label similarity (for example `gst_no` vs `gstin`, `cust_mobile` vs `mobile_no`) and type and options matches. Runs in the pre-commit hook and in each project's CI. A hit fails the commit unless the brief marks it as intended with a reason.
- CI CHECK PER PROJECT: the same dupcheck plus naming and placement checks run on every pull request (GitHub Actions; pre-commit hook as fallback), so developers who don't use Claude follow the rules too.

## 3.6 Stack skills (short rules; loaded only when the stack matches)
### frappe-dev
- SINGLE SOURCE OF TRUTH: ERPNext/Frappe masters are the only owners of their data: Company, Customer, Supplier, Item, Item Group, UOM, Price List, Employee, Address, Contact, Account, Cost Center, Warehouse, Tax templates, and the masters of HRMS, India Compliance and our framith_ apps. Never create a DocType or field that duplicates one (for example a custom GSTIN field when India Compliance already has one, or a second wallet app). Link fields, not copied values; fetch_from for read-only display. Computed values aren't stored unless needed for performance, and then say why.
- Classify every app as OWN or VENDORED (vendored includes our forks of frappe/erpnext). Never edit vendored apps unless I ask.
- Generic framith_<product> app first, customer framith_<customer> app for customisations (section 3.0).
- Extend first: Custom Fields, Property Setters, doc_events, override_doctype_class, hooks, standard reports, Print Designer, Workflows. New DocType only after G0 shows nothing to extend.
- Check across our framith_ apps too: one domain, one owning app.
- Logic for production lives in app code; site-only Server/Client Scripts and Customize Form changes are packaged into the suggested app before release, after the user approves (section 3.0). frappe.qb or get_all with explicit fields; no SQL concatenation; no get_doc in loops; db.get_value, bulk ops, frappe.enqueue (idempotent), frappe.cache, search_index on filtered fields.
- Permissions: whitelisted functions check permissions; ignore_permissions only with a comment; roles and User Permissions, never hardcoded users; respect company filters.
- Accounting: never write GL/Stock ledger rows by hand (use ERPNext controllers); respect submit/cancel/amend, accounting dimensions, fiscal years. Indian tax through india_compliance.
- Settings in one Single "Settings" DocType per app; nothing hardcoded. Strings in _(). Naming series.
- Distributable: fixtures filtered by module/app; idempotent patches in patches.txt; required_apps; version branch; README, CHANGELOG, semver; clean after_install/before_uninstall.
- Gate: FrappeTestCase for every DocType touched; module tests while working, app tests before push; `bench --site <site> backup` before migrate; migrate automatically only on dev/test sites; `bench build --app <app>` for the changed app only.
### medusa-dev
- Detect the version; rules are for v2 (say so if v1).
- Check built-in commerce modules, installed and our mithusa- plugins, src/modules, workflows and routes first. New project: check medusa-factory before hand-assembling.
- PLACEMENT ORDER (state which and why): 1) the existing module/plugin that owns the domain, 2) a generic mithusa- plugin if reusable across clients, 3) the customer's project src/ if customer-only. New module/plugin needs my yes.
- Extend, don't fork: module links, workflow hooks and steps, subscribers, src/api routes, admin widgets, Query for cross-module reads. ERPNext is the book of record for invoices and tax when connected; Medusa never recalculates statutory tax.
- Logic in workflows with compensation; thin zod-validated routes; model.define; CLI migrations; no cross-module DB access; strict TS, no any; webhooks verified and idempotent.
- Plugins: semver, @medusajs/* as peerDependencies, README + CHANGELOG, published to the private registry with the user's own npm config (never a token in a file).
### nextjs-js
Reuse components; no new framework or dependency without asking; config from env; accessibility and performance budgets; on CMS/marketing sites no URL may change and SEO checks must pass; lint, typecheck, format before commit.
### rust-dev
Core crates never depend on network or connectors; no unwrap/todo! on feature paths; clippy clean with repo config; `cargo test -p <crate>` while working, full gate before push; limit build parallelism; Tauri commands are thin wrappers over core; generated TS types committed.
### other-stack
For Go, Flutter, Python, TDL and anything else: read the project's CLAUDE.md for its gate; follow the stack's official style and linters; look up docs before writing unfamiliar APIs; same reuse, SSOT, placement and safety rules.
### enterprise-core (for any business logic, all stacks)
Tenant from the session, never the request; server-side permission plus record scope; money and quantities never floats, no money math in the UI; posted documents immutable, corrections are new documents; document and outbox row in one transaction; idempotency keys on commands and webhooks; retries with backoff and dead-letter; offline sync versioned with tested conflict rules; migrations backward-compatible; PII masked in logs; no N+1, paginate everything; a regression test for every bug fixed.

## 3.7 Patterns (kit `patterns/`, one short recipe each)
Ready answers for common tasks so they skip planning: package site customisations (driftcheck, suggest the app per item, move only approved items, test on a fresh site, remove database-only copies only on a yes), field on a standard master (Custom Field + fixture in the right framith_ app), customer-specific print format, new setting (Single Settings DocType field), report on existing data (Query/Script Report, no new table), webhook in/out (signature check, idempotency key, background job, integration log), Medusa link to a core model, Medusa admin widget, scheduled job. Recipes grow through the learning loop.

## 3.8 Agents (minimal tools, one-line descriptions; model/effort from routing.json)
light, worker, architect, checker (read, test, lint only; checks against approved packs, naming and layering, SSOT, placement, stack rules, enterprise-core and requirement coverage), cleanup (git and file tools only), indexer (builds .claude/index and catalogue entries).

## 3.9 Hooks (Node; each under 60 lines; they are the guardrails for bypass mode)
- PreToolUse: block force-push, pushes to main/master/production, production deploys and migrations on non-dev sites; block reads of .env*, credentials folders, ~/.ssh, *.pem; block edits to vendored paths (listed per project in `.claude/vendored.txt`); in worker sessions, block edits outside `.claude/owns.txt` and to contract files.
- SessionStart: kit self-update check (section 1), then at most 5 lines: project, stack, branch, active program and gate, which CLAUDE.md/HANDOFF.md to read.
- Coexist with the existing Offload hook; don't duplicate it. Each hook is tested once with sample input.

## 3.10 settings.json (merged by the installer; verify syntax)
- ALLOW: git status/diff/log/add/commit/branch/checkout/worktree/merge; gh pr; npm/yarn/pnpm install, run, test; cargo check/test/clippy/fmt; go build/test/vet; flutter analyze/test; pytest, ruff; bench build, run-tests, migrate on dev/test sites; Medusa db generate/migrate in development; read-only offload/docker/kubectl; the kit's own scripts.
- DENY: force-push; pushes to main/master/production; edits to vendored apps and node_modules; reading .env* (allow .env.example), credentials folders, ~/.ssh, *.pem.
- ASK: deploys, package publish, database restore/drop, docker/kubectl writes, `offload down`.

## 3.11 Learning loop and Mithtech catalogue (stored in this kit repo)
- LESSONS: at the end of a program or a fixed bug, the checker records each real mistake with a cause tag: `kit-gap` (a rule or pattern was missing or wrong), `stack-gotcha` (a trap in Frappe, Medusa, Rust…), or `prompt-issue` (the request was unclear or wrong). Only kit-gap and stack-gotcha are submitted; prompt-issue lessons are dropped, so one person's bad prompting never becomes a rule for everyone. Format: stack, cause, one-line lesson, one-line fix, source project. Project-only gotchas go to that project's CLAUDE.md Gotchas section (max 15 lines) instead.
- Lessons reach the kit only when I accept them in `maintain.mjs`. Each accepted lesson becomes a rule, pattern or gotcha in the right skill, written in the kit's rule style: one line, imperative, specific, with the reason in a few words if it isn't obvious (for example "Frappe: export Custom Fields with a module filter; blanket fixtures overwrite other apps."). Merge it with an existing rule instead of adding a near-duplicate; delete rules that turn out wrong.
- HUMAN-READABLE RULES: `RULES.md` at the repo root is the same rule set for people: grouped by stack, one line per rule, plain English, no Claude-specific wording, under 150 lines. `maintain.mjs` regenerates it whenever rules change, so the two never disagree.
- CATALOGUE (`catalog/`, built as we go): whenever the indexer reads a project, it adds or updates one entry per Mithtech-owned app, plugin or service: name, stack, repo, one-line purpose (max 120 characters), main DocTypes/models, owner domain, status. G0 searches it, so a feature that exists in any Mithtech project is found before anyone rebuilds it. Catalogue entries merge automatically after validation.

## 3.12 Templates
CLAUDE.frappe.md, CLAUDE.medusa.md, CLAUDE.web.md, CLAUDE.rust.md, CLAUDE.generic.md, each under 80 lines with: Purpose (1 line), Stack and versions, Gate command, Where things live, Generic vs customer apps, OWN vs VENDORED, Project hard rules, Data home and deploy, Gotchas (max 15 lines), link to HANDOFF.md. Plus brief.md, pack.md, approvals.md, wireframe.html, tracker.md for the orchestrator.

# 4. PER-PROJECT SETUP (first computer only; committed to each project's repo)
- Write CLAUDE.md from detected facts and HANDOFF.md; link HANDOFF.md, don't copy it. If a CLAUDE.md exists, merge a short kit section and keep the rest.
- Write `.claude/vendored.txt`. Add `.claude/tasks/` and `.claude/index/` to .gitignore.
- Show me each file and ask before committing.
- Propose missing pre-commit hooks, linters, dupcheck, secret scanning and CI per stack; install only after my yes.

# 5. PILOT (before pushing the kit)
On each pilot project run read-only dry runs and show me the result in 5 lines each:
1. Frappe: "add a GSTIN field to Customer" must find the existing India Compliance field and stop.
2. Frappe: "build a customer wallet DocType" must find the existing wallet app and stop.
3. Frappe: "add a field only customer X needs" must place it in framith_<customer>, not the generic app.
4. Medusa: "add product reviews" must find the existing reviews plugin.
5. Any: a size-M request must first show the CONFIRM FIRST bullets as clickable options and wait.
6. Any: a size-L request must produce G0 and a G1 pack mapped to TOGAF phases, open the review page, and wait without building.
7. Orchestrator: a 3-unit plan must show units, owned files, model/effort with reasons and token estimates, and start no session before my yes.
8. Hooks: a worker editing a file outside its brief, a force-push and an .env read must all be blocked.
9. Dupcheck: a new field `gst_no` on Customer must be flagged.
10. Driftcheck: on a dev site, a Custom Field and a Server Script made in the UI must be listed with a suggested app, and nothing is moved without approval.
Fix the kit if any fails. Report token use per dry run.

# 6. VERIFY AND REPORT
- Validate all frontmatter, JSON, hook scripts; run `node kit/install.mjs --doctor`.
- List every file created or changed (one line each) and the backups.
- Report conflicts with existing project rules, and the naming audit (section 3.0).
- Recommend, don't create: shared enterprise-core library, a routine to refresh PROJECTS.md.
- Give me: the 2-line text for Claude Settings → Instructions (it only points to the kit), the one-command install for other computers, and what I must do now (restart, or start a new session).
