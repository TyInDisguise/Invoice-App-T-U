# Invoice Processing (V1)

CRE invoice intake, AI extraction, and human-reviewed approval — the confirmed
Invoice record is the deliverable. Draw assembly, budgets, and lender
packaging are a later module (see [`.planning/CARRY-OVER-MANIFEST.md`](.planning/CARRY-OVER-MANIFEST.md)
for what stayed behind in [Invoice-Draw-App](https://github.com/TyInDisguise/Invoice-Draw-App),
frozen there as reference).

Start with:
- [`.planning/PRODUCT-BRIEF.md`](.planning/PRODUCT-BRIEF.md) — intent, workflow, non-negotiables
- [`.planning/research/INVOICE-PROCESSING-ARCHITECTURE-V2.md`](.planning/research/INVOICE-PROCESSING-ARCHITECTURE-V2.md) — the 14 locked architecture decisions, platform choices, security scope

## Status

Backend domain/service layer (models, extraction, validation, property/vendor
matching, intake orchestration, ARQ worker) is scaffolded against the
architecture doc. Not yet done, in rough priority order:

- Initial Alembic migration (needs a live Postgres to autogenerate against)
- Frontend: API-contract updates for the new Invoice schema (category triad,
  proposed_vendor_id/proposed_property_id, extraction_status, validation_flags);
  prune portal/budget/draw screens carried over with the frontend copy
- Azure Foundry wiring in `VisionExtractionProvider._build_body` — the
  document-content-block format needs confirming against the model chosen in
  the bake-off (decision 9)
- Microsoft Graph webhook subscription + `clientState` validation for email intake
- Tests (none carried over — old repo's tests targeted the old schema)

## Local dev

```
docker compose up -d          # postgres + redis
cd backend && pip install -e ".[dev]"
cp .env.example .env
alembic upgrade head           # once an initial migration exists
uvicorn app.main:app --reload
python -m app.workers.arq_worker   # separate terminal

cd frontend && npm install && npm run dev
```
