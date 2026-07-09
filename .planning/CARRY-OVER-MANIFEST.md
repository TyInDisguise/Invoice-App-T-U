# Carry-Over Manifest — Old Repo → New V1 Repo

**Decision (2026-07-09):** Old repo (`TyInDisguise/Invoice-Draw-App`) is frozen as reference, not deleted — the draw half is a future module and its reference implementation stays valuable. A new repo is seeded from the carry-over list below, built against `PRODUCT-BRIEF.md` and `research/INVOICE-PROCESSING-ARCHITECTURE-V2.md`.

## Carry over as-is

**Backend core:**
- `app/models/base.py`, `mixins.py`, `_helpers.py` — UUID PKs, UTC timestamps, `firm_id` scoping, soft delete
- `app/models/audit.py` — `AuditEntry`, append-only enforcement
- `app/models/invoice.py` — `Invoice`, `InvoiceLineItem`, `InvoiceAttachment`
- `app/models/vendor.py` — `Vendor`, `VendorPattern`
- `app/models/property.py` — `Property`, `Portfolio`
- `app/models/identity.py` — `FirmUser`, `FirmUserRole` (V1: collapse to admin-only role, per security decision)
- `app/models/approval.py` — `ApprovalRecord`
- `app/repositories/*` — base pattern, audit, invoice, invoice_attachment, vendor, property, firm_user*
- `app/services/vendor_matching.py` — reusable as-is; also the template for `match_property()`
- `app/services/state_machines.py` — trim to invoice transitions only
- `app/workers/arq_worker.py` — scaffolding; `compile_draw_package_job` is the pattern for the new extraction job
- `app/core/*` — config, database, deps, exceptions, logging, security, redis_client
- `app/routers/auth.py`, `properties.py`, `vendors.py`, `invoices.py`, `invoice_intake.py`, `audit.py`
- Docker Compose, Alembic setup, associated tests

**Frontend:**
- Design tokens / Tailwind config
- Primitives (Button, Table, Modal, Input, Badge, etc.)
- Invoice review + detail screens
- PDF.js + Fabric.js annotation layer
- SWR API layer (or swap for TanStack Query if reworking anyway)

**Non-code:**
- 58 sample invoices
- `Rebuild V1/Claude Design - Design Tokens.html`
- `Rebuild V1/` spec docs (reference-grade; partially superseded)
- `.planning/PRODUCT-BRIEF.md`, `.planning/research/INVOICE-PROCESSING-ARCHITECTURE-V2.md`

## Pattern/reference only — rewritten, not copied

- `app/services/extraction.py` — keep the interface shape (`ExtractionProvider`, `ExtractionResult`, `FieldStatus`, `MockExtractionProvider`); discard the OpenAI-compat implementation (pypdf path, prompt-and-parse JSON, ZDR flags — all rejected)
- `app/services/intake.py` — keep the orchestration skeleton (dedupe → persist → audit → stage → route); rewrite for background execution, validation gate, property matching, route-everything-to-review

## Left behind — stays in old repo, not ported

Loans, draws, escrow, budgets, lien waivers, draw packages, PM portal/payments, lender receipt, signed tokens, PM PIN auth, document generation (`excel_sov`, `pdf_cover`), notifications engine, and associated seed fixtures. `annotation_burn.py` is worth flagging for early return — it's needed once PDF-markup rejection is built in V1's own approval flow, not just the draw package.

Old repo continues to serve as the reference implementation for this half when the draw module's turn comes — ported deliberately against the confirmed-Invoice module seam at that time, not inherited passively now.
