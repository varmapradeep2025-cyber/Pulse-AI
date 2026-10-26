# Pulse AI — ML and Resilience Engine

**Audit date:** 2026-10-22  
**Primary evidence:** `backend/src/services/mlForecast.ts`, `intelligenceService.ts`, `scenarioService.ts`; duplicated browser engine in `frontend/src/data/hospitalIntelligence.ts`.  
**Important:** The Python `ml-service` contains no model. All forecasting runs in TypeScript, either in Express or in the browser fallback.

---

## 1. Model summary

| Property | Value |
|---|---|
| Algorithm | Pooled ridge regression (L2-regularized linear regression), closed-form normal equations |
| Training location | `backend/src/services/mlForecast.ts:276` (`fitRidge`) |
| Model scope | One global model across all hospital × medicine series |
| Target | Daily demand |
| Horizon | 7 days, recursive one-step forecasting |
| Holdout | Last 8 days of each series with > 10 observations |
| Ridge penalty | `λ = 200` |
| Target transform | `log1p` in both backend paths; prediction inverted with `expm1` |
| Baseline comparison | Per-series training mean over the holdout |
| Fallback | Deterministic synthetic data in Hospital Intelligence only |
| Per-series uncertainty | None (point forecasts only) |

---

## 2. Feature engineering

`buildBaseFeatures(series, i)` (`mlForecast.ts:142`) creates 15 base features:

| Index | Feature | Definition |
|---:|---|---|
| 0 | `lag1` | `series[i-1].demand`; if `i=0`, series mean |
| 1 | `lag7` | `series[i-7].demand`; if `i<7`, series mean |
| 2 | `ma7` | Mean of up to 7 observations ending at `i-1` |
| 3 | `ma14` | Mean of up to 14 observations ending at `i-1` |
| 4 | `trend` | `i / (n-1)` for `n>1`, else 0 |
| 5 | `is_weekend` | 1 for Saturday/Sunday |
| 6 | `month_sin` | `sin(2π·month/12)`, month 0-based |
| 7 | `month_cos` | `cos(2π·month/12)` |
| 8–14 | day-of-week one-hot | Monday … Sunday |

Then appended: one-hot columns for **every observed hospital × medicine pair**, plus a trailing bias column added inside `fitRidge`.

Feature count = `15 + |series pairs| + 1`. With the synthetic 5 × 10 grid that is 66 columns.

### 2.1 Preprocessing and fitting

1. Drop the bias column while standardizing.
2. Per feature: `mean = Σx / N`, `scale = sqrt(Σ(x-mean)² / N) || 1`.
3. Normalize each feature as `(x - mean) / scale`, then append bias `1`.
4. Transform target: `y' = log1p(max(0, y))`.
5. Solve:

```
(XᵀX + λI) w = Xᵀy'
```

6. Prediction:

```
ŷ' = x_normalized · w
ŷ  = max(0, expm1(ŷ'))
```

Implementation notes:
- The bias/intercept term is **also penalized**, because `λ` is added to every diagonal entry including the bias.
- The normal equations are solved by Gaussian elimination with partial pivoting (`solveLinear`, `mlForecast.ts:211`).
- Standardization is computed from training rows only.
- All numeric values are handled as JavaScript `number`; no NaN/Infinity guard exists before fitting.

---

## 3. Evaluation

`computeMetrics` (`mlForecast.ts:424`):

```
MAE  = (1/N) Σ |actual - predicted|
RMSE = sqrt((1/N) Σ (actual - predicted)²)
MAPE = (100/N) Σ_{actual>0} (|actual - predicted| / actual)
```

**MAPE defect:** only non-zero actuals contribute to the sum, but the divisor is the full `N`. Series containing zero-demand days therefore understate MAPE. This metric should not be used for model selection in its current form.

Holdout procedure:
- For each series with more than 10 points, the last 8 observations are held out.
- `train = series[0 : len-8]`, `test = series[len-8 : len]`.
- The baseline predicts the training mean for every test day.
- The ML model uses actual lag features within the holdout; it does not recursively roll forward during evaluation.
- Reported metrics are aggregate across all held-out rows, not per-series averages.

