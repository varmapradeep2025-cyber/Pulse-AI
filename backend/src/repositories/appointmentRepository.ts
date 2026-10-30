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
  allocateToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
  ): number;
  getServingToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
  ): number | null;
  setServingToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
    token: number,
  ): void;
  reset(): void;
  // Optional async operations for direct database persistence
  saveAppointmentAsync?(appointment: Appointment): Promise<void>;
  allocateTokenAsync?(
    facilityId: string,
    departmentId: string,
    queueDate: string,
  ): Promise<number>;
  setServingTokenAsync?(
    facilityId: string,
    departmentId: string,
    queueDate: string,
    token: number,
  ): Promise<void>;
  syncFromDatabase?(): Promise<void>;
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

function toDbAppointment(apt: Appointment) {
  return {
    id: apt.id,
    reference: apt.reference,
    patient_user_id: apt.userId,
    patient_name: apt.patientName,
    facility_id: apt.hospitalId,
    department_id: apt.departmentId,
    doctor_id: apt.doctorId,
    slot_id: apt.slotId,
    scheduled_at: apt.scheduledAt,
    status: apt.status,
    source: apt.source,
    checked_in_at: apt.checkedInAt ?? null,
    consultation_started_at: apt.consultationStartedAt ?? null,
    completed_at: apt.completedAt ?? null,
    cancelled_at: apt.cancelledAt ?? null,
    missed_at: apt.missedAt ?? null,
    created_at: apt.createdAt,
    updated_at: apt.updatedAt,
    queue_date: apt.queueDate ?? null,
    token_number: apt.tokenNumber ?? null,
    digital_token: apt.digitalToken ?? null,
    called_at: apt.calledAt ?? null,
  };
}

function fromDbAppointment(row: Record<string, unknown>): Appointment {
  return {
    id: String(row.id ?? ""),
    reference: String(row.reference ?? ""),
    userId: row.patient_user_id ? String(row.patient_user_id) : null,
    patientName: String(row.patient_name ?? ""),
    hospitalId: String(row.facility_id ?? ""),
    hospitalName: String(row.hospital_name ?? row.facility_id ?? ""),
    departmentId: String(row.department_id ?? ""),
    departmentName: String(row.department_name ?? row.department_id ?? ""),
    doctorId: String(row.doctor_id ?? ""),
    doctorName: String(row.doctor_name ?? row.doctor_id ?? ""),
    slotId: row.slot_id ? String(row.slot_id) : null,
    scheduledAt: String(row.scheduled_at ?? ""),
    status: row.status as Appointment["status"],
    source: (row.source as Appointment["source"]) ?? "online",
    checkedInAt: row.checked_in_at ? String(row.checked_in_at) : null,
    consultationStartedAt: row.consultation_started_at
      ? String(row.consultation_started_at)
      : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    missedAt: row.missed_at ? String(row.missed_at) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    queueDate: row.queue_date ? String(row.queue_date) : null,
    tokenNumber:
      typeof row.token_number === "number" ? row.token_number : null,
    digitalToken: row.digital_token ? String(row.digital_token) : null,
    calledAt: row.called_at ? String(row.called_at) : null,
  };
}

export class SupabaseAppointmentRepository implements AppointmentRepository {
  readonly mode = "supabase" as const;
  private inMemoryCache = new InMemoryAppointmentRepository();

