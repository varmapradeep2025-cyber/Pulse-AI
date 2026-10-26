# Pulse AI — API and Integrations

**Audit date:** 2026-10-22  
**Scope:** HTTP API exposed by `backend/`, clients in `frontend/`, Supabase Auth/data access, browser speech, and the unused Python service. No live endpoint calls were made; shapes below come from source code.

---

## 1. HTTP surface

| Method | Path | Auth | Purpose | Implementation |
|---|---|---|---|---|
| `GET` | `/health` | None | Service liveness | `backend/src/routes/health.ts` |
| `GET` | `/db-test` | None | Diagnostic table reads | `backend/src/routes/dbtest.ts` |
| `GET` | `/api/intelligence/summary` | None | Full hospital-intelligence summary | `backend/src/routes/intelligence.ts` |
| `POST` | `/api/scenarios/simulate` | None | Run one of five disruption scenarios | `backend/src/routes/scenario.ts` |

Default bind: `HOST=0.0.0.0`, `PORT=4000`. There is no API prefix versioning, OpenAPI document, or route-level middleware.

---

## 2. Endpoint contracts

### 2.1 `GET /health`

Response `200`:

```json
{
  "status": "ok",
  "service": "pulse-ai-backend",
  "environment": "development",
  "timestamp": "2026-10-22T00:00:00.000Z"
}
```

Liveness only; it does not verify Supabase or the ML service.

### 2.2 `GET /db-test`

Runs five parallel Supabase selects (`limit 5`): `hospitals`, `inventory`, `demand_history`, `orders`, `scenarios`.

Success `200`:

```json
{
  "success": true,
  "counts": {
    "hospitals": 5,
    "inventory": 5,
    "demand_history": 5,
    "orders": 5,
    "scenarios": 5
  },
  "data": {
    "hospitals": [],
    "inventory": [],
    "demand_history": [],
    "orders": [],
    "scenarios": []
  }
}
```

Any query error → `500` with `{ success: false, errors: [...] }`. Unexpected exception → `500` with `{ success: false, error: message }`.

**Production risk:** unauthenticated endpoint exposes schema/query errors and sample operational rows. It should be removed or gated.

### 2.3 `GET /api/intelligence/summary`

Success `200`:

```json
{
  "success": true,
  "summary": {
    "generatedAt": "2026-10-22T00:00:00.000Z",
    "source": "supabase",
    "hospitals": [{ "id": 1, "name": "Hospital name" }],
    "medicines": [
      {
        "id": 1,
        "name": "Medicine",
        "category": "Antibiotic",
        "criticality": "critical",
        "unit": "vials"
      }
    ],
    "model": {
      "name": "Ridge regression (feature-based ML)",
      "featureNames": ["lag1 (yesterday)"],
      "trainDays": 17000,
      "trainRows": 17000,
      "evaluationDays": 400,
      "ml": { "mae": 2.1, "rmse": 3.0, "mape": 7.4 },
      "baseline": { "mae": 2.8, "rmse": 3.9 }
    },
    "series": [
      {
        "hospitalId": 1,
        "medicineId": 1,
        "currentStock": 1000,
        "safetyStock": 300,
        "history": [{ "date": "2026-09-01", "demand": 30 }],
        "forecast": [{ "date": "2026-09-02", "predicted": 31 }],
        "predictedDailyDemand": 31,
        "meanHistoricalDemand": 30,
        "coverageDays": 32.3,
        "daysToStockout": null,
        "belowSafetyDay": null,
        "riskLevel": "LOW",
        "recommendation": "Routine monitoring — 32.3 days of stock cover available.",
        "suggestedAction": "Routine monitoring — 32.3 days of stock cover available.",
        "suggestedOrderQty": 93,
        "priority": 1
      }
    ]
  }
}
```

(Example values are illustrative, not a captured production response.)

`source` values:

| Value | Meaning |
|---|---|
| `supabase` | All four intelligence queries returned non-empty data |
| `synthetic-fallback` | At least one of hospitals/medicines/inventory/demand was empty; synthetic dataset used |
| `local` | **Frontend-only** label; backend never returns it |

Failure `500`:

```json
{ "success": false, "message": "Intelligence summary failed" }
```

The route logs the underlying error server-side; details are not returned.

### 2.4 `POST /api/scenarios/simulate`

Request:

```http
POST /api/scenarios/simulate
Content-Type: application/json

{ "scenarioId": 1 }
```

Validation: **none**. No schema, integer check, or allow-list. The value is passed directly to Supabase `.eq("id", scenarioId).single()`.

Success `200`:

```json
{
  "success": true,
  "results": {
    "scenario": {
      "scenario": {
        "id": 1,
        "name": "Supplier Failure",
        "description": "Primary supplier unavailable",
        "disruption_type": "supplier_failure",
        "duration_days": 7,
        "demand_change_percent": 0,
        "transport_delay_days": 0
      },
      "disclaimer": "Demonstration only...",
      "affected_suppliers": [
        {
          "supplier_id": "S02",
          "supplier_name": "MedLink Pharma Distribution",
          "location": "Indore, Madhya Pradesh",
          "supplied_medicines": ["Ceftriaxone", "Azithromycin", "ORS (Oral Rehydration Salts)"],
          "normal_lead_time": 5,
          "emergency_lead_time": 2,
          "reliability_score": 0.91,
          "current_status": "active"
        }
      ],
      "affected_medicine_ids": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      "affected_hospital_ids": [1, 2, 3, 4, 5],
      "headline": "Primary supplier (S02) unavailable for 7 day(s).",
      "demand_change_label": "No change",
      "supplier_disruption_label": "MedLink Pharma Distribution (S02) unavailable",
      "projected_shortage_total": 0,
      "worst_risk_label": "YELLOW",
      "result_counts": {
        "GREEN": 49,
        "YELLOW": 1,
        "RED": 0,
        "CRITICAL": 0
      },
      "assumptions": [
        "Stock projections assume no resupply is received during the 7-day disruption window."
      ]
    },
    "model": {
      "name": "Ridge regression (feature-based ML)",
      "featureNames": ["lag1 (yesterday)"],
      "trainRows": 17000,
      "testRows": 400,
      "mlMae": 2.1,
      "baselineMae": 2.8
    },
    "results": [
      {
        "hospital_id": 1,
        "medicine_id": 1,
        "starting_stock": 1000,
        "safety_stock": 300,
        "predicted_daily_demand": 30,
        "risk_level": "LOW",
        "recommendation": "Continue routine monitoring.",
        "model": {},
        "days": [{ "day": 1, "projected_stock": 970, "status": "NORMAL" }],
        "stock_out_day": null,
        "hospital": {},
        "medicine": {},
        "effective_daily_demand": 30,
        "disruption_window_days": 7,
        "supplier_disrupted": false,
        "projected_demand": 210,
        "projected_remaining_stock": 790,
        "days_of_stock_remaining": 33.3,
        "safety_stock_breach": false,
        "estimated_shortage_quantity": 0,
        "risk_label": "GREEN",
        "risk_reason": "Projected remaining stock ...",
        "recommendations": [],
        "redistribution": {
          "medicine_id": 1,
          "donor_hospital_id": 2,
          "donor_hospital_name": "Hospital 2",
          "transfer_units": 10
        }
      }
    ]
  }
}
```

(Empty `hospital`/`medicine`/`model` objects are placeholders; real responses contain full catalog/model metadata.)

Response nesting is intentional: the service returns `{ scenario, model, results }`, and the route wraps it as `{ success, results }`. The frontend unwraps `data.results`, which is correct.

Failure behavior:

| Case | Status | Body |
|---|---|---|
| Missing scenario row | `500` | `{ "success": false, "message": "Scenario simulation failed" }` |
| Supabase inventory/demand query error | `500` | same generic body |
| Empty inventory | `200` | `scenario` with zero counts, `model.name = "No data"`, `results: []` |
| Unknown `disruption_type` | `200` | Generic projection, no disruption effects |

---

## 3. Frontend clients

| Client | Endpoint | Timeout | Fallback | Error behavior |
|---|---|---|---|---|
| `frontend/src/api/scenarios.ts:150` | `POST /api/scenarios/simulate` | None | None | Throws `Simulation failed: <status>` or backend `message`; Dashboard renders error |
| `frontend/src/data/hospitalIntelligence.ts:78` | `GET /api/intelligence/summary` | 4.5 s via `AbortController` | Local browser model | Any error/timeout silently returns local results |

Both hardcode `http://localhost:4000`. `VITE_API_BASE_URL` is documented but unread. There is no shared generated client, retry policy, request ID, auth token, or cancellation UI.

---

## 4. Authentication and authorization

- **Frontend:** Supabase Auth email/password. Session managed by `AuthContext`; routes guarded client-side.
- **Backend:** no auth. It does not inspect `Authorization` headers or verify Supabase JWTs.
- **Database:** backend uses `SUPABASE_SERVICE_ROLE_KEY`, bypassing RLS.
- **CORS:** `app.use(cors())` allows all origins and methods.
- **Consequence:** operational data and simulations are available to any process that can reach the backend port. Client-side route guards are not a security boundary.

Recommended sequence for production: verify Supabase JWT → map to roles/tenants → enforce per-route authorization → restrict CORS → add rate limits and audit logs.

---

## 5. Supabase integration

### 5.1 Frontend Auth

| Operation | Wrapper |
|---|---|
| Sign up | `signUp(email, password, fullName)` |
| Sign in | `signIn(email, password)` |
| Sign out | `signOut()` |
| Current user | `getCurrentUser()` |
| Session subscribe | `AuthContext` via `onAuthStateChange` |