The UI displays the returned model name, feature names, train/test row counts, ML MAE/RMSE/MAPE, and baseline MAE/RMSE. It does not display statistical significance, confidence intervals, or per-series accuracy.

---

## 4. Hospital Intelligence pipeline

`buildIntelligenceSummary()` (`intelligenceService.ts:527`):

1. Load hospitals, medicines, inventory, and paginated demand history.
2. If **any** of those has no rows, replace all four with `buildSyntheticDataset()`.
3. Group demand by `"hospitalId-medicineId"`; sort dates ascending.
4. Build one-hot hospital × medicine columns for inventory pairs.
5. Build pooled training/holdout matrices.
6. Fit ridge with `λ=200`, `log1p` target.
7. For every inventory row with a matching series:
   - Recursively forecast 7 days.
   - `predictedDailyDemand = round(mean(7 forecast values))`.
   - Project stock day by day, subtracting each day’s forecast.
   - Record first day below safety and first day at/below zero.
   - `coverageDays = currentStock / predictedDailyDemand` (1 decimal; `Infinity` if zero demand).
   - Assign risk.
   - Compute order quantity and recommendation.
8. Rank by risk severity, then days-to-stock-out ascending, then order quantity descending.
9. Return `{ model, series }`.

### 4.1 Risk classification and recommended action

```
leadTime = clamp(round(safetyStock / predictedDailyDemand), 2, 10)   // 5 if demand ≤ 0
orderQty = max(1, ceil(predictedDailyDemand × leadTime))
```

| Level | Condition | Recommendation family |
|---|---|---|
| `CRITICAL` | Stock-out within 7 days or minimum projected ≤ 0 | Emergency procurement / immediate reallocation |
| `HIGH` | Minimum projected stock < safety stock | Replenish urgently, order ≈ qty |
| `MEDIUM` | Minimum projected ≤ 1.5 × safety stock | Plan replenishment within lead time |
| `LOW` | Otherwise | Routine monitoring, show coverage days |

**Threshold asymmetry:** intelligence uses the **minimum projected stock over the whole horizon**, while scenarios use the **end-of-window remaining stock**. The same inventory can therefore be HIGH in one view and RED in the other.

### 4.2 Forecast-step defect (shared with scenarios)

Both forecast loops call:

```ts
buildBaseFeatures(simulated, simulated.length - 1)
```

For a series of length `n`, this builds the feature row for the **last observed day** (`i=n-1`), not the next day (`i=n`):

- `lag1` is `simulated[n-2]`, so the most recent observation is excluded.
- The rolling windows exclude the newest point.
- The feature date is the last observed date, not the forecast date.
- The constructed output date is nevertheless `last date + 1` and is appended for the next iteration.

The model still recurses, but every step is one day out of alignment with its date and skips the newest demand. Passing `simulated.length` would match the documented behavior in `buildBaseFeatures` (“`i === series.length` is allowed”). The same defect exists in `frontend/src/data/hospitalIntelligence.ts:652`.

---

## 5. Scenario engine

`simulateScenario(scenarioId)` (`scenarioService.ts:255`):

1. Load one `scenarios` row; throw if absent.
2. Load inventory and paginated demand.
3. If inventory is empty, return a “No data” result with zero counts.
4. Group demand; build pooled training/holdout rows for series with > 10 points.
5. Fit ridge (`λ=200`, `log1p`) and compute ML vs baseline metrics.
6. Derive scenario parameters.
7. For every inventory row:
   - Forecast 7 days (same off-by-one defect).
   - `baseRate = mean(7 forecasts)`.
   - Determine whether the medicine is supplied by the disrupted supplier.
   - `effectiveRate = baseRate × surgeMultiplier`.
   - Project `windowDays` days with **no resupply**.
   - Compute impact, risk label, cause, and recommendations.
