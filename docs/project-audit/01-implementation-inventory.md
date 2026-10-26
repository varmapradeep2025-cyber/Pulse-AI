# Pulse AI — Implementation Inventory

**Snapshot:** `main` @ `733dc82`, audit date 2026-10-22  
**Scope:** All application source and configuration tracked in Git. Lockfiles and ignored build output are excluded from implementation descriptions.

---

## 1. Repository snapshot

| Metric | Value |
|---|---|
| Tracked files | 112 |
| Source text files audited (TS/TSX/Python/CSS) | 90 |
| Physical source lines (including blank lines) | ~17,332 |
| Frontend TS/TSX | 72 files under `frontend/src` |
| Backend TS | 12 files under `backend/src` |
| ML service Python | 5 files under `ml-service/app` (only `main.py` has behavior) |
| TypeScript/React style | Strict TypeScript, function components, plain CSS |
| Package managers | npm (frontend/backend), pip/requirements (ML) |
| Commit history | `e274c15` foundation → `4993938` features → `733dc82` features update |

The repository has **no** SQL/migration directory, Dockerfile, CI workflow, test directory, lint configuration, or deployment manifest.

---

## 2. Service inventory

| Service | Entry point | Runtime | Port | Status |
|---|---|---|---|---|
| Frontend | `frontend/src/main.tsx` → `App.tsx` | React 19, React Router 7, Vite 8, TypeScript 7 | 5173 | Implemented, builds |
| Backend | `backend/src/index.ts` | Express 5, TypeScript via `tsx`, Node ≥ 20 | 4000 | Implemented, typechecks; needs Supabase env to start |
| ML service | `ml-service/app/main.py` | FastAPI / Uvicorn | 8000 | Health-check scaffold only |
| Database | Supabase PostgreSQL | Accessed only by backend `service_role` client and frontend Auth | n/a | Referenced, not provisioned in repo |

---

## 3. Backend inventory (`backend/src`, 12 TS files, ~2,522 lines)

### 3.1 Entry and configuration

| File | Lines | Purpose / notable behavior |
|---|---:|---|
| `index.ts` | 23 | Loads `dotenv/config`; creates Express app; enables unrestricted CORS + JSON parsing; mounts health, db-test, scenario, intelligence routers; listens on `HOST`/`PORT`. No error middleware or shutdown hook. |
| `config/env.ts` | 23 | Reads `PORT`, `HOST`, `NODE_ENV`; **throws at import** if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing. |
| `utils/supabase.ts` | 7 | Creates one shared Supabase client with the service-role key. |
| `routes/health.ts` | 15 | `GET /health` returns service name, environment, timestamp. |
| `routes/dbtest.ts` | 83 | `GET /db-test`; parallel reads five tables with `.limit(5)`; returns counts and sample rows, or error details. Diagnostic endpoint, unaudited. |
| `routes/intelligence.ts` | 33 | `GET /api/intelligence/summary`; calls `buildIntelligenceSummary`; wraps result in `{ success, summary }`. |
| `routes/scenario.ts` | 25 | `POST /api/scenarios/simulate`; accepts `{ scenarioId }`; calls `simulateScenario`; wraps the full response in `{ success, results }`. No validation. |
| `controllers/.gitkeep`, `middleware/.gitkeep`, `services/.gitkeep` | 0 | Placeholder directories; no controllers or middleware exist. |

### 3.2 Services

| File | Lines | Purpose / notable behavior |
|---|---:|---|
| `services/intelligenceService.ts` | 572 | Loads four Supabase tables; if any is empty, replaces **all** data with a deterministic synthetic dataset. Trains one pooled ridge model; produces per-series 7-day forecasts; computes coverage, stock-out day, safety-breach day, risk level, order quantity, recommendation, and priority ranking. |
| `services/mlForecast.ts` | 454 | Numeric/time feature builder, Gaussian-elimination solver, closed-form ridge fit with standardization and `log1p` target, prediction, MAE/RMSE/MAPE. |
| `services/scenarioService.ts` | 911 | Loads scenario/inventory/demand from Supabase; trains the same pooled model; applies scenario multipliers; projects stock day by day; assigns risk labels/reasons; builds operational recommendations; performs a redistribution matching pass; builds scenario summary. No synthetic fallback. |
| `services/syntheticData.ts` | 166 | Seeded `mulberry32(20260924)` dataset: 5 hospitals × 10 medicines × 365 days, ending 2026-09-22, plus inventory and safety stock. |

### 3.3 Reference data

| File | Lines | Purpose |
|---|---:|---|
| `data/catalog.ts` | 210 | 10 generic medicines, 5 fictional Madhya Pradesh facilities, 5 fictional suppliers; `DISRUPTED_SUPPLIER_ID = "S02"`; demonstration disclaimer. Used only by the scenario service. |

### 3.4 Backend implementation limits

- No controllers, service interfaces, DTO validation, middleware, auth, rate limiting, or structured logging.
- No pagination for `hospitals`, `medicines`, or `inventory`; `demand_history` is paginated in 1,000-row pages.
- No retry/timeout policy for Supabase calls.
- Scenario lookup uses `.single()`; a missing row becomes a thrown error and then a generic HTTP 500.
- Numeric coercion is done with `Number(...)` without finite/negative checks.
- The backend trusts the scenario row’s `disruption_type`; unknown types behave as generic demand-only projections.

