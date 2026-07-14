# Handoff — Invoice Processing (V1)

> **This file is always the current state.** Per-session narratives (the story of
> how we got here) are archived under [`.planning/archive/`](archive/), one file
> per session — newest work is summarized here, detail lives there.

## Current status
Backend + frontend run locally end-to-end. Initial Alembic migration applied. **Anthropic / Claude Sonnet 5 extraction validated live.** Backend test suite (29 pytest tests: unit + DB + HTTP) passing. All backend work committed and pushed to `origin/main`.

**V1 core happy-path is DONE and proven:** intake → live AI extraction → validation → review-ready. See "Open work" for what remains.

## Project scope & references
New repo, seeded from the older `Invoice-Draw-App` (draw/budget/loan-inclusive) per [`CARRY-OVER-MANIFEST.md`](CARRY-OVER-MANIFEST.md). Scope is **invoice intake → AI extraction → human review → approval only.** Read [`PRODUCT-BRIEF.md`](PRODUCT-BRIEF.md) for intent/workflow and [`research/INVOICE-PROCESSING-ARCHITECTURE-V2.md`](research/INVOICE-PROCESSING-ARCHITECTURE-V2.md) for the 14 locked architecture decisions (referenced by number throughout code comments) before making design calls.

## Run locally
```
docker compose up -d          # postgres:16 + redis:7  (use full docker.exe path if not on PATH)
cd backend && pip install -e ".[dev]"
cp .env.example .env           # EXTRACTION_PROVIDER=mock works with no API key
alembic upgrade head           # applies 9a5403128344 (initial schema)
.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
.venv\Scripts\python.exe -m app.workers.arq_worker   # separate terminal — see worker gotcha below

cd frontend && npm install && npm run dev
```
Open http://localhost:5173/login. **No seed loader** — use `POST /auth/signup` to create the first firm+user (or the existing demo `admin@example.com` / `DevPassword123!` if the dev DB is intact).

- **Extraction provider:** `backend/.env` currently has `EXTRACTION_PROVIDER=anthropic` + a real key (gitignored). Set `EXTRACTION_PROVIDER=mock` for no-key local/UI work.
- **Worker gotcha:** start the worker **only** from `backend/.venv\Scripts\python.exe`, and kill stray workers first (`Get-CimInstance Win32_Process -Filter "Name='python.exe'"`) — a global-Python worker lacks `anthropic` and silently strands anthropic jobs at `queued`.

## Tests (`backend/tests/`)
Run from `backend/`: `.venv\Scripts\python.exe -m pytest` (29 passing). Needs Docker Postgres up; auto-provisions the `<db>_test` database. Requires `pip install -e ".[dev]"`.
- `test_extraction_parsers.py` — pure unit: `{value,status}`-envelope recovery for line_items/property_hints + mock provider.
- `test_validation.py` — DB: duplicate self-exclusion (both directions), totals reconciliation (+ truncated-doc skip), date/currency sanity.
- `test_repositories.py` — DB: the `created_by`→`created_by_id` alias.
- `test_api.py` — HTTP via httpx ASGI transport: auth flow + create endpoints (the created_by 500 regression at the request boundary), 422-on-bad-input.

Two isolation models in `conftest.py`: unit/DB tests use a rolled-back transaction (`db_session`); HTTP tests use a committing session + per-test TRUNCATE (`client`/`authed`/`_api_engine`) because router writes use `async with db.begin()`.

## What's built
**Backend** (`backend/app/`) — models/schemas/routers written against ARCHITECTURE-V2:
- `models/` — `Invoice`/`InvoiceLineItem`/`InvoiceAttachment` (`category` triad; `proposed_property_id`/`property_match_signal` staging; `extraction_status` separate from business `status`; `validation_flags` JSONB; `page_count`/`pages_extracted` for the 15-page cap), `Vendor`/`VendorPattern`, `Property`/`Portfolio`/`PropertyContact`/`PropertyEntity`/`PropertyPattern`, `FirmUser`/`FirmUserRole` (admin-only for V1), `AuditEntry` (append-only), `ApprovalRecord`
- `services/extraction.py` — `ExtractionProvider` ABC, `MockExtractionProvider` (no key), **`AnthropicExtractionProvider` (Claude Sonnet 5 — wired + validated live)**, `VisionExtractionProvider` (Azure Foundry path — placeholder body, not yet validated; decision 9 bake-off)
- `services/intake.py` — dedupe → persist → audit → stage → route-to-review orchestration
- `services/property_matching.py`, `vendor_matching.py` — proposal-layer matching
- `services/validation.py` — deterministic checks (totals reconcile, date/currency sanity, duplicate suspect)
- `services/state_machines.py` — invoice transitions only
- `routers/` — `auth`, `properties` (+ portfolios/contacts/entities/patterns), `vendors`, `invoices`, `invoice_intake` (email + manual upload + extraction view/correction + attachments), `artifacts`, `audit`
- Docker Compose (postgres:16 + redis:7); Alembic (`alembic.ini` + async `env.py`) with initial migration `9a5403128344` applied
- `pyproject.toml` — FastAPI/SQLAlchemy 2.0 async/asyncpg/Alembic/JWT/arq/redis/pypdf/anthropic/azure-storage-blob/azure-identity