8. Run one redistribution pass.
9. Build summary counts/shortage/worst label.
10. Return `{ scenario, model, results }`.

### 5.1 Scenario parameters

```
surgeMultiplier =
  1 + demand_change_percent/100   if type ∈ {demand_surge, hospital_disruption, combined}
  1                               otherwise

windowDays = max(duration_days, transport_delay_days if > 0, 1)
```

| Type | Surge | Window | Supplier effects | Facility targeting |
|---|---|---|---|---|
| `supplier_failure` | 1.0 | duration | S02 medicines marked; alternate-supplier advice | None |
| `transport_delay` | 1.0 | max(duration, delay) | Text/recommendation exposure only | None |
| `demand_surge` | 1 + pct/100 | duration | None | None (applies network-wide) |
| `hospital_disruption` | 1 + pct/100 | duration | None | None (text says “affected facilities” but all tuples are multiplied) |
| `combined` | 1 + pct/100 | max(duration, delay) | Same as supplier failure | None |

`DISRUPTED_SUPPLIER_ID` is hardcoded to `S02`. Only medicines whose catalog `generic_name` exactly matches S02’s supplied medicine names are marked `supplier_disrupted`.

### 5.2 Projection math

For each day `d = 1 … windowDays`:

```
projected = max(0, projected - effectiveRate)
status = STOCK_OUT if projected == 0
         AT_RISK   if projected ≤ safetyStock
         NORMAL    otherwise
```

End-of-window metrics:

```
projectedDemand    = round(effectiveRate × windowDays)
projectedRemaining = round(max(0, startingStock - projectedDemand))   // equivalent to loop end
daysOfStock        = round(startingStock / effectiveRate)
safetyBreach       = projectedRemaining < safetyStock
shortageUnits      = max(0, ceil(safetyStock - projectedRemaining))
```

Risk:

| Label | Condition |
|---|---|
| `CRITICAL` | Any stock-out day in window |
| `RED` | End remaining < safety stock |
| `YELLOW` | End remaining ≤ 1.5 × safety stock |
| `GREEN` | Otherwise |

UI-level mapping: `CRITICAL→CRITICAL`, `RED→HIGH`, `YELLOW→MEDIUM`, `GREEN→LOW`.

### 5.3 Recommendations

Generated in order:

1. **Alternate supplier** when the item is marked supplier-disrupted and its catalog lists a different supplier. Uses that supplier’s emergency lead time only in text.
2. **Emergency procurement** when `shortageUnits > 0`; quantity equals `shortageUnits`.
3. **Monitoring** for `RED` or `YELLOW` risk.
4. **Reallocation** (prepended later by redistribution).

Supplier normal lead times and reliability scores are not used in projection timing; procurement is not scheduled.

### 5.4 Redistribution logic

`applyRedistribution()` (`scenarioService.ts:742`) operates per medicine:

1. Recipients = items with `shortageUnits > 0`, sorted by shortage descending.
2. Donors = items with `projectedRemaining > safetyStock`, sorted by surplus descending.
3. For each recipient, find the first donor with:
   - a different hospital, and
   - surplus ≥ recipient shortage.
4. Transfer = `floor(min(donor surplus, recipient shortage))`.
5. Attach donor metadata to the recipient and prepend reallocation advice to both sides.

**Critical defects:**
- Donor surplus is **never decremented** after a promise, and the simulation is not rerun. One donor can be promised to multiple recipients, overstating feasible redistribution.
- A donor must cover the recipient’s **entire** shortage; partial transfers are not selected, even though the transfer formula supports them.
- Only one donor is used per recipient.
- Hospital-to-hospital transport time, cold chain, cost, jurisdiction, and stock-transfer feasibility are ignored.
- Recommendations do not update the recipient’s projected remaining stock, risk label, shortage quantity, or summary totals.

### 5.5 Scenario summary defects

