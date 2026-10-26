# Pulse AI — Executive Audit Summary

**Audit date:** 2026-10-22  
**Repository:** `C:\Users\ADMIN\Desktop\Pulse AI`  
**Branch / HEAD:** `main` / `733dc82` (`Update Pulse AI features`)  
**Audit type:** Read-only source and configuration audit; documentation added without changing application code, database, or dependencies.

---

## 1. What Pulse AI is today

Pulse AI is a working **hackathon/demo prototype** for healthcare supply-chain intelligence. It has two product surfaces that are not yet integrated with each other:

1. **Citizen-facing access tools** — synthetic hospitals, medical documents, reports, government-scheme information and eligibility demo, multilingual UI, browser voice input/output, and a rule-based assistant.
2. **Operations-facing resilience tools** — a TypeScript ridge-regression demand forecast, hospital/medicine risk ranking, and a scenario simulator for five predefined supply disruptions.

The repository is more advanced than `docs/architecture.md` claims. That document still describes a foundation phase with no authentication, database, ML, or AI. In reality, Supabase Auth, Supabase-backed supply tables, a TypeScript ML model, and the scenario engine are implemented. `README.md` is much closer to the code, although it overstates cascade-impact analysis and some Copilot capabilities.

**Bottom line:** this is a credible, runnable demonstration of forecast → risk → scenario response, not a production or clinically usable system. The main missing pieces are real data integrations, committed database schema/migrations, server-side persistence, automated tests, authentication/authorization for the operational API, and genuine cascade/network modeling.

---

## 2. Verified health check

| Check | Command | Result |
|---|---|---|
| Frontend typecheck + production build | `npm run build` in `frontend/` | **Passed** (133 modules; 826.85 kB JS bundle; Vite chunk-size warning) |
| Backend typecheck | `npm run typecheck` in `backend/` | **Passed** |
| ML service route surface | Python import of `app.main` | **Passed**; only `/health` plus FastAPI docs |
| Automated tests | Repository scan | **None found** — no test files, runner config, or test script |
| Lint | Repository scan | **None configured** |
| Database/schema verification | Source + repository scan | **Not possible/not present** — no SQL migrations in the repo; live Supabase project not inspected |
| Production deployment | Repository scan | **None configured** — no Dockerfile, CI workflow, or hosting config |

The working tree was clean before documentation files were added. Build output is ignored by `.gitignore`.

---

## 3. Five-feature scorecard

Maturity scale: **Early** → **Partial** → **Functional prototype** → **Production-ready**.

| Feature | Maturity | What is actually implemented | Most important gap |
|---|---|---|---|
| **Hospital Intelligence** | Functional prototype | Backend pipeline loads hospitals/medicines/inventory/demand, trains a pooled model, ranks hospital × medicine items by risk, returns days-to-stock-out and recommended order quantity; frontend has a full Intelligence page. | Synthetic/seed data only; no facility integration, no confidence intervals, no operational write-back. |
| **Demand & Stock-out Prediction** | Functional prototype | Pure-TypeScript ridge regression with lag, rolling mean, trend, weekday, month and hospital × medicine features; 8-day holdout; MAE/RMSE/MAPE; 7-day forecast; safety-stock and stock-out risk bands. | No real-world validation, no model registry/retraining, lead time is inferred rather than contracted, no prediction uncertainty. |
| **Resilience Scenario Engine** | Functional prototype | Five predefined scenarios (supplier failure, transport delay, demand surge, hospital disruption, combined), day-by-day stock projection, risk bands, operational recommendations, alternate-supplier suggestions and redistribution matching. | Requires Supabase scenario/inventory/demand rows; no custom scenarios; several disruption mechanics are simplified; no server-side run history. |
| **Cascade / Network Impact** | Partial / early | Every inventory row is simulated network-wide; redistribution matches a projected donor surplus to a recipient shortage for the same medicine. | No dependency graph, no cascading propagation between facilities/suppliers, and the redistribution pass does not decrement donor surplus, so one surplus can be promised more than once. |
| **Pulse AI Copilot** | Early | Rule-based assistant: keyword urgency/department mapping, synthetic hospital matching, multilingual formatted replies, microphone and read-aloud via the browser Web Speech API. | No LLM, no database/model querying, and operational questions such as “which hospital has the highest risk?” are not actually answered from the intelligence engine. |

---

## 4. Highest-priority findings

