# Pulse AI — Database and Data Sources

**Audit date:** 2026-10-22  
**Verification level:** Source-code evidence only. No live database connection, credential inspection, query execution, or migration was performed.

---

## 1. Executive data finding

Pulse AI depends on a **Supabase PostgreSQL project that is not defined in the repository**. The only schema description is an “expected schema (reference only)” SQL block in `README.md` (`README.md:528–591`). There are **no `.sql` files, migrations, seed scripts, RLS policies, or database tests** anywhere in Git.

Consequently:

- A fresh clone cannot reproduce the database.
- Column types, constraints, indexes, foreign keys, and grants are unverified and may differ from the README reference.
- RLS status is unknown.
- The application may work against the author’s local Supabase project while being non-reproducible for anyone else.

All operational data used by the resilience features is either the author’s Supabase seed data or the deterministic synthetic fallback. No real hospital, supplier, inventory, patient, or demand dataset is connected.

---

## 2. Supabase Auth

| Item | Evidence |
|---|---|
| Provider | Supabase Auth (`@supabase/supabase-js`) |
| Methods | Email/password sign-up, sign-in, sign-out, session lookup |
| Frontend client | `frontend/src/lib/supabase.ts` |
| Auth wrappers | `frontend/src/lib/auth.ts` |
| Session state | `frontend/src/context/AuthContext.tsx` |
| Sign-up metadata | `options.data.full_name` (`frontend/src/lib/auth.ts:8–16`) |
| Protected routes | `/dashboard`, `/documents`, `/reports`, `/intelligence`, `/assistant` |
| Application table access from frontend | None; the browser client is used only for `auth.*` |
| Backend auth | None; API routes do not validate Supabase JWTs |

No `profiles` table, role model, tenant model, or custom claims are referenced.

**Configuration mismatch:** `frontend/src/lib/supabase.ts:4` reads `VITE_SUPABASE_PUBLISHABLE_KEY`, but `frontend/.env.example:8` defines `VITE_SUPABASE_ANON_KEY`. The local ignored `.env` may compensate, but the documented setup path is broken.

---

## 3. Application tables referenced by code

### 3.1 `hospitals`

| Aspect | Detail |
|---|---|
| Referenced by | `intelligenceService.loadHospitals()` (`backend/src/services/intelligenceService.ts:215`), `/db-test` |
| Columns selected | `id`, `name` |
| README reference type | `id bigint primary key`, `name text not null` |
| Role | Facility reference for intelligence results |
| Notes | No address, capacity, location, or ownership fields are used |

### 3.2 `medicines`

| Aspect | Detail |
|---|---|
| Referenced by | `intelligenceService.loadMedicines()` (`backend/src/services/intelligenceService.ts:228`) |
| Columns selected | `id`, `name`, `category`, `criticality`, `unit` |
| README reference type | `id bigint primary key`, `name text not null`, optional text fields |
| Role | Medicine reference and display units |
| Notes | The scenario service does **not** read this table; it uses `backend/src/data/catalog.ts` instead |

### 3.3 `inventory`

| Aspect | Detail |
|---|---|
| Referenced by | `loadInventory()` (`backend/src/services/intelligenceService.ts:153`), `simulateScenario()` (`backend/src/services/scenarioService.ts:284`), `/db-test` |
| Columns selected | `hospital_id`, `medicine_id`, `current_stock`, `safety_stock`, `daily_consumption` (intelligence); scenario omits `daily_consumption` |
| README reference type | identity `id`, bigint hospital/medicine IDs, numeric stock fields, nullable `daily_consumption` |
| Role | Current stock/safety stock per facility × medicine |
| Notes | `daily_consumption` is loaded but not used by the ML/risk calculation. No uniqueness constraint on `(hospital_id, medicine_id)` is defined in the reference. |

### 3.4 `demand_history`

