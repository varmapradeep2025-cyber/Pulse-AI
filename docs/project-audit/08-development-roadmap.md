# Pulse AI — Development Roadmap

**Audit date:** 2026-10-22  
**Baseline:** `main` @ `733dc82`  
**Rule:** Every item below is marked **Implemented**, **Partial**, or **Planned**. Planned work is not a claim about current capability.

The four original roadmap stages are preserved: **v2.0 Foundation/Resilience**, **v2.5 Decision Intelligence**, **v3.0 AI Interface**, **v4.0 Real-World System**. A **v1.x stabilization** gate is added because critical correctness, reproducibility, and security work must precede new scope.

---

## 1. Roadmap at a glance

| Stage | Theme | Status | Exit condition |
|---|---|---|---|
| **v1.x** | Stabilize the prototype | **Partial** | Trustworthy math, reproducible setup, secured API, automated tests |
| **v2.0** | Foundation / Resilience | **Partial** | Versioned data platform, real scenario semantics, persisted runs |
| **v2.5** | Decision Intelligence | **Planned** | Confidence-aware recommendations, comparison/sensitivity, workflow |
| **v3.0** | AI Interface | **Planned** | Grounded multilingual Copilot with tools, citations, and safety |
| **v4.0** | Real-World System | **Planned** | Real integrations, governance, multi-tenant operations, validated impact |

---

## 2. Current capability vs roadmap

| Capability | Current status | Target stage |
|---|---|---|
| Supabase Auth + protected routes | Implemented | v1.x hardening |
| Multilingual UI (10 languages) | Implemented | v2.0 refinement |
| Browser speech input/output | Implemented | v3.0 upgrade |
| Hospital directory (synthetic) | Implemented | v4.0 real data |
| Schemes/documents/reports (synthetic/local) | Implemented demo | v2.0 persistence, v4.0 integration |
| Ridge demand forecast | Implemented, needs correction | v1.x |
| Risk ranking + order recommendation | Implemented prototype | v2.5 |
| Five disruption scenarios | Implemented prototype | v2.0 |
| Redistribution advice | Partial, unsafe | v2.0 |
| Cascade/network model | Not implemented | v2.0/v2.5 |
| Server-side run history | Not implemented | v2.0 |
| API auth/validation/rate limits | Not implemented | v1.x |
| DB migrations/seed/RLS | Not implemented | v1.x |
| Automated tests/CI/lint | Not implemented | v1.x |
| LLM Copilot with tools | Not implemented | v3.0 |
| Real hospital/supplier/EHR/procurement integrations | Not implemented | v4.0 |
| Observability/deployment | Not implemented | v1.x–v2.0 |

---

## 3. v1.x — Stabilize the prototype

**Goal:** make the current demo correct, reproducible, secure, and testable. No new headline features.

### 3.1 Correctness (P0)

| Item | Status | Work | Acceptance criteria |
|---|---|---|---|
| Forecast alignment | **Planned fix** | Pass `simulated.length` to feature builder in backend, scenario, and browser engine | Forecast day 1 uses latest observation; date/lag/weekday tests pass |
| Redistribution invariants | **Planned fix** | Decrement donor surplus; support partial/multi-donor; recompute outcomes | No donor over-allocation in property tests; summary reflects transfers |
| Scenario affected scope | **Planned fix** | Derive affected IDs from actual disruption, not all rows | Supplier failure returns only S02 medicines; targeted hospital tests pass |
| MAPE | **Planned fix** | Use zero-safe denominator or replace metric | Unit tests include zero-demand series |
| Risk semantics | **Planned fix** | Define one shared definition for intelligence and scenarios | Documented policy; cross-page consistency test |

### 3.2 Reproducibility and configuration (P0)

