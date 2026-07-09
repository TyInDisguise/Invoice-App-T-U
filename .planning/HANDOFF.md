# Handoff — Invoice Processing (V1)

## Status: Backend + frontend scaffolded and contract-aligned. No live DB test yet, no extraction wiring, no auth tests.

This is a **new repo**, seeded from the older `Invoice-Draw-App` (draw/budget/loan-inclusive) per [`CARRY-OVER-MANIFEST.md`](CARRY-OVER-MANIFEST.md). Scope is invoice intake → AI extraction → human review → approval only. See [`PRODUCT-BRIEF.md`](PRODUCT-BRIEF.md) for intent/workflow and [`research/INVOICE-PROCESSING-ARCHITECTURE-V2.md`](research/INVOICE-PROCESSING-ARCHITECTURE-V2.md) for the 14 locked architecture decisions — read both before making design calls, they're referenced by number throughout the code comments.

## Run locally
```
docker compose up -d          # postgres + redis
cd backend && pip install -e ".[dev]"
cp .env.example .env          # EXTRACTION_PROVIDER=mock works with no API key
alembic upgrade head          # NO MIGRATION EXISTS YET — see "What's blocking" below
uvicorn app.main:app --reload
python -m app.workers.arq_worker   # separate terminal, for background extraction jobs

cd frontend && npm install && npm run dev
```
Open http://localhost:5173/login

**No seed data / no demo user.** There's no seed loader or bootstrap script in this repo (unlike the old one). Use `POST /auth/signup` to create the first firm + user, then log in normally.

## What's built

**Backend** (`backend/app/`) — carried over per the manifest, then models/schemas/routers rewritten against ARCHITECTURE-V2:
- `models/` — `Invoice`/`InvoiceLineItem`/`InvoiceAttachment` (rewritten: `category` triad replaces `expense_classification`; `proposed_property_id`/`property_match_signal` staging; `extraction_status` separate from business `status`; `validation_flags` JSONB; `page_count`/`pages_extracted` for the 15-page cap), `Vendor`/`VendorPattern`, `Property`/`Portfolio`/`PropertyContact`/`PropertyEntity`/`PropertyPattern`, `FirmUser`/`FirmUserRole` (collapsed to admin-only for V1), `AuditEntry` (append-only), `ApprovalRecord`
- `services/extraction.py` — `ExtractionProvider` ABC, `MockExtractionProvider` (works with no key), `VisionExtractionProvider` (Azure Foundry vision-LLM path — **not yet wired**, see below)
- `services/intake.py` — dedupe → persist → audit → stage → route-to-review orchestration
- `services/property_matching.py`, `vendor_matching.py` — proposal-layer matching, mirrors old repo's pattern
- `services/validation.py` — deterministic checks (totals reconcile, date/currency sanity, duplicate suspect)
- `services/state_machines.py` — invoice transitions only (no draw/escrow/PM-payment states)
- `routers/` — `auth`, `properties` (+ portfolios/contacts/entities/patterns), `vendors`, `invoices`, `invoice_intake` (email + manual upload + extraction view/correction + attachments), `artifacts` (document streamer), `audit`
- Docker Compose (postgres:16 + redis:7), Alembic config (`alembic.ini` + async `env.py`, `target_metadata` wired to `Base.metadata`) — **versions/ dir is empty**
- `pyproject.toml` — FastAPI/SQLAlchemy 2.0 async/asyncpg/Alembic/JWT/arq/redis/pypdf/azure-storage-blob/azure-identity

**Frontend** (`frontend/src/`) — carried over, then pruned + contract-fixed 2026-07-09:
- Design tokens, primitives (Button/Table/Modal/Input/Badge/etc.), CommandPalette, StatusChip
- Pages: `Login`, `Dashboard`, `Properties`, `PropertyDashboard`, `Invoices`, `InvoiceReview`, `InvoiceDetail` (pdf.js + Fabric annotation layer), `Vendors`
- **Removed** (no backend route left for any of these): `Draws`, `DrawDetail`, `PayApp`, `pages/portals/*` (PM portal, lender receipt, vendor compliance), `PMAccessPanel`, `TokenLinkModal`, `api/tokens.ts`
- `api/types.ts` rewritten to match the real Pydantic response schemas field-for-field (was stale — carried the old `expense_classification`/`payment_method`/loan/budget/draw shapes)

