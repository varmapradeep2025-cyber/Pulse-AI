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

A per-series 7-day demand forecast driven by a pooled ridge-regression model
(see [Machine learning](#machine-learning)).

### Stock-out / safety-threshold risk detection

Projects stock forward day-by-day against the forecast and flags:

- projected stock-out and the day it happens
- the day stock falls below the configured safety level
- breach of the 1.5× safety-stock "watch" threshold

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
- Currently exposes only `GET /health` — **no models live here yet**
- Note: `pandas`, `numpy`, and `scikit-learn` are **not** used; the ML model
  lives in the TypeScript backend.

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
├── frontend/                    # React + TypeScript + Vite (port 5173)
│   └── src/
│       ├── pages/               # Dashboard, Intelligence, Hospitals, Assistant, …
│       ├── data/                # synthetic hospitals, catalogs, i18n dictionaries
│       ├── data/i18n/           # en, hi, mr, bn, ta, te, gu, kn, ml, pa
│       ├── hooks/               # useSpeechRecognition / useSpeechSynthesis / …
│       ├── api/                 # backend API clients + types
│       ├── context/             # LanguageContext, AuthContext, SimpleModeContext
│       └── lib/                 # supabase client, auth helpers
├── backend/                     # Node.js + Express + TypeScript (port 4000)
│   └── src/
│       ├── routes/              # health, dbtest, intelligence, scenario
│       ├── services/            # scenarioService, intelligenceService, mlForecast,
│       │                        #   syntheticData
│       ├── data/catalog.ts      # demo medicine/hospital/supplier catalog
│       ├── config/env.ts        # strict environment validation
│       └── utils/supabase.ts    # service-role client
└── ml-service/                  # Python + FastAPI (port 8000)
    └── app/main.py              # health-check scaffold
```

---

## Backend API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Service health + environment |
| GET | `/db-test` | Reads sample rows from all Supabase tables (diagnostics) |
| GET | `/api/intelligence/summary` | Hospital-intelligence pipeline: inventory → demand → ML forecast → risk → recommendation → action |
| POST | `/api/scenarios/simulate` | Run a disruption simulation (`{ scenarioId }`) and return per-item impact, risk, and recommendations |

The frontend calls `http://localhost:4000` for these endpoints. The Python
`ml-service` currently exposes only `GET /health`; it is reserved for future
model hosting.

---

## Database (Supabase)

PostgreSQL is accessed only through the backend service-role client. The
services use the following tables (the repo contains no committed SQL
migrations — the schema lives in the Supabase project; an expected-schema
reference and seed are provided in [Supabase setup & seed](#supabase-setup--seed)):

| Table | Purpose | Key columns used by the code |
|---|---|---|
| `hospitals` | Facility reference | `id`, `name` |
| `medicines` | Medicine reference | `id`, `name`, `category`, `criticality`, `unit` |
| `inventory` | Current stock per facility × medicine | `hospital_id`, `medicine_id`, `current_stock`, `safety_stock`, `daily_consumption` |
| `demand_history` | Daily observed demand | `hospital_id`, `medicine_id`, `demand_date`, `demand` |
| `orders` | Procurement orders (diagnostics) | `id`, `hospital_id`, `supplier_id`, `medicine_id`, `quantity`, `status` |
| `scenarios` | Defined disruption scenarios | `id`, `name`, `description`, `disruption_type`, `duration_days`, `demand_change_percent`, `transport_delay_days` |

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

**Training / evaluation:**

- Closed-form normal equations with an L2 penalty (`λ = 200`), solved with
  Gaussian elimination (partial pivoting), `log1p` target transform
- Last **8 days** of each series held out; the model is scored against a
  naive **baseline (mean of historical demand)**
- Reported metrics: **MAE**, **RMSE**, **MAPE** for the model, plus the
  baseline MAE/RMSE for comparison

> Metrics are computed **per run** from the currently seeded/synthetic data
> and are surfaced live in the UI's model cards — no numbers are hard-coded
> in this README. Because the current operational data is synthetic/seed data,
> these numbers describe model fit on demo data, **not** accuracy on real
> supply-chain data.

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
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
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
| backend | `npm run dev` | `tsx watch` dev server (port 4000) |
| backend | `npm run build` | Compile TypeScript to `dist/` |
| backend | `npm run start` | Run the compiled build |
| backend | `npm run typecheck` | `tsc --noEmit` |
| ml-service | `python -m uvicorn ...` | FastAPI dev server (port 8000) |

---

## Roadmap

- **Planned — LLM-backed Copilot:** replace the rule-based assistant with an
  LLM that answers from the application database and model results ("Why is
  Hospital H2 at risk?", "What happens if Supplier S2 fails?").
- **Planned — model hosting in Python:** move training/inference to
  `ml-service` (currently a health-check scaffold) so the Node tier stays
  stateless.
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