| Item | Status | Work | Acceptance criteria |
|---|---|---|---|
| Database schema | **Planned** | Add versioned migrations, seed, indexes, constraints, RLS policies | `supabase db reset` (or equivalent) yields working app |
| Scenario seed | **Planned** | Version-controlled seed for IDs 1–5; scenario fallback | Fresh DB runs all five scenarios |
| Frontend env | **Planned fix** | Standardize `VITE_SUPABASE_PUBLISHABLE_KEY` (or documented alias) | Copying `.env.example` starts the app |
| API base URL | **Planned fix** | Read `VITE_API_BASE_URL`; remove hardcoded URLs | Deployed frontend reaches configured backend |
| Dead config | **Planned** | Remove `ML_SERVICE_URL`/unused vars or implement them | `.env.example` matches code exactly |

### 3.3 Security and operations (P0/P1)

| Item | Status | Work | Acceptance criteria |
|---|---|---|---|
| API auth | **Planned** | Verify Supabase JWT, roles, tenant scope | Unauthenticated operational requests return 401 |
| API validation | **Planned** | Schema validation, 400/404/409/503 semantics | Fuzz/invalid input tests pass |
| CORS/headers/limits | **Planned** | Allow-list origins, Helmet, body limits, rate limit | Security tests and config review pass |
| `/db-test` | **Planned** | Remove in production or admin-gate | No public sample-row/schema leakage |
| Secrets | **Planned** | Least-privilege DB role, secret rotation, no service-role exposure | Secret scan clean; role audit documented |
| Observability | **Planned** | Structured logs, request IDs, health/readiness, error tracking | Traces/logs correlate a failing request end-to-end |
| Graceful shutdown | **Planned** | SIGTERM handling and connection draining | Rolling restart loses no in-flight request |

### 3.4 Quality gate (P0)

| Item | Status | Work | Acceptance criteria |
|---|---|---|---|
| Unit tests | **Planned** | ML features/metrics, scenario math, redistribution, scheme matching | ≥ 80% line coverage on core services; invariants tested |
| API tests | **Planned** | Contract + authz + error cases | CI runs against ephemeral DB |
| Frontend tests | **Planned** | Route guards, pages, fallback badge, uploads warning | Smoke suite in CI |
| Lint/format | **Planned** | ESLint/Prettier (or Biome) for frontend/backend | CI blocks on lint errors |
| CI | **Planned** | Typecheck, tests, build, migration check | Required checks on every PR |
| Accessibility | **Planned** | Automated axe + manual keyboard/screen-reader pass | No critical violations on key flows |

**v1.x exit:** all five scenarios run from a fresh clone; forecast/redistribution tests pass; unauthenticated API calls are rejected; CI is required; no critical findings from document `06` remain open.

**Effort:** M (roughly 3–6 focused engineer-weeks for a small team).

---

## 4. v2.0 — Foundation / Resilience

**Goal:** turn the demo into a coherent, persisted resilience platform with defensible scenario modeling.

### 4.1 Data platform — **Planned**
- Normalize entities: organizations, facilities, medicines, suppliers, contracts, inventory snapshots, deliveries, consumption, demand, scenarios, runs, recommendations.
- Add temporal/versioned inventory and demand facts.
- Add referential integrity, check constraints, uniqueness, and indexes for ordered demand access.
- Add RLS and role model (`citizen`, `analyst`, `facility_admin`, `network_admin`).
- Add seed/demo tenant separated from real tenant data.
- Add data-quality checks: completeness, freshness, outliers, negative values, duplicate series.
- **Acceptance:** migrations recreate production-like schema; RLS tests prove tenant isolation; data-quality dashboard flags stale/invalid input.

### 4.2 Scenario engine — **Planned**
- Model scheduled deliveries, supplier capacity/status, lead-time distributions, and transport delay as quantity/time effects.
- Support per-facility targeting and medicine/facility selection.
- Support custom scenario parameters and saved scenario templates.
- Add time-phased interventions (emergency order arrives day N, transfer leaves day N).
- Recompute all risk/summary values after interventions.
- Add deterministic fallback for the demo.
- **Acceptance:** supplier failure, delay, surge, facility disruption, and combined produce materially different, explainable outcomes; intervention timelines are visible.

