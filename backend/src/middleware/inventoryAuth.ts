import type { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { supabase } from "../utils/supabase.js";
import {
  hasInventoryHospitalScope,
  parseInventoryStaffIds,
  resolveInventoryUser,
} from "../services/inventoryAccess.js";

export function getAllowedInventoryStaffIds(): ReadonlySet<string> {
  const ids = new Set<string>();

  const envVar = process.env.INVENTORY_STAFF_USER_IDS;
  if (typeof envVar === "string") {
    for (const id of parseInventoryStaffIds(envVar)) {
      ids.add(id);
    }
  } else {
    for (const id of env.INVENTORY_STAFF_USER_IDS) {
      ids.add(id);
    }
  }

  try {
    const candidates = [
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), "backend", ".env"),
    ];
    for (const file of candidates) {
      if (fs.existsSync(file)) {
        const text = fs.readFileSync(file, "utf8");
        for (const line of text.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed.startsWith("INVENTORY_STAFF_USER_IDS=")) {
            const rawVal = trimmed.slice("INVENTORY_STAFF_USER_IDS=".length);
            for (const id of parseInventoryStaffIds(rawVal)) {
              ids.add(id);
            }
          }
        }
      }
    }
  } catch {
    // Ignore file read error
  }

  return ids;
}

export type InventoryUserClaimsVerifier = (token: string) => Promise<{
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
} | null>;

async function defaultSupabaseVerifier(token: string) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }
  return {
    id: data.user.id,
    email: data.user.email,
    app_metadata: data.user.app_metadata ?? {},
    user_metadata: data.user.user_metadata ?? {},
  };
}

export function createInventoryAuth(
  verifier: InventoryUserClaimsVerifier = defaultSupabaseVerifier,
  getAllowedIds: () => ReadonlySet<string> = getAllowedInventoryStaffIds,
) {
  return async function inventoryAuthMiddleware(
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
      const user = await verifier(token);

      if (!user) {
        res.status(401).json({
          success: false,
          code: "INVALID_SESSION",
          message: "Your session is invalid or has expired. Sign in again.",
        });
        return;
      }

      const allowedUserIds = getAllowedIds();
      const inventoryUser = resolveInventoryUser(
        {
          sub: user.id,
          email: user.email,
          app_metadata: user.app_metadata ?? {},
          user_metadata: user.user_metadata,
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
  };
}

export const inventoryAuth = createInventoryAuth();

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
      details: {
        userId: req.inventoryUser.id,
        reason:
          "User ID is not present in INVENTORY_STAFF_USER_IDS and lacks app_metadata.inventory_staff role.",
      },
    });
    return;
  }

  if (!hasInventoryHospitalScope(req.inventoryUser)) {
    res.status(403).json({
      success: false,
      code: "INVENTORY_HOSPITAL_SCOPE_REQUIRED",
      message:
        "Inventory hospital access is not configured for this account. Ask an administrator to assign one or more hospital IDs.",
      details: {
        userId: req.inventoryUser.id,
        reason:
          "User has staff role but lacks app_metadata.inventory_hospital_ids assignment.",
      },
    });
    return;
  }

  next();
}
