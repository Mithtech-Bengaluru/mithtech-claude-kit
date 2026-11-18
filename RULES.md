# Mithtech development rules

The rules every Mithtech developer follows, with or without Claude, grouped by concept. Each rule has a fixed id.
The sections up to Communication apply to every session (the global CLAUDE.md); each stack section loads with its skill.
Generated from `kit/rules.json` by `node kit/scripts/rules.mjs`; edit that file, not this one.

## Session start
- E17: At session start, read the project CLAUDE.md, then HANDOFF.md, then only the docs the task needs. Follow the repo's own coordinator, brief or contract workflow when it has one (for example FieldOps, merqPOS).
- E18: When a task matches a recipe in `<kit>/patterns/`, follow it and skip planning.
- E19: Before you change code, load the stack skill. Also load enterprise-core when the change touches business rules or data. Use the orchestrate skill for multi-session work.
- E20: Before you start a session, worker or subagent, get its model and effort from `node <kit>/scripts/route.mjs <route-id|describe:work> [--floor id]`. Pass both on the call.
- E21: To run an app, follow the coding root CLAUDE.md (Offload) when it exists.

## Reuse
- E01: Before you build, check the project index, the catalogue (`<kit>/../catalog/`), installed apps, modules, plugins and components, and built-in features. If something exists or extends easily, stop: say what and where, and advise extend or rebuild.
- N01: Add no new framework or dependency without approval.

## Single owner
- E02: Give every master record and setting one owner: an existing DocType, module or table. Link to the owner; never copy it or create a duplicate DocType, model, field, table or setting.

## Placement
- E03: Put code in the existing app, module, plugin or crate that owns its domain. State where and why, with one alternative.
- E23: Get approval before you create a new app, module, plugin or service.
- E16: Build the generic, setting-driven app first. Put a change other customers could use in the generic app, behind a setting. Put every other change in that customer's one customer app. Say which and why.

## Task size and approvals
- E04: Size every task before you start. S (bug fix, one field, small change, pattern match): do a one-line reuse check, then build. M (one feature): confirm it (C01) and check reuse. Then get approval for one mini pack: placement, data changes (existing or new), wireframe and flow if a page changes, test plan, token estimate. L (module, app, program): use the orchestrate skill.
- E05: Build everything that was approved, and nothing that was not.
- E24: Show the full item in chat with every approval request: pack, wireframe, diff, contract change or screenshot. A path or summary is not enough; relay a worker's pack in full.
- E08: Get explicit approval before every production deploy and every production data change.

## Screens and UI
- E14: For a task that adds or changes a screen, get three approvals, in order. 1: wireframe. 2: software flow (Mermaid: screens, actions, states, roles, errors, empty and loading). 3: UI/UX review against TonalDepth (layout, accessibility, light and dark, mobile). Build only after all three. Show screenshots next to them at each UI milestone. A screen change re-opens only the affected approval.
- E25: Build every UI with TonalDepth (`<coding root>/tonaldepth`, npm `@mithtech-bengaluru/tonaldepth-*`): its tokens, Mithtech colours, subtle claymorphism, light and dark modes. Use no raw colours and no outline-only depth. Copy this rule into every UI brief.

## Git and GitHub
- E07: Never force-push or push with --all or --mirror. Run the project's gate before you push main; `git ship` runs it and opens the PR.
- E12: Use only free GitHub features: no Actions, required status checks, Codespaces or Copilot. Before every pull request, run the gate locally or on the home cluster (Offload), and put the result in the PR body.
- E13: With live git sync on (`<kit>/docs/two-macs.md`), work on `wip`. SessionStart pulls it, Stop pushes it after each turn, and a job syncs idle repos. When SessionStart says PAUSED, help clear it first. Never commit a `*.sync-conflict-*` file.

## Secrets
- E10: Read secrets and configuration from environment variables. Keep secrets out of git, images, logs and shared files.

## Databases
- E28: Back up the database before every migration.
- E11: Never copy a database between machines without asking.

## Third-party code
- E09: Never edit vendored code: frappe, erpnext, hrms, india_compliance, other third-party apps, our forks of them, @medusajs core, node_modules, generated code.