- `affected_hospital_ids` and `affected_medicine_ids` are derived from **every result row** (`scenarioService.ts:664–665`), so they list the entire network rather than only affected facilities/medicines.
- `buildSummary` receives both arrays but does not use them in any computation (`void` at `:865–866`); it simply returns the full-network arrays passed in.
- `projected_shortage_total` sums pre-redistribution shortages.
- `worst_risk_label` is the maximum of the pre-redistribution labels.
- For `hospital_disruption`, the headline claims “affected facilities” while the code applies a uniform network-wide multiplier.
- For `transport_delay`, extending the window does not model delayed inbound deliveries or reduced supply; it only assumes existing stock must cover more days.

### 5.6 Cascade impact assessment

There is **no cascade graph, dependency model, or propagation step**. The engine evaluates each hospital × medicine tuple independently, then performs a single redistribution matching pass. Network effects are therefore limited to:

- counting/labeling all rows,
- suggesting transfers.

There is no modeling of:
- supplier → distributor → facility propagation,
- shared inventory pools,
- production capacity,
- substitution between medicines,
- patient diversion between facilities,
- second-order shortages caused by redistribution,
- time-phased delivery schedules.

The README’s “cascade-impact analysis” claim is not supported by the implementation.

---

## 6. Frontend fallback model

`frontend/src/data/hospitalIntelligence.ts` duplicates the backend approach:

- Same synthetic hospitals/medicines/demand shape.
- `HOLDOUT_DAYS = 8`, `HORIZON_DAYS = 7`, `RIDGE_LAMBDA = 200`.
- Same 15 base features + hospital × medicine indicators + bias.
- Same `log1p` target and risk thresholds.
- Same off-by-one forecast feature bug.
- Runs only when the backend is unreachable, times out after 4.5 s, or returns unusable data.
- Source label becomes `"local"`; backend successful paths use `"supabase"` or `"synthetic-fallback"`.

Risks:
- Two implementations must be maintained in lockstep.
- The fallback silently masks backend outages, so users may not know they are seeing a local model.
- Synthetic fallback data ends 2026-09-22; forecasts become progressively disconnected from the current date.

---

## 7. Scientific and product limitations

| Limitation | Consequence |
|---|---|
| Single pooled linear model | Cannot capture nonlinear interactions, seasonality shifts, promotions, outbreaks, or facility-specific dynamics beyond one-hot shifts |
| 7-day point forecast | No prediction intervals, so risk confidence cannot be expressed |
| Recursive forecasting | Errors compound; no uncertainty propagation |
| `log1p` target + penalized bias | Can bias low-demand series; intercept shrinkage is unusual |
| Aggregate metrics | Strong/weak series cannot be distinguished; no per-hospital accuracy |
| MAPE calculation | Understates error when zeros are present |
| No external drivers | No weather, outbreaks, footfall, bed occupancy, supplier performance, or calendar events |
| No backtesting protocol | One fixed holdout; no rolling-origin validation |
| No model registry/versioning | Weights are refit per request and never persisted or audited |
| Hardcoded thresholds | `1.5×` safety and `λ=200` are not configurable or clinically validated |
| No clinician/supply-chain validation | Outputs are demonstration-only and must not drive procurement |

---

## 8. Recommended engineering priorities for the engine

1. **Fix the forecast index** to use `simulated.length`; add regression tests for date alignment and lag use.
2. **Fix redistribution** by decrementing donor surplus, supporting partial/multi-donor transfers, and rerunning risk/summary after transfers.
3. **Separate scenario targeting** from network-wide multipliers; store affected facility/medicine IDs explicitly.
4. **Model supply arrivals**: delivery schedules, supplier capacity, lead-time distributions, and transport delays that reduce quantities.
5. **Model cascade dependencies** with an explicit graph (supplier → medicine → facility → patient service), if that claim is retained.
6. **Add probabilistic forecasts** (quantiles or simulation) and report confidence with risk.
7. **Validate the model** with rolling-origin backtests, per-series metrics, and domain review; fix MAPE before displaying it as a quality signal.
8. **Remove or consolidate** the duplicated browser model to prevent divergence.
9. **Persist model metadata** (training window, data source, feature count, metrics, version) with each result and report.