---

## 4. Frontend inventory (`frontend/src`, 72 TS/TSX + 1 CSS, ~14,790 lines incl. 1,749 CSS)

### 4.1 Application shell

| File | Purpose |
|---|---|
| `main.tsx` | React root, `AuthProvider`, dev-only translation completeness check. |
| `App.tsx` | Public routes: `/`, `/login`, `/signup`, `/hospitals`, `/hospitals/:id`, `/schemes`, `/schemes/:id`. Protected routes: `/dashboard`, `/documents`, `/reports`, `/intelligence`, `/assistant`. 404 fallback. |
| `components/Layout.tsx` | Navbar, skip link, main outlet, footer. |
| `components/Navbar.tsx` | Eight nav items, language selector, simple-mode toggle, mobile menu. “Hospital Intel” uses a hardcoded English label. |
| `components/ProtectedRoute.tsx` | Redirects unauthenticated users to `/login`; shows plain “Loading...” text. |
| `index.css` | 1,749 lines of global styling, responsive rules and simple-mode styles. |

### 4.2 Contexts and authentication

| File | Purpose |
|---|---|
| `context/AuthContext.tsx` | Supabase session load + `onAuthStateChange`; exposes `user`, `loading`, `signOut`. |
| `context/LanguageContext.tsx` | 10-language selection, `localStorage` persistence, `t()` fallback to English, `format()` placeholder interpolation. |
| `context/SimpleModeContext.tsx` | Persisted simple-mode flag and text override helper. |
| `lib/supabase.ts` | Browser Supabase client; reads `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`; throws if missing. |
| `lib/auth.ts` | Email/password sign-up (with `full_name` metadata), sign-in, sign-out, get-current-user wrappers. |
| `pages/LoginPage.tsx`, `SignupPage.tsx` | Auth forms with error display; sign-up handles email-confirmation-required case. |

### 4.3 Pages

| Page | Route | Implemented behavior |
|---|---|---|
| `LandingPage.tsx` | `/` | Feature marketing, voice CTA, simple-mode notice, disclaimer. |
| `DashboardPage.tsx` | `/dashboard` | Voice card, quick actions, five-scenario selector, backend simulation call, headline/counts, assumptions, item stock curves, recommendations, automatic report save to `localStorage`. |
| `HospitalsPage.tsx` | `/hospitals` | Search/filter synthetic facilities; links to details. |
| `HospitalDetailsPage.tsx` | `/hospitals/:id` | Synthetic facility details, departments, beds, contact, disclaimer. |
| `SchemesPage.tsx` | `/schemes` | Search/filter 10 real public schemes; synthetic-citizen matching panel with reasons and missing documents. |
| `SchemeDetailsPage.tsx` | `/schemes/:id` | Scheme detail, prototype eligibility fields/results, tracking phase, document availability, upload handoff, official URL, access information. |
| `DocumentsPage.tsx` | `/documents` | 18 synthetic demo documents plus browser-only simulated upload (object URL, no server), category filter, scheme prefilling. |
| `ReportsPage.tsx` | `/reports` | Eight synthetic medical reports with view/explanation panels; separate list of locally saved scenario reports; no server persistence. |
| `AssistantPage.tsx` | `/assistant` | Rule-based chat, urgency/department/hospital matches, voice input, TTS, quick-start prompts, matched-facility cards. |
| `IntelligencePage.tsx` | `/intelligence` | Backend-first hospital intelligence, local fallback, model metrics, risk counts, ranked table, expanded sparkline/stock charts. |
| `NotFoundPage.tsx` | `*` | Static 404 page. |

### 4.4 Components

`ActionCard`, `ChatMessage`, `Disclaimer`, `DocumentCard`, `EmptyState`, `FeatureCard`, `Footer`, `HealthcareCard`, `LanguageSelector`, `Layout`, `LoadingState`, `Navbar`, `ProtectedRoute`, `ReportCard`, `SchemeCard`, `SimpleModeToggle`, `VoiceAssistantCard`, `VoiceButton` (18 total). These are presentational or thin interaction components; there is no design-system package.

### 4.5 Hooks and voice

| File | Purpose |
|---|---|
| `hooks/useSpeechRecognition.ts` | Web Speech recognition wrapper with secure-context check, permission/device preflight, fresh recognizer per session, error normalization, interim results, abort handling. Contains temporary console diagnostics. |
| `hooks/useSpeechSynthesis.ts` | Browser TTS wrapper; voice loading, exact-then-base locale matching, cancellation, no-voice/error states. |
| `hooks/useVoiceAssistant.ts` | State machine `idle → listening → processing → response/error` driven by real recognition events. |
| `voice/errors.ts` | Maps speech error kinds to translation keys. |
| `data/voiceLocales.ts` | Maps the 10 UI languages to `en-IN`, `hi-IN`, etc. |

### 4.6 API clients and shared types

