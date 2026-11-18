# Mithtech development rules

The rules every Mithtech developer follows, with or without Claude. One line each. Updated as we learn.
Generated from `kit/rules.json` by `node kit/scripts/rules.mjs`; edit that file, not this one.

## Everyone
- Check what already exists before building: our apps and plugins, installed apps, and the platform's built-in features.
- Give every record and setting one owner. Link to it; never copy it or create a second version.
- Put code in the app or module that owns the feature. A new app, plugin or service needs approval.
- Size the task first. Small: build. Medium: one plan approval. Large: approve architecture, wireframes, software flow, UI/UX and build plan before building. Any screen change: approve wireframe, then flow, then UI/UX, and show screenshots against them while building.
- Build everything that was approved, and nothing that was not.
- Call a task done only when the project's checks pass, every approved requirement is built and tested, and nothing is stubbed.
- Never push to main, master or production, and never force-push, without approval.
- Get explicit approval for production deploys and production data changes. Back up before any migration.
- Never edit third-party or upstream code (frappe, erpnext, hrms, india_compliance, @medusajs core, node_modules, generated code).
- Keep secrets out of git, images, logs and shared files. Use environment variables.
- Never copy a database between machines without asking.
- We use GitHub Free. Do not add or rely on GitHub Actions, required status checks, Codespaces, Copilot or other paid GitHub features. Run the gate locally (or on the home cluster with Offload) before every pull request and put the result in the PR.
- Where live git sync is on (one person's own Macs; kit/docs/two-macs.md): work on the sync branch `wip`, which the job and the session hooks commit and push. Put finished work on main only with `git ship` (local gate, PR, squash-merge). Never push main directly, never force-push, never commit a secret or a `*.sync-conflict-*` file.

## Communication
- Before a medium or large task, restate it in at most 7 bullets (goal, scope, placement, assumptions, done when) and get a yes.
- Give the answer first. Keep messages to 10 lines unless detail is asked for.
- Ask one question at a time, with 2 to 4 options and the recommended one first.
- Write one idea per sentence. Keep instructions under 20 words and descriptions under 25.
- Use active voice. Start instructions with a verb.
- Use one term for one meaning, every time. Avoid noun clusters of more than 3 words.

## Frappe / ERPNext
- Name every Mithtech app `framith_<name>` (snake_case). Users see only the product name: app_title, labels, page titles and the README title never say "Framith" (`framith_tradedeal` shows "Trade Deal").
- Build the generic product app first (`framith_<product>`), complete and configurable through its Single Settings DocType.
- Put each customer's changes in their own app (`framith_<customer>`), which lists the generic apps in required_apps. No customer logic in generic apps; never fork a generic app per customer.
- If other customers could use a change, build it in the generic app behind a setting. Otherwise put it in the customer app. Say which and why.
- Use the standard masters (Company, Customer, Supplier, Item, UOM, Price List, Employee, Address, Contact, Account, Cost Center, Warehouse, tax templates). Never duplicate a DocType or field; check India Compliance, HRMS and our framith_ apps too.
- Do not store computed values unless performance needs it, and then say why.
- Extend before creating: Custom Fields, Property Setters, doc_events, override_doctype_class, hooks, standard reports, Print Designer, Workflows. Create a DocType only when nothing can be extended.
- Keep one owning app per domain across all our framith_ apps.
- Classify every app as OWN or VENDORED. Never edit vendored apps (including our forks of frappe and erpnext) unless asked.
- Site-only changes (Custom Fields, Property Setters, Server/Client Scripts, Customize Form) are fine while working. Package them in the owning app before production.
- When site-only changes exist, suggest which app each belongs in, with the reason. Move nothing without approval, and never in bulk. Remove the database-only copy only after a tested move and a yes.
- Treat older apps without the `framith_` prefix with care: report first; change them only with an approved plan, a backup and a trial on a copy of the site.
- Export Custom Fields and Property Setters as fixtures filtered by module; blanket fixtures overwrite other apps.
- Put data changes in idempotent patches listed in patches.txt.
- Query with frappe.qb or get_all with explicit fields. No SQL string concatenation and no get_doc inside loops.
- Check permissions in every whitelisted method. Use roles and User Permissions, never hardcoded users. Respect company filters.
- Never write GL or stock ledger entries by hand; use ERPNext controllers. Respect submit, cancel and amend, accounting dimensions and fiscal years.
- Send Indian tax through India Compliance.
- Keep settings in one Single Settings DocType per app; hardcode nothing. Wrap strings in _(). Use naming series.
- Make apps distributable: required_apps, version branch, README, CHANGELOG, semver, clean after_install and before_uninstall.
- Write FrappeTestCase tests for every DocType you touch. Run module tests while working and app tests before push.
- Run `bench --site <site> backup` before migrate. Migrate automatically only on dev and test sites.
- Run `bench build --app <app>` only for the app you changed.
- Run the drift check before every production release and weekly on live customer sites.
- Ship a generic app only when every requirement ID in its approved spec is built and tested. Keep partial apps on a feature branch.
- Run deletes in bench console with frappe.db.commit(); bench execute did not commit a frappe.client.delete.
- Drop the column yourself after deleting a test Custom Field on a dev site; Frappe keeps the database column.
- Name the controller class exactly as the DocType without spaces, acronyms as written (`SCException`); a title-cased class makes migrate delete the DocType as an orphan.
- Guard engine-only fields with a higher permlevel or a validate check; Frappe does not enforce read-only fields on the server, so the REST API can change them.
- Read child-table values from the browser with frappe.client.get_value and `parent` set; frappe.db.get_value on a child DocType returns only name.
- Set a custom new-record dialog in the listview `primary_action`; Frappe 16 resets the Add button after listview onload.
- Follow `amended_from` in submit hooks, or block amending system-made documents; Cancel-then-Amend gives a new name.
- Take the row lock first in the transaction, or read balances with locking reads; MariaDB keeps the old snapshot after plain reads.
- Load the same app checkout for every bench call on a site, and clear the site cache after one that did not; Redis caches the module map per site.
- Rename an app in this order: add the new package beside the old, switch dependents, rename each site, migrate, remove the old package. Rehearse on a throwaway site through its own apps file.
- Read dict hooks per app in install order (Frappe merges them into lists of values). In hook tests, assert on the doctype keys and add a positive control.
- Fill the item-wise rates JSON for every item when a script sets a Bill of Entry IGST row to Actual; India Compliance rejects it empty.
- Wrap the ERPNext test bootstrap to relax only the India Compliance checks it fails (zero-rate template, no HSN, non-GST state); load test data once on the baseline site.
- Translate at request time only; translating labels at module import freezes the first request language in each worker.
- Put the nvm Node 24 folder first on PATH before get-app or build on a server; a non-interactive ssh shell picks the system Node.
- Patch shared dicts once in the main thread around worker threads; mock.patch.dict inside threads leaks the patched value.

## Medusa
- Name every Mithtech plugin, module or extension `mithusa-<name>` and keep our npm scope (`@mithtech-medusa/mithusa-<name>`). Users see only the product name: admin labels, page titles and the README title never say "Mithusa".
- Build generic `mithusa-` plugins first. Put customer-only code in the customer's Medusa project, or in `mithusa-<customer>` if several of their stores share it.
- Detect the Medusa version. These rules are for v2; say so when a project is v1.
- Check built-in commerce modules, installed plugins, our mithusa- plugins, src/modules, workflows and routes before building. For a new project, check medusa-factory first.
- Place code in this order and say which and why: the module or plugin that owns the domain, a generic mithusa- plugin, then the customer project's src/. A new module or plugin needs approval.
- Extend, never fork core: module links, workflow hooks and steps, subscribers, src/api routes, admin widgets, Query for cross-module reads.
- Treat ERPNext as the book of record for invoices and tax when connected. Medusa never recalculates statutory tax.
- Put business logic in workflows with compensation. Keep routes thin and zod-validated.
- Define models with model.define and generate migrations with the CLI. No cross-module database access.
- Use strict TypeScript with no `any`. Verify webhooks and make them idempotent.
- Publish plugins with semver, @medusajs/* as peerDependencies, README and CHANGELOG, to the private registry with your own npm config; never put a token in a file.

## Next.js and JS sites
- Reuse existing components. Add no new framework or dependency without approval.
- Read configuration from the environment.
- Keep accessibility and performance budgets.
- On CMS and marketing sites, change no URL; SEO checks must pass.
- Run lint, typecheck and format before every commit.
- Read every statement Payload migrate:create generates; strip changes outside your collections and list that drift in the PR.
- Start Web Workers inline from a blob URL at module load, before long synchronous work, and allow blob: workers in the CSP; Chrome starts a URL worker only on a free main-thread task.
- Add a silence watchdog (about 12 s without host messages) to WebRTC guests; a crashed host leaves the data channel open and close never fires.
- Build production in a checkout with its own deps and env, or use the release image build as the check; worktree builds fail on symlinked node_modules and blocked env.
- Compose TonalDepth pages without a bare main element and write actions as buttons; compat styles hit bare main and link colour beats component classes.
- Check layouts at the real inner width (the browser pane can be narrower than requested), test a minimum width per main area, set the theme per check, and confirm the pane is visible (a hidden pane freezes animations).

## Rust
- Keep core crates free of network and connector dependencies.
- Use no unwrap or todo!() on feature paths.
- Keep clippy clean with the repo's config.
- Run `cargo test -p <crate>` while working and the full gate before push. Limit build parallelism.
- Keep Tauri commands as thin wrappers over core. Commit generated TypeScript types.
- Add the register and remove listener commands to a Tauri 2 mobile plugin command list and default permissions, then test on an emulator; otherwise events never reach the UI.

## Other stacks (Go, Flutter, Python, Tally TDL, Docker/k3s)
- Read the project's CLAUDE.md for its gate command.
- Follow the stack's official style guide and linters.
- Look up the official docs before using an unfamiliar API.
- Apply the same reuse, single-owner, placement and safety rules as every other stack.
- Read Meta Embedded Signup phone and account IDs from the popup message event, and request contacts and history sync right after onboarding; it expires in 24 hours.
- Attach Playwright to Android WebView with its Android device API (not plain CDP) and clear colour-scheme emulation before theme checks.
- Request the local network permission for Android 17 (API 37) apps that reach private addresses: debug builds always, release builds only for private LAN servers.

## Business software (all stacks)
- Take the tenant from the logged-in session, never from the request.
- Check permissions and record scope on the server, not only in the UI.
- Never use floats for money or quantities. Do no money math in the UI.
- Never edit posted documents. Corrections are new documents.
- Write the document and its outbox row in one transaction.
- Put idempotency keys on commands and webhooks. Retry with backoff and a dead-letter queue.
- Version offline sync and test its conflict rules.
- Keep migrations compatible with the previous release.
- Mask personal data in logs.
- Avoid N+1 queries. Paginate every list.
- Add a regression test for every bug you fix.
- Read a payout balance as of the run date (or block overlapping runs) and test out-of-order periods; mixed dates paid one balance twice.
- Cap text length before PII regexes, keep dates out of the phone pattern and test date-plus-phone strings; long text made the email pattern quadratic.
- Make every database change safe to run twice and rehearse it on a copy of production data; a branch script can repeat changes production already has.
- Start local test servers with an allow-list of env vars (database URL, app secret); a full env file can reach real ERP, push and mail services.
