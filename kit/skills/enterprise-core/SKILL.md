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
- B04: Never edit a posted document. Make each correction a new document.
- B05: Write the document and its outbox row in one transaction.
- B06: Put idempotency keys on every command and webhook. Retry with backoff, then send failures to a dead-letter queue.
- B07: Version offline sync and test its conflict rules.
- B08: Keep migrations compatible with the previous release. Make every data change safe to run twice. Rehearse it on a copy of production data.
- B09: Mask personal data in logs.
- B10: Never run a database query inside a loop over records. Paginate every list endpoint.
- B11: Add a regression test for every bug you fix.
- B12: Calculate Indian tax only with India Compliance. When Medusa connects to ERPNext, ERPNext owns invoices and tax; Medusa never recalculates statutory tax.
<!-- kit-rules:enterprise:end -->

## Gotchas (from lessons)
<!-- kit-lessons:enterprise:start -->
- EG01: Read a payout balance as of the run date, or block overlapping runs. Test out-of-order periods; mixed dates once paid one balance twice.
- EG02: Cap the text length before PII regexes, and keep dates out of the phone pattern. Test date-plus-phone strings; long text made the email pattern quadratic.
- EG04: Start local test servers with an allow-list of env vars, such as the database URL and app secret. A full env file can reach real ERP, push and mail services.
<!-- kit-lessons:enterprise:end -->
