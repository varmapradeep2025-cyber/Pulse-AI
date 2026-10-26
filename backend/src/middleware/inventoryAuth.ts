import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { supabase } from "../utils/supabase.js";
import {
  hasInventoryHospitalScope,
  resolveInventoryUser,
} from "../services/inventoryAccess.js";

const allowedUserIds = new Set(env.INVENTORY_STAFF_USER_IDS);

export async function inventoryAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      code: "AUTH_REQUIRED",
      message: "Sign in to import inventory data.",
    });
    return;
  }

  const token = header.slice("Bearer ".length).trim();

  if (!token) {
    res.status(401).json({
      success: false,
      code: "AUTH_REQUIRED",
      message: "Sign in to import inventory data.",
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

    req.inventoryUser = inventoryUser;
    next();
  } catch (error) {
    console.error(
      "Inventory authentication failed:",
      error instanceof Error ? error.message : "unknown error",
    );

    res.status(503).json({
      success: false,
      code: "AUTH_UNAVAILABLE",
      message: "Authentication is temporarily unavailable. Try again shortly.",
    });
  }
}

export function requireInventoryStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.inventoryUser) {
    res.status(401).json({
      success: false,
      code: "AUTH_REQUIRED",
      message: "Sign in to import inventory data.",
    });
    return;
  }

  if (!req.inventoryUser.isStaff) {
    res.status(403).json({
      success: false,
      code: "INVENTORY_STAFF_ACCESS_REQUIRED",
      message:
        "Inventory staff access is not configured for this account. Ask an administrator to assign the inventory staff role.",
    });
    return;
  }

  if (!hasInventoryHospitalScope(req.inventoryUser)) {
    res.status(403).json({
      success: false,
      code: "INVENTORY_HOSPITAL_SCOPE_REQUIRED",
      message:
        "Inventory hospital access is not configured for this account. Ask an administrator to assign one or more hospital IDs.",
    });
    return;
  }

  next();
}
