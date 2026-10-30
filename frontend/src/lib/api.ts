import { supabase } from "./supabase";

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000"
).replace(/\/+$/, "");

let refreshPromise: Promise<string | null> | null = null;

/**
 * Refreshes the active Supabase session. De-duplicates simultaneous refresh calls
 * using a shared singleton promise to avoid multiple roundtrips.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session?.access_token) {
        // If refresh fails, clear invalid session
        await supabase.auth.signOut().catch(() => {});
        return null;
      }
      return data.session.access_token;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Retrieves a valid access token. If the current token is expired or within 60 seconds
 * of expiration, proactively refreshes it before returning.
 */
export async function accessToken(): Promise<string | null> {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      return null;
    }

    // Check expiration buffer (60 seconds)
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    const now = Date.now();
    const BUFFER_MS = 60 * 1000;

    if (expiresAt > 0 && expiresAt - now < BUFFER_MS) {
      const refreshedToken = await refreshAccessToken();
      return refreshedToken ?? session.access_token;
    }

    return session.access_token;
  } catch {
    return null;
  }
}

/**
 * Returns Authorization header with a valid access token.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessToken();

  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface AuthenticatedFetchOptions extends RequestInit {
  /**
   * If true, permits a single retry on HTTP 401 after refreshing the token.
   * Defaults to true for idempotent methods (GET, HEAD, OPTIONS, PUT, DELETE).
   */
  allowRetryOn401?: boolean;
}

/**
 * Authenticated fetch helper with de-duplicated session refresh and single-retry protection
 * for idempotent requests. Non-idempotent mutations (POST) are not blindly retried by default
 * to prevent duplicate appointments or records.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: AuthenticatedFetchOptions,
): Promise<Response> {
  const headers = new Headers(init?.headers ?? {});

  if (!headers.has("Authorization")) {
    const token = await accessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const method = (init?.method ?? "GET").toUpperCase();
  const isIdempotent = ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"].includes(
    method,
  );
  const allowRetry = init?.allowRetryOn401 ?? isIdempotent;

  const response = await fetch(input, {
    ...init,
    headers,
  });

  // Handle 401 with single retry if permitted
  if (response.status === 401 && allowRetry && !headers.has("x-retry-attempt")) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers.set("Authorization", `Bearer ${refreshed}`);
      headers.set("x-retry-attempt", "1");
      return fetch(input, {
        ...init,
        headers,
      });
    }
  }

  return response;
}
