# Pattern: Package site customisations (Frappe)
Use when: Site has Custom Fields, Property Setters, Server/Client Scripts or Customize Form changes not in any app.
Size: S (follow these steps; skip planning). Escalate to M if a step does not fit.

1. Run `node <kit>/driftcheck.mjs <site>` (read-only).
2. Show the list with the suggested app per item: generic `framith_<product>` if other customers could use it, else `framith_<customer>`; on a live customer site, the customer app. Give the reason per item.
3. Ask the user to approve items one by one (AskUserQuestion). Never move in bulk.
4. For each approved item: Custom Field / Property Setter: set `module` to the owning app module, add a filtered fixture (`{"dt": "Custom Field", "filters": [["module", "=", "<Module>"]]}`) or install/patch code. Server Script: move to a controller, doc_events hook or whitelisted API. Client Script: move to the app JS via `doctype_js`.
5. `bench --site <dev-site> export-fixtures --app <app>`; commit in the app repo.
6. Test on a fresh site: install the app, confirm the items exist and work.
7. Offer to remove the database-only copy; remove it only on a yes.