## Testing and done
- E29: Run targeted tests while you work, and the full gate once before you push.
- E06: Call a task done only when its gate passes locally and every approved requirement is built and tested, with no stub or mock. Then update the status.
- E26: Before a test that drives or captures the screen, move every monitor to an empty desktop (Mission Control). Never test over open windows. Copy this rule into every GUI-test brief.
- E30: After you fix a bug or finish a program, record lessons with `node <kit>/scripts/contribute.mjs lesson ...`.

## Tokens
- E22: Grep the index before you read code. Read only the lines you need, and never re-read an unchanged file.
- E31: Show diffs, not full files; never echo code. Write briefs in words, not pasted code.

## Communication
- C02: Answer first. Keep a message to 10 lines unless asked for detail. Do not narrate, recap the request or repeat a question.
- C07: Label message blocks **Telling** (facts, results, recommendations) and **Asking** (one question).
- C01: Ask one question at a time: 2 to 4 options with short labels, the recommended one first and marked (Recommended), with AskUserQuestion when available. Before an M or L task, restate it in at most 7 bullets: goal, in scope, out of scope, placement, assumptions you cannot check, done when. Then ask: Correct / Change something.
- C04: Write one idea per sentence. Keep instructions under 20 words and descriptions under 25. Apply C04 to C06 to messages, briefs, packs and reports, not to code or logs.
- C05: Use active voice. Start every instruction with a verb.
- C06: Use one term for one meaning, every time. Avoid noun clusters of more than 3 words.
- C08: End a task with a report of at most 8 lines: branch, commits, gate result, deploy status, pending items, risks, tokens used vs budget.

## Frappe / ERPNext (skill frappe-dev)
- F01: Name every Mithtech app `framith_<name>` (snake_case). Show users only the product name: `framith_tradedeal` shows "Trade Deal" in app_title, labels, page titles and the README.
- F03: Keep only that customer's Custom Fields, Property Setters, print formats, workspaces, fixtures and small overrides in the customer app `framith_<customer>`. List the generic apps in its required_apps. Never put a customer check in generic code, and never fork a generic app per customer.
- F19: Keep each app's settings in one Single Settings DocType; hardcode nothing. Wrap user-facing strings in _(). Use naming series.
- F05: Treat these masters as owners: Company, Customer, Supplier, Item, Item Group, UOM, Price List, Employee, Address, Contact, Account, Cost Center, Warehouse, tax templates, and the masters of HRMS, India Compliance and our framith_ apps. Never duplicate one: India Compliance has `gstin`; customer_wallet exists. Use Link fields, and fetch_from for read-only display.
- F06: Store no computed value unless a measured query is too slow. Then record why in the PR.
- F07: Extend before you create: Custom Fields, Property Setters, doc_events, override_doctype_class, hooks, standard reports, Print Designer, Workflows. Create a DocType only when nothing can be extended.
- F09: Classify every app as OWN or VENDORED in `.claude/vendored.txt`.
- F10: Make site-only changes (Custom Fields, Property Setters, Server and Client Scripts, Customize Form) freely while you work. Before production, package them in the owning app. Put fields in fixtures (F13) or install and patch code. Put server logic in controllers, hooks and API files, and client logic in doctype_js. Test the packaged changes on a fresh site.
- F11: When site-only changes exist, suggest an app for each, with the reason. Move nothing without approval, and never in bulk. Remove the database copy only after a tested move and a yes.
- F12: Before you change an older app without the `framith_` prefix, report its contents and the risk. Change it only with an approved plan, a backup and a trial on a site copy.
- F13: Export Custom Fields and Property Setters as fixtures filtered by module. Blanket fixtures overwrite other apps.
- F14: Put data changes in idempotent patches listed in patches.txt.
- F15: Query with frappe.qb, or with get_all and explicit fields. Prefer db.get_value, bulk operations, idempotent frappe.enqueue jobs, frappe.cache and search_index on filtered fields. Never concatenate SQL, and never call get_doc inside a loop.
- F16: Check permissions in every whitelisted method. Use ignore_permissions only with a comment that says why. Use roles and User Permissions, never hardcoded users. Respect company filters.
- F17: Never write GL or stock ledger entries by hand; use the ERPNext controllers. Respect submit, cancel and amend, accounting dimensions and fiscal years.
- F20: Make apps distributable: required_apps, a version branch, README, CHANGELOG, semver, and clean after_install and before_uninstall hooks.
- F21: Write FrappeTestCase tests for every DocType you touch.
- F22: Migrate automatically only on dev and test sites.
- F23: Run `bench build --app <app>` only for the app you changed.
- F24: Run the drift check (`node <kit>/driftcheck.mjs <site>`) before every production release and weekly on live customer sites.
- F25: Keep a generic app on a feature branch until every requirement ID in its approved spec is built and tested.

