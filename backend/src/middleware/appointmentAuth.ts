import type {
  NextFunction,
  Request,
  Response,
} from "express";
import type { User } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { supabase } from "../utils/supabase.js";
import { hasAppointmentStaffAccess } from "../services/appointmentAccess.js";
import type { AppointmentUser } from "../types/appointments.js";

function fullNameFromUser(user: User): string | undefined {
  const metadata = user.user_metadata ?? {};
  const candidate =
    metadata.full_name ?? metadata.name ?? user.email;

  return typeof candidate === "string" &&
    candidate.trim().length > 0
    ? candidate.trim()
    : undefined;
}

function isConfiguredStaff(user: User): boolean {
  return hasAppointmentStaffAccess({
    id: user.id,
    appMetadata: user.app_metadata ?? {},
    staffUserIds: env.APPOINTMENT_STAFF_USER_IDS,
  });
}

export async function appointmentAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      code: "AUTH_REQUIRED",
      message: "Sign in to use appointments.",
    });
    return;
  }

  const token = header.slice("Bearer ".length).trim();

  if (!token) {
    res.status(401).json({
      success: false,
      code: "AUTH_REQUIRED",
      message: "Sign in to use appointments.",
    });
    return;
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({
        success: false,
        code: "INVALID_SESSION",
        message:
          "Your session is invalid or has expired. Sign in again.",
      });
      return;
    }

    const appointmentUser: AppointmentUser & {
      isStaff: boolean;
    } = {
      id: data.user.id,
      fullName: fullNameFromUser(data.user),
      email: data.user.email,
      isStaff: isConfiguredStaff(data.user),
    };

    req.appointmentUser = appointmentUser;
    next();
  } catch (error) {
    console.error(
      "Appointment authentication failed:",
      error instanceof Error ? error.message : "unknown error",
    );

    res.status(503).json({
      success: false,
      code: "AUTH_UNAVAILABLE",
      message:
        "Authentication is temporarily unavailable. Try again shortly.",
    });
  }
}

export function requireAppointmentStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.appointmentUser) {
    res.status(401).json({
      success: false,
      code: "AUTH_REQUIRED",
      message: "Sign in to use appointments.",
    });
    return;
  }

  if (!req.appointmentUser.isStaff) {
    res.status(403).json({
      success: false,
      code: "STAFF_ACCESS_REQUIRED",
      message:
        "Staff queue access is not configured for this account. Ask an administrator to assign an appointment staff role.",
    });
    return;
  }

  next();
}