| Aspect | Detail |
|---|---|
| Referenced by | `loadDemandHistory()` (`backend/src/services/intelligenceService.ts:171`), scenario pagination (`backend/src/services/scenarioService.ts:297`), `/db-test` |
| Columns selected | `hospital_id`, `medicine_id`, `demand_date`, `demand` |
| README reference type | identity `id`, bigint IDs, date, numeric demand |
| Pagination | Ordered by hospital, medicine, date; 1,000 rows per request until exhausted |
| Role | Training/evaluation data for the pooled forecast |
| Notes | Series with ≤ 10 rows (`HOLDOUT_DAYS + 2`) are skipped. Demand values are coerced with `Number()` and not validated. |

### 3.5 `scenarios`

| Aspect | Detail |
|---|---|
| Referenced by | `simulateScenario()` (`backend/src/services/scenarioService.ts:259`), `/db-test` |
| Columns selected | `id`, `name`, `description`, `disruption_type`, `duration_days`, `demand_change_percent`, `transport_delay_days` |
| README reference type | bigint PK + text/ints/numeric |
| Role | Supplies disruption parameters |
| Expected IDs | Frontend selector assumes `1`–`5`; README seed supplies those IDs |
| Notes | No fallback if the row is absent. `.single()` failure becomes HTTP 500. Unknown `disruption_type` values fall through to a generic “no disruption” projection. |

README reference seed (not executable in repo):

| ID | Name | Type | Duration | Demand change | Transport delay |
|---:|---|---|---:|---:|---:|
| 1 | Supplier Failure | `supplier_failure` | 7 | 0% | 0 |
| 2 | Transport Delay | `transport_delay` | 3 | 0% | 3 |
| 3 | Demand Surge | `demand_surge` | 7 | +30% | 0 |
| 4 | Hospital Disruption | `hospital_disruption` | 7 | +20% | 0 |
| 5 | Combined Crisis | `combined` | 7 | +30% | 3 |

### 3.6 `orders`

| Aspect | Detail |
|---|---|
| Referenced by | `/db-test` only (`backend/src/routes/dbtest.ts:30`) |
| Columns selected | `id`, `hospital_id`, `supplier_id`, `medicine_id`, `quantity`, `status` |
| Role in product logic | **None.** No forecaster, risk calculation, or scenario uses orders |
| README reference type | identity PK, bigint IDs, text supplier, numeric quantity, text status |

---

## 4. Schema, RLS, and integrity status

| Concern | Status |
|---|---|
| Committed DDL/migrations | **None** |
| Seed scripts | **None**; README contains insert for `scenarios` only |
| RLS policies | **Not in repo; unverified** |
| Foreign keys | Not declared in README reference |
| Unique keys on `inventory` / `demand_history` | Not declared |
| Indexes for demand queries | Not declared (critical for a year of data per series) |
| Check constraints (non-negative stock/demand) | Not declared |
| Timestamps/audit columns | Not defined |
| Storage buckets/files | None referenced |
| Database tests | None |

Because the backend uses the Supabase **service-role key**, any RLS enabled on these tables is bypassed by the backend. The frontend does not query these tables directly, so table-level RLS would not affect the current UI. API-layer authorization is therefore the only possible control — and it is absent.

---

## 5. Data-source classification

| Class | Data | Where it appears | Provenance label |
|---|---|---|---|
| **REAL / PUBLIC reference** | Names/descriptions of 10 Government of India / Madhya Pradesh health schemes; official information URLs | `frontend/src/data/schemes.ts` | Described as real/public; all 10 records currently `info_status: "verified"` |
| **REAL / PUBLIC descriptors** | Generic medicine names/categories/units; generic facility type descriptors | `backend/src/data/catalog.ts`; synthetic datasets | Marked demonstration data |
| **DERIVED / MODEL** | Demand forecasts, coverage days, stock-out/safety-breach days, risk levels, order quantities, model metrics | Backend + local browser engine | Computed at runtime |
| **SIMULATED** | Five disruption projections, shortages, recommendations, redistribution | Scenario service | `DEMO_DISCLAIMER` |
| **SYNTHETIC DEMO** | Hospitals, patients, documents, reports, inventories, demand history, suppliers, citizen profile | Static modules + backend synthetic data | `isDemo`, `SYNTHETIC_DATA_LABEL`, or disclaimer |
| **BROWSER-LOCAL DEMO** | Uploaded document records/names, scheme tracking, scenario reports | `localStorage` / memory | Explicitly described as demo in UI |