## What's blocking — things only you (or a machine with Docker) can unblock

1. **Initial Alembic migration doesn't exist.** `backend/alembic/versions/` only has `.gitkeep`. Needs a live Postgres to autogenerate against:
   ```
   docker compose up -d
   cd backend && alembic revision --autogenerate -m "initial schema"
   alembic upgrade head
   ```
   Sanity-check the generated migration against the 41-ish tables in `app/models/__init__.py` before committing — autogenerate can miss server-side defaults/check-constraints on first pass.

2. **No tests exist yet.** Old repo's tests targeted the old (draw-inclusive) schema and weren't carried over. Backend and frontend both need a test suite written against the current contract. Frontend has 5 test files stubbed (`InvoiceReview`, `Vendors`, `client`, a couple components) — everything else is untested.

3. **`VisionExtractionProvider._build_body`** (`backend/app/services/extraction.py:292`) — the document-content-block format is a placeholder; confirm it against whichever Azure AI Foundry model deployment you land on (decision 9 in the architecture doc calls for a bake-off, not yet run). `EXTRACTION_PROVIDER=mock` is the default and needs no key for local dev/UI work.

4. **Microsoft Graph email intake** — `POST /invoices/intake/email` accepts a payload shape but there's no webhook subscription-creation code or `clientState` validation handshake yet. Needs `M365_TENANT_ID`/`M365_CLIENT_ID`/`M365_CLIENT_SECRET`/`INTAKE_MAILBOX`/`GRAPH_WEBHOOK_CLIENT_STATE` in `.env` plus the Graph subscription setup itself (not started).

## Known frontend simplifications (flag before shipping)

Made during the 2026-07-09 prune pass, documented here so they don't get mistaken for oversights:
- **`InvoiceDetail`'s pay-app multi-attachment view mode was removed.** Old repo switched layouts when `attachments.length > 1`; that variant doesn't map to any V1 backend concept, so it's gone — always renders the standard single-document 3-pane layout now. If multi-document invoices become a real V1 need, this needs a real design, not a revert.
- **`AnnotationCanvas`'s "burn annotation" action has no backend route.** Component kept as a local PDF-markup sketch tool; `onBurn` shows a "not saved in this version" toast instead of calling a dead endpoint. `annotation_json` does exist on the `InvoiceAttachment` model (for markup-on-reject, per PRODUCT-BRIEF), so the wiring is a backend-endpoint job, not a frontend rewrite.
- **`Vendors.tsx` W-9/COI compliance-doc request flow was stripped** to a plain vendor list — that lifecycle is explicitly excluded from V1 scope per `PRODUCT-BRIEF.md`.

## Design system notes
(Carried over from the old repo — same tokens, same rules.)
- Fonts: **Geist** (sans), **Instrument Sans** (display), **IBM Plex Mono** (mono only for ⌘K kbd hints, logo mark, status chip labels)
- `font-mono` banned from numeric cells (dotted zeros complaint)
- StatusChip: text+dot only, no pill background

## Reference: old repo
`Invoice-Draw-App` (github.com/TyInDisguise/Invoice-Draw-App) is frozen as the reference implementation for everything left behind — draws, escrow, budgets, lien waivers, PM portal/payments, lender receipt, signed tokens, document generation (`excel_sov`, `pdf_cover`), notifications engine. Its own `.planning/HANDOFF.md` has the fuller build history (12 phases) if you need to see how a carried-over piece worked before this rewrite. Port from it deliberately, against the confirmed Invoice-record module seam, when the draw module's turn comes — not passively.

## Memory
User's rule on context refresh: refresh at ~300K BUT only if (a) clean handoff exists, (b) distilled handoff is on disk, (c) resume stays under ~20K. This file is the disk handoff.
