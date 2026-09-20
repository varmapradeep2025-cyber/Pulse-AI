# Pulse AI

**AI-powered public healthcare access assistant** for underserved and low-income
patients navigating public healthcare services in India.

> **Important:** Pulse AI is a *healthcare access* assistant. It is **not** a
> medical diagnosis or treatment system. It does not predict diseases, triage
> patients, apply medical eligibility scoring, or provide medical advice.

## Project layout

```
Pulse AI/
├── README.md
├── .gitignore
├── docs/
│   └── architecture.md
├── frontend/     # React + TypeScript + Vite
├── backend/      # Node.js + Express + TypeScript
└── ml-service/   # Python + FastAPI (Pydantic, Uvicorn)
```

See [docs/architecture.md](./docs/architecture.md) for the detailed
architecture and current scope.

## Prerequisites

- Node.js >= 20 (tested with v25.9.0)
- npm (tested with 11.12.1)
- Python >= 3.11 (tested with 3.13.12)
- pip
- Git

No Docker required. Services run directly on localhost.

## Quick start

### 1. Frontend (React + TypeScript)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

- `npm run build` — typecheck (`tsc --noEmit`) then production build to `dist/`
- `npm run preview` — serve the built app locally

### 2. Backend (Express + TypeScript)

```bash
cd backend
npm install
cp .env.example .env  # adjust values if needed
npm run dev           # tsx watch -> http://localhost:4000
```

- `npm run build` — compile TypeScript to `dist/` via `tsc`
- `npm run start` — run the compiled build (requires build first)
- Health check: `GET http://localhost:4000/health`

### 3. ML service (FastAPI)

```bash
cd ml-service
python -m venv .venv
. .venv/Scripts/activate        # Windows (PowerShell)
# or: source .venv/bin/activate # macOS/Linux
pip install -r requirements.txt
cp .env.example .env            # adjust values if needed
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Health check: `GET http://localhost:8000/health`
- Interactive docs: `http://localhost:8000/docs`

## Environment variables

Each service reads its configuration from environment variables.
Copy the corresponding `.env.example` to `.env` and edit.

| Service       | File                  | Current vars | Reserved for later |
|---------------|-----------------------|--------------|--------------------|
| frontend      | `frontend/.env.example` | —           | `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| backend       | `backend/.env.example`  | `PORT`, `HOST`, `NODE_ENV` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ML_SERVICE_URL` |
| ml-service    | `ml-service/.env.example`| `SERVICE_NAME`, `SERVICE_VERSION`, `APP_ENV` | future model/API keys |

Never commit real `.env` files.

## Verification

```bash
# Frontend
cd frontend && npm run build

# Backend
cd backend && npm run build && npm run start
curl hhealthttp://localhost:4000/

# ML service
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
curl 