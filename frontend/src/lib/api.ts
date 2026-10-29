import { supabase } from "./supabase";

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000"
).replace(/\/+$/, "");

export async function accessToken(): Promise<string | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    return null;
  }

  return session.access_token;
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessToken();

  return token ? { Authorization: `Bearer ${token}` } : {};
}