### Critical / high

1. **No committed database schema or migrations.** The six expected Supabase tables are defined only as a reference SQL block in `README.md`; the repository has no SQL or migration files. Schema, constraints, indexes, seed data, and RLS cannot be reproduced from source control.
2. **Forecast feature index is off by one day.** Both backend forecast loops and the browser fallback call `buildBaseFeatures(simulated, simulated.length - 1)`, so each step uses the previous day’s feature row, excludes the newest observation from `lag1`/rolling windows, and assigns the prediction to the wrong date. Risk and stock-out days inherit the error.
3. **Redistribution can over-allocate a donor.** Donor surplus is never decremented between matches, and the simulation is not rerun after a transfer, so one facility’s surplus can be promised multiple times.
4. **Scenario simulation has no synthetic fallback.** Hospital Intelligence falls back to deterministic synthetic data when Supabase is empty, but `scenarioService.simulateScenario()` requires a seeded `scenarios` row and non-empty `inventory`; otherwise it throws or returns empty results. This contradicts the “demo always runs” impression in the README.
5. **Operational API is unauthenticated and open-CORS.** `/api/intelligence/summary`, `/api/scenarios/simulate`, `/db-test`, and `/health` have no auth, authorization, rate limiting, or schema validation. `cors()` allows every origin. `/db-test` exposes sample operational rows.
6. **Frontend environment variable mismatch.** `frontend/src/lib/supabase.ts` requires `VITE_SUPABASE_PUBLISHABLE_KEY`, while `frontend/.env.example` documents `VITE_SUPABASE_ANON_KEY`. Following the example causes the app to throw during startup.
7. **No automated tests or lint gate.** Both TypeScript projects typecheck, but no behavior, API, ML, authorization, or UI tests exist, and there is no CI.

### Medium

- API base URLs are hard-coded to `http://localhost:4000` in `frontend/src/api/scenarios.ts` and `frontend/src/data/hospitalIntelligence.ts`; `VITE_API_BASE_URL` is documented but unused.
- Frontend and backend duplicate the ML/risk implementation instead of sharing one contract; they can drift.
- Scenario “affected” hospital/medicine lists are derived from all returned inventory rows, so they overstate what a supplier-specific scenario actually affects.
- Scenario transport delay does not model reduced deliveries; supplier failure does not remove stock beyond extending the projection window; “hospital disruption” applies a uniform demand multiplier.
- Document uploads are session-only browser object URLs; refresh loses the uploaded record/file. Only the document name is persisted to `localStorage` for scheme tracking.
- No error boundary, no graceful shutdown, no structured logging, no request IDs, and generic 500 responses.
- Left-in voice diagnostics (`console.log` marked “TEMP DIAGNOSTICS”) and a misleading “14-day view” label over a 7-day chart.
- Scheme information is real public-scheme description data, but eligibility is a synthetic-profile prototype; only the demo citizen’s canned profile is evaluated.

### Positive findings

- Clear synthetic/demo labelling and a repeated “not clinical advice / not official eligibility” disclaimer.
- Deterministic seeded synthetic data makes the intelligence demo reproducible without a database.
- The ML model is implemented rather than mocked, with a holdout baseline comparison surfaced in the UI.
- Scenario output includes written risk reasons, assumptions, operational-only recommendations, and provenance labels.
- Browser speech handling includes secure-context checks, permission/device preflight, locale matching, and graceful “no voice installed” behavior.
- All ten UI languages have separate translation dictionaries, with a dev-time missing-key check.

---

## 5. Recommended sequence

1. **Make the current demo correct and reproducible:** fix forecast date/lag alignment and redistribution invariants; commit schema/seed/RLS migrations; add a scenario seed path and fallback; fix the frontend env-name mismatch; centralize API base URL configuration.
2. **Secure and test the operational surface:** add API authentication/authorization, validation, rate limits, CORS allow-list, tests, lint, and CI.
3. **Replace the network claim with real network logic:** model suppliers → facilities → medicines as a graph, recompute stock after transfers, and add explicit cascade rules.
4. **Persist decisions and audit trails:** server-side scenario runs, report export, and model/risk versioning.
5. **Then add the LLM Copilot:** tool-calling/retrieval over the intelligence and scenario services, with citations, safety boundaries, and multilingual evaluation.

Detailed evidence, formulas, API contracts, and file-level references are in documents `01`–`09`.
