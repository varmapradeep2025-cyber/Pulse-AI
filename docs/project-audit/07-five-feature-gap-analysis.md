# Pulse AI — Five-Feature Gap Analysis

**Audit date:** 2026-10-22  
**Maturity scale:** Early → Partial → Functional prototype → Production-ready  
**Effort scale (1–2 engineers):** S < 1 week · M 1–3 weeks · L 1–2 months · XL quarter+

---

## 1. Summary scorecard

| # | Feature | Maturity | Implemented depth | Demo credibility | Production readiness | Biggest blocker |
|---|---|---|---|---|---|---|
| 1 | Hospital Intelligence | **Functional prototype** | Backend + frontend + fallback | High | Low | Synthetic/seed data; no confidence or write-back |
| 2 | Demand & Stock-out Prediction | **Functional prototype** | Real model, no dedicated product surface | Medium–high | Low | No validation/uncertainty; forecast alignment defect |
| 3 | Resilience Scenario Engine | **Functional prototype** | Five scenarios, projections, recommendations | Medium | Low | Simplified supply mechanics; DB-dependent |
| 4 | Cascade / Network Impact | **Partial / early** | Network-wide rows + one redistribution pass | Low–medium | Very low | No graph or propagation; over-allocation |
| 5 | Pulse AI Copilot | **Early** | Rule-based assistant + multilingual voice | Medium as a navigator | Very low | No LLM/retrieval; cannot answer operational questions |

Adjacent citizen-access scope (hospitals, schemes, documents, reports, voice) is stronger than the Copilot label suggests but is not one of the five named resilience features. It remains a synthetic, browser-local demo.

---

## 2. Feature 1 — Hospital Intelligence

### Implemented
- `GET /api/intelligence/summary` returns model metadata, hospitals, medicines, and ranked series.
- Loads hospitals, medicines, inventory, and paginated demand from Supabase; falls back to deterministic synthetic data if any table is empty.
- Trains a pooled ridge model, compares against a mean baseline, forecasts 7 days, and computes coverage, stock-out/below-safety days, risk level, order quantity, recommendation, and priority.
- Frontend `/intelligence` page shows risk counts, ranked table, sparkline, stock projection, recommendation, and model metrics.
- Local browser fallback mirrors the backend and labels source as `local`.

### Gaps
| Gap | Impact | Priority |
|---|---|---|
| Forecast off-by-one feature index (shared) | Wrong lag/date/risk values | Critical |
| Recomputed per request; no cache/versioning | Slow, non-auditable, unstable outputs | High |
| Synthetic/seed data only | No real facility credibility | High |
| No prediction intervals or confidence | Risk looks more certain than it is | High |
| Only aggregate holdout metrics | Cannot see which facilities/medicines are poorly modeled | Medium |
| Order quantity uses inferred lead time, not supplier terms | Procurement quantities are not contractual | Medium |
| No write-back/assignment/acknowledgement | Intelligence does not become an action | High |
| Different risk semantics from scenarios | Cross-page inconsistency | Medium |
| No facility capacity/occupancy/service context | Clinical priority is absent | Medium |

### What “credible” requires
1. Fix forecast alignment and add regression tests.
2. Publish per-series accuracy and confidence.
3. Use real lead times, supplier terms, and stock counts.
4. Add an action workflow (assign, acknowledge, export) with audit history.
5. Align risk definitions across pages.

**Effort to pilot-ready:** L. **Effort to production-ready:** XL.

---

## 3. Feature 2 — Demand & Stock-out Prediction

### Implemented
- Genuine TypeScript ridge regression (no mock): 15 base features + hospital × medicine indicators, standardization, `log1p` target, `λ=200`, Gaussian elimination.
- 8-day holdout per series; MAE/RMSE/MAPE and baseline comparison.
- Recursive 7-day forecasts power both intelligence and scenarios.
- Risk bands, stock-out day, safety-breach day, coverage days.
- No separate demand-prediction page; outputs are embedded in Intelligence and Dashboard.

