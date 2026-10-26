# Pulse AI — As-Built Architecture

**Audit date:** 2026-10-22  
**Authority:** This document describes the code as it exists at `733dc82`. Where `README.md` and `docs/architecture.md` disagree, the source code is treated as authoritative.

---

## 1. System context

Pulse AI currently combines two largely separate domains in one frontend:

- **Citizen access demo:** hospital directory, schemes, documents, reports, voice assistant.
- **Supply-chain resilience demo:** demand forecast, hospital intelligence, disruption scenarios.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Browser (React 19 + TypeScript + Vite)                               │
│                                                                      │
│  AuthContext ◄──────────── Supabase Auth ──────────────► Supabase    │
│  Language/SimpleMode contexts (localStorage)                         │
│                                                                      │
│  Citizen pages ── local synthetic data / localStorage                │
│  Dashboard ────── POST /api/scenarios/simulate ──┐                   │
│  Intelligence ─── GET  /api/intelligence/summary ─┤                  │
│  Assistant ────── browser Web Speech API          │                  │
└───────────────────────────────────────────────────┼──────────────────┘
                                                    │ HTTP JSON (no auth)
                                      ┌─────────────▼─────────────┐
                                      │ Express 5 backend         │
                                      │ (TypeScript, tsx/node)    │
                                      │                           │
                                      │ routes → services         │
                                      │  ridge forecast           │
                                      │  risk + recommendations   │
                                      │  scenario simulation      │
                                      └─────────────┬─────────────┘
                                                    │ service-role client
                                      ┌─────────────▼─────────────┐
                                      │ Supabase PostgreSQL       │
                                      │ hospitals, medicines,     │
                                      │ inventory, demand_history,│
                                      │ orders, scenarios         │
                                      │ (schema not in repo)      │
                                      └───────────────────────────┘

  Python FastAPI (ml-service) ── only GET /health; not called by anyone
```

There is **no** frontend → Python ML-service call, no backend → Python call, and no Python model.

---

## 2. Frontend architecture

### 2.1 Composition

`frontend/src/main.tsx` wraps `App` in `AuthProvider`. `App` wraps routes in `LanguageProvider` and `SimpleModeProvider`, then `Layout` (Navbar/Footer). Public and protected routes are separated by `ProtectedRoute`, which checks the Supabase session.

### 2.2 Routing

| Route | Protection | Page |
|---|---|---|
| `/`, `/login`, `/signup` | Public | Landing/Login/Signup |
| `/hospitals`, `/hospitals/:id` | Public | Hospital list/details |
| `/schemes`, `/schemes/:id` | Public | Scheme list/details |
| `/dashboard` | Protected | Scenario simulation |
| `/documents` | Protected | Documents portal |
| `/reports` | Protected | Medical + scenario reports |
| `/intelligence` | Protected | Hospital intelligence |
| `/assistant` | Protected | Rule-based assistant |
| `*` | Public | 404 |

### 2.3 State and persistence

| State | Owner | Persistence |
|---|---|---|
| Supabase session/user | `AuthContext` | Supabase session storage |
| Language | `LanguageContext` | `localStorage["pulse-ai-language"]` |
| Simple mode | `SimpleModeContext` | `localStorage` |
| Uploaded documents | `DocumentsPage` component state | In-memory only (object URLs); name added to `localStorage` for scheme tracking |
| Scheme tracking flags | `demoCitizen.ts` helpers | `localStorage["pulse-ai-scheme-tracking"]` |
| Demo document names | `demoCitizen.ts` helpers | `localStorage["pulse-ai-demo-citizen-docs"]` |
| Scenario reports | `ReportsPage`/`DashboardPage` | `localStorage["pulseai.scenarioReports"]`, max 12 |
| Intelligence result | `IntelligencePage` state | None; reloaded on mount |
| Scenario result | `DashboardPage` state | Saved locally on every successful run |

### 2.4 Data-access paths

1. **Auth only:** frontend Supabase client is used solely for `auth.*`; it never queries application tables.
2. **Operational API:** two hardcoded `http://localhost:4000` calls:
   - `POST /api/scenarios/simulate` from `frontend/src/api/scenarios.ts:150`.
   - `GET /api/intelligence/summary` from `frontend/src/data/hospitalIntelligence.ts:78`.
