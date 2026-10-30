# Pulse AI

**Predict. Simulate. Respond.**

Pulse AI is an AI-powered healthcare resilience and supply-chain intelligence
platform. It turns healthcare inventory and demand data into predictions, risk
detection, disruption simulations, cascade-impact analysis, and response
recommendations — so decision-makers can move from "stock is low" to "how fast
can the network run out, why, and what are our options".

```
Healthcare data → Prediction → Risk detection → Disruption simulation
→ Cascade impact analysis → Response recommendations → Human decision-making
```

> **Health & safety note:** Pulse AI is a prototype / demonstration system.
> It is **not** a medical diagnosis, triage, or eligibility tool. Nothing in
> this software prescribes or doses medicines, and all recommendations are
> operational (inventory, procurement, redistribution, logistics, monitoring)
> — never clinical. No real hospital, supplier, or patient is connected.

---

## Table of contents

- [Signature feature — Resilience Scenario Engine](#signature-feature--resilience-scenario-engine)
- [Feature highlights](#feature-highlights)
  - [Hospital Intelligence](#hospital-intelligence)
  - [Citizen Appointments & Digital Queue Tokens](#citizen-appointments--digital-queue-tokens)
  - [Multi-Channel Notification System & Outbox Scheduler](#multi-channel-notification-system--outbox-scheduler)
  - [Daily Inventory Reporting & Excel Batch Ingestion](#daily-inventory-reporting--excel-batch-ingestion)
  - [Dynamic Multi-Facility Redistribution](#dynamic-multi-facility-redistribution)
  - [Role-Based Hospital Scoping & Analytics Security](#role-based-hospital-scoping--analytics-security)
- [Data provenance: real / derived / simulated](#data-provenance-real--derived--simulated)
- [AI Copilot](#ai-copilot)
- [Voice interaction](#voice-interaction)
- [Architecture](#architecture)
- [Technology stack](#technology-stack)
- [Project layout](#project-layout)
- [Backend API](#backend-api)
- [Database (Supabase)](#database-supabase)
- [Machine learning](#machine-learning)
- [Data sources](#data-sources)
- [Installation](#installation)
- [Environment variables](#environment-variables)
- [Supabase setup & seed](#supabase-setup--seed)
- [Scripts](#scripts)
- [Roadmap](#roadmap)
- [License](#license)

---

## Signature feature — Resilience Scenario Engine

The scenario engine simulates how a supply-chain disruption propagates through
the hospital network and estimates the operational impact before it happens.

A user can simulate:

- **Supplier failure** — a primary supplier goes offline
- **Supplier delivery delay** — orders arrive late
- **Demand surge** — consumption jumps (e.g. seasonal outbreak)
- **Transport disruption** — delivery corridor delays
- **Hospital capacity / demand disruption** — facility-level demand shift
- **Combined crisis** — several disruptions at once

The system then estimates, per hospital × medicine:

| Output | Meaning |
|---|---|
| Projected daily demand | ML-forecast demand during the disruption window |
| Day-by-day stock projection | Stock at each day of the window (`NORMAL / AT_RISK / STOCK_OUT`) |
| Stock-out day | First day projected stock reaches zero (if any) |
| Projected shortage | Units below the safety level by the end of the window |
| Risk band | `GREEN / YELLOW / RED / CRITICAL` with an explicit written reason |
| Response options | Reallocation, alternate supplier, emergency procurement, monitoring |

Conceptual flow:

```
Supplier disruption
        ↓
Supply reduction
        ↓
Inventory impact
        ↓
Risk prediction
        ↓
Hospital / network impact
        ↓
Response options
```

Every recommendation is expressed as **"consider / recommended action /
potential response"** and is limited to inventory, procurement,
redistribution, logistics, and monitoring actions. A redistribution pass
matches facilities with projected surplus to facilities with projected
shortage for the same medicine.

The engine runs in the backend and is exercised from the Dashboard
("Run Simulation"), which renders risk badges, per-item stock curves, and
recommendations, and lets you save a scenario report.

---

## Feature highlights

### Hospital Intelligence

Answers the five questions decision-makers ask:

1. **Which hospitals/resources currently require attention?**
2. **Why** are they at risk?
3. **How soon** could the situation become critical?
4. **What could happen** under a disruption?
5. **What response options** are available?

Implemented as a pipeline — `Inventory → Demand history → ML forecast → Risk →
Recommendation → Action` — producing per hospital × medicine:

- **Risk level** (`CRITICAL / HIGH / MEDIUM / LOW`)
- **Predicted daily demand** and mean historical demand
- **Days to stock-out** and **day-below-safety** thresholds
- **Coverage days** of stock remaining
- **Suggested order quantity** (covers the procurement lead time)
- **Recommendation & action** (emergency procurement, urgent replenishment,
  planned replenishment, or routine monitoring)

### Resource / inventory intelligence

Live risk ranking across all hospital × medicine combinations — surfaces the
highest-priority items first (severity, then time-to-crisis, then order size).

### Demand forecasting

Hospital Intelligence selects a seven-day forecast from the validated
seasonal-naive, ridge, and XGBoost comparison when available (see
[Machine learning](#machine-learning)).

### Stock-out / safety-threshold risk detection

Projects stock forward day-by-day against the forecast and flags:

- projected stock-out and the day it happens
- the day stock falls below the configured safety level
- breach of the 1.5× safety-stock "watch" threshold

### Citizen Appointments & Digital Queue Tokens

A complete outpatient department (OPD) queue and appointment engine:

- **Atomic sequential tokens:** Allocates sequential digital queue tokens (`T-001`, `T-002`) scoped per facility, department, and calendar date using PostgreSQL row locks.
- **Private citizen snapshot API:** Authenticated endpoint (`GET /api/appointments/:id/queue-snapshot`) returning patient position, current serving token, and estimated wait times with zero cross-patient data exposure.
- **Hospital-scoped staff queue operations:** Staff are restricted to their authorized facility IDs, managing calls, consultations, walk-in patient registrations, and no-shows.
- **Rescheduling & cancellation integrity:** Same-day reschedules retain queue tokens; multi-day reschedules forfeit old tokens and allocate a fresh token for the target date. Cancelled tokens are never reused.


### Multi-Channel Notification System & Outbox Scheduler

A unified, multi-channel notification engine for outpatient appointments and live queue events:

- **In-App Notification Center:** Realtime notification bell with unread badge counter, persistent dropdown tray, relative time markers, read/unread states, and deep-linking to live queue snapshots.
- **Configurable Reminder Intervals:** Citizens can choose notification intervals (24h, 1h, 30m, 15m) and toggle in-app, push, email, and SMS channels independently via the Notification Preferences modal.
- **Durable Scheduler & Outbox:** Pending reminder jobs are staged in `public.scheduled_notifications` with idempotency keys. Cancelling or rescheduling appointments automatically cancels obsolete reminder jobs.
- **Web Push Notifications:** PWA/browser notifications via Service Worker (`public/sw.js`) and VAPID Web Push protocol (`PushProvider`).
- **Branded Transactional Email:** Modular email dispatch (`ResendEmailProvider` & `MockEmailProvider`) with responsive HTML templates for booking confirmations, reminders, queue turn approaches, and cancellations.
- **SMS Integration Ready:** Indian phone number normalizer (`+91` / E.164) with TRAI DLT template structures and provider abstraction (`ExotelSmsProvider` & `MockSmsProvider`).
- **AI Copilot Live Query Integration:** Natural-language assistant tools (`queryLiveAssistant`) allowing citizens to check their appointment and queue status, and doctors to review their queue and call the next eligible patient.

### Daily Inventory Reporting & Excel Batch Ingestion

Enables physical healthcare facilities to submit daily consumption and stock reports:

- **Canonical template generator:** Generates downloadable Excel templates (`.xlsx`) with validation rules, unit constraints, and sample entries.
- **Two-phase staging & preview:** Uploaded workbooks are parsed, validated against stock-conservation equations (`closing = opening + received - dispensed - written_off + adjustments`), deduplicated, and staged before commit.
- **Segregation of synthetic vs. real data:** Enforces strict provenance flags (`imported-real` vs `imported-synthetic`) to prevent simulated testing figures from corrupting operational data.
- **Transactional import commit:** Atomically merges staged rows into `public.inventory_daily_reports` using database RPC (`commit_inventory_import`).

### Dynamic Multi-Facility Redistribution

Upgrades scenario simulation to model operational inventory transfers during crises:

- **Dynamic risk refresh:** When surplus stock from a donor hospital is transferred to alleviate a deficit, stock projections and risk bands (`GREEN / YELLOW / RED / CRITICAL`) are recomputed for both recipient and donor.
- **Donor depletion guard:** Donors are never drained below their configured safety stock threshold.
- **Actionable redistribution guidance:** Generates explicit donor and recipient operational action cards with exact post-transfer unit counts.

### Role-Based Hospital Scoping & Analytics Security

- **JWT Authentication:** Strict token verification via Supabase Auth for intelligence and scenario APIs.
- **Hospital boundaries:** Staff users are bounded to their assigned hospital scopes via environment allowlists or trusted metadata.
- **CORS whitelist & API hardening:** Explicit origin validation via `FRONTEND_ORIGINS`, removal of diagnostic database test dumps, `no-store` cache headers, and payload size bounds.

### Supplier intelligence

A demonstration supplier catalog (name, location, supplied medicines, normal
and emergency lead times, reliability score, status) used by the scenario
engine to model supplier failure and alternate-supplier handoff.

### Command-center dashboard

Dashboard with simulation controls, risk-badge visualization, per-item stock
projection, recommendation panels, and one-click scenario-report saving.

### Data provenance

Every intelligence summary is labelled with its actual data source
(`supabase`, `synthetic-fallback`, or `local`), and all demo data carries an
explicit "Prototype / Demonstration Data" marker. See
[Data provenance](#data-provenance-real--derived--simulated).

---

## Data provenance: real / derived / simulated

Pulse AI is deliberately transparent about where each number comes from:

| Class | What it is | Where it appears |
|---|---|---|
| **REAL / PUBLIC** | Publicly-known, generic descriptions of medicines and facility types. **No real hospital, supplier, or patient dataset is currently connected.** | Supply-chain catalog (`catalog.ts`) |
| **DERIVED / MODEL** | Output produced by the forecasting/risk model from current stock, safety stock, and demand history. | Forecasts, risk bands, days-to-stock-out, order quantities |
| **SIMULATED SCENARIO** | What-if projections for a disruption window (no resupply assumed). | Scenario engine results, shortage estimates, recommendations |

House rules honoured throughout the codebase:

- Simulated supply-chain values are **never** presented as real hospital data.
- Every demo record is marked (`isDemo`, `demonstration: true`,
  `SYNTHETIC_DATA_LABEL`, or `"Prototype / Demonstration Data — Not for
  Clinical Decision-Making"`).
- Hospital names, cities, and counts captured in the UI are clearly labelled
  as synthetic demo data.

---

## AI Copilot

The Assistant page exposes an **AI Copilot** that answers operational
questions about the healthcare network, for example:

> "Which hospital currently has the highest risk?"
>
> "I have a fever — which departments and hospitals should I consider?"
>
> "Is emergency care available for this?"

**Implementation status — important and honest:**

- The Copilot is currently a **rule-based, deterministic assistant**.
  It matches plain-language keywords to an urgency level and department, then
  returns matching facilities from the synthetic demo dataset. It does **not**
  call a large language model — there is **no external LLM/API key anywhere
  in this project**.
- Replies are generated **entirely in the selected UI language** (see next
  sections) and only reference actual dataset values — the Copilot never
  invents hospital names, counts, or operational numbers.
- A **Planned** upgrade is to back the Copilot with a real LLM that answers
  from the application database and model results ("Why is Hospital H2 at
  risk?", "What happens if Supplier S2 fails?") rather than heuristics.

### Multilingual service

Pulse AI ships with an existing selector for **10 languages** — English plus 9
Indian languages: Hindi, Marathi, Bengali, Tamil, Telugu, Gujarati, Kannada,
Malayalam, and Punjabi. The selected language drives *everything*:

```
Existing language selector
          ↓
selected language
          ↓
AI response generated in selected language      (localized templates)
          ↓
Speech input  (recognizer locale: e.g. hi-IN)   (Web Speech API)
          ↓
Text-to-Speech (same selected-language locale)  (Web Speech API)
          ↓
matching voice → SPEAK response
```

The selected language is stored in `LanguageContext` and persisted to
`localStorage`; the same selector is reused across pages — no duplicate
selector exists.

---

## Voice interaction

Implemented with the browser **Web Speech API** — no cloud STT/TTS service and
no API keys.

- **Speech recognition (microphone input):** uses the selected language's
  locale (`en-IN`, `hi-IN`, `mr-IN`, `bn-IN`, `ta-IN`, `te-IN`, `gu-IN`,
  `kn-IN`, `ml-IN`, `pa-IN`).
- **Text-to-speech (read the answer aloud via the 🔊 Speak / ⏹ Stop
  buttons):** picks a voice matching the selected locale — exact locale
  match first (`hi-IN`), then the base language (`hi`). The hook waits for
  `speechSynthesis.onvoiceschanged` so late-loading voice lists are handled.
- **Graceful degradation:** if no voice exists for the selected language the
  assistant **never reads the reply in English**. It keeps the translated text
  visible and shows a non-blocking message — "A voice for this language is not
  available on this device."
- Changing the language stops any speech currently playing; the next Speak
  always uses the newly selected language.

Voice availability depends on the voices installed in the user's OS/browser.
The translated reply is always shown as text regardless of voice availability.

---

## Architecture

```
User
  ↓
Pulse AI Frontend (React + TypeScript + Vite, Web Speech API)
  ↓ HTTP JSON
Backend API (Node.js + Express + TypeScript)
  ├── Hospital Intelligence service      (/api/intelligence/summary)
  ├── Scenario simulation service        (/api/scenarios/simulate)
  └── ML demand-forecast module          (ridge regression, in TypeScript)
  ↓
Supabase (PostgreSQL)                    ←· falls back to deterministic
  · hospitals · medicines · inventory        synthetic data if tables are
  · demand_history · orders · scenarios     empty (labelled as such)
  ↓
Risk & Resilience Engine → Scenario Simulation → Response Intelligence
  ↓
Dashboard / Intelligence / AI Copilot / Voice assistant
```

Key design decisions:

- Three independently runnable services: **frontend**, **backend**,
  **ml-service** (Python/FastAPI scaffold).
- The **backend owns the ML** — the demand-forecast model is implemented in
  pure TypeScript (ridge regression, no external ML runtime required).
- **Resilience by default:** when Supabase is empty or unreachable, the
  backend and the intelligence page fall back to a **deterministic synthetic
  dataset** and label the result as synthetic, so the demo always runs without
  manual data setup.
- The frontend tools are redundant: the Hospital Intelligence page prefers the
  backend engine and falls back to an identical in-browser engine only when
  the backend is offline.

---

## Technology stack

Verified from the repository (`package.json`, `requirements.txt`, source):

### Frontend — `frontend/`
- **React 19** + **TypeScript** + **Vite 8**
- React Router 7
- `@supabase/supabase-js` (email/password auth)
- Web Speech API (SpeechRecognition + SpeechSynthesis)
- Plain CSS modules (no styling framework)

### Backend — `backend/`
- **Node.js** (>= 20) + **Express 5** + **TypeScript** (`tsx` for dev)
- `@supabase/supabase-js` (service-role client), `cors`, `dotenv`
- Ridge regression implemented in pure TypeScript (`services/mlForecast.ts`)

### ML service — `ml-service/`
- **Python 3.11+** + **FastAPI** + Pydantic + Uvicorn
- Exposes `GET /health` and a transparent rolling-origin comparison of
  seasonal naive, ridge regression, and XGBoost.
- Uses NumPy, scikit-learn, and XGBoost; the operational scenario engine also
  retains its TypeScript ridge forecaster.

### Database
- **Supabase** (PostgreSQL)

### Development
- Git + GitHub, npm, VS Code / OpenCode

---

## Project layout

```
Pulse AI/
├── README.md
├── docs/architecture.md
├── docs/APPOINTMENTS_AND_DIGITAL_QUEUE_AUDIT_PHASE1.md
├── frontend/                    # React + TypeScript + Vite (port 5173)
│   └── src/
│       ├── pages/               # Dashboard, Intelligence, Hospitals, Assistant, Appointments, HospitalQueue …
│       ├── data/                # synthetic hospitals, catalogs, i18n dictionaries
│       ├── data/i18n/           # en, hi, mr, bn, ta, te, gu, kn, ml, pa
│       ├── hooks/               # useSpeechRecognition / useSpeechSynthesis / …
│       ├── api/                 # backend API clients + types (scenarios, appointments)
│       ├── context/             # LanguageContext, AuthContext, SimpleModeContext
│       └── lib/                 # supabase client, auth helpers, API caller
├── backend/                     # Node.js + Express + TypeScript (port 4000)
│   └── src/
│       ├── routes/              # health, scenario, intelligence, appointments, inventoryImport
│       ├── services/            # scenarioService, intelligenceService, mlForecast,
│       │                        #   operationalData, appointmentService, inventoryImportService, syntheticData
│       ├── repositories/        # appointmentRepository (in-memory & Supabase adapters)
│       ├── middleware/          # analyticsAuth (JWT auth & hospital scoping)
│       ├── data/catalog.ts      # demo medicine/hospital/supplier catalog
│       ├── config/env.ts        # strict environment validation
│       └── utils/supabase.ts    # service-role client
├── supabase/
│   └── migrations/              # PostgreSQL migrations (appointments, queue tokens, inventory imports)
└── ml-service/                  # Python + FastAPI (port 8000)
    └── app/main.py              # health-check scaffold
```

---

## Backend API

### Health & Intelligence
| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Service health + environment |
| GET | `/api/intelligence/summary` | Hospital-intelligence pipeline with 4-tier data provenance (`imported-real`, `imported-synthetic`, `legacy`, `synthetic`) |
| POST | `/api/scenarios/simulate` | Disruption simulation with dynamic multi-hospital redistribution and donor risk updating |

### Citizen Appointments & Digital Queue
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/appointments/catalog` | Facility and department catalog for outpatient booking |
| GET | `/api/appointments/slots` | Available future 30-minute booking slots |
| POST | `/api/appointments` | Book outpatient appointment (auto-confirmed or doctor approval needed) |
| GET | `/api/appointments/my` | Authenticated citizen appointment history |
| GET | `/api/appointments/:id` | Authenticated appointment details |
| POST | `/api/appointments/:id/reschedule` | Reschedule booking date/slot with token preservation rules |
| POST | `/api/appointments/:id/cancel` | Cancel an eligible appointment |
| POST | `/api/appointments/:id/check-in` | Same-day clinic check-in |
| GET | `/api/appointments/:id/queue-snapshot` | Citizen private queue snapshot (digital token, serving token, wait estimate) |
| GET | `/api/staff/appointments/queue` | Hospital-scoped staff queue for active departments |
| POST | `/api/staff/appointments/:id/status` | Advance patient status (`calling`, `in_consultation`, `completed`, `no_show`) |
| POST | `/api/staff/appointments/walk-in` | Register walk-in patient with sequential token allocation |


### Notifications & Scheduler
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/notifications` | Authenticated user notification inbox with unread count |
| PATCH | `/api/notifications/:id/read` | Mark individual notification as read |
| POST | `/api/notifications/mark-all-read` | Mark all user notifications as read |
| GET | `/api/notifications/preferences` | Retrieve user notification channel and timing preferences |
| PUT | `/api/notifications/preferences` | Update notification channels, phone number, and reminder intervals |
| POST | `/api/notifications/push/subscribe` | Register browser push subscription endpoint and keys |
| DELETE | `/api/notifications/push/unsubscribe` | Deactivate browser push subscription |
| POST | `/api/notifications/process-worker` | Trigger durable outbox background delivery worker |
| POST | `/api/appointments/assistant-query` | Authoritative AI Copilot tool endpoint for appointment & queue status |

### Inventory Ledger & Excel Batch Ingestion
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/staff/inventory/template` | Download canonical Excel inventory reporting template |
| POST | `/api/staff/inventory/preview` | Upload and validate Excel report batch with staging and conflict checks |
| POST | `/api/staff/inventory/commit` | Two-phase commit staged reports into `public.inventory_daily_reports` |
| GET | `/api/staff/inventory/batches` | View past uploaded import batches |
| GET | `/api/staff/inventory/batches/:id` | View batch status, replacement count, and imported items |
| GET | `/api/staff/inventory/summary` | Staff-scoped summary of latest inventory reports across facilities |

The frontend calls `http://localhost:4000` for these endpoints. Hospital
Intelligence also requests a rolling-origin forecast comparison from the
private Python `ml-service`.

---

## Database (Supabase)

PostgreSQL is accessed only through the backend service-role client. The
services use the following tables (committed SQL migrations live in `supabase/migrations/`; an expected-schema
reference and seed are provided in [Supabase setup & seed](#supabase-setup--seed)):

| Table | Purpose | Key columns used by the code |
|---|---|---|
| `hospitals` | Facility reference | `id`, `name` |
| `medicines` | Medicine reference | `id`, `name`, `category`, `criticality`, `unit` |
| `inventory` | Current stock per facility × medicine | `hospital_id`, `medicine_id`, `current_stock`, `safety_stock`, `daily_consumption` |
| `demand_history` | Daily observed demand | `hospital_id`, `medicine_id`, `demand_date`, `demand` |
| `orders` | Procurement orders (diagnostics) | `id`, `hospital_id`, `supplier_id`, `medicine_id`, `quantity`, `status` |
| `scenarios` | Defined disruption scenarios | `id`, `name`, `description`, `disruption_type`, `duration_days`, `demand_change_percent`, `transport_delay_days` |
| `notification_preferences` | User notification channel & timing settings | `user_id`, `channels`, `reminder_intervals_minutes`, `phone_number` |
| `notifications` | Persistent in-app notifications | `id`, `user_id`, `type`, `title`, `body`, `read_at`, `reference_id` |
| `push_subscriptions` | Web push subscription endpoints | `user_id`, `endpoint`, `p256dh`, `auth`, `active` |
| `scheduled_notifications` | Durable outbox for timed reminders | `id`, `user_id`, `appointment_id`, `scheduled_for`, `status`, `idempotency_key` |
| `notification_delivery_attempts` | Multi-channel audit & delivery logs | `notification_id`, `channel`, `status`, `attempt_count`, `error_message` |

Audit/inventory data is handled by the application; credentials live only in
environment variables and are never committed.

---

## Machine learning

The forecasting model is a **ridge regression** (least squares + L2
regularisation) implemented in `backend/src/services/mlForecast.ts`, trained
at runtime on the full pooled hospital × medicine demand dataset.

**Feature engineering** (per demand day):

- `lag1` / `lag7` — past demand (autocorrelation)
- rolling means 7d / 14d (short + long trend)
- normalised time trend
- `is_weekend` flag
- month `sin`/`cos` (yearly seasonality)
- day-of-week one-hot (weekly seasonality)
- hospital × medicine interaction one-hots (the pooled model learns how each
  facility and each medicine behaves)

**Transparent model comparison:**

- `ml-service` compares weekly seasonal-naive, ridge regression, and XGBoost
  using the same recursive seven-day forecasts and the six most recent
  chronological rolling cutoffs. Random train/test splits are not used.
- Each fold fits only on its training prefix. Series with date gaps or fewer
  than 49 consecutive daily observations are reported as excluded.
- The displayed measures are MAE, RMSE, WAPE, and macro MASE. MASE uses the
  fold's training-only seasonal-naive error; series with a zero denominator
  are listed and excluded from macro MASE.
- Ridge or XGBoost is selected only when macro MASE is at least 5% better than
  seasonal naive and WAPE is no more than 5% worse. Otherwise seasonal naive
  remains selected. This is a demo acceptance rule, not a universal standard.
- Forecast-derived stock risks use the selected model forecast when the
  comparison service is available. If it is unavailable, the page keeps the
  existing forecast and explicitly marks comparison as unavailable.

The comparison data shown by the app comes from the current operational
dataset. It is not proof of real-world hospital accuracy; imported and
synthetic/demo data are distinguished in the UI.

### Run the comparison service locally

From PowerShell:

```powershell
cd ml-service
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Set `ML_SERVICE_URL=http://127.0.0.1:8000` in the backend environment. The
backend exposes the comparison through the authenticated
`GET /api/intelligence/forecast-comparison` route; the Python service should
remain bound to loopback for local development.

The operational delay card is a hypothetical what-if input. It does not create
or execute a supplier order and does not imply the workbook contained a
scheduled delivery.

The intelligence pipeline additionally produces risk bands from the forecast:
`GREEN` (above 1.5× safety), `YELLOW` (within 1.5× of safety), `RED` (below
safety), `CRITICAL` (projected stock-out), each with a written reason.

**Planned:** move model training to the Python `ml-service` and add
anomaly-detection and scenario-sensitivity metrics.

---

## Data sources

**No external public dataset is currently integrated.** All operational data
is synthetic and clearly labelled:

- **Deterministic synthetic dataset** (`backend/src/services/syntheticData.ts`,
  mirror in `frontend`): 5 hospital profiles × 10 essential medicines, one
  year of daily demand generated with a seeded PRNG (`mulberry32`, seed
  `20260924`) so results are reproducible.
- **Supply-chain catalog** (`backend/src/data/catalog.ts`): 10 generic
  medicines, 5 facility profiles (Madhya Pradesh), 5 fictional suppliers with
  lead times and reliability scores. Medicine and facility descriptors are
  based on public, generic descriptions; **no real organisation is implied**
  and the records are marked as demonstration data.
- **Frontend demo assets** (`frontend/src/data/hospitals.ts`): fictional
  hospitals with labelled "Synthetic Demo Data".

Why synthetic? Hospital-level real-time inventory and supplier-contract data
are generally not publicly available, so the prototype uses deterministic,
clearly-labelled demo data. The pipeline is identical for real data: point it
at populated Supabase tables and the same code trains, forecasts, and scores.

---

## Installation

Prerequisites: **Node.js ≥ 20** (tested with v25), **npm**, **Python ≥ 3.11**
(testing value: 3.13), **pip**, **Git**. No Docker required.

```bash
git clone <your-repository-url>
cd pulse-ai
```

### 1. Frontend

```bash
cd frontend
npm install
cp .env.example .env       # then set VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                # http://localhost:5173
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env       # then set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm run dev                # tsx watch → http://localhost:4000
```

> The backend **requires** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to
> start (validated in `config/env.ts`). With those set, the intelligence
> pipeline works whether or not your tables are seeded — it falls back to
> deterministic synthetic data and labels it as such.

### 3. ML service (Python/FastAPI)

```bash
cd ml-service
python -m venv .venv
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# macOS/Linux:
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health checks: `GET http://localhost:4000/health`,
`GET http://localhost:8000/health` (FastAPI docs at `/docs`).

---

## Environment variables

Never commit real `.env` files (`.gitignore` covers them).

| Service | File | Required now | Notes |
|---|---|---|---|
| `frontend/.env` | `frontend/.env.example` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | used by Supabase auth; `VITE_API_BASE_URL` optional |
| `backend/.env` | `backend/.env.example` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | service-role client; backend refuses to start without them |
| `backend/.env` | `backend/.env.example` | Optional: `FRONTEND_ORIGINS`, `APPOINTMENT_STAFF_USER_IDS`, `INVENTORY_STAFF_USER_IDS` | explicit CORS origins and staff allowlists; never commit real values |
| `ml-service/.env` | `ml-service/.env.example` | none | metadata only (`SERVICE_NAME`, `SERVICE_VERSION`, `APP_ENV`) |

---

## Supabase setup & seed

1. Create a Supabase project and copy the project URL + keys into the `.env`
   files above (publishable/anon key for the frontend, service-role key for
   the backend — never expose the service-role key in the frontend).
2. Create the tables used by the code (reference below).
3. Optionally seed `scenarios` (the Dashboard uses ids 1–5) and populate
   `inventory` / `demand_history`; when those are empty the pipeline uses its
   synthetic fallback and labels it.

### Apply SQL migrations

Run the files in `supabase/migrations/` in filename order against the intended
Supabase project, using the Supabase CLI or SQL editor. They are not applied
automatically by either app.

- `20261026000200_inventory_import.sql` creates
  `inventory_import_batches` and `inventory_daily_reports`, enables RLS,
  revokes direct `anon`/`authenticated` access, grants `service_role`, and
  creates the `commit_inventory_import(uuid, uuid)` RPC.
- The inventory migration depends on existing `hospitals(id)` and
  `medicines(id)` tables with `bigint` IDs and on Supabase Auth users.
- Do not apply it to a production project without reviewing ownership,
  backups, and the intended data environment.

### Staff access configuration

- `INVENTORY_STAFF_USER_IDS` is a backend-only comma/space/semicolon-separated
  list of Supabase user IDs. Listed users get inventory access for **all**
  hospitals.
- For hospital-scoped staff, leave the allowlist unset and set trusted
  Supabase **app metadata** on the user:

```json
{
  "inventory_staff": true,
  "inventory_hospital_ids": [1, 2]
}
```

- `APPOINTMENT_STAFF_USER_IDS` works the same way for the staff appointment
  queue. `app_metadata.appointment_staff = true` or
  `app_metadata.role = "appointment_staff"` is also accepted.
- Set these values only in the backend environment. Never put service-role
  keys or staff allowlists in frontend environment files.

Expected schema (reference only — adapt names/types to your project):

```sql
create table if not exists hospitals (
  id bigint primary key,
  name text not null
);

create table if not exists medicines (
  id bigint primary key,
  name text not null,
  category text,
  criticality text,
  unit text
);

create table if not exists inventory (
  id bigint generated always as identity primary key,
  hospital_id bigint not null,
  medicine_id bigint not null,
  current_stock numeric not null,
  safety_stock numeric not null,
  daily_consumption numeric
);

create table if not exists demand_history (
  id bigint generated always as identity primary key,
  hospital_id bigint not null,
  medicine_id bigint not null,
  demand_date date not null,
  demand numeric not null
);

create table if not exists orders (
  id bigint generated always as identity primary key,
  hospital_id bigint not null,
  supplier_id text,
  medicine_id bigint not null,
  quantity numeric,
  status text
);

create table if not exists scenarios (
  id bigint primary key,
  name text not null,
  description text,
  disruption_type text,
  duration_days int,
  demand_change_percent numeric,
  transport_delay_days int
);

insert into scenarios (id, name, description, disruption_type, duration_days, demand_change_percent, transport_delay_days) values
  (1, 'Supplier Failure',       'Primary supplier unavailable for 7 days.',                          'supplier_failure',   7,  0,  0),
  (2, 'Transport Delay',        'Expected deliveries delayed by 3 days.',                            'transport_delay',    3,  0,  3),
  (3, 'Demand Surge',           'Demand for selected resources increases by 30% for 7 days.',        'demand_surge',       7, 30,  0),
  (4, 'Hospital Disruption',    'Facility-level demand rises 20%; redistribution matches surplus.',  'hospital_disruption', 7, 20, 0),
  (5, 'Combined Crisis',        'Supplier failure + 30% demand rise + 3-day delivery delay.',        'combined',            7, 30,  3)
on conflict (id) do nothing;
```

Enable **Row Level Security** on tables holding sensitive data and only reach
the database through the backend client.

---

## Scripts

| Service | Script | Purpose |
|---|---|---|
| frontend | `npm run dev` | Vite dev server (port 5173) |
| frontend | `npm run build` | `tsc --noEmit` typecheck + production build |
| frontend | `npm run preview` | Serve the built app |
| frontend | `npm test` | Run component and routing unit tests (23 tests) |
| backend | `npm run dev` | `tsx watch` dev server (port 4000) |
| backend | `npm run build` | Compile TypeScript to `dist/` |
| backend | `npm run start` | Run the compiled build |
| backend | `npm run typecheck` | `tsc --noEmit` typecheck |
| backend | `npm test` | Run complete test suite (100 tests covering queues, scheduler, notifications, scenarios, forecasting, imports, and assistant tools) |
| ml-service | `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000` | FastAPI forecast comparison and health endpoints |

---

## Roadmap

- **Planned — LLM-backed Copilot:** replace the rule-based assistant with an
  LLM that answers from the application database and model results ("Why is
  Hospital H2 at risk?", "What happens if Supplier S2 fails?").
- **Next — validate against real operational histories:** use authorized,
  privacy-reviewed data and include historical stock snapshots to evaluate
  whether forecast improvements also improve safety-buffer alerts.
- **Planned — real public datasets:** integrate authoritative public data
  (e.g. public health facility registers) and label it as REAL/PUBLIC data.
- **Planned — anomaly detection:** flag unexpected demand shifts before they
  surface as forecast error.
- **Planned — scenario sensitivity:** confidence bands around forecast and
  shortage estimates.

---

## License

Proprietary demo project. Built for demonstration and hackathon evaluation;
not for clinical or production use.