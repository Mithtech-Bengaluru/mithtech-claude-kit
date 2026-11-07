# Pattern: Webhook in or out (any stack)
Use when: Receive events from, or send events to, an external system.
Size: S (follow these steps; skip planning). Escalate to M if a step does not fit.

1. Inbound: verify the signature first; reject on failure. Store an idempotency key (event id) and skip duplicates.
2. Process in a background job (frappe.enqueue / Medusa subscriber or workflow), not in the request.
3. Outbound: write the document and an outbox row in one transaction; a job sends it with retries, backoff and a dead-letter status.
4. Log every call in an integration log (status, attempts, masked payload).
5. Secrets come from settings or environment variables, never code.
