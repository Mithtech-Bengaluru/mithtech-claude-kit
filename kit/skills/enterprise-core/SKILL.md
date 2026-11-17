---
name: enterprise-core
description: Rules for business logic in any stack - multi-tenant SaaS, permissions, money, ledgers, posted documents, outbox, idempotency, offline sync, migrations, PII. Load together with the stack skill whenever a change touches business rules or data.
---

# enterprise-core

Set `Floor: money|permissions|production|contracts` on these tasks, and route ledgers, payments, tenancy/security and offline sync as `critical` (`node <kit>/scripts/route.mjs critical`).

## Rules
<!-- kit-rules:enterprise:start -->
- B01: Take the tenant from the logged-in session, never from the request.
- B02: Check permissions and record scope on the server, not only in the UI.
- B03: Never use floats for money or quantities. Do no money math in the UI.
- B04: Never edit posted documents. Corrections are new documents.
- B05: Write the document and its outbox row in one transaction.
- B06: Put idempotency keys on commands and webhooks. Retry with backoff and a dead-letter queue.
- B07: Version offline sync and test its conflict rules.
- B08: Keep migrations compatible with the previous release.
- B09: Mask personal data in logs.
- B10: Avoid N+1 queries. Paginate every list.
- B11: Add a regression test for every bug you fix.
<!-- kit-rules:enterprise:end -->

## Gotchas (from lessons)
<!-- kit-lessons:enterprise:start -->
- EG01: Read a payout balance as of the run date (or block overlapping runs) and test out-of-order periods; mixed dates paid one balance twice.
- EG02: Cap text length before PII regexes, keep dates out of the phone pattern and test date-plus-phone strings; long text made the email pattern quadratic.
- EG03: Make every database change safe to run twice and rehearse it on a copy of production data; a branch script can repeat changes production already has.
- EG04: Start local test servers with an allow-list of env vars (database URL, app secret); a full env file can reach real ERP, push and mail services.
<!-- kit-lessons:enterprise:end -->
