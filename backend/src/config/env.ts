import { parseFrontendOrigins } from "./cors.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV ?? "development";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const APPOINTMENT_STAFF_USER_IDS = (
  process.env.APPOINTMENT_STAFF_USER_IDS ?? ""
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const INVENTORY_STAFF_USER_IDS = (
  process.env.INVENTORY_STAFF_USER_IDS ?? ""
)
  .split(/[,;\s]+/)
  .map((value) => value.trim())
  .filter(Boolean);

const FRONTEND_ORIGINS = parseFrontendOrigins(
  process.env.FRONTEND_ORIGINS,
);

// ── Notification provider keys ──────────────────────────────────────
// Email: Resend (https://resend.com — free 3 000 emails/month)
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "Pulse AI <onboarding@resend.dev>";

// SMS: Fast2SMS (https://fast2sms.com — free credits, India mobile numbers)
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY ?? "";

// App public URL used in email/push links
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
const ML_SERVICE_URL = (
  process.env.ML_SERVICE_URL ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export const env = {
  PORT,
  HOST,
  NODE_ENV,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  APPOINTMENT_STAFF_USER_IDS,
  INVENTORY_STAFF_USER_IDS,
  FRONTEND_ORIGINS,
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
  FAST2SMS_API_KEY,
  APP_URL,
  ML_SERVICE_URL,
};
