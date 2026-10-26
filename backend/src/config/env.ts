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

export const env = {
  PORT,
  HOST,
  NODE_ENV,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  APPOINTMENT_STAFF_USER_IDS,
  INVENTORY_STAFF_USER_IDS,
};