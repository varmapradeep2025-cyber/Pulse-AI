import type { CorsOptions } from "cors";

export const DEFAULT_FRONTEND_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
] as const;

export function parseFrontendOrigins(raw: string | undefined): string[] {
  const origins = (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.includes("*")) {
    throw new Error(
      "FRONTEND_ORIGINS must list explicit origins; wildcards are not allowed.",
    );
  }

  return origins.length > 0
    ? Array.from(new Set(origins))
    : [...DEFAULT_FRONTEND_ORIGINS];
}

export function isFrontendOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  return !origin || allowedOrigins.includes(origin);
}

export function createCorsOptions(
  allowedOrigins: readonly string[],
): CorsOptions {
  return {
    origin(origin, callback) {
      callback(null, isFrontendOriginAllowed(origin, allowedOrigins));
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    maxAge: 86_400,
  };
}
