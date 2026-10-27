import type { Appointment, AppointmentEvent } from "../types/appointments.js";

const MISSING_SCHEMA_CODES = new Set(["42P01", "PGRST202", "PGRST205"]);

export class AppointmentPersistenceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "AppointmentPersistenceError";
  }
}

export interface AppointmentRepository {
  readonly mode: "memory" | "supabase";
  getAppointments(): Appointment[];
  getEvents(): AppointmentEvent[];
  findAppointment(id: string): Appointment | undefined;
  saveAppointment(appointment: Appointment): void;
  recordEvent(event: AppointmentEvent): void;
  allocateToken(facilityId: string, departmentId: string, queueDate: string): number;
  getServingToken(facilityId: string, departmentId: string, queueDate: string): number | null;
  setServingToken(facilityId: string, departmentId: string, queueDate: string, token: number): void;
  reset(): void;
}

export class InMemoryAppointmentRepository implements AppointmentRepository {
  readonly mode = "memory" as const;
  private appointments: Appointment[] = [];
  private events: AppointmentEvent[] = [];
  private tokenCounters = new Map<string, number>();
  private servingTokens = new Map<string, number>();

  getAppointments(): Appointment[] {
    return this.appointments;
  }

  getEvents(): AppointmentEvent[] {
    return this.events;
  }

  findAppointment(id: string): Appointment | undefined {
    return this.appointments.find((candidate) => candidate.id === id);
  }

  saveAppointment(appointment: Appointment): void {
    const existingIndex = this.appointments.findIndex(
      (candidate) => candidate.id === appointment.id,
    );

    if (existingIndex >= 0) {
      this.appointments[existingIndex] = appointment;
    } else {
      this.appointments.push(appointment);
    }
  }

  recordEvent(event: AppointmentEvent): void {
    this.events.push(event);
  }

  allocateToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
  ): number {
    const key = `${facilityId}:${departmentId}:${queueDate}`;
    const current = this.tokenCounters.get(key) ?? 0;
    const next = current + 1;
    this.tokenCounters.set(key, next);
    return next;
  }

  getServingToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
  ): number | null {
    const key = `${facilityId}:${departmentId}:${queueDate}`;
    return this.servingTokens.get(key) ?? null;
  }

  setServingToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
    token: number,
  ): void {
    const key = `${facilityId}:${departmentId}:${queueDate}`;
    this.servingTokens.set(key, token);
  }

  reset(): void {
    this.appointments = [];
    this.events = [];
    this.tokenCounters.clear();
    this.servingTokens.clear();
  }
}

export class SupabaseAppointmentRepository implements AppointmentRepository {
  readonly mode = "supabase" as const;
  private inMemoryCache = new InMemoryAppointmentRepository();

  private assertSchemaAvailable(error?: { code?: string; message?: string }): never {
    if (error && (MISSING_SCHEMA_CODES.has(error.code ?? "") || error.message?.includes("does not exist"))) {
      throw new AppointmentPersistenceError(
        503,
        "APPOINTMENT_SCHEMA_NOT_READY",
        "Appointment database storage is not configured yet. Apply migrations before using database persistence.",
      );
    }

    throw new AppointmentPersistenceError(
      500,
      "APPOINTMENT_DB_ERROR",
      "Appointment database query failed.",
    );
  }

  getAppointments(): Appointment[] {
    return this.inMemoryCache.getAppointments();
  }

  getEvents(): AppointmentEvent[] {
    return this.inMemoryCache.getEvents();
  }

  findAppointment(id: string): Appointment | undefined {
    return this.inMemoryCache.findAppointment(id);
  }

  saveAppointment(appointment: Appointment): void {
    this.inMemoryCache.saveAppointment(appointment);
  }

  recordEvent(event: AppointmentEvent): void {
    this.inMemoryCache.recordEvent(event);
  }

  allocateToken(facilityId: string, departmentId: string, queueDate: string): number {
    return this.inMemoryCache.allocateToken(facilityId, departmentId, queueDate);
  }

  getServingToken(facilityId: string, departmentId: string, queueDate: string): number | null {
    return this.inMemoryCache.getServingToken(facilityId, departmentId, queueDate);
  }

  setServingToken(facilityId: string, departmentId: string, queueDate: string, token: number): void {
    this.inMemoryCache.setServingToken(facilityId, departmentId, queueDate, token);
  }

  reset(): void {
    this.inMemoryCache.reset();
  }

  async verifyConnection(): Promise<void> {
    const { supabase } = await import("../utils/supabase.js");
    const { error } = await supabase
      .from("appointments")
      .select("id")
      .limit(1);

    if (error) {
      this.assertSchemaAvailable(error);
    }
  }
}
