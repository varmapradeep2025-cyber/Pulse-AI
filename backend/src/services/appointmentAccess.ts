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

  return (
    configuredIds.includes(identity.id) ||
    appMetadata.appointment_staff === true ||
    appMetadata.role === "appointment_staff"
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
  if (
    appMetadata.appointment_all_hospitals === true ||
    appMetadata.all_hospitals === true
  ) {
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

  // If environment configured staff without explicit hospital metadata restriction, permit for dev/demo
  const configuredIds = identity.staffUserIds ?? [];
  return configuredIds.includes(identity.id);
}