No custom backend auth endpoints, email templates, password-reset UI, MFA, OAuth, or role selection exist.

### 5.2 Backend data

| Table | Operations |
|---|---|
| `hospitals` | `select(id, name)` |
| `medicines` | `select(id, name, category, criticality, unit)` |
| `inventory` | `select(...)`; no writes |
| `demand_history` | Ordered, paginated `select(...)`; no writes |
| `scenarios` | `select(...).eq("id").single()`; no writes |
| `orders` | Read only by `/db-test` |

The backend never writes data. Scenario results and reports remain browser-local. There is no transaction, migration runner, or storage integration.

---

## 6. Browser speech integration

| Capability | API | Notes |
|---|---|---|
| Speech-to-text | `window.SpeechRecognition` / `webkitSpeechRecognition` | User-initiated, secure-context preflight, permission/device probe, fresh recognizer per session, interim results |
| Text-to-speech | `window.speechSynthesis` | Voice loading, locale match with base-language fallback, cancel on stop |
| Error model | `frontend/src/types/speech.ts`, `voice/errors.ts` | Normalizes browser errors to translation keys |
| Language mapping | `data/voiceLocales.ts` | e.g. `en→en-IN`, `hi→hi-IN`, `ta→ta-IN` |
| Server dependency | None | Audio is handled by the browser/OS vendor service, not Pulse AI |
| Persistence | None | Transcripts/responses are in component state |

Operational caveats:
- Recognition is unavailable in some browsers and often requires HTTPS/localhost.
- The code includes temporary `console.log` diagnostics.
- Voice is used for hospital navigation and assistant input; it does not call an LLM or the intelligence/scenario APIs.
- Provider data handling (Google/Microsoft/Apple speech) is not disclosed in the UI or README.

---

## 7. External links and integrations

| Integration | Direction | Status |
|---|---|---|
| Supabase Auth | Browser → Supabase | Active |
| Supabase PostgreSQL | Backend → Supabase | Active (live state unverified) |
| Backend API | Browser → Express | Active via hardcoded localhost |
| Python ML service | None | Health-only; `ML_SERVICE_URL` documented but never read |
| Official scheme websites | Browser → external HTTPS | Links only; no fetch/verification |
| Maps/geocoding | None | No map provider |
| SMS/email/WhatsApp | None | No notification provider |
| EHR/HIS/procurement | None | Not integrated |
| LLM provider | None | No API key or SDK |
| Payments | None | Not applicable |

---

## 8. Environment-variable matrix

| Variable | Documented in | Read by code | Status |
|---|---|---|---|
| `PORT` | `backend/.env.example` | `backend/src/config/env.ts` | Active |
| `HOST` | `backend/.env.example` | `backend/src/config/env.ts` | Active |
| `NODE_ENV` | `backend/.env.example` | `env.ts`, health | Active |
| `SUPABASE_URL` | `backend/.env.example` | backend | Required; startup fails if absent |
| `SUPABASE_SERVICE_ROLE_KEY` | `backend/.env.example` | backend | Required; secret |
| `ML_SERVICE_URL` | `backend/.env.example` | **Never** | Dead configuration |
| `VITE_API_BASE_URL` | `frontend/.env.example` | **Never** | Dead configuration |
| `VITE_SUPABASE_URL` | `frontend/.env.example` | frontend | Active |
| `VITE_SUPABASE_ANON_KEY` | `frontend/.env.example` | **Never** | Misnamed |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | not in example | `frontend/src/lib/supabase.ts` | Required; undocumented |
| `SERVICE_NAME` | `ml-service/.env.example` | FastAPI | Active |
| `SERVICE_VERSION` | `ml-service/.env.example` | FastAPI | Active |
| `APP_ENV` | `ml-service/.env.example` | FastAPI | Active |
| `HOST` / `PORT` | `ml-service/.env.example` | Uvicorn CLI, not app | Depends on launch command |

The examples still say Supabase is “reserved for a later phase - not used yet,” which is stale.

---

## 9. API recommendations

1. Add request validation (e.g., Zod) for `scenarioId`; return `400` for invalid input and `404` for a missing scenario.
2. Add a typed contract shared by frontend/backend or generate a client from OpenAPI.
3. Move base URL to `VITE_API_BASE_URL`; fail build if unset.
4. Authenticate operational endpoints; add roles (`citizen`, `analyst`, `admin`) and tenant scoping.
5. Remove `/db-test` from production or protect it with admin auth.
6. Restrict CORS to known origins; add Helmet, body limits, and rate limiting.
7. Add timeouts/retries, a circuit breaker, and graceful shutdown around Supabase.
8. Return structured error codes and correlation IDs; stop swallowing intelligence fallback causes.
9. Add `/health/ready` that checks Supabase connectivity and model/data availability.
10. Version the API (`/api/v1/...`) before external consumers exist.