### Gaps
| Gap | Impact | Priority |
|---|---|---|
| Forecast feature index defect | All predictions shifted/mis-specified | Critical |
| MAPE formula divides by all rows | Understates error on zero-demand days | High |
| No rolling-origin backtest | One holdout is weak evidence | High |
| No uncertainty intervals | Cannot express confidence | High |
| No external drivers (outbreaks, weather, events, occupancy) | Limited real-world accuracy | High |
| Single pooled linear model | Misses nonlinear/facility-specific dynamics | Medium |
| No retraining schedule/model registry | No reproducibility or drift control | High |
| No anomaly/outlier handling | Spikes can distort fits | Medium |
| No data-quality monitoring | Bad inputs flow silently | High |
| Synthetic demand pattern is simplistic | Demo metrics may not generalize | Medium |
| No stock-out event history/calibration | Risk bands are heuristic, not validated | High |

### What “credible” requires
1. Correct alignment; add backtesting and per-series error reporting.
2. Add quantile/interval forecasts.
3. Validate on real demand with clinical/supply review.
4. Add model versioning, drift monitoring, and retraining.
5. Treat thresholds as configurable policy, not constants.

**Effort to pilot-ready:** L. **Effort to production-ready:** XL.

---

## 4. Feature 3 — Resilience Scenario Engine

### Implemented
- Five predefined scenarios with IDs 1–5: supplier failure, transport delay, demand surge, hospital disruption, combined.
- Scenario parameters read from Supabase `scenarios`; inventory and demand from Supabase.
- Pooled ML forecast averaged to daily demand; day-by-day stock projection with no resupply.
- GREEN/YELLOW/RED/CRITICAL labels with explanations and assumptions.
- Recommendations: alternate supplier, emergency procurement, monitoring, reallocation.
- Dashboard selector, headline counts, per-item curves, and automatic local report save.
- Scenario report history in `localStorage` (last 12).

### Gaps
| Gap | Impact | Priority |
|---|---|---|
| No synthetic fallback | Demo breaks without seed data | High |
| No request validation or custom scenarios | Invalid input → 500; users cannot model their situation | High |
| Transport delay only extends window | Does not model delayed/reduced deliveries | High |
| Supplier failure only changes text | Does not actually remove supply | High |
| Hospital disruption is a uniform multiplier | No facility targeting | High |
| Affected hospital/medicine lists are network-wide | Overstates scope | High |
| Redistribution does not decrement donor surplus | Infeasible recommendations | Critical |
| No post-transfer recomputation | Risk/summary stale after advice | High |
| No time-phased deliveries, capacity, cost, or service impact | Projection is stock-only | High |
| Runs are browser-local only | No sharing, audit, or team workflow | Medium |
| Fixed S02 supplier | Scenarios are not configurable per network | Medium |
| No scenario comparison or sensitivity analysis | Hard to choose a response | Medium |

### What “credible” requires
1. Seed/fallback and input validation.
2. Model inbound supply, lead times, and per-facility targets.
3. Fix redistribution and recompute outcomes.
4. Persist runs server-side with inputs, model version, and outputs.
5. Add scenario comparison and sensitivity views.

**Effort to pilot-ready:** L. **Effort to production-ready:** XL.

---

## 5. Feature 4 — Cascade / Network Impact

### Implemented
- Every inventory tuple is simulated, producing network-wide counts and a shortage total.
- Redistribution groups by medicine and matches a donor surplus to a recipient shortage.
- Recommendations mention transfers and alternate suppliers.
- UI presents network-level headline, affected lists, counts, and per-item results.

### Gaps
| Gap | Impact | Priority |
|---|---|---|
| No dependency graph | Cannot represent supplier → facility → patient propagation | Critical (if claim retained) |
| No cross-medicine or cross-facility dependencies | Cannot model substitution, shared logistics, or diversion | High |
| No second-order effects | Redistribution does not create new shortages in donor facilities | High |
| Donor surplus not decremented | Over-allocates the same stock | Critical |
| No time dimension for transfers | Same-day infinite transfer assumption | High |
| “Affected” sets are all rows | No real impact scope | High |
| No patient/service impact | Cascade stops at stock units | High |
| No visualization of the network | Users cannot inspect the cascade | Medium |
| Unsupported README claim | Erodes trust in the product narrative | High |

### What “credible” requires
1. Define a graph schema: suppliers, distributors, facilities, medicines, service lines.
2. Add time-phased propagation rules and constraints.
3. Recompute after every intervention, including donor impact.
4. Visualize the network and affected paths.
5. Validate with supply-chain experts.

