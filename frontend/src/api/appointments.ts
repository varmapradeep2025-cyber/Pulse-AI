import { supabase } from "../lib/supabase";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export type AppointmentStatus =
  | "requested"
  | "confirmed"
  | "checked_in"
  | "waiting"
  | "in_consultation"
  | "completed"
  | "cancelled"
  | "missed";

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

export interface AppointmentCatalog {
  source: "demo";
  demoLabel: string;
  timezone: "Asia/Kolkata";
  hospitals: readonly AppointmentHospital[];
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

export interface PublicAppointment {
  id: string;
  reference: string;
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
  source: "online" | "walk_in" | "assisted";
  createdAt: string;
  updatedAt: string;
  checkedInAt: string | null;
  consultationStartedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  missedAt: string | null;
}

export interface AppointmentEvent {
  id: string;
  appointmentId: string;
  fromStatus: AppointmentStatus | null;
  toStatus: AppointmentStatus;
  actorRole: "patient" | "staff";
  createdAt: string;
}

export interface AppointmentGuidance {
  arrival: string;
  status: string;
  assistance: string;
  notifications: string;
}

export type WaitEstimate =
  | {
      available: true;
      minutes: number;
      basis: string;
      updatedAt: string;
    }
  | {
      available: false;
      reason: string;
      activeQueueCount: number;
      recentConsultations: number;
    };

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
  source: "demo";
  demoLabel: string;
}

export interface AppointmentSelection {
  hospitalId: string;
  departmentId: string;
  doctorId: string;
}

export interface CreateAppointmentInput extends AppointmentSelection {
  slotId: string;
  patientName: string;
}

export interface CreateWalkInInput {
  hospitalId: string;
  departmentId: string;
  doctorId?: string;
  patientName: string;
}

export class AppointmentApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AppointmentApiError";
  }
}

interface ApiPayload {
  success?: boolean;
  code?: string;
  message?: string;
  [key: string]: unknown;
}

async function request<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
  } = {},
): Promise<T> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new AppointmentApiError(
      "Sign in again to use appointments.",
      401,
      "AUTH_REQUIRED",
    );
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body:
        options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
    });
  } catch {
    throw new AppointmentApiError(
      "The appointment service is unreachable. Check that the backend is running and try again.",
      0,
      "NETWORK_ERROR",
    );
  }

  const payload = (await response
    .json()
    .catch(() => null)) as ApiPayload | null;

  if (!response.ok || !payload?.success) {
    throw new AppointmentApiError(
      payload?.message ??
        `The appointment request failed (${response.status}).`,
      response.status,
      payload?.code,
    );
  }

  return payload as T;
}

function selectionQuery(selection: AppointmentSelection): string {
  return new URLSearchParams({
    hospitalId: selection.hospitalId,
    departmentId: selection.departmentId,
    doctorId: selection.doctorId,
  }).toString();
}

export async function getAppointmentCatalog(): Promise<AppointmentCatalog> {
  const payload = await request<{
    success: true;
    catalog: AppointmentCatalog;
  }>("/api/appointments/catalog");

  return payload.catalog;
}

export async function getAppointmentAvailability(
  selection: AppointmentSelection,
): Promise<AppointmentAvailability> {
  const payload = await request<{
    success: true;
    availability: AppointmentAvailability;
  }>(`/api/appointments/availability?${selectionQuery(selection)}`);

  return payload.availability;
}

export async function getMyAppointments(): Promise<AppointmentView[]> {
  const payload = await request<{
    success: true;
    appointments: AppointmentView[];
  }>("/api/appointments");

  return payload.appointments;
}

export async function createAppointment(
  input: CreateAppointmentInput,
): Promise<AppointmentView> {
  const payload = await request<{
    success: true;
    appointment: AppointmentView;
  }>("/api/appointments", {
    method: "POST",
    body: input,
  });

  return payload.appointment;
}

export async function rescheduleAppointment(
  appointmentId: string,
  slotId: string,
): Promise<AppointmentView> {
  const payload = await request<{
    success: true;
    appointment: AppointmentView;
  }>(
    `/api/appointments/${encodeURIComponent(
      appointmentId,
    )}/reschedule`,
    {
      method: "PATCH",
      body: { slotId },
    },
  );

  return payload.appointment;
}

export async function cancelAppointment(
  appointmentId: string,
): Promise<AppointmentView> {
  const payload = await request<{
    success: true;
    appointment: AppointmentView;
  }>(
    `/api/appointments/${encodeURIComponent(
      appointmentId,
    )}/cancel`,
    { method: "POST" },
  );

  return payload.appointment;
}

export async function checkInAppointment(
  appointmentId: string,
): Promise<AppointmentView> {
  const payload = await request<{
    success: true;
    appointment: AppointmentView;
  }>(
    `/api/appointments/${encodeURIComponent(
      appointmentId,
    )}/check-in`,
    { method: "POST" },
  );

  return payload.appointment;
}

export async function getStaffQueue(
  hospitalId: string,
  departmentId: string,
): Promise<QueueView> {
  const query = new URLSearchParams({
    hospitalId,
    departmentId,
  }).toString();
  const payload = await request<{
    success: true;
    queue: QueueView;
  }>(`/api/staff/appointments/queue?${query}`);

  return payload.queue;
}

export async function createWalkIn(
  input: CreateWalkInInput,
): Promise<AppointmentView> {
  const payload = await request<{
    success: true;
    appointment: AppointmentView;
  }>("/api/staff/appointments/walk-ins", {
    method: "POST",
    body: input,
  });

  return payload.appointment;
}

export async function transitionAppointmentStatus(
  appointmentId: string,
  status: AppointmentStatus,
): Promise<AppointmentView> {
  const payload = await request<{
    success: true;
    appointment: AppointmentView;
  }>(
    `/api/staff/appointments/${encodeURIComponent(
      appointmentId,
    )}/status`,
    {
      method: "PATCH",
      body: { status },
    },
  );

  return payload.appointment;
}