### 4.3 Network/cascade MVP — **Partial target**
- Define a graph: supplier → medicine → facility → service line.
- Add constraints: transfer time, cold chain, max transfer, stock ownership, eligibility.
- Propagate donor impact after transfers.
- Visualize affected paths and second-order effects.
- **Acceptance:** a donor transfer can create a new at-risk facility and the UI shows it; no over-allocation is possible.

### 4.4 Persistence and workflow — **Planned**
- Server-side scenario runs with inputs, model version, data snapshot, outputs, author, timestamp.
- Report export (PDF/CSV) and shareable links.
- Document/report metadata persistence with access control (no fake uploads).
- **Acceptance:** a run can be reopened byte-for-byte; exports include provenance and disclaimer.

### 4.5 API/platform — **Planned**
- Versioned API (`/api/v1`), OpenAPI contract, generated client or shared types.
- Background job/queue for expensive simulations; caching by data version.
- Environment separation (dev/staging/prod) and deployment pipeline.
- **Acceptance:** API contract tests pass; simulation p95 latency meets target; staging mirrors production config.

**v2.0 exit:** persisted, reproducible scenario runs; real supply mechanics; network MVP with post-transfer recomputation; deployed staging environment with migrations and CI.

**Effort:** L–XL.

---

## 5. v2.5 — Decision Intelligence

**Goal:** move from “here is a forecast” to “here is a defensible decision, with uncertainty and trade-offs.”

### Planned
- Probabilistic demand forecasts (quantiles/simulation) and confidence-aware risk.
- Per-series backtesting, calibration, and model quality dashboards.
- Recommendation ranking with cost, service impact, feasibility, and equity constraints.
- Scenario comparison and sensitivity analysis (tornado charts, thresholds).
- Optimization for procurement/redistribution (multi-objective, constraints).
- Alerting: threshold breaches, supplier risk, stock-out likelihood.
- Action workflow: assign owner, acknowledge, snooze, resolve, audit trail.
- Role-specific views (facility vs network vs procurement).
- Human-in-the-loop feedback to correct forecasts/recommendations.

### Acceptance criteria
- Every risk/recommendation shows uncertainty and data freshness.
- Recommendations state constraints and expected impact, including donor side effects.
- Analysts can compare scenarios side-by-side and export the decision rationale.
- Alert precision/recall is measured on historical data.
- Action outcomes are captured and feed evaluation.

**Effort:** L–XL. **Dependency:** v2.0 data platform and network model.

---

## 6. v3.0 — AI Interface

**Goal:** deliver a genuinely useful, grounded multilingual Copilot — not a keyword chatbot.

### Planned
- Intent routing and tool/function calling over:
  - hospital intelligence,
  - scenario simulation/comparison,
  - scheme/document guidance,
  - facility navigation.
- Retrieval over curated scheme/document content with source citations and freshness.
- Conversation state with explicit user consent and retention controls.
- Multilingual answer generation plus the existing 10-language UI.
- Voice upgrade: server-side STT/TTS optional, language detection, barge-in, transcript review.
- Safety layer: scope limits, medical-advice refusal, PII redaction, prompt-injection defenses.
- Evaluation: golden set, multilingual quality, groundedness/citation accuracy, red-team results.
- Cost/abuse controls: auth, quotas, caching, model routing.
- Offline/rule-based fallback preserved and clearly labeled.

### Acceptance criteria
- “Which hospital has the highest risk?” returns the ranked intelligence result with timestamp/source.
- “Run a 7-day supplier failure and compare with transport delay” executes both and summarizes differences.
- Every factual claim links to an internal record or official source.
- Medical-advice prompts are refused with safe alternatives.
- Evaluation thresholds are met in all supported languages.
- The Copilot cannot take an operational action without explicit confirmation and authorization.

**Effort:** L. **Dependency:** v2.5 decision APIs and v2.0 auth/observability.

---

## 7. v4.0 — Real-World System

**Goal:** operate with real facilities, real supply data, and real governance.

