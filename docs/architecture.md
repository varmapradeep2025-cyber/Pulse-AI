# Pulse AI — Architecture

## Overview

Pulse AI is an AI-powered public healthcare access assistant focused on helping
underserved and low-income patients navigate public healthcare services in India.

**Important:** Pulse AI is a *healthcare access* assistant. It is **not** a
medical diagnosis or treatment system. Clinical claims, disease prediction,
triage logic, and medical rules are out of scope for this foundation phase and
will only be added after their exact behavior and data sources are defined.

## System components

Three independently runnable services, designed to be developed and deployed
separately:

| Service       | Path          | Stack                     | Entry point          | Port (dev default) |
|---------------|---------------|---------------------------|----------------------|--------------------|
| Frontend      | `frontend/`   | React + TypeScript + Vite | `src/main.tsx`       | 5173               |
| Backend       | `backend/`    | Node.js + Express + TypeScript (tsx for dev) | `src/index.ts` | 4000               |
| ML service    | `ml-service/` | Python + FastAPI (Pydantic, Uvicorn) | `app/main.py` | 8000               |

## Service responsibilities

- **Frontend**: user-facing web UI. Talks to the backend over HTTP JSON.
  No direct database access.
- **Backend**: API gateway for the product domain (patients, facilities,
  appointments — to be defined). Owns business logic and will own Supabase
  integration. Exposes `GET /health`.
- **ML service**: future location for AI/ML capabilities (e.g., plain-language
  explanations of schemes, facility eligibility lists). No models yet. Exposes
  `GET /health`.

## Infrastructure (future)

- **Database**: Supabase PostgreSQL. **Not connected yet.** It will be reached
  only through the backend using `@supabase/supabase-js`, with Row Level
  Security to protect patient data. Access credentials will live in environment
  variables (never committed).

## Configuration

All configurable values are read from environment variables at runtime.
Template files (`.env.example`) exist in each service directory; copy them to
`.env` locally. Never commit real `.env` files.

Current variable names:

- `frontend/`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `VITE_API_BASE_URL`
- `backend/`: `PORT`, `HOST`, `NODE_ENV`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_ORIGINS`,
  `APPOINTMENT_STAFF_USER_IDS`, `INVENTORY_STAFF_USER_IDS`, `ML_SERVICE_URL`
- `ml-service/`: `APP_ENV`, `SERVICE_NAME`, `SERVICE_VERSION`, future model/API
  keys

`INVENTORY_STAFF_USER_IDS` grants full inventory access to the listed Supabase
user IDs. Prefer hospital-scoped `app_metadata.inventory_staff = true` plus
`app_metadata.inventory_hospital_ids = [1, 2]` for staff who should only see
assigned facilities.

## Current endpoint surface

- `GET backend/health` -> `{ status, service, environment, timestamp }`
- `GET ml-service/health` -> `{ status, service, environment, timestamp }`

## Non-goals (foundation phase)

- No authentication
- No database code / connections
- No AI / LLM API calls
- No ML models
- No disease prediction or triage logic
- No medical eligibility scoring or medical rules
- No invented hospital, medicine, scheme, queue, or diagnostic data

## Deferred decisions (add in a later phase, with explicit requirements)

1. Exact AI feature set and its prompting / data flow.
2. Authoritative data sources for public health infrastructure in India.
3. Supabase schema, RLS policies, and identity model.
4. Intra-service communication contract (backend <-> ML service).
5. Deployment targets and environment strategy (local only for now).