**Effort to a defensible MVP:** XL. This is a research/product design effort, not a patch.

---

## 6. Feature 5 — Pulse AI Copilot

### Implemented
- Chat UI with message history and quick-start prompts.
- Rule-based matching of urgency terms and departments to synthetic hospitals.
- Multilingual response formatting and translation.
- Microphone input and read-aloud via browser Web Speech API.
- Voice assistant card on the landing page/dashboard; `/assistant` page.
- Clear “not a diagnosis” safety copy.

### Gaps
| Gap | Impact | Priority |
|---|---|---|
| No LLM or natural-language understanding | Only keyword matching; brittle phrasing | High |
| No retrieval/tool calls over intelligence/scenarios | Cannot answer “highest risk hospital?” | Critical (for Copilot claim) |
| No conversation memory beyond the session | No follow-ups or context | Medium |
| No citations/source grounding | Users cannot verify claims | High |
| No safety evaluation/red-team | Risk of harmful medical guidance if expanded | Critical before expansion |
| No operational actions | Cannot open a scenario, stock item, or scheme | Medium |
| No authentication/rate limiting for future LLM | Cost/abuse exposure | High |
| Browser-only speech | Browser/OS dependency; no transcript audit | Medium |
| No evaluation dataset/metrics | Quality is unknown | High |
| Left-in diagnostics/console logs | Unpolished; leaks internal details | Low |

### What “credible” requires
1. Define the Copilot’s scope explicitly (navigation/ops, not diagnosis).
2. Add intent routing and tool calls to intelligence, scenario, hospital, and scheme services.
3. Ground answers with citations and source/freshness labels.
4. Add safety policies, refusal behavior, logging, and evaluation.
5. Preserve the current offline rules as a degraded fallback.

**Effort to a grounded pilot:** M–L. **Effort to safe production:** XL.

---

## 7. Cross-feature gaps

| Gap | Consequence |
|---|---|
| Citizen and operations surfaces are disconnected | No shared patient/facility narrative; one product feels like two demos |
| Synthetic data duplicated frontend/backend | Drift and inconsistent numbers |
| No shared type/contract package | API changes silently break UI |
| No server-side persistence for reports/uploads/runs | No team workflow or audit trail |
| No identity/roles beyond authenticated citizen | Analysts and admins cannot be separated |
| No observability | Failures are invisible in production |
| No CI/CD or environments | No repeatable release path |
| No data governance | Real data cannot be safely onboarded |
| No design-system/accessibility gate | Inconsistent scaling and unknown accessibility |

---

## 8. Prioritized gap-closing sequence

| Order | Work | Features | Effort | Why first |
|---:|---|---|---|---|
| 1 | Fix forecast alignment and redistribution invariants; add tests | 1, 2, 3, 4 | M | Removes wrong outputs before expanding |
| 2 | Commit migrations/seeds/RLS; add scenario fallback; fix env/API config | 1, 2, 3 | M | Makes the demo reproducible |
| 3 | Secure API, validate inputs, restrict CORS, remove `/db-test` | All | M | Prevents exposure |
| 4 | Add confidence intervals and per-series metrics | 1, 2 | M | Makes forecasts honest |
| 5 | Model supply arrivals and scenario targeting | 3, 4 | L | Makes scenarios meaningfully different |
| 6 | Implement dependency graph + post-transfer recomputation | 4 | XL | Delivers the cascade claim |
| 7 | Server-side run/report persistence and audit | 1, 3, 4 | L | Enables real workflows |
| 8 | Grounded Copilot with tools/citations/safety | 5 | L | Turns the assistant into a real copilot |
| 9 | Real data onboarding and validation | 1–4 | XL | Required for production credibility |

---

## 9. Honest positioning

Today Pulse AI can credibly claim:

> “A runnable, deterministic prototype that forecasts demand, ranks hospital × medicine risk, simulates five supply disruptions, and demonstrates multilingual citizen access and voice interaction.”

It cannot yet credibly claim:

> “Production-ready cascade-impact analysis, a decision-grade Copilot, real-time hospital/supplier integration, or official eligibility determination.”
