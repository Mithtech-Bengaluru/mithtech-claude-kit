# Pattern: Field on a standard master (Frappe)
Use when: Add a field to Customer, Item, Supplier, Employee or another standard master.
Size: S (follow these steps; skip planning). Escalate to M if a step does not fit.

1. G0: grep `.claude/index/frappe.txt` for the field name, label and synonyms (India Compliance and HRMS add many fields). Exists: stop and report.
2. Placement: generic `framith_<product>` if reusable, else `framith_<customer>`.
3. Create a Custom Field with `module` = owning app module; export it as a filtered fixture.
4. No copied values: use a Link field, or `fetch_from` for read-only display.
5. Run `node <kit>/dupcheck.mjs` and a FrappeTestCase for the master.
