# Mithtech development rules

The rules every Mithtech developer follows, with or without Claude. One line each. Updated as we learn.

## Everyone
- Check what already exists before building: our apps and plugins, installed apps, and the platform's built-in features.
- One owner per record and setting. Link to it; never copy it or create a second version.
- Put code in the app or module that owns the feature. A new app, plugin or service needs approval.
- Size the task first. Small: build. Medium: one plan approval. Large: approve architecture, wireframes and build plan before building.
- Build everything that was approved, and nothing that wasn't.
- Done means the project's checks pass, every approved requirement is built and tested, and nothing is stubbed.
- Never push to main/master/production or force-push without approval.
- Production deploys and production data changes need explicit approval. Back up before any migration.
- Never edit third-party or upstream code (frappe, erpnext, hrms, india_compliance, @medusajs core, node_modules).
- No secrets in git, images, logs or shared files. Use environment variables.
- Never copy a database between machines without asking.

## Communication
- Before a medium or large task, restate it in at most 7 bullets (goal, scope, placement, assumptions, done when) and get a yes.
- Write one idea per sentence. Keep instructions under 20 words, descriptions under 25.
- Use active voice. Start instructions with a verb.
- Use one term for one meaning, every time.

## Frappe / ERPNext
- Name every Mithtech app `framith_<name>`.
- Build the generic product app first (`framith_<product>`), complete and configurable through its Settings DocType.
- Put each customer's changes in their own app (`framith_<customer>`). No customer logic in generic apps; never fork a generic app per customer.
- If other customers could use a change, build it in the generic app behind a setting.
- Use the standard masters (Customer, Item, Company, Employee…). Never duplicate a DocType or field; check India Compliance and HRMS too.
- Extend before creating: Custom Fields, Property Setters, hooks, overrides, standard reports.
- Site-only changes (Custom Fields, Server/Client Scripts, Customize Form) are fine while working; package them in the right app before production.
- When site-only changes exist, suggest which app each belongs in. Move nothing without approval, and never in bulk.
- Treat older apps without the `framith_` prefix with care: report first; change them only with an approved plan, a backup and a trial on a copy.
- Export Custom Fields and Property Setters as fixtures filtered by module; data changes go in idempotent patches.
- Never write GL or stock ledger entries by hand. Indian tax goes through India Compliance.
- Check permissions in every whitelisted method. Use roles and User Permissions, never hardcoded users.
- No raw SQL strings and no get_doc inside loops.
- Write tests for every DocType you touch. Run `bench build --app <app>` only for the app you changed.

## Medusa
- Name every Mithtech plugin, module or extension `mithusa-<name>`.
- Generic `mithusa-` plugins first; customer-only code in the customer's project.
- Check built-in modules and our plugins first. Extend with links, workflow hooks, subscribers and routes; never fork core.
- Business logic in workflows with compensation. Keep routes thin and validated.
- ERPNext is the book of record for invoices and tax when connected.
- Strict TypeScript, CLI-generated migrations, and verified, idempotent webhooks.

## Next.js and JS sites
- Reuse components. No new framework or dependency without approval.
- On live sites, never change a URL without a redirect and an SEO check.

## Rust
- Core code never depends on the network or a connector.
- No unwrap or todo!() on feature paths. Clippy must be clean.

## Business software (all stacks)
- The tenant comes from the logged-in session, never from the request.
- Check permissions on the server, not only in the UI.
- Never use floats for money or quantities.
- Posted documents are never edited; corrections are new documents.
- Every webhook and command is idempotent; retries use backoff.
- Migrations stay compatible with the previous release.
- Every fixed bug gets a regression test.
