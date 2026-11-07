# Pattern: Report on existing data (Frappe)
Use when: Users need a list, summary or analysis of data that already exists.
Size: S (follow these steps; skip planning). Escalate to M if a step does not fit.

1. Use a Query Report or Script Report in the owning app; never a new table for report data.
2. Use frappe.qb with explicit fields, filters and pagination; respect permissions and company filters.
3. Add the report to the owning workspace.
4. Test with filters and an empty result.
