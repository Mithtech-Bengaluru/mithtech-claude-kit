# Pattern: New setting (any Frappe app)
Use when: Behaviour must differ between customers or sites.
Size: S (follow these steps; skip planning). Escalate to M if a step does not fit.

1. Add a field to the owning app Single Settings DocType (create `<App> Settings` only if the app has none).
2. Read it with `frappe.db.get_single_value("<App> Settings", "<field>")` (cache if hot).
3. Never check a customer name in code. Default value = current behaviour.
4. Add a test for each setting value.
