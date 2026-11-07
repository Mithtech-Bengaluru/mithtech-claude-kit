# Pattern: Link to a Medusa core model
Use when: A custom module needs to relate to Product, Customer, Order or another core model.
Size: S (follow these steps; skip planning). Escalate to M if a step does not fit.

1. Never add columns to core tables or import another module service directly.
2. Define a module link in `src/links/<name>.ts` with `defineLink`.
3. Run `npx medusa db:sync-links` (or `db:migrate`, which syncs links) in development.
4. Read across modules with Query (`query.graph`), not repository joins.
5. Test the link with an integration test.
