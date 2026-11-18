---
name: frappe-dev
description: Rules for Frappe, ERPNext, HRMS and India Compliance work, framith_ apps and benches. Use for any change in a Frappe app or site (DocTypes, Custom Fields, hooks, controllers, reports, print formats, fixtures, patches).
---

# frappe-dev

## Before building (G0, every size)
1. Grep the index, never DocType JSON: `rg -i '<term>' .claude/index/frappe.txt` (bench root or app repo). Missing or stale index: `node <kit>/index.mjs`.
2. Grep the catalogue: `rg -i '<term>' <kit>/../catalog/`.
3. Check the masters of rule F05 for the field or DocType. Then apply rule E01.
4. Run `node <kit>/dupcheck.mjs` before every commit (rule E02; the pre-commit hook also runs it).

## Placement
Apply rules E03, E16, F03, F19 and F12. The customer app name comes from the local config `customerApps`; else propose one.

## Site-only customisations
`node <kit>/driftcheck.mjs <site>` lists Custom Fields, Property Setters, Server/Client Scripts, Print Formats, Reports and Workspaces that live in no app, with a suggested app. Then apply rules F10, F11 and F13. Pattern: `<kit>/patterns/package-site-customisations.md`.

## Gate
- Targeted tests (rule E29): `bench --site <dev-site> run-tests --app <app> --module <module>`. Full gate: `bench --site <dev-site> run-tests --app <app>`.
- Backup (rule E28), then migrate (rule F22): `bench --site <site> backup`, then `bench --site <site> migrate`.
- Build (rule F23): `bench build --app <app>`.

## Rules
<!-- kit-rules:frappe:start -->
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
<!-- kit-rules:frappe:end -->

## Gotchas (from lessons; maintain.mjs adds here)
<!-- kit-lessons:frappe:start -->
- FG01: Run deletes in bench console and call frappe.db.commit(). bench execute did not commit a frappe.client.delete.
- FG02: Drop the database column yourself after you delete a test Custom Field on a dev site. Frappe keeps the column.
- FG03: Name the controller class exactly as the DocType, without spaces and with acronyms as written (`SCException`). With a title-cased class, migrate deletes the DocType as an orphan.
- FG04: Guard engine-only fields with a higher permlevel or a validate check. Frappe does not enforce read-only fields on the server, so the REST API can change them.
- FG05: Read child-table values from the browser with frappe.client.get_value and `parent` set. frappe.db.get_value on a child DocType returns only the name.
- FG06: Set a custom new-record dialog in the listview `primary_action`. Frappe 16 resets the Add button after listview onload.
- FG07: Follow `amended_from` in submit hooks, or block amending system-made documents. Cancel-then-Amend gives the document a new name.
- FG08: Take the row lock first in the transaction, or read balances with locking reads. After a plain read, MariaDB keeps the old snapshot.
- FG09: Load the same app checkout for every bench call on a site. Clear the site cache after a call that did not. Redis caches the module map per site.
- FG10: Rename an app in this order: add the new package beside the old one, switch the dependents, rename each site, migrate, remove the old package. Rehearse it on a throwaway site with its own apps file.
- FG11: Read dict hooks per app in install order; Frappe merges them into lists of values. In hook tests, assert on the doctype keys and add a positive control.
- FG12: Fill the item-wise rates JSON for every item when a script sets a Bill of Entry IGST row to Actual. India Compliance rejects an empty JSON.
- FG13: Wrap the ERPNext test bootstrap to relax only the India Compliance checks it fails: zero-rate template, no HSN, non-GST state. Load test data once on the baseline site.
- FG14: Translate labels at request time only. A translation at module import freezes the first request's language in each worker.
- FG15: Put the nvm Node 24 folder first on PATH before get-app or build on a server. A non-interactive ssh shell picks the system Node.
- FG16: Patch shared dicts once in the main thread, around the worker threads. mock.patch.dict inside a thread leaks the patched value.
<!-- kit-lessons:frappe:end -->