No external public-health dataset, live supplier feed, procurement system, hospital HIS, EHR, or geospatial service is integrated.

---

## 6. Synthetic datasets

### 6.1 Backend deterministic dataset (`backend/src/services/syntheticData.ts`)

- PRNG: `mulberry32`, seed `20260924`.
- 5 hospitals × 10 medicines = **50 inventory series**.
- 365 daily demand rows per series = **18,250 demand rows**.
- End date: **2026-09-22**; one full year ending on that date.
- Safety stock: ~4.5 × mean demand.
- Current stock: at least safety stock, mean × 8–28.
- Demand pattern: weekday factors, annual sinusoid, slow trend, 0.75–1.25 noise, 4% chance of 1.6× spike.
- Used by Hospital Intelligence only when one of hospitals/medicines/inventory/demand is empty.

### 6.2 Frontend local dataset (`frontend/src/data/hospitalIntelligence.ts`)

- Mirrors the synthetic hospital/medicine/demand structure for the offline fallback.
- Uses the same model hyperparameters (`HOLDOUT_DAYS = 8`, `HORIZON_DAYS = 7`, `RIDGE_LAMBDA = 200`).
- Cached in module memory after first build.
- Not shared with backend code or data files; duplication can drift.

### 6.3 Scenario catalog (`backend/src/data/catalog.ts`)

- 10 medicines, 5 hospitals, 5 suppliers.
- All fictional; demonstration flag.
- Disrupted supplier is fixed at **S02** (MedLink Pharma Distribution), which supplies Ceftriaxone, Azithromycin and ORS.
- Supplier reliability, normal/emergency lead times exist but are mostly not used in projection math.

### 6.4 Citizen demo assets

| Dataset | Count | Nature |
|---|---:|---|
| Hospitals | 5 | Fictional facilities with plausible names, addresses, phones, bed counts |
| Patients | 5 | Synthetic IDs only |
| Documents | 18 | Fictional metadata; no real files |
| Medical reports | 8 | Fictional summaries/results |
| Schemes | 10 | Real public scheme information; synthetic eligibility-form definitions |
| Demo citizen | 1 | Fictional adult female profile in Madhya Pradesh |
| Languages | 10 | Hand-authored translations |

---

## 7. Data-quality and privacy risks

1. **Unvalidated numbers:** demand, stock, safety stock, duration and percentages are coerced without range/finite checks; negative stock or demand can enter the model.
2. **No schema reproducibility:** no DDL means column-name drift is undetectable until runtime.
3. **No referential integrity in repo:** inventory can reference nonexistent hospitals/medicines; fallback labels then use generic names.
4. **Stale synthetic horizon:** fallback demand ends 2026-09-22. As time passes, forecast dates and the demo’s “current” position become increasingly artificial.
5. **PII readiness:** current patient data is synthetic, but the citizen flow already stores profile-derived state in `localStorage`; real data would require encryption, consent, retention, access control, audit logging, and RLS/API authorization.
6. **Service-role blast radius:** a compromised backend environment exposes all application tables.
7. **Browser uploads:** object URLs are not durable and are not a secure storage design; they should not be used for real medical documents.
8. **Scheme “verified” status:** the flag is an internal assertion about source checking; the repository does not include the verification evidence, date-specific source snapshots, or automated link/content checks.
9. **Foreign keys/index omissions:** the README reference omits indexes needed for the ordered, paginated demand query; performance on realistic volumes is unknown.
