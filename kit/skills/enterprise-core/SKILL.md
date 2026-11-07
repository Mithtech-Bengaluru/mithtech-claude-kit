---
name: enterprise-core
description: Rules for business logic in any stack - multi-tenant SaaS, permissions, money, ledgers, posted documents, outbox, idempotency, offline sync, migrations, PII. Load together with the stack skill whenever a change touches business rules or data.
---

# enterprise-core

Route money, permissions, tenancy, production data and shared contracts at least sonnet/high; ledgers, payments, tenancy/security and offline sync at opus/xhigh (`routing.json`).

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
<!-- kit-lessons:enterprise:end -->
