# Pattern: Scheduled job (any stack)
Use when: Something must run on a schedule.
Size: S (follow these steps; skip planning). Escalate to M if a step does not fit.

1. Frappe: add to `scheduler_events` in hooks.py, calling a function that enqueues idempotent work.
2. Medusa: `src/jobs/<name>.ts` with `config = { name, schedule }`.
3. Make the job idempotent and safe to run twice; process in batches; log start, end and counts.
4. Add a setting to turn it on or off when customers differ.
5. Test the job function directly.