| File | Purpose |
|---|---|
| `api/scenarios.ts` | Hardcoded `http://localhost:4000`; scenario/response types; `runScenarioSimulation`; expects `{ success, results }`. |
| `data/hospitalIntelligence.ts` | Hardcoded backend URL; 4.5 s timeout; local fallback engine that duplicates backend feature engineering, ridge fit, risk thresholds and ranking; result source `supabase | synthetic-fallback | local`. |
| `types/domain.ts` | Hospitals, schemes, documents, reports, assistant, voice types; contains both legacy and structured records. |
| `types/speech.ts` | Browser SpeechRecognition/Synthesis interfaces and error unions. |
| `types/api.ts` | Unused frontend-only `ping()` helper. |

### 4.7 Frontend data assets

| Asset | Count / coverage | Provenance |
|---|---|---|
| `data/i18n/*.ts` + `data/languages.ts` + `translations.ts` | 10 languages: English, Hindi, Marathi, Bengali, Tamil, Telugu, Gujarati, Kannada, Malayalam, Punjabi | Hand-authored UI translations; dev-time key check |
| `data/hospitals.ts` | 5 fictional facilities, H001–H005 | Synthetic demo data |
| `data/hospitalIntelligence.ts` | 5 synthetic hospital/medicine profiles + 365 days of demand | Deterministic local fallback; mirrors backend synthetic dataset |
| `data/schemes.ts` | 10 real public schemes; all 10 records currently marked `verified` | Real public descriptions + synthetic demo eligibility forms |
| `data/demoCitizen.ts` | 1 synthetic citizen (`DEMO-001`, age 32, Madhya Pradesh) | Synthetic; `localStorage` tracking/readiness |
| `data/schemeEligibility.ts` | Field-level prototype matching and ranking | Deterministic rules over demo profile |
| `data/hospitalMatching.ts` | Keyword urgency/department/hospital matching | Deterministic rules over synthetic hospitals; explicitly not diagnosis |
| `data/documents.ts` | 18 synthetic documents, 22 document types, category mappings | Synthetic demo data |
| `data/reports.ts` | 8 synthetic medical reports | Synthetic demo data |
| `data/patients.ts` | 5 synthetic patient IDs | Synthetic placeholders |
| `data/scenarioReports.ts` | Last 12 scenario reports in `localStorage` under `pulseai.scenarioReports` | Browser-local; not synchronized |
| `data/assistant.ts` | Legacy sample transcript/replies | Demo copy; mostly not the live assistant path |

---

## 5. ML service inventory (`ml-service`)

| File | Status |
|---|---|
| `app/main.py` | Active: reads `SERVICE_NAME`, `SERVICE_VERSION`, `APP_ENV`; exposes `GET /health`; no model or inference route. |
| `app/models/__init__.py`, `app/routers/__init__.py`, `app/services/__init__.py` | Empty placeholders. |
| `requirements.txt` | `fastapi`, `uvicorn[standard]`, `pydantic` only. |
| `.env.example` | Service metadata/host/port only. |

The real ML runs in the Node backend, not the Python service.

---

## 6. Implemented vs partial vs claimed-only

| Capability | Status | Evidence |
|---|---|---|
| Email/password authentication | Implemented | Supabase Auth + protected routes |
| Multilingual UI (10 languages) | Implemented | Separate dictionaries/context |
| Browser speech input/output | Implemented | Web Speech hooks + voice card + assistant |
| Hospital directory | Implemented (synthetic) | 5 records + list/detail pages |
| Documents/reports portals | Implemented (synthetic/browser-local) | 18 documents, 8 reports; upload not persisted |
| Scheme catalogue and prototype eligibility | Implemented (synthetic profile) | 10 schemes, rules engine |
| Ridge demand forecast | Implemented | `mlForecast.ts` + duplicated browser engine |
| Risk ranking and stock-out projection | Implemented | Intelligence service/page |
| Five disruption scenarios | Implemented (DB-dependent) | Scenario service + dashboard |
| Alternate supplier/recommendation engine | Implemented (catalog-driven) | Scenario service |
| Redistribution matching | Partial | Single-pass, non-mutating, over-allocation possible |
| Cascade/network impact | Partial/claimed beyond implementation | No graph propagation; network-wide rows only |
| LLM Copilot | Not implemented | Rule/keyword assistant only |
| Python ML service | Not implemented | Health-only scaffold |
| Real hospital/supplier/patient data | Not implemented | Synthetic/demo only |
| Database schema/RLS in repository | Not implemented | Reference SQL only in README |
| Automated tests / lint / CI | Not implemented | None configured |

---

## 7. Legacy / duplicate / unused code observations

- `types/domain.ts` deliberately keeps legacy fields alongside structured fields; both are populated in data modules.
- The browser intelligence engine (`data/hospitalIntelligence.ts`) duplicates backend logic and synthetic data rather than consuming shared packages.
- `types/api.ts` defines an unused `ping()` helper.
- `data/assistant.ts` contains legacy sample messages not used by the live `AssistantPage` response path.
- Backend `controllers/` and `middleware/` are empty placeholder directories.
- The frontend includes `VITE_API_BASE_URL` in configuration but does not read it.
