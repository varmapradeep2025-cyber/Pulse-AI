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
