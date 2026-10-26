# Pulse AI — File Reference Index

**Audit date:** 2026-10-22  
**Snapshot:** `main` @ `733dc82`  
**Line counts:** Physical lines including blank lines, from the working tree at audit time. Lockfiles are listed for completeness but not analyzed line by line.

---

## 1. Repository totals

| Metric | Value |
|---|---:|
| Tracked files | 112 |
| Frontend TS/TSX | 72 |
| Backend TS | 12 |
| ML Python | 5 (3 empty `__init__`) |
| CSS | 1 (`frontend/src/index.css`, 1,749 lines) |
| Markdown docs (pre-audit) | 2 (`README.md`, `docs/architecture.md`) |
| Audit docs added | 10 (`docs/project-audit/00`–`09`) |
| SQL/migration/test/CI files | 0 |

---

## 2. Root and project configuration

| File | Lines | Purpose |
|---|---:|---|
| `.gitignore` | 32 | Ignores `node_modules`, build output, `.env`, Python caches |
| `README.md` | 629 | Product overview, setup, expected schema/seed, feature claims, roadmap |
| `docs/architecture.md` | 77 | **Stale** foundation-phase architecture; says no auth/DB/ML/AI |
| `backend/package.json` | 25 | Backend scripts and deps (Express 5, Supabase, cors, dotenv) |
| `backend/package-lock.json` | 2,055 | Resolved dependency lock |
| `backend/tsconfig.json` | 16 | NodeNext ES modules, strict, `src` → `dist` |
| `backend/.env.example` | 13 | Sample backend env; Supabase vars marked “not used yet” (stale) |
| `backend/.gitignore` | 8 | Backend build/env ignores |
| `frontend/package.json` | 24 | Frontend scripts/deps (React 19, Router 7, Vite 8, TS 7) |
| `frontend/package-lock.json` | 1,461 | Resolved dependency lock |
| `frontend/tsconfig.json` | 19 | Strict DOM/ESNext TS config |
| `frontend/vite.config.ts` | 9 | React plugin, dev server port 5173 |
| `frontend/index.html` | 12 | SPA shell; no external fonts/analytics |
| `frontend/.env.example` | 8 | Documents `VITE_SUPABASE_ANON_KEY` (code expects `..._PUBLISHABLE_KEY`) |
| `ml-service/requirements.txt` | 3 | FastAPI, Uvicorn standard, Pydantic |
| `ml-service/.env.example` | 12 | Service metadata/host/port examples |
| `ml-service/.gitignore` | 8 | Python env/cache ignores |
| `frontend/src/vite-env.d.ts` | 1 | Vite client type reference |

---

## 3. Backend (`backend/src`, 2,522 lines)

### 3.1 Entry, config, utilities

| File | Lines | Key symbols / purpose |
|---|---:|---|
| `index.ts` | 23 | Express app; CORS, JSON, routers, listen. No auth/error middleware/graceful shutdown |
| `config/env.ts` | 23 | `env` object; throws if Supabase URL/service key missing |
| `utils/supabase.ts` | 7 | Shared service-role Supabase client |
| `utils/.gitkeep` | 0 | Placeholder |
| `controllers/.gitkeep` | 0 | Empty placeholder; no controllers |
| `middleware/.gitkeep` | 0 | Empty placeholder; no middleware |
| `services/.gitkeep` | 0 | Placeholder |

### 3.2 Routes

| File | Lines | Key symbols / purpose |
|---|---:|---|
| `routes/health.ts` | 15 | `GET /health` liveness payload |
| `routes/dbtest.ts` | 83 | `GET /db-test`; reads five tables, returns counts/rows/errors |
| `routes/intelligence.ts` | 33 | `GET /api/intelligence/summary`; `{ success, summary }` |
| `routes/scenario.ts` | 25 | `POST /api/scenarios/simulate`; `{ success, results }` |

### 3.3 Services

| File | Lines | Key exports / purpose |
|---|---:|---|
| `services/mlForecast.ts` | 454 | `BASE_BANDS`, `BASE_FEATURE_NAMES`, `buildBaseFeatures`, `futureDate`, `addDays`, `dateString`, `solveLinear`, `fitRidge`, `predictVector`, `computeMetrics` |
| `services/intelligenceService.ts` | 572 | Data loaders, `buildSeriesForecasts`, `buildIntelligenceSummary`, risk bands, lead time, recommendation, priority |
| `services/scenarioService.ts` | 911 | `simulateScenario`, scenario params, projections, `buildRecommendations`, `applyRedistribution`, `buildSummary`, risk mapping |
| `services/syntheticData.ts` | 166 | `buildSyntheticDataset`; seeded demand/inventory for intelligence fallback |

