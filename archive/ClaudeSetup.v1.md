Set up Mithtech's Claude Code development kit on this computer. Mithtech builds mainly Frappe-based apps (Frappe, ERPNext, HRMS and our custom apps), plus Medusa commerce projects and simple JS sites. This kit defines how all our development should be done: reuse first, correct placement, high quality, fast delivery and low token use.

# 0. RULES FOR THIS SETUP
- Detect the OS, the home folder and the Claude Code user config folder (~/.claude, or %USERPROFILE%\.claude on Windows). Everything you create must work on macOS, Linux and Windows. Write any script or hook in Node or Python, not bash.
- Check what already exists before writing anything. Never overwrite: back up an existing file to <name>.bak-<date>, then merge into it.
- Before writing, verify the exact formats against the current Claude Code docs: skill folders, SKILL.md frontmatter, agent files (including the model and effort fields), settings.json permission rules and hooks. Don't guess syntax. Also verify Frappe and Medusa CLI commands against their current docs.
- Never write secrets, tokens or passwords into any file. Refer to env variables by name only.
- Ask me questions ONE AT A TIME, and only for things you can't detect. When something needs me (a login, an install, an approval), tell me exactly what to do and wait for my confirmation.
- Use subagents only where they save time. Keep your updates short.

# 1. DISCOVER (ask one at a time)
1. Does a Mithtech Claude kit repo already exist? If yes, clone it, run its installer (see step 6), then continue at step 3.
2. Should the kit be pushed to a private GitHub repo so every Mithtech developer gets the same setup? If yes, which org and repo name?
3. Which project folders on this computer should be configured? Detect each folder's type: Frappe bench, Medusa or JS site.
4. Check git and `gh auth status`. If I'm not logged in, tell me to run `gh auth login` and wait.
5. For each project, ask: default branch, staging and production deploy method (git remote, Frappe Cloud, SSH script or CI), and the site names.

# 2. GLOBAL FILES (in the Claude config folder)

## CLAUDE.md (under 60 lines; it loads in every session)
- EXISTING-FEATURE CHECK: Before building anything, search the codebase, the installed apps/modules/plugins and the platform's built-in features. If the feature exists or can be modified easily, STOP and warn me: say what exists, where, and whether you recommend extending it or rebuilding.
- PLACEMENT: New code goes into the correct existing app, module or plugin. Never create a new app, module or plugin unless I ask. Always state where the code will go and why, with one alternative.
- ROUTING:
  - In a Frappe bench, use the frappe-dev skill.
  - In a Medusa project, use the medusa-dev skill.
  - For other JS projects, use the js-site skill.
  - For multi-part tasks, use the parallel skill (its trigger rules are below).
- READ FIRST: Read the project's CLAUDE.md before exploring the code.
- TOKENS:
  - Grep before reading. Read only the lines you need. Never re-read unchanged files.
  - Show diffs, not full files. Don't echo code back. Keep summaries short.
  - Reuse existing code. No duplicates, no speculative features, minimal dependencies. Write compact code.
- SAFETY:
  - Never force-push, and never push to main, master or production branches unless I ask.
  - Production deploys and production data changes need my explicit yes.
  - Back up before any migrate.
  - Never edit upstream code (frappe, erpnext, hrms, @medusajs core, node_modules).
- QUESTIONS: Ask held questions one at a time.
- FINAL REPORT for any task: branch, commits, test result, deploy status, items still pending, and a reminder that I can check usage with /cost.

## skills/parallel/SKILL.md
Write the description so this skill triggers ONLY on the first message of a fresh session, and only when the task spans 3+ files/modules, has independent parts, or I write "PARALLEL". Body:
1. RECON (cheapest model): Read the project CLAUDE.md, then run the existing-feature check. If the feature exists, stop and warn me.
2. PLAN:
   - Split the work into the FEWEST parallel units.
   - Schema and data-model units (DocTypes, fields, patches, Medusa data models, links, migrations) run first and merge before the units that depend on them.
   - If there would be 2 or fewer units, or the units are tightly coupled, do the work in the main session with no subagents.
   - Decide worktrees, model and effort per unit yourself; never ask me. Use the cheapest combination that will work, and escalate only after a failure:
     - light (Haiku/low): search, reading, boilerplate, docs
     - worker (Sonnet/medium): standard features, fixes, tests
     - architect (Opus/high): architecture, hard debugging, merge conflicts, security, money, migrations
   - Show one short table with unit, model, effort and reason, then proceed. Wait for me only if the task is ambiguous or destructive.
