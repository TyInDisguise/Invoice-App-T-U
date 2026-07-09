# Product Brief — Invoice Processing

**Updated:** 2026-07-08. Supersedes draw-inclusive scope for current build.

## Intent

CRE investment/development firms receive invoices mostly by email and process them by hand: read the PDF, key the data, assign the project, route for approval. This app replaces that with a system of record where invoices arrive, are read by AI, verified by a human, and land as approved, project-assigned expenses.

Accuracy bar: **near-perfect effective accuracy (99%+)** — achieved by extraction + deterministic validation + human review, not the model alone. Human review of every invoice is the starting posture, not the destination; oversight is removed only as measured accuracy earns it.

Core principle: **visibility replaces communication; every action is auditable without exception.**

## Users

Firm users (asset managers, accountants), scoped per property. Vendors are records matched against, not users.

## Workflow

1. Firm manages **properties** (grouped into portfolios) and a **vendor** directory.
2. **Invoices arrive** — email or manual upload. Duplicates detected and ignored.
3. A **vision LLM reads the document directly** (no OCR step): vendor, invoice number, dates, amounts/taxes/total, line items, **bill-to entity**, property-identifying hints, and expense category — **operating / non-operating / construction draw** (the sole categorization; no legacy schemes). Every value carries a status: extracted / inferred / ambiguous / missing. Null, never guessed.
   **No dead ends:** unreadable documents, failed extractions (after retries), and stuck jobs all land in the review queue flagged with the failure — the reviewer keys the fields by hand from the attached original. Nothing silently stalls.
4. **Deterministic validation**: line items + tax reconcile to total; date/currency sanity; fuzzy duplicate check (vendor + invoice # + amount).
5. System **proposes** vendor match and property assignment. Proposals, never facts.
6. **Human reviews each invoice** — one queue row per invoice, validation flags and uncertain fields highlighted — confirms or corrects. Confirmation makes it truth.
7. Confirmed invoices are **approved**, **rejected** (notes drawn on the PDF), or **held**. Unit of approval: the whole invoice.
8. Output: a ledger of **approved, project-assigned, categorized expenses**, originals attached, every step in an **append-only audit trail**.

## Non-negotiables

- **AI proposes; humans decide.** Model output is staged, marked by certainty; humans promote it.
- **Audit trail is immutable.** No update, no delete.
- **The firm owns its data** — records live in a company-owned database. (Provider-side zero-data-retention agreements: not required for V1; revisit if compliance demands it.)

## Excluded, designed-for later

Budget line items, job codes, GL coding. Vendor compliance lifecycle (W-9, COI, expiry tracking). Manual invoice creation without a document (correction-driven entry in the review queue covers V1 needs). Draw assembly, lender packaging, lien waivers, loans, escrow, PM payment portal. **Module seam: the confirmed Invoice record** (property, fields, line items, category, status) — later modules read it and know nothing about how it was produced.

Line items are extracted (they validate the total and feed the future draw module) but are not individually reviewed or approved.