**Frontend** (`frontend/src/`) — carried over, pruned + contract-fixed 2026-07-09:
- Design tokens, primitives, CommandPalette, StatusChip
- Pages: `Login`, `Dashboard`, `Properties`, `PropertyDashboard`, `Invoices`, `InvoiceReview`, `InvoiceDetail` (pdf.js + Fabric annotation layer), `Vendors`
- Draw/budget/portal screens removed (no backend route); `api/types.ts` matches the real Pydantic schemas
- **Unverified this session** — review/approval UI not exercised beyond the API; near-zero frontend tests.

## Open work (prioritized)
1. **Broaden the backend tests** — upload→extraction-view flow (use `MockExtractionProvider`, no key/worker; override the arq enqueue), intake orchestration (`services/intake.py::receive_invoice`/`run_extraction`), the invoice state machine.
2. **Broader "re-bill" duplicate detection** (design item below) — build when scoped.
3. **Pre-prod backlog:** audit-log Postgres RULE (`models/audit.py` "Layer 1"); Microsoft Graph email intake (`POST /invoices/intake/email` has a payload shape but no webhook subscription / `clientState` handshake — needs `M365_*`/`INTAKE_MAILBOX`/`GRAPH_WEBHOOK_CLIENT_STATE`); Azure Foundry vision bake-off (decision 9 — `VisionExtractionProvider` body is a placeholder).
4. **Verify the frontend** (review/approval UI) against the live backend; add frontend tests.

## Design item (not yet built) — broader "re-bill" duplicate detection
The current fuzzy check only catches an *exact* vendor+invoice#+total resubmission. It will NOT catch the same work re-billed under a *new* invoice number (a real risk). Intended design: tiered, advisory-only signals (fits the Proposal Layer / no-auto-accept rule) — e.g. exact-number match = high-confidence dup; same vendor + near-total + no number match = "possible re-bill, review"; same vendor + overlapping line-item descriptions = "possible re-bill" even if totals drift. Do the deterministic tiers first (vendor + amount tolerance + date window); layer an LLM semantic line-item comparison ("is this the same work?") on top later. Keep everything a reviewer flag, never auto-reject.

## Known frontend simplifications (flag before shipping)
From the 2026-07-09 prune pass — documented so they aren't mistaken for oversights:
- **`InvoiceDetail` pay-app multi-attachment view mode removed** — always renders the standard single-document 3-pane layout. Multi-document invoices would need a real design, not a revert.
- **`AnnotationCanvas` "burn annotation" has no backend route** — `onBurn` shows a "not saved in this version" toast. `annotation_json` exists on `InvoiceAttachment` (markup-on-reject per PRODUCT-BRIEF), so the wiring is a backend-endpoint job.
- **`Vendors.tsx` W-9/COI compliance-doc flow stripped** to a plain vendor list — that lifecycle is out of V1 scope per PRODUCT-BRIEF.

## Design system notes
(Carried over — same tokens, same rules.)
- Fonts: **Geist** (sans), **Instrument Sans** (display), **IBM Plex Mono** (mono only for ⌘K kbd hints, logo mark, status chip labels)
- `font-mono` banned from numeric cells (dotted zeros complaint)
- StatusChip: text+dot only, no pill background

## Reference: old repo
`Invoice-Draw-App` (github.com/TyInDisguise/Invoice-Draw-App) is frozen as the reference implementation for everything left behind — draws, escrow, budgets, lien waivers, PM portal/payments, lender receipt, signed tokens, document generation, notifications engine. Port from it deliberately, against the confirmed Invoice-record module seam, when the draw module's turn comes — not passively.

## Conventions
- **Handoff:** this file stays current-only; at each session's end, move that session's narrative into `.planning/archive/HANDOFF-<date>.md` and refresh the sections above.
- **Context refresh rule:** refresh at ~300K only if (a) a clean handoff exists, (b) it's on disk (this file), (c) resume stays under ~20K.