3. EXECUTE IN PARALLEL:
   - Each brief contains the goal, file paths, constraints and done criteria. Never paste code into a brief.
   - When a unit finishes, it appends one line to .claude/tasks/status.md: `<unit> | done or blocked | 1-line summary | questions or "none"`. It returns only that line.
   - Don't keep subagents alive between steps.
4. INTEGRATE: Merge the units one at a time into a single branch, feat/<task>. The orchestrator never re-reads code the subagents wrote.
5. CHECKER (checker agent, fresh context):
   - Check the work against the plan, the existing-feature rule, the placement rule and the stack skill's rules, and flag duplicated code.
   - During fix loops, run only targeted tests. Run the full suite once, before the push.
6. STOP RULE: Retry a failed unit once on the same model, then escalate one tier. If it still fails, stop that unit and queue the problem as a question.
7. SHIP: Push feat/<task> to GitHub. If staging is configured, deploy there automatically. Deploy to production only after my yes.
8. CLEANUP (cleanup agent, launched once at the end):
   - Read only status.md.
   - Delete worktrees and branches only for units that are done, merged and checked, with no open items.
   - Ask me the held questions ONE AT A TIME, waiting for each answer.
   - Hand pending units back to the orchestrator, then clean them up and close.
9. FINAL REPORT (in the format from the global CLAUDE.md).

## agents/ (minimal tools, one-line descriptions)
- light: Haiku, low effort
- worker: Sonnet, medium effort
- architect: Opus, high effort
- checker: Sonnet, medium effort; read, test and lint tools only
- cleanup: Haiku, low effort; git and file tools only

## skills/frappe-dev/SKILL.md
REUSE AND PLACEMENT
- Before creating a DocType, report, print format, workflow or workspace, search Frappe, ERPNext, HRMS, the other installed apps and our custom apps for an existing one.
- Prefer extending what exists: Custom Fields, Property Setters, doc_events, override_doctype_class and hooks.
- Never edit upstream apps. Code goes into the existing custom app and module that owns the domain. Recommend which one; create a new app or module only when I ask.
CODE QUALITY
- Logic lives in app code (controllers, hooks, API files), not in Server Scripts or Client Scripts stored in the database, unless I ask.
- Use frappe.qb, or frappe.get_all with explicit fields. Never build SQL by string concatenation.
- Never call get_doc inside a loop. Use db.get_value for single fields, bulk operations, frappe.enqueue for long jobs, frappe.cache for hot lookups, and search_index on fields you filter by.
- @frappe.whitelist functions check permissions. ignore_permissions is allowed only with a comment explaining why.
- Use roles and User Permissions, never hardcoded user checks.
- Put configuration in a Single "Settings" DocType. Never hardcode sites, URLs, companies or accounts.
- Wrap user-facing strings in _(). Use naming series and autoname rules.
DISTRIBUTABILITY
- Export customizations as fixtures filtered by module or app, never blanket fixtures.
- Make data changes through idempotent patches listed in patches.txt.
- Declare required_apps. Target the version branch the app supports. Keep pyproject metadata correct.
- after_install and before_uninstall must leave a site clean. No site-specific data in the repo.
- Keep a README and CHANGELOG, and bump the version using semver.
TESTING AND SPEED
- Write FrappeTestCase tests for every DocType you touch.
- While working, run module-level tests on a test site. Run the full app tests before pushing.
- Run `bench --site <site> backup` before any migrate. Migrate automatically only on dev and test sites.
- Build only the app you changed: `bench build --app <app>`.
- Tooling: pre-commit with ruff, eslint, prettier and semgrep's Frappe rules, plus CI that runs the tests on a fresh bench.