## Medusa (skill medusa-dev)
- M01: Name every Mithtech plugin, module or extension `mithusa-<name>`. Show users only the product name in admin labels, page titles and the README.
- M03: Detect the Medusa version. These rules are for v2; say so when a project is v1.
- M04: Before you build, check the built-in commerce modules, installed plugins, our mithusa- plugins, src/modules, workflows and routes. For a new project, check medusa-factory first.
- M05: Place code in this order: the module or plugin that owns the domain, a generic mithusa- plugin, then the customer project's src/. Say which and why.
- M02: Put customer-only code in the customer's Medusa project, or in `mithusa-<customer>` when several of their stores share it.
- M06: Extend core, never fork it: module links, workflow hooks and steps, subscribers, src/api routes, admin widgets, and Query for cross-module reads.
- M08: Put business logic in workflows with compensation. Keep routes thin and validate them with zod.
- M09: Define models with model.define and generate migrations with the CLI. Never access another module's tables.
- M10: Use strict TypeScript with no `any`. Verify the signature of every webhook.
- M11: Publish plugins as `@mithtech-medusa/mithusa-<name>` to the private registry, with your own npm config. Use semver, @medusajs/* as peerDependencies, a README and a CHANGELOG.

## Next.js and JS sites (skill nextjs-js)
- N03: Pass the project's accessibility and performance checks before every pull request.
- N04: Change no URL on CMS and marketing sites. Keep the SEO checks passing.
- N05: Run lint, typecheck and format before every commit.

## Rust (skill rust-dev)
- R01: Keep core crates free of network and connector dependencies.
- R02: Use no unwrap or todo!() on feature paths.
- R03: Keep clippy clean with the repo's config.
- R04: Limit build parallelism with `CARGO_BUILD_JOBS=4` (or `-j 4`).
- R05: Keep Tauri commands as thin wrappers over core. Commit the generated TypeScript types.

## Other stacks (Go, Flutter, Python, Tally TDL, Docker/k3s) (skill other-stack)
- O01: Read the project's CLAUDE.md for its gate command. If it has none, propose one and ask.
- O02: Follow the stack's official style guide and linters.
- O03: Read the official docs before you use an unfamiliar API.

## Business software (all stacks) (skill enterprise-core)
- B01: Take the tenant from the logged-in session, never from the request.
- B02: Check permissions and record scope on the server, not only in the UI.
- B03: Never use floats for money or quantities. Do no money math in the UI.
- B04: Never edit a posted document. Make each correction a new document.
- B05: Write the document and its outbox row in one transaction.
- B06: Put idempotency keys on every command and webhook. Retry with backoff, then send failures to a dead-letter queue.
- B07: Version offline sync and test its conflict rules.
- B08: Keep migrations compatible with the previous release. Make every data change safe to run twice. Rehearse it on a copy of production data.
- B09: Mask personal data in logs.
- B10: Never run a database query inside a loop over records. Paginate every list endpoint.
- B11: Add a regression test for every bug you fix.
- B12: Calculate Indian tax only with India Compliance. When Medusa connects to ERPNext, ERPNext owns invoices and tax; Medusa never recalculates statutory tax.

Lessons and gotchas (29): `lessons` in kit/rules.json, shown in each stack skill.
