import type {
  Appointment,
  AppointmentEvent,
  AppointmentStatus,
} from "../types/appointments.js";
import { isStaffAuthorizedForHospital } from "../services/appointmentAccess.js";
import { findDemoHospital } from "../data/appointmentCatalog.js";

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

export interface AppointmentAccessContext {
  id: string;
  isStaff?: boolean;
  appMetadata?: Record<string, unknown>;
  staffUserIds?: readonly string[];
}

export interface AppointmentRepository {
  readonly mode: "memory" | "supabase";

  // Synchronous methods (for isolated in-memory unit tests & sync compatibility)
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

  // Real PostgreSQL asynchronous operations (production & integration tests)
  createAppointment(appointment: Appointment): Promise<Appointment>;
  getAppointmentById(
    id: string,
    accessContext?: AppointmentAccessContext,
  ): Promise<Appointment | undefined>;
  getAppointmentsByUser(userId: string): Promise<Appointment[]>;
  getAppointmentsByHospital(
    hospitalId: string,
    departmentId?: string,
    queueDate?: string,
  ): Promise<Appointment[]>;
  updateAppointment(appointment: Appointment): Promise<Appointment>;
  updateAppointmentStatus(
    id: string,
    status: AppointmentStatus,
    extra?: Partial<Appointment>,
    actorRole?: "patient" | "staff",
  ): Promise<Appointment>;
  cancelAppointment(
    id: string,
    cancelledAt: string,
    actorRole?: "patient" | "staff",
  ): Promise<Appointment>;
  getQueueRecords(
    hospitalId: string,
    departmentId: string,
    queueDate: string,
  ): Promise<Appointment[]>;
  allocateQueueToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
  ): Promise<number>;
  getServingQueueToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
  ): Promise<number | null>;
  setServingQueueToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
    token: number,
  ): Promise<void>;
  recordEventAsync(event: AppointmentEvent): Promise<void>;
  verifyConnection(): Promise<void>;
  syncFromDatabase?(): Promise<void>;
}