## skills/medusa-dev/SKILL.md
- First detect the Medusa version from package.json. The rules below are for v2. If the project is on v1, apply the v1 equivalents and say so.
REUSE AND PLACEMENT
- Before building, check the built-in commerce modules (product, pricing, promotion, cart, order, inventory, stock location, fulfillment, payment, customer, sales channel, region, tax, store, user, auth, notification, file), the installed plugins, src/modules and the existing workflows and routes. If the feature exists or can be extended easily, stop and warn me.
- Extend, don't fork:
  - module links to attach data to core models
  - workflow hooks and custom steps
  - subscribers for events
  - routes under src/api
  - admin widgets and UI routes
  - Query for reads across modules
- PLACEMENT ORDER (always state which you chose and why):
  1. the existing custom module or plugin that owns the domain
  2. an existing shared Mithtech plugin, if the feature is reusable across clients
  3. the project's src/, if the feature is client-specific
  Create a new module or plugin only when I ask. If you think one is warranted, recommend it and wait.
CODE QUALITY
- Business logic goes in workflows, with compensation steps. Keep routes thin and validate their input with zod.
- Define data models with model.define. Generate migrations with the CLI; never hand-edit the database.
- No direct database access across modules. Read config from env variables and plugin options, never hardcoded values.
- Use strict TypeScript with no `any`.
- Write integration tests: targeted ones while working, the full suite before pushing. Always run typecheck and lint.
DISTRIBUTABILITY
- Package reusable features as plugins. Version them with semver, list @medusajs/* packages as peerDependencies, and document plugin options in a README and CHANGELOG.
- Publish plugins to our private registry.
- Keep storefront changes separate from the backend, and use the JS SDK.

## skills/js-site/SKILL.md (short)
- Reuse existing components. Don't add a new framework or dependency without asking.
- Read config from env. Meet basic accessibility and performance budgets.
- Run lint and format before committing.

## settings.json (merge into the existing file; verify the syntax first)
- ALLOW without prompting (this makes builds faster):
  - git status, diff, log, add, commit, branch, checkout, worktree and merge
  - gh pr commands
  - npm, yarn and pnpm install, run and test
  - bench build, run-tests and migrate, on dev and test sites only
  - Medusa db generate and migrate, in development only
- DENY:
  - git push --force
  - pushing to main, master or production
  - edits under apps/frappe, apps/erpnext, apps/hrms and node_modules
  - reading .env files
- ASK every time: deploy commands.

## templates/
Create CLAUDE.frappe.md, CLAUDE.medusa.md and CLAUDE.js.md, each under 80 lines.

# 3. PER-PROJECT CLAUDE.md
For each project folder, fill in the matching template with real detected data:
- Frappe: bench path, Frappe and ERPNext versions, apps installed per site, our custom apps and their modules, the names of key custom DocTypes, test, build and deploy commands, and branch rules.
- Medusa: Medusa version, package manager, custom modules, installed plugins, a summary of custom routes, workflows and subscribers, admin extensions, scripts, and env variable NAMES only.
Then add `.claude/tasks/` to the project's .gitignore. Show me the file and ask before committing it.

# 4. QUALITY TOOLING
For each project, propose any missing pre-commit hooks, linters and CI workflow. Install them only after I say yes.

# 5. SETTINGS TEXT
Give me 2 or 3 lines to paste into Claude → Settings → Instructions. They should only point to this kit, since the full rules live in the files above.

# 6. KIT REPO (if I chose one in step 1)
Create a mithtech-claude-kit repo containing:
- everything from step 2
- a cross-platform installer (Node or Python) that backs up existing files and merges the kit into the config folder
- a README for Mithtech developers
Push it only after I confirm.

# 7. VERIFY AND REPORT
- Validate all frontmatter and JSON.
- List every file you created or changed, with one line each.
- Recommend anything worth adding, for example a shared Mithtech Frappe app or Medusa plugin for common code. Don't create these.
- Tell me what I still need to do: paste the Settings text, and restart the app or start a new session.