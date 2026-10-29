export const APPOINTMENT_STATUSES = [
  "requested",
  "confirmed",
  "checked_in",
  "waiting",
  "in_consultation",
  "completed",
  "cancelled",
  "missed",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const ACTIVE_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  "requested",
  "confirmed",
  "checked_in",
  "waiting",
  "in_consultation",
];

export type AppointmentSource = "online" | "walk_in" | "assisted";
export type AppointmentActorRole = "patient" | "staff";

export const APPOINTMENT_DEMO_LABEL =
  "Demo scheduling and queue data only. These are fictional facilities, doctors and availability records; not real hospital appointments. Records reset when the backend restarts.";

export interface AppointmentUser {
  id: string;
  fullName?: string;
  email?: string;
}

export interface AppointmentDoctor {
  id: string;
  name: string;
  approvalRequired: boolean;
  availableWeekdays: readonly number[];
}

export interface AppointmentDepartment {
  id: string;
  name: string;
  doctors: readonly AppointmentDoctor[];
}

export interface AppointmentHospital {
  id: string;
  name: string;
  city: string;
  departments: readonly AppointmentDepartment[];
}

export interface AppointmentSlot {
  slotId: string;
  hospitalId: string;
  departmentId: string;
  doctorId: string;
  startsAt: string;
  endsAt: string;
  label: string;
}

export interface AppointmentAvailabilityDay {
  date: string;
  label: string;
  slots: AppointmentSlot[];
}

export interface AppointmentAvailability {
  source: "demo";
  demoLabel: string;
  timezone: "Asia/Kolkata";
  days: AppointmentAvailabilityDay[];
}

export interface Appointment {
  id: string;
  reference: string;
  userId: string | null;
  patientName: string;
  hospitalId: string;
  hospitalName: string;
  departmentId: string;
  departmentName: string;
  doctorId: string;
  doctorName: string;
  slotId: string | null;
  scheduledAt: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  createdAt: string;
  updatedAt: string;
  checkedInAt: string | null;
  consultationStartedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  missedAt: string | null;
  queueDate: string | null;
  tokenNumber: number | null;
  digitalToken: string | null;
  calledAt: string | null;
}

export type PublicAppointment = Omit<Appointment, "userId">;

export interface AppointmentEvent {
  id: string;
  appointmentId: string;
  fromStatus: AppointmentStatus | null;
  toStatus: AppointmentStatus;
  actorRole: AppointmentActorRole;
  createdAt: string;
}

export interface AppointmentGuidance {
  arrival: string;
  status: string;
  assistance: string;
  notifications: string;
}

export interface WaitEstimateAvailable {
  available: true;
  minutes: number;
  basis: string;
  updatedAt: string;
}

export interface WaitEstimateUnavailable {
  available: false;
  reason: string;
  activeQueueCount: number;
  recentConsultations: number;
}

export type WaitEstimate =
  | WaitEstimateAvailable
  | WaitEstimateUnavailable;

export interface AppointmentView {
  appointment: PublicAppointment;
  guidance: AppointmentGuidance;
  waitEstimate: WaitEstimate;
  history: AppointmentEvent[];
  source: "demo";
  demoLabel: string;
}

export interface QueueView {
  appointments: AppointmentView[];
  waitEstimate: WaitEstimate;
  currentServingToken: number | null;
  currentServingDigitalToken: string | null;
  activeCount: number;
  source: "demo";
  demoLabel: string;
}

export interface QueueSnapshot {
  appointmentId: string;
  reference: string;
  status: AppointmentStatus;
  queueDate: string | null;
  tokenNumber: number | null;
  digitalToken: string | null;
  currentServingToken: number | null;
  currentServingDigitalToken: string | null;
  patientsAhead: number;
  waitEstimate: WaitEstimate;
  updatedAt: string;
}

export interface CreateAppointmentInput {
  hospitalId?: unknown;
  departmentId?: unknown;
  doctorId?: unknown;
  slotId?: unknown;
  patientName?: unknown;
  phoneNumber?: unknown;
}

export interface RescheduleAppointmentInput {
  slotId?: unknown;
}

export interface CreateWalkInInput {
  hospitalId?: unknown;
  departmentId?: unknown;
  doctorId?: unknown;
  patientName?: unknown;
}

export interface TransitionAppointmentInput {
  status?: unknown;
}