export function toDbAppointment(apt: Appointment): Record<string, unknown> {
  return {
    id: apt.id,
    reference: apt.reference,
    patient_user_id: apt.userId,
    patient_name: apt.patientName,
    facility_id: apt.hospitalId,
    hospital_name: apt.hospitalName,
    department_id: apt.departmentId,
    department_name: apt.departmentName,
    doctor_id: apt.doctorId,
    doctor_name: apt.doctorName,
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

export function fromDbAppointment(row: Record<string, unknown>): Appointment {
  const hospitalId = String(row.facility_id ?? "");
  const departmentId = String(row.department_id ?? "");
  const doctorId = String(row.doctor_id ?? "");

  // Fallback to catalog metadata if denormalized names are missing
  const catalogHospital = findDemoHospital(hospitalId);
  const catalogDept = catalogHospital?.departments.find(
    (d) => d.id === departmentId,
  );
  const catalogDoc = catalogDept?.doctors.find((d) => d.id === doctorId);

  const hospitalName =
    typeof row.hospital_name === "string" && row.hospital_name.trim()
      ? row.hospital_name
      : (catalogHospital?.name ?? hospitalId);

  const departmentName =
    typeof row.department_name === "string" && row.department_name.trim()
      ? row.department_name
      : (catalogDept?.name ?? departmentId);

  const doctorName =
    typeof row.doctor_name === "string" && row.doctor_name.trim()
      ? row.doctor_name
      : (catalogDoc?.name ?? doctorId);

  return {
    id: String(row.id ?? ""),
    reference: String(row.reference ?? ""),
    userId: row.patient_user_id ? String(row.patient_user_id) : null,
    patientName: String(row.patient_name ?? ""),
    hospitalId,
    hospitalName,
    departmentId,
    departmentName,
    doctorId,
    doctorName,
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

/**
 * Isolated in-memory repository for unit testing and test fixtures.
 * NOT used in production.
 */
export class InMemoryAppointmentRepository implements AppointmentRepository {
  readonly mode = "memory" as const;
  private appointments: Appointment[] = [];
  private events: AppointmentEvent[] = [];
  private tokenCounters = new Map<string, number>();
  private servingTokens = new Map<string, number>();

  getAppointments(): Appointment[] {
    return [...this.appointments];
  }

  getEvents(): AppointmentEvent[] {
    return [...this.events];
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

  // Async implementations for in-memory testing
  async createAppointment(appointment: Appointment): Promise<Appointment> {
    this.saveAppointment(appointment);
    return appointment;
  }

  async getAppointmentById(
    id: string,
    accessContext?: AppointmentAccessContext,
  ): Promise<Appointment | undefined> {
    const apt = this.findAppointment(id);
    if (!apt) {
      return undefined;
    }

    if (accessContext) {
      if (!accessContext.isStaff && apt.userId && apt.userId !== accessContext.id) {
        throw new AppointmentPersistenceError(
          403,
          "APPOINTMENT_FORBIDDEN",
          "You do not have permission to access this appointment.",
        );
      }
      if (accessContext.isStaff) {
        const authorized = isStaffAuthorizedForHospital(
          {
            id: accessContext.id,
            appMetadata: accessContext.appMetadata,
            staffUserIds: accessContext.staffUserIds,
          },
          apt.hospitalId,
        );
        if (!authorized) {
          throw new AppointmentPersistenceError(
            403,
            "STAFF_HOSPITAL_FORBIDDEN",
            "You are not authorized to view appointments for this hospital.",
          );
        }
      }
    }

    return apt;
  }

  async getAppointmentsByUser(userId: string): Promise<Appointment[]> {
    return this.appointments.filter((a) => a.userId === userId);
  }

  async getAppointmentsByHospital(
    hospitalId: string,
    departmentId?: string,
    queueDate?: string,
  ): Promise<Appointment[]> {
    return this.appointments.filter((a) => {
      if (a.hospitalId !== hospitalId) return false;
      if (departmentId && a.departmentId !== departmentId) return false;
      if (queueDate && a.queueDate !== queueDate) return false;
      return true;
    });
  }

  async updateAppointment(appointment: Appointment): Promise<Appointment> {
    this.saveAppointment(appointment);
    return appointment;
  }

  async updateAppointmentStatus(
    id: string,
    status: AppointmentStatus,
    extra: Partial<Appointment> = {},
    actorRole: "patient" | "staff" = "staff",
  ): Promise<Appointment> {
    const existing = this.findAppointment(id);
    if (!existing) {
      throw new AppointmentPersistenceError(
        404,
        "APPOINTMENT_NOT_FOUND",
        "Appointment does not exist.",
      );
    }
    const updated: Appointment = {
      ...existing,
      ...extra,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.saveAppointment(updated);
    this.recordEvent({
      id: crypto.randomUUID(),
      appointmentId: id,
      fromStatus: existing.status,
      toStatus: status,
      actorRole,
      createdAt: updated.updatedAt,
    });
    return updated;
  }

  async cancelAppointment(
    id: string,
    cancelledAt: string,
    actorRole: "patient" | "staff" = "patient",
  ): Promise<Appointment> {
    return this.updateAppointmentStatus(
      id,
      "cancelled",
      { cancelledAt },
      actorRole,
    );
  }

  async getQueueRecords(
    hospitalId: string,
    departmentId: string,
    queueDate: string,
  ): Promise<Appointment[]> {
    return this.appointments
      .filter(
        (a) =>
          a.hospitalId === hospitalId &&
          a.departmentId === departmentId &&
          a.queueDate === queueDate &&
          ["confirmed", "checked_in", "waiting", "in_consultation", "completed"].includes(
            a.status,
          ),
      )
      .sort((a, b) => (a.tokenNumber ?? 0) - (b.tokenNumber ?? 0));
  }

  async allocateQueueToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
  ): Promise<number> {
    return this.allocateToken(facilityId, departmentId, queueDate);
  }

  async getServingQueueToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
  ): Promise<number | null> {
    return this.getServingToken(facilityId, departmentId, queueDate);
  }

  async setServingQueueToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
    token: number,
  ): Promise<void> {
    this.setServingToken(facilityId, departmentId, queueDate, token);
  }

  async recordEventAsync(event: AppointmentEvent): Promise<void> {
    this.recordEvent(event);
  }

  async verifyConnection(): Promise<void> {
    // In-memory connection is always available
  }
}

/**
 * Production repository backed by real Supabase PostgreSQL.
 * Never silently falls back to JavaScript Maps.
 */
export class SupabaseAppointmentRepository implements AppointmentRepository {
  readonly mode = "supabase" as const;
  private readonly clientPromise: Promise<{ supabase: any }>;
  private inMemoryMirror = new InMemoryAppointmentRepository();

  constructor(customClient?: any) {
    if (customClient) {
      const clientObj = customClient.supabase ? customClient : { supabase: customClient };
      this.clientPromise = Promise.resolve(clientObj);
    } else {
      this.clientPromise = import("../utils/supabase.js");
    }
  }

  private handleDatabaseError(error: unknown): never {
    const err = error as { code?: string; message?: string } | undefined;
    if (
      err &&
      (MISSING_SCHEMA_CODES.has(err.code ?? "") ||
        err.message?.includes("does not exist") ||
        err.message?.includes("relation") ||
        err.message?.includes("schema") ||
        err.message?.includes("Missing SUPABASE_URL"))
    ) {
      throw new AppointmentPersistenceError(
        503,
        "APPOINTMENT_SCHEMA_NOT_READY",
        "Appointment database schema is not configured in Supabase. Apply migrations before using database persistence.",
      );
    }

    throw new AppointmentPersistenceError(
      500,
      "APPOINTMENT_DB_ERROR",
      `Appointment database operation failed: ${err?.message ?? "unknown error"}`,
    );
  }

  async verifyConnection(): Promise<void> {
    try {
      const { supabase } = await this.clientPromise;
      const { error } = await supabase
        .from("appointments")
        .select("id")
        .limit(1);

      if (error) {
        this.handleDatabaseError(error);
      }
    } catch (err) {
      if (err instanceof AppointmentPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async createAppointment(appointment: Appointment): Promise<Appointment> {
    try {
      const { supabase } = await this.clientPromise;
      const dbRow = toDbAppointment(appointment);

      const { data, error } = await supabase
        .from("appointments")
        .insert(dbRow)
        .select("*")
        .single();

      if (error || !data) {
        this.handleDatabaseError(error);
      }

      const created = fromDbAppointment(data);

      // Record creation audit event in PostgreSQL
      try {
        await supabase.from("appointment_events").insert({
          appointment_id: created.id,
          from_status: null,
          to_status: created.status,
          actor_role: created.source === "walk_in" ? "staff" : "patient",
          created_at: created.createdAt,
        });
      } catch (eventErr) {
        console.warn("Non-fatal appointment_events insert warning:", eventErr);
      }

      this.inMemoryMirror.saveAppointment(created);
      return created;
    } catch (err) {
      if (err instanceof AppointmentPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async getAppointmentById(
    id: string,
    accessContext?: AppointmentAccessContext,
  ): Promise<Appointment | undefined> {
    try {
      const { supabase } = await this.clientPromise;
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        this.handleDatabaseError(error);
      }

      if (!data) {
        return undefined;
      }

      const apt = fromDbAppointment(data);

      // Enforce strict multi-tenant authorization
      if (accessContext) {
        if (!accessContext.isStaff && apt.userId && apt.userId !== accessContext.id) {
          throw new AppointmentPersistenceError(
            403,
            "APPOINTMENT_FORBIDDEN",
            "You do not have permission to access this appointment.",
          );
        }
        if (accessContext.isStaff) {
          const authorized = isStaffAuthorizedForHospital(
            {
              id: accessContext.id,
              appMetadata: accessContext.appMetadata,
              staffUserIds: accessContext.staffUserIds,
            },
            apt.hospitalId,
          );
          if (!authorized) {
            throw new AppointmentPersistenceError(
              403,
              "STAFF_HOSPITAL_FORBIDDEN",
              "You are not authorized to view appointments for this hospital.",
            );
          }
        }
      }

      this.inMemoryMirror.saveAppointment(apt);
      return apt;
    } catch (err) {
      if (err instanceof AppointmentPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async getAppointmentsByUser(userId: string): Promise<Appointment[]> {
    try {
      const { supabase } = await this.clientPromise;
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("patient_user_id", userId)
        .order("scheduled_at", { ascending: false });

      if (error) {
        this.handleDatabaseError(error);
      }

      const appointments = (data ?? []).map(fromDbAppointment);
      for (const apt of appointments) {
        this.inMemoryMirror.saveAppointment(apt);
      }
      return appointments;
    } catch (err) {
      if (err instanceof AppointmentPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async getAppointmentsByHospital(
    hospitalId: string,
    departmentId?: string,
    queueDate?: string,
  ): Promise<Appointment[]> {
    try {
      const { supabase } = await this.clientPromise;
      let query = supabase
        .from("appointments")
        .select("*")
        .eq("facility_id", hospitalId);

      if (departmentId) {
        query = query.eq("department_id", departmentId);
      }

      if (queueDate) {
        query = query.eq("queue_date", queueDate);
      }

      const { data, error } = await query.order("scheduled_at", {
        ascending: true,
      });

      if (error) {
        this.handleDatabaseError(error);
      }

      const appointments = (data ?? []).map(fromDbAppointment);
      for (const apt of appointments) {
        this.inMemoryMirror.saveAppointment(apt);
      }
      return appointments;
    } catch (err) {
      if (err instanceof AppointmentPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async updateAppointment(appointment: Appointment): Promise<Appointment> {
    try {
      const { supabase } = await this.clientPromise;
      const dbRow = toDbAppointment(appointment);

      const { data, error } = await supabase
        .from("appointments")
        .update(dbRow)
        .eq("id", appointment.id)
        .select("*")
        .single();

      if (error || !data) {
        this.handleDatabaseError(error);
      }

      const updated = fromDbAppointment(data);
      this.inMemoryMirror.saveAppointment(updated);
      return updated;
    } catch (err) {
      if (err instanceof AppointmentPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async updateAppointmentStatus(
    id: string,
    status: AppointmentStatus,
    extra: Partial<Appointment> = {},
    actorRole: "patient" | "staff" = "staff",
  ): Promise<Appointment> {
    try {
      const existing = await this.getAppointmentById(id);
      if (!existing) {
        throw new AppointmentPersistenceError(
          404,
          "APPOINTMENT_NOT_FOUND",
          "Appointment does not exist.",
        );
      }

      const updatedFields: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (extra.checkedInAt !== undefined) {
        updatedFields.checked_in_at = extra.checkedInAt;
      }
      if (extra.consultationStartedAt !== undefined) {
        updatedFields.consultation_started_at = extra.consultationStartedAt;
      }
      if (extra.completedAt !== undefined) {
        updatedFields.completed_at = extra.completedAt;
      }
      if (extra.cancelledAt !== undefined) {
        updatedFields.cancelled_at = extra.cancelledAt;
      }
      if (extra.missedAt !== undefined) {
        updatedFields.missed_at = extra.missedAt;
      }
      if (extra.queueDate !== undefined) {
        updatedFields.queue_date = extra.queueDate;
      }
      if (extra.tokenNumber !== undefined) {
        updatedFields.token_number = extra.tokenNumber;
      }
      if (extra.digitalToken !== undefined) {
        updatedFields.digital_token = extra.digitalToken;
      }
      if (extra.calledAt !== undefined) {
        updatedFields.called_at = extra.calledAt;
      }

      const { supabase } = await this.clientPromise;
      const { data, error } = await supabase
        .from("appointments")
        .update(updatedFields)
        .eq("id", id)
        .select("*")
        .single();

      if (error || !data) {
        this.handleDatabaseError(error);
      }

      const updated = fromDbAppointment(data);

      try {
        await supabase.from("appointment_events").insert({
          appointment_id: id,
          from_status: existing.status,
          to_status: status,
          actor_role: actorRole,
          created_at: updated.updatedAt,
        });
      } catch (eventErr) {
        console.warn("Non-fatal appointment_events insert warning:", eventErr);
      }

      this.inMemoryMirror.saveAppointment(updated);
      return updated;
    } catch (err) {
      if (err instanceof AppointmentPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async cancelAppointment(
    id: string,
    cancelledAt: string,
    actorRole: "patient" | "staff" = "patient",
  ): Promise<Appointment> {
    return this.updateAppointmentStatus(
      id,
      "cancelled",
      { cancelledAt },
      actorRole,
    );
  }

  async getQueueRecords(
    hospitalId: string,
    departmentId: string,
    queueDate: string,
  ): Promise<Appointment[]> {
    try {
      const { supabase } = await this.clientPromise;
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("facility_id", hospitalId)
        .eq("department_id", departmentId)
        .eq("queue_date", queueDate)
        .in("status", [
          "confirmed",
          "checked_in",
          "waiting",
          "in_consultation",
          "completed",
        ])
        .order("token_number", { ascending: true });

      if (error) {
        this.handleDatabaseError(error);
      }

      const records = (data ?? []).map(fromDbAppointment);
      for (const rec of records) {
        this.inMemoryMirror.saveAppointment(rec);
      }
      return records;
    } catch (err) {
      if (err instanceof AppointmentPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async allocateQueueToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
  ): Promise<number> {
    try {
      const { supabase } = await this.clientPromise;
      const { data, error } = await supabase.rpc("allocate_queue_token", {
        p_facility_id: facilityId,
        p_department_id: departmentId,
        p_queue_date: queueDate,
      });

      if (error) {
        this.handleDatabaseError(error);
      }

      const tokenNumber = Number(data);
      if (!Number.isInteger(tokenNumber) || tokenNumber <= 0) {
        throw new AppointmentPersistenceError(
          500,
          "TOKEN_ALLOCATION_FAILED",
          "Database failed to return a valid sequence token number.",
        );
      }

      return tokenNumber;
    } catch (err) {
      if (err instanceof AppointmentPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async getServingQueueToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
  ): Promise<number | null> {
    try {
      const { supabase } = await this.clientPromise;
      const { data, error } = await supabase
        .from("queue_counters")
        .select("serving_token_number")
        .eq("facility_id", facilityId)
        .eq("department_id", departmentId)
        .eq("queue_date", queueDate)
        .maybeSingle();

      if (error) {
        this.handleDatabaseError(error);
      }

      return data?.serving_token_number ?? null;
    } catch (err) {
      if (err instanceof AppointmentPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async setServingQueueToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
    token: number,
  ): Promise<void> {
    try {
      const { supabase } = await this.clientPromise;
      const { error } = await supabase.rpc("advance_serving_token", {
        p_facility_id: facilityId,
        p_department_id: departmentId,
        p_queue_date: queueDate,
        p_serving_token: token,
      });

      if (error) {
        this.handleDatabaseError(error);
      }
    } catch (err) {
      if (err instanceof AppointmentPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async recordEventAsync(event: AppointmentEvent): Promise<void> {
    try {
      const { supabase } = await this.clientPromise;
      await supabase.from("appointment_events").insert({
        appointment_id: event.appointmentId,
        from_status: event.fromStatus ?? null,
        to_status: event.toStatus,
        actor_role: event.actorRole,
        created_at: event.createdAt,
      });
    } catch (err) {
      console.warn("Non-fatal recordEventAsync warning:", err);
    }
  }

  async syncFromDatabase(): Promise<void> {
    try {
      const { supabase } = await this.clientPromise;
      const { data, error } = await supabase.from("appointments").select("*");

      if (error) {
        this.handleDatabaseError(error);
      }

      if (Array.isArray(data)) {
        this.inMemoryMirror.reset();
        for (const row of data) {
          this.inMemoryMirror.saveAppointment(fromDbAppointment(row));
        }
      }
    } catch (err) {
      if (err instanceof AppointmentPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  // Synchronous wrapper methods for backward compatibility
  getAppointments(): Appointment[] {
    return this.inMemoryMirror.getAppointments();
  }

  getEvents(): AppointmentEvent[] {
    return this.inMemoryMirror.getEvents();
  }

  findAppointment(id: string): Appointment | undefined {
    return this.inMemoryMirror.findAppointment(id);
  }

  saveAppointment(appointment: Appointment): void {
    this.inMemoryMirror.saveAppointment(appointment);
    const isTest =
      process.env.NODE_ENV === "test" ||
      process.env.npm_lifecycle_event === "test" ||
      process.argv.some((arg) => arg.includes("test"));
    if (!isTest || process.env.USE_SUPABASE_REPO === "true") {
      this.createAppointment(appointment).catch((err) => {
        console.warn("Supabase background appointment save warning:", err);
      });
    }
  }

  recordEvent(event: AppointmentEvent): void {
    this.inMemoryMirror.recordEvent(event);
    const isTest =
      process.env.NODE_ENV === "test" ||
      process.env.npm_lifecycle_event === "test" ||
      process.argv.some((arg) => arg.includes("test"));
    if (!isTest || process.env.USE_SUPABASE_REPO === "true") {
      this.recordEventAsync(event).catch(() => {});
    }
  }

  allocateToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
  ): number {
    return this.inMemoryMirror.allocateToken(
      facilityId,
      departmentId,
      queueDate,
    );
  }

  getServingToken(
    facilityId: string,
    departmentId: string,
    queueDate: string,
  ): number | null {
    return this.inMemoryMirror.getServingToken(
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
    this.inMemoryMirror.setServingToken(
      facilityId,
      departmentId,
      queueDate,
      token,
    );
    this.setServingQueueToken(facilityId, departmentId, queueDate, token).catch(
      (err) => {
        console.warn("Supabase advance_serving_token warning:", err);
      },
    );
  }

  reset(): void {
    this.inMemoryMirror.reset();
  }
}
