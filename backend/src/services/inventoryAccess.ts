import type { InventoryUser } from "../types/inventory.js";

const STAFF_ROLES = new Set([
  "inventory_staff",
  "inventory-staff",
  "inventory_admin",
  "inventory-admin",
  "inventory_manager",
  "inventory-manager",
]);

export interface InventoryClaims {
  sub?: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

function normalizedRole(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function truthyFlag(value: unknown): boolean {
  if (value === true) {
    return true;
  }

  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

export function parseInventoryStaffIds(value: string | undefined): ReadonlySet<string> {
  const ids = (value ?? "")
    .split(/[,;\s]+/)
    .map((id) => id.trim())
    .filter(Boolean);

  return new Set(ids);
}

export function parseHospitalIds(value: unknown): number[] {
  let parsed: unknown = value;

  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = value;
    }
  }

  const values = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "string"
      ? parsed.split(/[,;\s]+/)
      : [parsed];
  const ids = values
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);

  return [...new Set(ids)];
}

export function hasInventoryStaffRole(
  appMetadata: Record<string, unknown> | undefined,
): boolean {
  if (!appMetadata) {
    return false;
  }

  if (truthyFlag(appMetadata.inventory_staff)) {
    return true;
  }

  return (
    STAFF_ROLES.has(normalizedRole(appMetadata.inventory_role)) ||
    STAFF_ROLES.has(normalizedRole(appMetadata.role))
  );
}

export function resolveInventoryUser(
  claims: InventoryClaims,
  allowedUserIds: ReadonlySet<string>,
): InventoryUser | null {
  const id = String(claims.sub ?? "").trim();

  if (!id) {
    return null;
  }

  const environmentStaff = allowedUserIds.has(id);
  const metadata = claims.app_metadata ?? {};
  const hospitalIds = [
    ...new Set([
      ...parseHospitalIds(metadata.inventory_hospital_ids),
      ...parseHospitalIds(metadata.allowed_hospital_ids),
    ]),
  ];

  return {
    id,
    email: claims.email,
    isStaff: environmentStaff || hasInventoryStaffRole(metadata),
    hospitalIds,
    allHospitals:
      truthyFlag(metadata.inventory_all_hospitals) ||
      (environmentStaff && hospitalIds.length === 0),
  };
}

export function hasInventoryHospitalScope(user: InventoryUser): boolean {
  return user.allHospitals || user.hospitalIds.length > 0;
}

export function hospitalIsAllowed(
  user: InventoryUser,
  hospitalId: number,
): boolean {
  return user.allHospitals || user.hospitalIds.includes(hospitalId);
}