  private assertSchemaAvailable(error?: {
    code?: string;
    message?: string;
  }): never {
    if (
      error &&
      (MISSING_SCHEMA_CODES.has(error.code ?? "") ||
        error.message?.includes("does not exist"))
    ) {
      throw new AppointmentPersistenceError(
        503,
        "APPOINTMENT_SCHEMA_NOT_READY",
        "Appointment database storage is not configured yet. Apply migrations before using database persistence.",
      );
    }

    throw new AppointmentPersistenceError(
      500,
      "APPOINTMENT_DB_ERROR",
      `Appointment database query failed: ${error?.message ?? "unknown error"}`,
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
    // Background database write to survive container recycles
    this.saveAppointmentAsync(appointment).catch((err) => {
      // Log for observability without crashing synchronous caller
      console.warn("Supabase background appointment upsert warning:", err);
    });
  }

  async saveAppointmentAsync(appointment: Appointment): Promise<void> {
    try {
      const { supabase } = await import("../utils/supabase.js");
      const dbRow = toDbAppointment(appointment);
      const { error } = await supabase.from("appointments").upsert(dbRow);
      if (error) {
        this.assertSchemaAvailable(error);
      }
    } catch (err) {
      if (err instanceof AppointmentPersistenceError) {
        throw err;
      }
      this.assertSchemaAvailable(err as { code?: string; message?: string });
    }
  }

  recordEvent(event: AppointmentEvent): void {
    this.inMemoryCache.recordEvent(event);
    import("../utils/supabase.js")
      .then(({ supabase }) =>
        supabase.from("appointment_events").insert({
          appointment_id: event.appointmentId,
          from_status: event.fromStatus ?? null,
          to_status: event.toStatus,
          actor_role: event.actorRole,
          created_at: event.createdAt,
        }),
      )
      .catch((err) => {
        console.warn("Supabase appointment_events insert warning:", err);
      });
  }

  allocateToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
  ): number {
    return this.inMemoryCache.allocateToken(
      facilityId,
      departmentId,
      queueDate,
    );
  }

  async allocateTokenAsync(
    facilityId: string,
    departmentId: string,
    queueDate: string,
  ): Promise<number> {
    try {
      const { supabase } = await import("../utils/supabase.js");
      const { data, error } = await supabase.rpc("allocate_queue_token", {
        p_facility_id: facilityId,
        p_department_id: departmentId,
        p_queue_date: queueDate,
      });

      if (error) {
        this.assertSchemaAvailable(error);
      }

      const tokenNumber = Number(data);
      // Synchronize in-memory counter with PostgreSQL atomic sequence
      const key = `${facilityId}:${departmentId}:${queueDate}`;
      (this.inMemoryCache as unknown as { tokenCounters: Map<string, number> }).tokenCounters.set(
        key,
        tokenNumber,
      );
      return tokenNumber;
    } catch (err) {
      if (err instanceof AppointmentPersistenceError) {
        throw err;
      }
      // If RPC is not available yet, fall back to atomic in-memory counter
      return this.inMemoryCache.allocateToken(
        facilityId,
        departmentId,
        queueDate,
      );
    }
  }

  getServingToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
  ): number | null {
    return this.inMemoryCache.getServingToken(
      facilityId,
      departmentId,
      queueDate,
    );
  }

  setServingToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
    token: number,
  ): void {
    this.inMemoryCache.setServingToken(
      facilityId,
      departmentId,
      queueDate,
      token,
    );
    this.setServingTokenAsync(facilityId, departmentId, queueDate, token).catch(
      (err) => {
        console.warn("Supabase advance_serving_token RPC warning:", err);
      },
    );
  }

  async setServingTokenAsync(
    facilityId: string,
    departmentId: string,
    queueDate: string,
    token: number,
  ): Promise<void> {
    try {
      const { supabase } = await import("../utils/supabase.js");
      const { error } = await supabase.rpc("advance_serving_token", {
        p_facility_id: facilityId,
        p_department_id: departmentId,
        p_queue_date: queueDate,
        p_serving_token: token,
      });
      if (error) {
        this.assertSchemaAvailable(error);
      }
    } catch (err) {
      if (err instanceof AppointmentPersistenceError) {
        throw err;
      }
      // Log for observability
      console.warn("advance_serving_token fallback:", err);
    }
  }

  async syncFromDatabase(): Promise<void> {
    try {
      const { supabase } = await import("../utils/supabase.js");
      const { data, error } = await supabase.from("appointments").select("*");

      if (error) {
        this.assertSchemaAvailable(error);
      }

      if (Array.isArray(data)) {
        for (const row of data) {
          this.inMemoryCache.saveAppointment(fromDbAppointment(row));
        }
      }
    } catch (err) {
      if (err instanceof AppointmentPersistenceError) {
        throw err;
      }
      this.assertSchemaAvailable(err as { code?: string; message?: string });
    }
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
