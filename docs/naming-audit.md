# Naming audit (report only)

Date: 2026-11-08. Source: the first computer's bench and plugin folders. Nothing was renamed.
Rules: Frappe apps are `framith_<name>`; Medusa plugins are `mithusa-<name>` inside our npm scope `@mithtech-medusa`.
Customer apps are listed in a local, gitignored `naming-audit.private.md` (the public repo holds no customer names).
Each rename is its own size-L program with gates and the maintainer's approval.

## Frappe apps (14 generic apps break the rule)

| App | Proposed name | Status | Note |
|---|---|---|---|
| amc2 | framith_amc | active | Same domain as framith_amc_service and mith_service: pick one owner first |
| mith_service | (merge) | active | Same purpose text as framith_amc_service; likely the older copy. Merge, do not rename |
| customer_wallet | framith_wallet | active | Depends on the lending app |
| ding | framith_ding | active | |
| flowmentor | framith_flowmentor | active | |
| mith_store | framith_store_theme | active | Theme build only |
| ntfynext | framith_ntfy | dormant | Low risk: start here |
| polygin | framith_polygin | active | |
| pricenexus | framith_pricenexus | dormant | Low risk |
| pulse | framith_pulse | active | |
| setter | framith_setter | active | Runs on many new sites: rename last |
| smartflo | framith_smartflo | dormant | Low risk |
| whatsapp_flow_builder | framith_whatsapp_flow | active | |
| medusync | (archive) | retired | Replaced by the ERPNext Medusa plugin; archive, do not rename |

What a Frappe rename touches: the app folder and Python package, `hooks.py` (app_name, every dotted path), `modules.txt` and every Module Def's `app_name`, the `module` field of every DocType, Report, Print Format, Workspace, Custom Field and Property Setter fixture, imports in other apps, `required_apps` of dependants, fixtures and `patches.txt` paths, `sites/apps.txt` and installed apps on every site, the repo name and remotes, CI.

Risk on live sites: the installed-apps list and Module Def rows point to the old name. A careless rename orphans DocTypes, or migrate removes them with their data. Every rename needs a patch that rewrites Module Def `app_name`, a backup, a rehearsal on a copy of each live site, and a rollback plan.

## Medusa plugins (10 break the rule)

| Package | Proposed name |
|---|---|
| @mithtech-medusa/cashfree | @mithtech-medusa/mithusa-cashfree |
| @mithtech-medusa/communication | @mithtech-medusa/mithusa-communication |
| @mithtech-medusa/gst-india | @mithtech-medusa/mithusa-gst-india |
| @mithtech-medusa/marketing | @mithtech-medusa/mithusa-marketing |
| @mithtech-medusa/pages | @mithtech-medusa/mithusa-pages |
| @mithtech-medusa/plugin-erpnext | @mithtech-medusa/mithusa-erpnext |
| @mithtech-medusa/reviews | @mithtech-medusa/mithusa-reviews |
| @mithtech-medusa/social-auth | @mithtech-medusa/mithusa-social-auth |
| @mithtech-medusa/surepass | @mithtech-medusa/mithusa-surepass |
| @mithtech-medusa/wallet-loc | @mithtech-medusa/mithusa-wallet |

What a Medusa rename touches: `package.json` name, imports and type references, `medusa-config` plugin `resolve` entries in every store, the private registry (publish the new name, deprecate the old one), dependants (surepass depends on wallet-loc), module names and link definitions if the module key changes, migrations table names if the module key changes, CI and READMEs.

Risk on live stores: changing a module key renames its tables and links. Keep module keys unchanged and rename only the package, then the risk is low.

## Suggested order
1. Settle the duplicate service domain (amc2, framith_amc_service, mith_service) before any rename.
2. Dormant Frappe apps: ntfynext, pricenexus, smartflo.
3. Medusa packages, one per release, keeping module keys. Do leaf packages first and wallet-loc last.
4. Active Frappe apps with few sites. Do customer_wallet and setter last.
5. Archive medusync.