3. **Local-only:** all citizen pages read static TypeScript modules and `localStorage`.
4. **Browser voice:** `useSpeechRecognition`/`useSpeechSynthesis`, no server STT/TTS.

### 2.5 Frontend fallback behavior

Only Hospital Intelligence has a functional offline fallback. It aborts the backend request after 4.5 seconds and runs a browser copy of the ridge model on synthetic data. The Dashboard scenario engine has **no** local fallback or cached result, so it fails visibly when the backend or database is unavailable.

### 2.6 Frontend structural concerns

- No shared package/contract with the backend; response types are manually duplicated in `frontend/src/api/scenarios.ts` and `frontend/src/data/hospitalIntelligence.ts`.
- No router-level code splitting; the production bundle is 826.85 kB (212.91 kB gzip) and triggers Vite’s 500 kB warning.
- No error boundary; a failed Supabase client initialization throws before React can render a useful error.
- `ProtectedRoute` renders plain text while auth loads.
- No deep-link or 404 handling for unknown hospital/scheme IDs beyond a static not-found state.

---

## 3. Backend architecture

### 3.1 Layering

```
index.ts
  ├─ dotenv + env validation (throws on missing Supabase values)
  ├─ cors()                     ← allows all origins
  ├─ express.json()
  ├─ healthRouter               GET /health
  ├─ dbTestRouter               GET /db-test
  ├─ scenarioRouter             POST /api/scenarios/simulate
  └─ intelligenceRouter         GET /api/intelligence/summary
         │
         ├─ intelligenceService ──► Supabase + synthetic fallback
         ├─ scenarioService ──────► Supabase + catalog
         └─ mlForecast           (pure functions)
```

### 3.2 Intelligence request flow

1. `buildIntelligenceSummary()` sequentially loads hospitals, medicines, inventory, and paginated demand history.
2. If **any** of those four is empty/errored, it discards all Supabase data and builds the deterministic synthetic dataset.
3. It groups demand by `hospitalId-medicineId`, builds pooled features, holds out the last 8 days per eligible series, and fits one ridge model.
4. It evaluates the model and a per-series historical-mean baseline on the holdout.
5. It forecasts 7 days recursively per series, projects stock, computes risk and recommendation, then ranks all series.
6. The route responds with `{ success: true, summary }`.

Failure mode: a Supabase error on the hospital/medicine/inventory load is silently converted into “empty” and triggers synthetic fallback. A demand-history error **throws** and returns HTTP 500.

### 3.3 Scenario request flow

1. Read one `scenarios` row by `id`.
2. Read all inventory rows and paginated demand history.
3. If inventory is empty, return an empty result set and a “No data” model.
4. Group demand, build the same pooled feature matrix/model and holdout metrics.
5. Derive scenario parameters (`surgeMultiplier`, transport delay, disrupted supplier S02 and its medicines).
6. For each inventory row: forecast 7 daily values, average them, apply surge, project `windowDays` of stock, compute impact/risk/reason, and build recommendations.
7. Run a single-pass redistribution matcher across results.
8. Build scenario-level counts/shortage/worst label and return `{ scenario, model, results }`.
9. Route wraps that object as `{ success: true, results }`.

### 3.4 Scenario semantics (as implemented)

- The base projection always assumes **no resupply** during the window.
- Supplier failure only changes recommendations/causal text for medicines supplied by S02; it does not directly remove scheduled deliveries (none are modeled).
- Transport delay extends the window to at least the delay length; it does not reduce delivered quantities.
- Demand surge multiplies **every** inventory item’s forecast, not a selected subset.
- Hospital disruption behaves like a uniform demand surge; no facility is singled out.
- Hospital/medicine “affected” lists are built from all result rows, so they are not scenario-specific.

### 3.5 Backend operational gaps

- No authn/authz, request validation, rate limiting, CORS allow-list, or request size limit.
- No central error handler; routes return generic 500 messages. `/db-test` can expose table errors/sample data.
- No timeouts/retries/circuit breaker for Supabase.
- No structured logs, correlation IDs, metrics, or health dependency checks.
- No graceful SIGTERM shutdown.
- No API versioning.
- Uses the **service-role** key, bypassing RLS by design; this is appropriate only if the API itself enforces authorization, which it does not.

