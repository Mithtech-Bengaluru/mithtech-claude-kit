---
name: frappe-dev
description: Rules for Frappe, ERPNext, HRMS and India Compliance work, framith_ apps and benches. Use for any change in a Frappe app or site (DocTypes, Custom Fields, hooks, controllers, reports, print formats, fixtures, patches).
---

# frappe-dev

## Before building (G0, every size)
1. Grep the index, never DocType JSON: `rg -i '<term>' .claude/index/frappe.txt` (bench root or app repo). Missing or stale index: `node <kit>/index.mjs`.
2. Grep the catalogue: `rg -i '<term>' <kit>/../catalog/`.
3. Check the standard masters and India Compliance, HRMS and our framith_ apps for the field or DocType.
4. Exists or extendable? STOP. Say what and where, with extend-or-rebuild advice.
5. Run `node <kit>/dupcheck.mjs` before every commit (the pre-commit hook also runs it).

## Placement (say which and why, with one alternative)
- Reusable by other customers: the generic `framith_<product>` app, behind a field in its Single Settings DocType.
- Only this customer: the customer app `framith_<customer>` (from the local config `customerApps`, or propose the name). On a live customer site, the customer's app.
- Existing app without the framith_ prefix: report only (contents, what would change, risk on live sites). No rename, move, merge or delete without an approved plan, a backup and a rehearsal on a site copy.

## Site-only customisations
`node <kit>/driftcheck.mjs <site>` lists Custom Fields, Property Setters, Server/Client Scripts, Print Formats, Reports and Workspaces that live in no app, with a suggested app. Suggest; move only items the user approves, one by one; test on a fresh site; remove the database-only copy only after a yes. Pattern: `<kit>/patterns/package-site-customisations.md`.

## Gate
- `bench --site <dev-site> run-tests --app <app> --module <module>` while working; `bench --site <dev-site> run-tests --app <app>` before push.
- `bench --site <site> backup` before `bench --site <site> migrate`; migrate only dev/test sites (the guard blocks others).
- `bench build --app <app>` for the changed app only.

## Rules
<!-- kit-rules:frappe:start -->
- F01: Name every Mithtech app `framith_<name>` (snake_case).
- F02: Build the generic product app first (`framith_<product>`), complete and configurable through its Single Settings DocType.
- F03: Customer app `framith_<customer>` holds only that customer's Custom Fields, Property Setters, print formats, workspaces, fixtures and small overrides; it lists the generic apps in required_apps. Never put a customer check in generic code; never fork a generic app per customer.
- F04: If other customers could use a change, build it in the generic app behind a setting. Otherwise put it in the customer app. Say which and why.
- F05: ERPNext/Frappe masters own their data: Company, Customer, Supplier, Item, Item Group, UOM, Price List, Employee, Address, Contact, Account, Cost Center, Warehouse, tax templates, and the masters of HRMS, India Compliance and our framith_ apps. Never create a DocType or field that duplicates one (for example a custom GSTIN field: India Compliance has `gstin`; a second wallet app: customer_wallet exists). Use Link fields, not copied values; fetch_from for read-only display.
- F06: Do not store computed values unless performance needs it, and then say why.
- F07: Extend before creating: Custom Fields, Property Setters, doc_events, override_doctype_class, hooks, standard reports, Print Designer, Workflows. Create a DocType only when nothing can be extended.
- F08: Keep one owning app per domain across all our framith_ apps.
- F09: Classify every app as OWN or VENDORED. Never edit vendored apps (including our forks of frappe and erpnext) unless asked.
- F10: Package for production: fixtures of the owning app (module set to that app's module, filtered fixtures) or install/patch code for fields and property setters; controllers, hooks and API files for server logic; doctype_js for client logic. Test packaged changes on a fresh site before release.
- F11: When site-only changes exist, suggest which app each belongs in, with the reason. Move nothing without approval, and never in bulk. Remove the database-only copy only after a tested move and a yes.
- F12: Treat older apps without the `framith_` prefix with care: report first; change them only with an approved plan, a backup and a trial on a copy of the site.
- F13: Export Custom Fields and Property Setters as fixtures filtered by module; blanket fixtures overwrite other apps.
- F14: Put data changes in idempotent patches listed in patches.txt.
- F15: Use frappe.qb or get_all with explicit fields; db.get_value, bulk operations, frappe.enqueue (idempotent jobs), frappe.cache, search_index on filtered fields. No SQL concatenation; no get_doc in loops.
- F16: Whitelisted functions check permissions; ignore_permissions only with a comment saying why; roles and User Permissions, never hardcoded users; respect company filters.
- F17: Never write GL or stock ledger entries by hand; use ERPNext controllers. Respect submit, cancel and amend, accounting dimensions and fiscal years.
- F18: Send Indian tax through India Compliance.
- F19: Keep settings in one Single Settings DocType per app; hardcode nothing. Wrap strings in _(). Use naming series.
- F20: Make apps distributable: required_apps, version branch, README, CHANGELOG, semver, clean after_install and before_uninstall.
- F21: Write FrappeTestCase tests for every DocType you touch. Run module tests while working and app tests before push.
- F22: Run `bench --site <site> backup` before migrate. Migrate automatically only on dev and test sites.
- F23: Run `bench build --app <app>` only for the app you changed.
- F24: Run the drift check before every production release and weekly on live customer sites.
- F25: Ship a generic app only when every requirement ID in its approved spec is built and tested. Keep partial apps on a feature branch.
<!-- kit-rules:frappe:end -->

## Gotchas (from lessons; maintain.mjs adds here)
<!-- kit-lessons:frappe:start -->
- FG01: Run deletes in bench console with frappe.db.commit(); bench execute did not commit a frappe.client.delete.
- FG02: Drop the column yourself after deleting a test Custom Field on a dev site; Frappe keeps the database column.
<!-- kit-lessons:frappe:end -->
