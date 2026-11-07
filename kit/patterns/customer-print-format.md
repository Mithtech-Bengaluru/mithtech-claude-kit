# Pattern: Customer-specific print format (Frappe)
Use when: One customer needs its own invoice, quotation or delivery note layout.
Size: S (follow these steps; skip planning). Escalate to M if a step does not fit.

1. Placement: `framith_<customer>` (customer-only by definition).
2. Build with Print Designer or a Jinja print format; set `module` to the customer app module and `standard` = Yes so it is exported with the app.
3. Use existing fields only; any new field follows field-on-standard-master.
4. Test print and PDF on a dev site with real-shaped data.