---

## 4. ML service architecture

`ml-service/app/main.py` is a 20-line FastAPI app:

- Reads `SERVICE_NAME`, `SERVICE_VERSION`, `APP_ENV`.
- Exposes `GET /health`.
- Has empty `models/`, `routers/`, and `services/` packages.
- No model artifacts, training code, inference endpoint, database access, or backend integration.
- `requirements.txt` contains only FastAPI, Uvicorn, and Pydantic.

It is a reserved runtime, not part of the working intelligence path.

---

## 5. Data architecture (summary)

Only names and code-referenced columns are asserted here; see `03-database-and-data-sources.md`.

| Store | Used by | Notes |
|---|---|---|
| Supabase `hospitals`, `medicines`, `inventory`, `demand_history` | Intelligence + scenario | Empty intelligence tables trigger synthetic fallback; scenario requires seeded rows |
| Supabase `scenarios` | Scenario only | UI expects IDs 1–5; seed block is in README, not executable in repo |
| Supabase `orders` | `/db-test` only | Not used by any forecast/risk logic |
| Supabase Auth | Frontend | Email/password; `full_name` metadata |
| Static TypeScript datasets | Citizen pages | Synthetic hospitals/documents/reports; real public scheme descriptions |
| Browser `localStorage` | Citizen personalization + scenario reports | No server sync, per-browser only |
| Browser object URLs | Document upload previews | Lost on refresh |

---

## 6. Security and trust boundaries

| Boundary | Current state | Risk |
|---|---|---|
| Browser → operational API | No authentication or authorization | Anyone who can reach port 4000 can run simulations and read intelligence |
| Browser → Supabase Auth | Public publishable/anon key | Expected; depends on Supabase project config |
| Backend → Supabase | Service-role key in environment | Full DB bypass; must never be exposed |
| Backend CORS | `cors()` with no options | Any origin can call the API |
| `/db-test` | Public diagnostic endpoint | Leaks schema errors and sample operational data |
| Scheme external links | Official public URLs in dataset | External content is outside Pulse AI’s control |
| Voice | Browser vendor speech service | Audio processing is governed by browser/OS provider; not documented in-product |
| Local-only citizen records | `localStorage`/memory | No confidentiality guarantee; shared-device exposure |

No secrets were read or printed during this audit. Local `.env` files exist in `frontend/` and `backend/` and are git-ignored; their values were not inspected.

---

## 7. Deployment and environment architecture

- Intended local topology: Vite dev server (`5173`) + Express (`4000`) + optional Python (`8000`) + hosted Supabase.
- No reverse proxy, container, process manager, CI/CD, infrastructure-as-code, or production host configuration exists.
- API URLs are hardcoded to localhost, so a deployed frontend cannot reach a remote backend without code changes.
- `frontend/.env.example` and `frontend/src/lib/supabase.ts` use different Supabase key variable names.
- Backend refuses to start without Supabase credentials, even if the operator only wants the health endpoint.
- ML service is independently runnable but unused.

---

## 8. Documentation discrepancies

| Claim | Source | Actual state |
|---|---|---|
| “No authentication”, “No database code / connections”, “No ML models”, “No AI” | `docs/architecture.md` | All four are now false; Auth, Supabase reads, ridge ML, and a rules assistant exist |
| “Database not connected yet” | `docs/architecture.md` | Backend and frontend are wired to Supabase (live verification not performed) |
| “Cascade-impact analysis” | `README.md` headline | Network-wide simulation/redistribution only; no cascade graph |
| Copilot answers “Which hospital currently has the highest risk?” | `README.md` | Assistant only keyword-matches urgency/department/hospitals; it does not query intelligence |
| Demo “always runs” | README/architecture implication | Only intelligence has synthetic fallback; scenario simulation requires seeded Supabase |
| “One-click scenario-report saving” | `README.md` | Dashboard saves automatically after every successful run; no explicit save control |
| 14-day stock view | `IntelligencePage.tsx` label | Chart renders current stock + 7 forecast days (8 bars) |
