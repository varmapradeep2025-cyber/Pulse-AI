import type { NextFunction, Request, Response } from "express";

type AccessTokenVerifier = (token: string) => Promise<string | null>;

async function verifyWithSupabase(token: string): Promise<string | null> {
  const { supabase } = await import("../utils/supabase.js");

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user?.id) {
    return null;
  }

  return data.user.id;
}

export function createAnalyticsAuth(
  verifyAccessToken: AccessTokenVerifier = verifyWithSupabase,
) {
  return async function analyticsAuth(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const header = req.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        code: "AUTH_REQUIRED",
        message: "Sign in to use hospital analytics.",
      });
      return;
    }

    const token = header.slice("Bearer ".length).trim();

    if (!token) {
      res.status(401).json({
        success: false,
        code: "AUTH_REQUIRED",
        message: "Sign in to use hospital analytics.",
      });
      return;
    }

    try {
      const userId = await verifyAccessToken(token);

      if (!userId) {
        res.status(401).json({
          success: false,
          code: "INVALID_SESSION",
          message: "Your session is invalid or has expired. Sign in again.",
        });
        return;
      }

      next();
    } catch (error) {
      console.error(
        "Analytics authentication failed:",
        error instanceof Error ? error.message : "unknown error",
      );

      res.status(503).json({
        success: false,
        code: "AUTH_UNAVAILABLE",
        message: "Authentication is temporarily unavailable. Try again shortly.",
      });
    }
  };
}

export const analyticsAuth = createAnalyticsAuth();