### 3.4 Catalog

| File | Lines | Key exports / purpose |
|---|---:|---|
| `data/catalog.ts` | 210 | 10 medicines, 5 hospitals, 5 suppliers; lookup helpers; `DEMO_DISCLAIMER`, `DISRUPTED_SUPPLIER_ID` |

---

## 4. Frontend shell and global styles

| File | Lines | Purpose |
|---|---:|---|
| `frontend/src/main.tsx` | 25 | React root, `AuthProvider`, dev translation-completeness check |
| `frontend/src/App.tsx` | 56 | Route definitions and public/protected split |
| `frontend/src/index.css` | 1,749 | Global CSS, responsive layout, simple-mode styles |
| `frontend/src/vite-env.d.ts` | 1 | Vite types |

---

## 5. Frontend contexts (`context/`, 216 lines)

| File | Lines | Purpose |
|---|---:|---|
| `AuthContext.tsx` | 77 | Supabase session state, auth listener, `signOut` |
| `LanguageContext.tsx` | 87 | 10-language state, persistence, `t`, `format` |
| `SimpleModeContext.tsx` | 52 | Persisted simple-mode flag and copy helper |

---

## 6. Frontend libraries, API, types, voice

| File | Lines | Purpose |
|---|---:|---|
| `lib/supabase.ts` | 13 | Browser Supabase client; requires `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `lib/auth.ts` | 55 | Sign-up/sign-in/sign-out/current-user wrappers; `full_name` metadata |
| `api/scenarios.ts` | 181 | Scenario types and `runScenarioSimulation`; hardcoded localhost URL |
| `types/domain.ts` | 201 | Hospitals, schemes, documents, reports, assistant/voice domain types (legacy + structured) |
| `types/speech.ts` | 86 | Speech recognition/synthesis interfaces and error types |
| `types/api.ts` | 13 | Unused local `ping()` helper |
| `voice/errors.ts` | 37 | Speech error → translation-key mapping |
| `api/.gitkeep` | 0 | Placeholder |

---

## 7. Frontend hooks (`hooks/`, 594 lines)

| File | Lines | Purpose |
|---|---:|---|
| `useSpeechRecognition.ts` | 338 | Recognition lifecycle, secure-context/permission checks, error normalization, TEMP diagnostics |
| `useSpeechSynthesis.ts` | 118 | TTS lifecycle, voice loading/locale matching, cancellation |
| `useVoiceAssistant.ts` | 138 | Voice state machine and assistant integration |

---

## 8. Frontend components (`components/`, 956 lines)

| File | Lines | Purpose |
|---|---:|---|
| `ActionCard.tsx` | 58 | Action/navigation card |
| `ChatMessage.tsx` | 28 | Assistant message bubble |
| `Disclaimer.tsx` | 11 | Reusable demo/medical disclaimer |
| `DocumentCard.tsx` | 108 | Document metadata/status card |
| `EmptyState.tsx` | 26 | Empty-list placeholder |
| `FeatureCard.tsx` | 30 | Landing feature card |
| `Footer.tsx` | 28 | Global footer/disclaimer links |
| `HealthcareCard.tsx` | 80 | Hospital/facility card |
| `LanguageSelector.tsx` | 34 | Language dropdown |
| `Layout.tsx` | 21 | Navbar + skip link + outlet + footer |
| `LoadingState.tsx` | 12 | Loading placeholder |
| `Navbar.tsx` | 105 | Desktop/mobile nav, language, simple-mode toggle |
| `ProtectedRoute.tsx` | 16 | Auth guard with plain loading text |
| `ReportCard.tsx` | 107 | Synthetic/scenario report display |
| `SchemeCard.tsx` | 85 | Scheme summary card |
| `SimpleModeToggle.tsx` | 24 | Simple-mode switch |
| `VoiceAssistantCard.tsx` | 127 | Voice status/controls/result summary |
| `VoiceButton.tsx` | 56 | Microphone button states/accessibility labels |

---

## 9. Frontend pages (`pages/`, 5,007 lines)

| File | Lines | Route | Purpose |
|---|---:|---|---|
| `LandingPage.tsx` | 101 | `/` | Hero, feature cards, voice CTA, disclaimers |
| `LoginPage.tsx` | 72 | `/login` | Email/password sign-in |
| `SignupPage.tsx` | 94 | `/signup` | Sign-up + email-confirmation handling |
| `DashboardPage.tsx` | 771 | `/dashboard` | Five-scenario selector, simulation run, charts, recommendations, auto-save |
| `HospitalsPage.tsx` | 626 | `/hospitals` | Search/filter synthetic hospitals |
| `HospitalDetailsPage.tsx` | 144 | `/hospitals/:id` | Facility details |
| `SchemesPage.tsx` | 353 | `/schemes` | Search/list schemes + demo-citizen matching |
| `SchemeDetailsPage.tsx` | 594 | `/schemes/:id` | Eligibility fields/results, tracking, document upload handoff |
| `DocumentsPage.tsx` | 598 | `/documents` | 18 demo docs + session-only simulated upload |
| `ReportsPage.tsx` | 485 | `/reports` | 8 demo reports + local scenario reports; `/` link bug |
| `AssistantPage.tsx` | 782 | `/assistant` | Rule-based chat, hospital matching, voice |
| `IntelligencePage.tsx` | 371 | `/intelligence` | Risk table, charts, model metrics; “14-day view” label bug |
| `NotFoundPage.tsx` | 16 | `*` | Static 404 |

---

## 10. Frontend data (`data/`, 3,316 lines + i18n 2,284 lines)

### 10.1 Domain datasets and logic

| File | Lines | Purpose / counts |
|---|---:|---|
| `assistant.ts` | 32 | Legacy sample transcript/replies; not the live response path |
| `demoCitizen.ts` | 209 | Synthetic citizen profile; tracking/document readiness localStorage helpers |
| `documents.ts` | 352 | 18 demo documents (`DOC-001`–`018`), 22 types/category mappings |
| `hospitalIntelligence.ts` | 810 | Backend client + local ML fallback + synthetic data + duplicated ridge/risk logic |
| `hospitalMatching.ts` | 356 | Keyword urgency/department/hospital matching for assistant |
| `hospitals.ts` | 202 | 5 synthetic hospitals (`H001`–`H005`), departments/contacts |
| `languages.ts` | 16 | 10 supported language definitions |
| `patients.ts` | 21 | 5 synthetic patient IDs (`PAT-001`–`005`) |
| `reports.ts` | 134 | 8 synthetic reports (`REPORT-01`–`08`) |
| `scenarioReports.ts` | 147 | `localStorage` scenario report CRUD, max 12, key `pulseai.scenarioReports` |
| `schemeEligibility.ts` | 266 | Field definitions, prototype evaluation/ranking, missing-document logic |
| `schemes.ts` | 748 | 10 real public schemes; all records `verified`; application/tracking metadata |
| `translations.ts` | 1 | Re-export of i18n index |
| `voiceLocales.ts` | 22 | UI language → BCP-47 speech locale map |

### 10.2 Translation dictionaries (`data/i18n/`, 2,284 lines)

| File | Lines | Language |
|---|---:|---|
| `index.ts` | 62 | Dictionary registry, types, completeness helper |
| `en.ts` | 260 | English (reference dictionary) |
| `hi.ts` | 218 | Hindi |
| `mr.ts` | 218 | Marathi |
| `bn.ts` | 218 | Bengali |
| `ta.ts` | 218 | Tamil |
| `te.ts` | 218 | Telugu |
| `gu.ts` | 218 | Gujarati |
| `kn.ts` | 218 | Kannada |
| `ml.ts` | 218 | Malayalam |
| `pa.ts` | 218 | Punjabi |

Non-English dictionaries have fewer lines than English; the dev-only completeness check exists because key coverage can differ.

---

## 11. ML service (`ml-service/`)

| File | Lines | Purpose |
|---|---:|---|
| `app/main.py` | 20 | FastAPI app; env metadata; `GET /health`; no model/inference |
| `app/__init__.py` | 0 | Package marker |
| `app/models/__init__.py` | 0 | Empty placeholder |
| `app/routers/__init__.py` | 0 | Empty placeholder |
| `app/services/__init__.py` | 0 | Empty placeholder |
| `requirements.txt` | 3 | FastAPI/Uvicorn/Pydantic |
| `.env.example` | 12 | Service metadata/host/port |
| `.gitignore` | 8 | Python ignores |

The backend never calls this service; `ML_SERVICE_URL` is unused.

---

## 12. Key symbol locator

### 12.1 Backend

| Symbol | Location |
|---|---|
| Express app/bootstrap | `backend/src/index.ts:1` |
| Env validation | `backend/src/config/env.ts:1` |
| Supabase client | `backend/src/utils/supabase.ts:1` |
| Intelligence route | `backend/src/routes/intelligence.ts:15` |
| Scenario route | `backend/src/routes/scenario.ts:7` |
| DB diagnostic route | `backend/src/routes/dbtest.ts:6` |
| Synthetic dataset | `backend/src/services/syntheticData.ts:buildSyntheticDataset` |
| Feature builder | `backend/src/services/mlForecast.ts:142` |
| Ridge fit | `backend/src/services/mlForecast.ts:276` |
| Prediction | `backend/src/services/mlForecast.ts:392` |
| Metrics | `backend/src/services/mlForecast.ts:424` |
| Intelligence entry | `backend/src/services/intelligenceService.ts:527` |
| Risk/recommendation | `backend/src/services/intelligenceService.ts:431–479` |
| Scenario entry | `backend/src/services/scenarioService.ts:255` |
| Scenario projection | `backend/src/services/scenarioService.ts:551` |
| Redistribution | `backend/src/services/scenarioService.ts:742` |
| Scenario summary | `backend/src/services/scenarioService.ts:809` |
| Catalog + supplier | `backend/src/data/catalog.ts` |

### 12.2 Frontend

| Symbol | Location |
|---|---|
| Route map | `frontend/src/App.tsx:1` |
| Auth provider | `frontend/src/context/AuthContext.tsx:1` |
| Language provider | `frontend/src/context/LanguageContext.tsx:1` |
| Supabase client | `frontend/src/lib/supabase.ts:1` |
| Auth wrappers | `frontend/src/lib/auth.ts:1` |
| Scenario client | `frontend/src/api/scenarios.ts:150` |
| Intelligence loader/fallback | `frontend/src/data/hospitalIntelligence.ts:78` |
| Local forecast loop | `frontend/src/data/hospitalIntelligence.ts:647` |
| Assistant matching | `frontend/src/data/hospitalMatching.ts:matchHospitals` |
| Scheme eligibility | `frontend/src/data/schemeEligibility.ts:evaluateSchemeEligibility` |
| Scenario report storage | `frontend/src/data/scenarioReports.ts` |
| Speech recognition | `frontend/src/hooks/useSpeechRecognition.ts:1` |
| Speech synthesis | `frontend/src/hooks/useSpeechSynthesis.ts:1` |
| Voice state machine | `frontend/src/hooks/useVoiceAssistant.ts:1` |
| Speech errors | `frontend/src/voice/errors.ts:1` |
| Dashboard simulation/save | `frontend/src/pages/DashboardPage.tsx:114–124` |
| Intelligence label defect | `frontend/src/pages/IntelligencePage.tsx:93` |
| Reports link defect | `frontend/src/pages/ReportsPage.tsx:446–447` |
| Upload state defect | `frontend/src/pages/DocumentsPage.tsx:71,198,221` |
| TEMP diagnostics | `frontend/src/hooks/useSpeechRecognition.ts:128–136` |

---

## 13. Audit documents added

| File | Contents |
|---|---|
| `docs/project-audit/00-executive-summary.md` | Verdict, health checks, scorecard, top findings, recommended sequence |
| `docs/project-audit/01-implementation-inventory.md` | Repository/services/modules/pages/data inventory and maturity |
| `docs/project-audit/02-architecture.md` | As-built architecture, data flows, security/deployment boundaries, doc discrepancies |
| `docs/project-audit/03-database-and-data-sources.md` | Tables/columns used, missing schema/RLS, synthetic datasets, data provenance |
| `docs/project-audit/04-ml-and-resilience-engine.md` | Features, ridge formulas, risk bands, scenario math and defects, cascade assessment |
| `docs/project-audit/05-api-and-integrations.md` | Endpoint contracts, clients, auth/CORS, Supabase/speech integrations, env matrix |
| `docs/project-audit/06-testing-and-known-issues.md` | Verification results, ranked issues, test strategy |
| `docs/project-audit/07-five-feature-gap-analysis.md` | Feature-by-feature implemented/partial/missing analysis with effort |
| `docs/project-audit/08-development-roadmap.md` | v1.x stabilization, v2.0, v2.5, v3.0, v4.0 with acceptance criteria |
| `docs/project-audit/09-file-reference-index.md` | This exhaustive file/symbol index |

---

## 14. Index notes

- Paths are relative to the repository root.
- “Lines” includes blank lines; this differs from `git`/`Measure-Object` counts that exclude blanks.
- `.gitkeep` files (0 lines) preserve empty directories; they contain no behavior.
- Lockfiles are listed but intentionally not summarized.
- No SQL, migration, seed, test, Docker, CI, or hosting files exist to index.
- `.env` files are intentionally ignored and were not read; only `.env.example` files are indexed.
