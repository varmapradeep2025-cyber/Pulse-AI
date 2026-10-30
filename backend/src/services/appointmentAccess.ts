export interface AppointmentAccessIdentity {
  id: string;
  appMetadata?: Record<string, unknown>;
  staffUserIds?: readonly string[];
}

export function hasAppointmentStaffAccess(
  identity: AppointmentAccessIdentity,
): boolean {
  const appMetadata = identity.appMetadata ?? {};
  const configuredIds = identity.staffUserIds ?? [];
  const role = String(appMetadata.role ?? "").trim().toLowerCase();

  return (
    configuredIds.includes(identity.id) ||
    appMetadata.appointment_staff === true ||
    role === "appointment_staff" ||
    role === "admin" ||
    role === "administrator"
  );
}

export function isStaffAuthorizedForHospital(
  identity: AppointmentAccessIdentity,
  hospitalId: string,
): boolean {
  if (!hasAppointmentStaffAccess(identity)) {
    return false;
  }

  const appMetadata = identity.appMetadata ?? {};
  const role = String(appMetadata.role ?? "").trim().toLowerCase();
  const isAdmin =
    role === "admin" ||
    role === "administrator" ||
    appMetadata.appointment_all_hospitals === true ||
    appMetadata.all_hospitals === true;

  if (isAdmin) {
    return true;
  }

  const assigned = [
    ...(Array.isArray(appMetadata.appointment_hospital_ids)
      ? appMetadata.appointment_hospital_ids
      : []),
    ...(Array.isArray(appMetadata.allowed_hospital_ids)
      ? appMetadata.allowed_hospital_ids
      : []),
    ...(typeof appMetadata.hospital_id === "string"
      ? [appMetadata.hospital_id]
      : []),
    ...(typeof appMetadata.appointment_hospital_id === "string"
      ? [appMetadata.appointment_hospital_id]
      : []),
  ].map(String);

  if (assigned.length > 0) {
    return assigned.includes(hospitalId);
  }

  // Explicit hospital assignment is required; unassigned staff cannot access hospitals
  return false;
}
