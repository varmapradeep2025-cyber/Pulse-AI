import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { supabase } from "../utils/supabase.js";
import {
  hasInventoryHospitalScope,
  resolveInventoryUser,
} from "../services/inventoryAccess.js";
import type { AnalyticsUser } from "../types/analytics.js";

const allowedUserIds = new Set(env.INVENTORY_STAFF_USER_IDS);

export async function analyticsAuth(
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
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({
        success: false,
        code: "INVALID_SESSION",
        message: "Your session is invalid or has expired. Sign in again.",
      });
      return;
    }

    const inventoryUser = resolveInventoryUser(
      {
        sub: data.user.id,
        email: data.user.email,
        app_metadata: data.user.app_metadata ?? {},
      },
      allowedUserIds,
    );

    if (!inventoryUser) {
      res.status(401).json({
        success: false,
        code: "INVALID_SESSION",
        message: "Your session is invalid or has expired. Sign in again.",
      });
      return;
    }

    if (inventoryUser.isStaff && !hasInventoryHospitalScope(inventoryUser)) {
      res.status(403).json({
        success: false,
        code: "ANALYTICS_HOSPITAL_SCOPE_REQUIRED",
        message:
          "Analytics hospital access is not configured for this account. Ask an administrator to assign one or more hospital IDs.",
      });
      return;
    }

    const scoped = hasInventoryHospitalScope(inventoryUser);
    const analyticsUser: AnalyticsUser = {
      id: inventoryUser.id,
      email: inventoryUser.email,
      isStaff: inventoryUser.isStaff,
      hospitalIds: scoped ? [...inventoryUser.hospitalIds] : [],
      allHospitals: !scoped || inventoryUser.allHospitals,
    };

    req.analyticsUser = analyticsUser;
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
}
