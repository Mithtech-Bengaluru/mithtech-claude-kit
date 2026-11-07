# Pattern: Medusa admin widget
Use when: Show extra data or actions on an admin page.
Size: S (follow these steps; skip planning). Escalate to M if a step does not fit.

1. Create `src/admin/widgets/<name>.tsx` with `defineWidgetConfig({ zone: "<zone>" })`.
2. Use @medusajs/ui components; fetch through the admin SDK and a thin custom route.
3. Put logic in a workflow behind the route, not in the widget.
4. Build with `npx medusa plugin:build` (plugins) or the project build.
