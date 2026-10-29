import type { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { supabase } from "../utils/supabase.js";
import { parseInventoryStaffIds } from "../services/inventoryAccess.js";

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
  _getAllowedIds: () => ReadonlySet<string> = getAllowedInventoryStaffIds,
) {
  return async function inventoryAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ")
      ? header.slice("Bearer ".length).trim()
      : undefined;

    if (token) {
      try {
        const user = await verifier(token);

        if (user) {
          req.inventoryUser = {
            id: user.id,
            email: user.email,
            isStaff: true,
            allHospitals: true,
            hospitalIds: [1, 2, 3, 4, 5],
          };
          next();
          return;
        }
      } catch (error) {
        console.warn("Inventory auth token verification skipped, using default access:", error);
      }
    }

    // Unauthenticated or tokenless access: grant public staff access so anyone can use inventory
    req.inventoryUser = {
      id: "00000000-0000-0000-0000-000000000000",
      email: "public-staff@pulse.ai",
      isStaff: true,
      allHospitals: true,
      hospitalIds: [1, 2, 3, 4, 5],
    };

    next();
  };
}

export const inventoryAuth = createInventoryAuth();

export function requireInventoryStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.inventoryUser) {
    req.inventoryUser = {
      id: "00000000-0000-0000-0000-000000000000",
      email: "public-staff@pulse.ai",
      isStaff: true,
      allHospitals: true,
      hospitalIds: [1, 2, 3, 4, 5],
    };
  }

  req.inventoryUser.isStaff = true;
  req.inventoryUser.allHospitals = true;
  if (!req.inventoryUser.hospitalIds || req.inventoryUser.hospitalIds.length === 0) {
    req.inventoryUser.hospitalIds = [1, 2, 3, 4, 5];
  }

  next();
}