### Planned
- Integrations: hospital HIS/inventory, procurement/ERP, supplier portals, logistics, district/state health systems.
- Standards/interoperability evaluation (e.g., HL7/FHIR where relevant; CSV/SFTP fallback).
- Master data management for facilities, medicines, suppliers, contracts.
- Real-time/near-real-time ingestion with idempotency and lineage.
- Multi-tenant/multi-region deployment, disaster recovery, backups, SLAs.
- Security/compliance program: threat model, penetration testing, audit logging, encryption, retention, DPIA, consent.
- Clinical/supply-chain governance: review board, model change control, incident response.
- Field validation and impact measurement (stock-out reduction, service continuity, cost).
- Training, support, and rollout playbooks.
- Sustainability: monitoring, on-call, model retraining, data contracts.

### Acceptance criteria
- At least one real integration in production with monitored SLAs.
- Data lineage from source to recommendation is auditable.
- Security and privacy reviews passed; incidents have runbooks.
- Model performance and decision impact are measured against pre-deployment baselines.
- Rollback and disaster-recovery drills pass.
- Clinical/supply-chain governance signs off on intended use.

**Effort:** XL+ (multi-quarter program).

---

## 8. Cross-cutting workstreams

| Workstream | v1.x | v2.0 | v2.5 | v3.0 | v4.0 |
|---|---|---|---|---|---|
| Data/schema | Migrations, seed, RLS | Normalized platform, lineage | Quality/calibration | Retrieval corpus | Real integrations, MDM |
| ML | Fix alignment, tests | Supply-aware simulation | Probabilistic + optimization | Tool-grounded answers | Production monitoring/retraining |
| Security | AuthN/Z, CORS, secrets | Tenant isolation | Action authorization | LLM safety, quotas | Compliance/pen test |
| Product/UX | Honest labels, fallback badges | Persisted runs, exports | Comparison/workflow | Copilot UX | Field workflows |
| Ops | CI, logging, readiness | Staging, queues | Alerting | Model routing/cost | SLAs, DR, on-call |
| Accessibility/i18n | Audit, key coverage | Language QA | Role views | Multilingual eval | Localization program |

---

## 9. Sequencing and dependencies

```
v1.x correctness/security/reproducibility
        │
        ├──► v2.0 data platform + real scenario mechanics
        │           │
        │           ├──► v2.5 uncertainty + optimization + workflow
        │           │           │
        │           │           └──► v3.0 grounded Copilot
        │           │                       │
        │           └───────────────────────┴──► v4.0 real integrations/governance
        │
        └──► Do NOT start LLM Copilot before v2.5 APIs, auth, and evaluation exist.
```

**Hard dependencies:**
- Copilot tools require stable, authorized intelligence/scenario APIs.
- Scenario persistence requires the v2.0 schema and auth model.
- Cascade modeling requires normalized supplier/facility/medicine entities.
- Real integrations require security/compliance readiness.

---

## 10. Non-goals / guardrails

- Do not describe the current prototype as clinical decision support or official eligibility determination.
- Do not onboard real patient data before privacy/security controls are validated.
- Do not add an LLM before grounding, authorization, and safety evaluation exist.
- Do not retain “cascade” claims until the network model is implemented and validated.
- Do not expand languages/features faster than translation QA and accessibility can support.

---

## 11. Suggested release milestones

| Milestone | Content | Evidence of completion |
|---|---|---|
| **M1 — Trustworthy demo** | v1.x fixes, tests, seeded DB, secured API | Fresh-clone demo, CI green, no critical issues |
| **M2 — Resilience platform** | v2.0 schema, supply-aware scenarios, persisted runs, network MVP | Reproducible runs, RLS tests, cascade demo |
| **M3 — Decision support** | v2.5 uncertainty, comparison, workflow, alerts | Decision rationale export, calibration report |
| **M4 — Grounded Copilot** | v3.0 tools, citations, safety, multilingual eval | Evaluation report, refusal tests, audit logs |
| **M5 — Field pilot** | v4.0 integration, governance, SLA | Signed pilot, monitored production run |
