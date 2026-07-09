# Invoice Processing Architecture V2

**Updated:** 2026-07-08. Supersedes `INVOICE-INGESTION-ARCHITECTURE.md` §5 (target architecture). See `../PRODUCT-BRIEF.md` for scope. Evidence base: Fraunhofer arXiv 2509.04469, SAP/Stanford arXiv 2603.02789, OCBC arXiv 2604.26462, OCR Arena, Ardent/APQC AP benchmarks.

## Decisions (locked)

| # | Decision | Rationale |
|---|---|---|
| 1 | **Vision LLM reads the PDF directly — no OCR, no text-first tiering** | Native image beats OCR-then-LLM by ~28 pts on scans (Fraunhofer); one code path, one eval surface |
| 2 | **One call, one schema**: headers (incl. **bill-to entity**, taxes) + line items + property hints + category (operating / non-operating / construction draw), structured output (strict JSON schema), per-field status, null-not-guess | Kills tolerant-JSON parsing; bill-to names the owning LLC — strongest property signal in CRE; line items exist for totals validation + future draw module, not per-line review |
| 3 | **Extraction runs in ARQ background job**; upload persists invoice + attachment sync, frontend polls | Vision latency (10–30s) can't live in HTTP request |
| 4 | **Deterministic validation gate**: line sum + tax ⇔ total (tolerance band), date/currency sanity, fuzzy dupe (vendor + invoice # + amount) beyond message-ID dedupe | Highest-leverage error catch; independent of model; failures become review-queue flags |
| 5 | **`match_property()`** — deterministic match against a per-property **entity/alias register** (owning LLC, job names, vendor-used abbreviations), signal priority: **bill-to entity > property aliases > vendor relationship history > city/state/address**; staged as proposal. Vendor history is a rank-boost among candidates only, never sole basis (empty at launch); address is corroboration, not primary. Reviewer corrections of property assignment enrich the alias register | "Sort to project" is new — today callers supply property_id; email intake can't. Alias register = the learning loop without ML |
| 6 | **V1 gate: everything routes to human review.** One queue row per invoice; validation flags + uncertain fields highlighted; confirm/correct/approve/reject/hold | Review is the safety layer; each correction is a labeled eval example. No auto-advance logic to tune yet |
| 7 | **Gate on categorical field status + validation, never self-reported confidence** | Verbalized confidence is uncalibrated (71% cluster at 0.95, AUROC 0.57) |
| 8 | **Proposal Layer preserved, extended to line items**: AI writes staging JSONB only; `InvoiceLineItem` rows materialize on human confirm | Load-bearing safety pattern; line-item table currently has no staging columns |
| 9 | **Model bake-off before commit**: Claude Opus + GPT-5-class via Azure Foundry (inside M365 governance, ZDR-capable); Gemini/Vertex only if Azure options disappoint. Test on the 58 labeled samples, document-level accuracy | Leaderboards shortlist, own data decides |
| 10 | **ZDR dropped as a V1 requirement** — strip the dead `zero_data_retention` flags/assertions (currently asserted but unenforced). Data lives in a company-owned database; provider-side retention terms revisit only if compliance demands | Supersedes INV-03's ZDR clause; removes enforcement theater rather than fixing it |
| 11 | Route status changes through `assert_transition_allowed()` | Intake currently bypasses the state machine |
| 12 | **Category triad replaces all prior classification** (`standard/reimbursable/capital`, INV-07's four-way scheme): operating / non-operating / construction draw only | Fundamentals-first; no legacy categorization carried forward |
| 13 | **Failure handling — no dead ends**: unreadable input → review flagged "unreadable"; extraction error/timeout → 2 retries w/ backoff, then review flagged "extraction failed," fields empty for manual keying; jobs in "processing" > ~3 min → re-enqueued once by sweep, then flagged; every failure/retry audited | With the page cap (decision 14) every call is ≤ 10 pages (typical: 15–40s, p95 < 90s), so one flat threshold works. Failure fallback is the same review screen (V1's only manual entry) |
| 14 | **Extraction page cap: first 15 pages of every document** (config value). Full PDF stored/attached regardless. Payapp amounts live in the G702/G703 summary pages up front; the backup pages stay available to the reviewer in the original. Review row shows truncation ("15 of 187 pages"). Totals reconciliation enforced only on untruncated docs; truncated docs flag "partial lines," never "mismatch" | One processing path, one call, no batching/merge machinery. Re-extraction at a higher cap is possible anytime from stored originals — full-payapp ingestion is a future config toggle, not a rebuild |

## Flow

```
Email / upload → dedupe (message-ID + fuzzy) → persist invoice + attachment
  → ARQ job: vision-LLM extract (one schema) → deterministic validation
  → propose vendor + property → review queue (flags highlighted)
  → human confirms/corrects → approve / reject (PDF markup) / hold
  → ledger of approved, project-assigned, categorized expenses
  → append-only audit at every step
```

## Rejected / deferred (with re-entry triggers)

| Item | Status | Why / when to revisit |
|---|---|---|
| Azure Document Intelligence cross-check | **Deferred** | Catches hallucinations when no human looks; v1 humans look at everything. PDFs are stored → backfillable anytime. Build it as the admission ticket to auto-accept (Phase 2) |
| Auto-accept gate | **Phase 2** | Requires: accuracy report from correction history, ADI agreement signal calibrated. Enable per-field/per-category as data earns it |
| Image preprocessing (deskew/denoise) | **Deferred** | Evidence is from OCR pipelines; unproven under frontier vision models. Add if evals show scan failures |
| Power Automate / SharePoint review queue | **Rejected** | The app's review screen is the product; don't build it twice |
| OCR / text-extraction tier (`pypdf` path) | **Rejected** | Delete; vision handles digital and scanned identically |
| Cost-tiered model routing | **Rejected until ~20k invoices/mo** | Total model spend at pilot volume ≈ $20–60/mo |
| Langfuse (tracing, prompt registry) | **Deferred to Phase 2** | Accuracy measurement needs only tables that exist (`ai_extracted_payload` vs corrections). Prompt registry earns its place once an eval loop gates promotions |
| Vendor-amount anomaly check | **Deferred** | Needs history that doesn't exist yet |
| PO 3-way matching | **N/A** | Mostly non-PO invoices; add per-vendor-segment if PO data appears |
| Vendor compliance lifecycle (W-9, COI, VEND-03…08) | **Out of V1** | Not needed to process invoices; re-enters with draw module (COI pre-flight) |
| Manual invoice creation without a document (INV-09) | **Deferred** | Correction-driven entry in the review queue (decision 13) covers V1; standalone entry is a later phase |
| Budget-line matching, GL coding, draws | **Later modules** | Consume confirmed invoices via the module seam |

## Platforms (V1)

- **Existing, keep**: Python 3.12 / FastAPI / SQLAlchemy async / Postgres 16 / Alembic; ARQ + Redis; React 18 + TS strict / Vite / Tailwind / React Router; PDF.js + Fabric.js (markup already installed); append-only audit + mutable operational tables; polling.
- **Decided**: model via **Azure Foundry** (Claude Opus vs GPT-5-class bake-off); email intake via **Microsoft Graph** (drop Gmail/Nylas paths); storage → **Azure Blob**, private containers; hosting → **Azure App Service/Container Apps + managed Postgres + Redis**.
- **Frontend additions**: React Hook Form + Zod (review/correction form; Zod mirrors extraction schema). TanStack Query optional — SWR already in place; swap only if reworking screens anyway.
- **Auth**: keep existing JWT email/password through the build (single user). **Entra ID SSO is a pre-team-rollout milestone**, not a build item — contained swap (app registration + token validation); property scoping beneath is unchanged.

## Security (V1 vs deferred)

V1 — guards data, not users:
1. **Graph webhook validation + least-privilege app registration** (Mail.Read, one mailbox) — the intake mailbox is the only outsider-facing door; non-deferrable.
2. Private blob + backend-streamed / short-lived-signed downloads.
3. Upload validation: file type, size, page count.
4. Secrets in Key Vault / App Service config (managed identity) at deploy.
5. Extend audit to role/property-access changes; add prompt/schema version to AI traceability columns.

Already built: per-property scoping (FirmUserRole), per-endpoint permission checks, invoice-lifecycle audit, CORS lockdown, firm_id on all records, intake dedupe.

Deferred to pre-team rollout: Entra SSO, second role (V1 = admin only), permission-change review flows.
Cut for this deployment (re-enter with SaaS/multi-firm): rate-limiting middleware (config caps suffice), Postgres RLS, SIEM/monitoring beyond an extraction-failure alert, PDF sandboxing (Defender for Storage toggle if desired), PII minimization to the AI provider (contradicts accuracy goal; data posture already decided).

## Phase 2 — earning the taper

1. Accuracy report: extraction vs. human corrections (data already captured by review flow).
2. ADI cross-check: backfill stored PDFs, run forward, calibrate agreement signal.
3. Auto-accept: validation passes + all fields `extracted` + extractors agree → skip review. Never on confidence alone.

## Scaling triggers

| Trigger | Revisit |
|---|---|
| >~20k invoices/mo | Cost-tiered routing |
| PO data for a vendor segment | 3-way matching for that segment |
| Review queue is the bottleneck | Threshold tuning / auto-accept rollout |
| Signals prove calibrated on own data | Raise auto-accept coverage |
| Bake-off shows a runaway winner | Drop multi-model testing overhead |

## Open items

1. Run the bake-off (58 labeled samples; firm labels ground truth).
2. Set totals-reconciliation tolerance band.
3. Confirm data-residency verdict on off-Azure Gemini before any production use.
4. Name reviewer(s) + review SLA — the 99%+ effective-accuracy claim depends on the loop closing promptly.
