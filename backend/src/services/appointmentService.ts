import { randomUUID } from "node:crypto";
import { APPOINTMENT_DEMO_HOSPITALS } from "../data/appointmentCatalog.js";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  APPOINTMENT_DEMO_LABEL,
  APPOINTMENT_STATUSES,
  type Appointment,
  type AppointmentActorRole,
  type AppointmentAvailability,
  type AppointmentDepartment,
  type AppointmentDoctor,
  type AppointmentEvent,
  type AppointmentGuidance,
  type AppointmentHospital,
  type AppointmentSlot,
  type AppointmentStatus,
  type AppointmentUser,
  type AppointmentView,
  type CreateAppointmentInput,
  type CreateWalkInInput,
  type PublicAppointment,
  type QueueSnapshot,
  type QueueView,
  type RescheduleAppointmentInput,
  type TransitionAppointmentInput,
  type WaitEstimate,
} from "../types/appointments.js";
import {
  type AppointmentRepository,
  InMemoryAppointmentRepository,
} from "../repositories/appointmentRepository.js";
import {
  type AppointmentAccessIdentity,
  isStaffAuthorizedForHospital,
} from "./appointmentAccess.js";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SLOT_MINUTES = 30;
const AVAILABILITY_DAYS = 14;
const BOOKING_CONFLICT_WINDOW_MS = SLOT_MINUTES * 60 * 1000;
const CHECKIN_OPENS_BEFORE_MS = 60 * 60 * 1000;
const CHECKIN_CLOSES_AFTER_MS = 120 * 60 * 1000;
const RECENT_CONSULTATION_DAYS = 14;
const STALE_CONSULTATION_MS = 24 * 60 * 60 * 1000;
const MIN_RECENT_CONSULTATIONS = 3;
const MAX_WAIT_ESTIMATE_MINUTES = 240;

const STAFF_TRANSITIONS: Record<
  AppointmentStatus,
  readonly AppointmentStatus[]
> = {
  requested: ["confirmed", "cancelled"],
  confirmed: ["waiting", "cancelled", "missed"],
  checked_in: ["waiting", "cancelled"],
  waiting: ["in_consultation", "cancelled", "missed"],
  in_consultation: ["completed"],
  completed: [],
  cancelled: [],
  missed: [],
};

const STATUS_ORDER: Record<AppointmentStatus, number> = {
  in_consultation: 0,
  waiting: 1,
  checked_in: 2,
  requested: 3,
  confirmed: 4,
  completed: 5,
  missed: 6,
  cancelled: 7,
};

export class AppointmentError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "AppointmentError";
  }
}

interface AppointmentServiceOptions {
  now?: () => Date;
  hospitals?: readonly AppointmentHospital[];
  repository?: AppointmentRepository;
}

interface ResolvedSelection {
  hospital: AppointmentHospital;
  department: AppointmentDepartment;
  doctor: AppointmentDoctor;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function istDateKey(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

function dateKeyToDate(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00+05:30`);
}

function dateKeysFrom(now: Date, count: number): string[] {
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const start = Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate(),
  );

  return Array.from({ length: count }, (_, index) =>
    new Date(start + index * DAY_MS).toISOString().slice(0, 10),
  );
}

function dayLabel(dateKey: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(dateKeyToDate(dateKey));
}

function timeLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function localSlot(dateKey: string, hour: number, minute: number): Date {
  return new Date(
    `${dateKey}T${pad(hour)}:${pad(minute)}:00+05:30`,
  );
}

function slotIdFor(doctorId: string, startsAt: Date): string {
  return `SLOT-${doctorId}-${startsAt
    .toISOString()
    .replace(/[^0-9]/g, "")}`;
}

function makeReference(now: Date): string {
  const datePart = istDateKey(now).replaceAll("-", "");
  return `APT-${datePart}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

export function formatDigitalToken(tokenNumber: number): string {
  return `T-${String(tokenNumber).padStart(3, "0")}`;
}

function isActiveStatus(status: AppointmentStatus): boolean {
  return ACTIVE_APPOINTMENT_STATUSES.includes(status);
}

function isSlotBlockingStatus(status: AppointmentStatus): boolean {
  return status !== "cancelled" && status !== "missed";
}

function asRequiredString(
  value: unknown,
  fieldName: string,
  maxLength = 100,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AppointmentError(
      400,
      "INVALID_INPUT",
      `${fieldName} is required.`,
    );
  }

  const normalized = value.trim();

  if (normalized.length > maxLength) {
    throw new AppointmentError(
      400,
      "INVALID_INPUT",
      `${fieldName} is too long.`,
    );
  }

  return normalized;
}

function asPatientName(
  value: unknown,
  fallback?: string,
): string {
  const supplied =
    typeof value === "string" && value.trim().length > 0
      ? value
      : fallback;

  if (typeof supplied !== "string") {
    throw new AppointmentError(
      400,
      "INVALID_INPUT",
      "Patient name is required.",
    );
  }

  const normalized = supplied.trim().replace(/\s+/g, " ");

  if (normalized.length < 2 || normalized.length > 80) {
    throw new AppointmentError(
      400,
      "INVALID_INPUT",
      "Patient name must be between 2 and 80 characters.",
    );
  }

  return normalized;
}

function asStatus(value: unknown): AppointmentStatus {
  if (
    typeof value !== "string" ||
    !APPOINTMENT_STATUSES.includes(value as AppointmentStatus)
  ) {
    throw new AppointmentError(
      400,
      "INVALID_STATUS",
      "Choose a valid appointment status.",
    );
  }

  return value as AppointmentStatus;
}

function sameIstDay(first: string | Date, second: Date): boolean {
  const firstDate =
    typeof first === "string" ? new Date(first) : first;

  return istDateKey(firstDate) === istDateKey(second);
}

function consultationDurationMs(
  appointment: Appointment,
): number | null {
  if (!appointment.consultationStartedAt || !appointment.completedAt) {
    return null;
  }

  const started = new Date(
    appointment.consultationStartedAt,
  ).getTime();
  const completed = new Date(appointment.completedAt).getTime();

  if (!Number.isFinite(started) || !Number.isFinite(completed)) {
    return null;
  }

  return completed - started;
}

export class AppointmentService {
  private readonly now: () => Date;
  private readonly hospitals: readonly AppointmentHospital[];
  private readonly repository: AppointmentRepository;

  constructor(options: AppointmentServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.hospitals =
      options.hospitals ?? APPOINTMENT_DEMO_HOSPITALS;
    this.repository =
      options.repository ?? new InMemoryAppointmentRepository();
  }

  private get appointments(): Appointment[] {
    return this.repository.getAppointments();
  }

  private get events(): AppointmentEvent[] {
    return this.repository.getEvents();
  }

  getRepository(): AppointmentRepository {
    return this.repository;
  }

  resetDemoData(): void {
    this.repository.reset();
  }

  getCatalog() {
    return {
      source: "demo" as const,
      demoLabel: APPOINTMENT_DEMO_LABEL,
      timezone: "Asia/Kolkata" as const,
      hospitals: this.hospitals,
    };
  }

  getAvailability(input: {
    hospitalId?: unknown;
    departmentId?: unknown;
    doctorId?: unknown;
  }): AppointmentAvailability {
    const selection = this.resolveSelection(input);
    const now = this.now();
    const dates = dateKeysFrom(now, AVAILABILITY_DAYS);

    const days = dates.map((date) => {
      const slots = this.doctorSlots(selection, date).filter(
        (slot) =>
          !this.isSlotTaken(slot.slotId) &&
          new Date(slot.startsAt).getTime() > now.getTime(),
      );

      return {
        date,
        label: dayLabel(date),
        slots,
      };
    });

    return {
      source: "demo",
      demoLabel: APPOINTMENT_DEMO_LABEL,
      timezone: "Asia/Kolkata",
      days,
    };
  }

  listAppointments(user: AppointmentUser): AppointmentView[] {
    this.assertUser(user);

    return this.appointments
      .filter(
        (appointment) => appointment.userId === user.id,
      )
      .sort(
        (first, second) =>
          new Date(second.scheduledAt).getTime() -
          new Date(first.scheduledAt).getTime(),
      )
      .map((appointment) =>
        this.toView(appointment),
      );
  }

  getAppointment(
    user: AppointmentUser,
    appointmentId: string,
  ): AppointmentView {
    const appointment = this.findOwnedAppointment(
      user,
      appointmentId,
    );

    return this.toView(appointment);
  }

  getQueueSnapshot(
    user: AppointmentUser,
    appointmentId: string,
  ): QueueSnapshot {
    const appointment = this.findOwnedAppointment(
      user,
      appointmentId,
    );
    const now = this.now();
    const queueDate =
      appointment.queueDate ?? istDateKey(new Date(appointment.scheduledAt));

    const activeQueue = this.appointments
      .filter(
        (candidate) =>
          candidate.hospitalId === appointment.hospitalId &&
          candidate.departmentId === appointment.departmentId &&
          (candidate.status === "checked_in" ||
            candidate.status === "waiting" ||
            candidate.status === "in_consultation") &&
          (candidate.queueDate === queueDate ||
            sameIstDay(
              candidate.checkedInAt ?? candidate.scheduledAt,
              now,
            )),
      )
      .sort((first, second) => {
        const firstTime = new Date(
          first.checkedInAt ?? first.scheduledAt,
        ).getTime();
        const secondTime = new Date(
          second.checkedInAt ?? second.scheduledAt,
        ).getTime();

        return firstTime - secondTime;
      });

    let currentServingToken = this.repository.getServingToken(
      appointment.hospitalId,
      appointment.departmentId,
      queueDate,
    );

    if (currentServingToken === null) {
      const inConsultation = activeQueue.find(
        (candidate) => candidate.status === "in_consultation",
      );
      if (inConsultation && inConsultation.tokenNumber !== null) {
        currentServingToken = inConsultation.tokenNumber;
      }
    }

    let patientsAhead = 0;
    if (
      appointment.status === "checked_in" ||
      appointment.status === "waiting"
    ) {
      const index = activeQueue.findIndex(
        (candidate) => candidate.id === appointment.id,
      );
      patientsAhead = index >= 0 ? index : 0;
    }

    const waitEstimate = this.computeWaitEstimate({
      hospital:
        this.hospitals.find(
          (candidate) => candidate.id === appointment.hospitalId,
        ) ?? {
          id: appointment.hospitalId,
          name: appointment.hospitalName,
          city: "",
          departments: [],
        },
      department: {
        id: appointment.departmentId,
        name: appointment.departmentName,
        doctors: [],
      },
      doctorId: appointment.doctorId,
      appointment,
    });

    return {
      appointmentId: appointment.id,
      reference: appointment.reference,
      status: appointment.status,
      queueDate: appointment.queueDate,
      tokenNumber: appointment.tokenNumber,
      digitalToken: appointment.digitalToken,
      currentServingToken,
      currentServingDigitalToken:
        currentServingToken !== null
          ? formatDigitalToken(currentServingToken)
          : null,
      patientsAhead,
      waitEstimate,
      updatedAt: now.toISOString(),
    };
  }

  createAppointment(
    user: AppointmentUser,
    input: CreateAppointmentInput,
  ): AppointmentView {
    this.assertUser(user);

    const selection = this.resolveSelection(input);
    const slotId = asRequiredString(
      input.slotId,
      "Appointment slot",
      180,
    );
    const now = this.now();
    const slot = this.findFutureSlot(selection, slotId, now);

    if (this.isSlotTaken(slot.slotId)) {
      throw new AppointmentError(
        409,
        "SLOT_TAKEN",
        "That appointment slot has just been taken. Choose another slot.",
      );
    }

    if (
      this.hasUserConflict(
        user.id,
        slot.startsAt,
      )
    ) {
      throw new AppointmentError(
        409,
        "BOOKING_CONFLICT",
        "You already have another appointment around this time. Choose a different slot.",
      );
    }

    const patientName = asPatientName(
      input.patientName,
      user.fullName,
    );
    const isApprovalRequired = selection.doctor.approvalRequired;
    const requestedStatus: AppointmentStatus = isApprovalRequired
      ? "requested"
      : "confirmed";

    const queueDate = istDateKey(new Date(slot.startsAt));
    let tokenNumber: number | null = null;
    let digitalToken: string | null = null;

    if (!isApprovalRequired) {
      tokenNumber = this.repository.allocateToken(
        selection.hospital.id,
        selection.department.id,
        queueDate,
      );
      digitalToken = formatDigitalToken(tokenNumber);
    }

    const appointment = this.addAppointment({
      userId: user.id,
      patientName,
      selection,
      slotId: slot.slotId,
      scheduledAt: slot.startsAt,
      status: requestedStatus,
      source: "online",
      checkedInAt: null,
      queueDate,
      tokenNumber,
      digitalToken,
      calledAt: null,
    });

    return this.toView(appointment);
  }

  rescheduleAppointment(
    user: AppointmentUser,
    appointmentId: string,
    input: RescheduleAppointmentInput,
  ): AppointmentView {
    const appointment = this.findOwnedAppointment(
      user,
      appointmentId,
    );

    if (
      appointment.status !== "requested" &&
      appointment.status !== "confirmed"
    ) {
      throw new AppointmentError(
        409,
        "RESCHEDULE_NOT_ALLOWED",
        "This appointment can no longer be rescheduled online. Contact hospital registration staff.",
      );
    }

    const slotId = asRequiredString(
      input.slotId,
      "New appointment slot",
      180,
    );

    if (appointment.slotId === slotId) {
      throw new AppointmentError(
        400,
        "SAME_SLOT",
        "Choose a different appointment slot.",
      );
    }

    const selection = this.resolveSelection({
      hospitalId: appointment.hospitalId,
      departmentId: appointment.departmentId,
      doctorId: appointment.doctorId,
    });
    const now = this.now();
    const slot = this.findFutureSlot(selection, slotId, now);

    if (
      this.isSlotTaken(
        slot.slotId,
        appointment.id,
      )
    ) {
      throw new AppointmentError(
        409,
        "SLOT_TAKEN",
        "That appointment slot is no longer available. Choose another slot.",
      );
    }

    if (
      this.hasUserConflict(
        user.id,
        slot.startsAt,
        appointment.id,
      )
    ) {
      throw new AppointmentError(
        409,
        "BOOKING_CONFLICT",
        "You already have another appointment around this time. Choose a different slot.",
      );
    }

    const previousStatus = appointment.status;
    const isApprovalRequired = selection.doctor.approvalRequired;
    const nextStatus: AppointmentStatus = isApprovalRequired
      ? "requested"
      : "confirmed";

    const oldQueueDate =
      appointment.queueDate ??
      istDateKey(new Date(appointment.scheduledAt));
    const newQueueDate = istDateKey(new Date(slot.startsAt));

    if (oldQueueDate === newQueueDate) {
      if (nextStatus === "confirmed" && appointment.tokenNumber === null) {
        appointment.tokenNumber = this.repository.allocateToken(
          selection.hospital.id,
          selection.department.id,
          newQueueDate,
        );
        appointment.digitalToken = formatDigitalToken(appointment.tokenNumber);
      }
    } else {
      if (!isApprovalRequired) {
        appointment.tokenNumber = this.repository.allocateToken(
          selection.hospital.id,
          selection.department.id,
          newQueueDate,
        );
        appointment.digitalToken = formatDigitalToken(appointment.tokenNumber);
      } else {
        appointment.tokenNumber = null;
        appointment.digitalToken = null;
      }
    }

    appointment.queueDate = newQueueDate;
    appointment.slotId = slot.slotId;
    appointment.scheduledAt = slot.startsAt;
    appointment.status = nextStatus;
    appointment.updatedAt = now.toISOString();

    this.repository.saveAppointment(appointment);
    this.recordEvent(
      appointment.id,
      previousStatus,
      nextStatus,
      "patient",
      now,
    );

    return this.toView(appointment);
  }

  cancelAppointment(
    user: AppointmentUser,
    appointmentId: string,
  ): AppointmentView {
    const appointment = this.findOwnedAppointment(
      user,
      appointmentId,
    );

    if (
      appointment.status !== "requested" &&
      appointment.status !== "confirmed"
    ) {
      throw new AppointmentError(
        409,
        "CANCEL_NOT_ALLOWED",
        "This appointment can no longer be cancelled online. Contact hospital registration staff.",
      );
    }

    const previousStatus = appointment.status;
    const now = this.now();

    appointment.status = "cancelled";
    appointment.cancelledAt = now.toISOString();
    appointment.updatedAt = now.toISOString();

    this.repository.saveAppointment(appointment);
    this.recordEvent(
      appointment.id,
      previousStatus,
      "cancelled",
      "patient",
      now,
    );

    return this.toView(appointment);
  }

  checkIn(
    user: AppointmentUser,
    appointmentId: string,
  ): AppointmentView {
    const appointment = this.findOwnedAppointment(
      user,
      appointmentId,
    );

    if (
      appointment.status === "checked_in" ||
      appointment.status === "waiting"
    ) {
      throw new AppointmentError(
        409,
        "ALREADY_CHECKED_IN",
        "You are already checked in and waiting. Your digital queue token is active.",
      );
    }

    if (appointment.status !== "confirmed") {
      throw new AppointmentError(
        409,
        "CHECKIN_NOT_ALLOWED",
        "This appointment cannot be checked in right now. Check your status or contact registration staff.",
      );
    }

    const now = this.now();
    const scheduledAt = new Date(
      appointment.scheduledAt,
    ).getTime();
    const opensAt = scheduledAt - CHECKIN_OPENS_BEFORE_MS;
    const closesAt = scheduledAt + CHECKIN_CLOSES_AFTER_MS;

    if (now.getTime() < opensAt) {
      throw new AppointmentError(
        409,
        "CHECKIN_TOO_EARLY",
        "Check-in opens 60 minutes before your appointment time.",
      );
    }

    if (now.getTime() > closesAt) {
      throw new AppointmentError(
        409,
        "CHECKIN_WINDOW_CLOSED",
        "The online check-in window has closed. Speak to registration staff when you arrive. Walk-ins remain possible.",
      );
    }

    const previousStatus = appointment.status;

    appointment.status = "waiting";
    appointment.checkedInAt = now.toISOString();
    appointment.updatedAt = now.toISOString();

    if (appointment.tokenNumber === null) {
      const queueDate =
        appointment.queueDate ?? istDateKey(new Date(appointment.scheduledAt));
      appointment.queueDate = queueDate;
      appointment.tokenNumber = this.repository.allocateToken(
        appointment.hospitalId,
        appointment.departmentId,
        queueDate,
      );
      appointment.digitalToken = formatDigitalToken(appointment.tokenNumber);
    }

    this.repository.saveAppointment(appointment);
    this.recordEvent(
      appointment.id,
      previousStatus,
      "waiting",
      "patient",
      now,
    );

    return this.toView(appointment);
  }

  getQueue(
    input: {
      hospitalId?: unknown;
      departmentId?: unknown;
    },
    staffIdentity?: AppointmentAccessIdentity,
  ): QueueView {
    const hospitalId = asRequiredString(
      input.hospitalId,
      "Hospital",
    );
    const departmentId = asRequiredString(
      input.departmentId,
      "Department",
    );

    if (staffIdentity) {
      if (!isStaffAuthorizedForHospital(staffIdentity, hospitalId)) {
        throw new AppointmentError(
          403,
          "STAFF_HOSPITAL_FORBIDDEN",
          "You are not authorized to view the queue for this hospital.",
        );
      }
    }

    const selection = this.resolveSelection({
      hospitalId,
      departmentId,
      doctorId: this.hospitals
        .find((hospital) => hospital.id === hospitalId)
        ?.departments.find(
          (department) => department.id === departmentId,
        )?.doctors[0]?.id,
    });
    const now = this.now();
    const todayKey = istDateKey(now);

    const appointments = this.appointments
      .filter(
        (appointment) =>
          appointment.hospitalId === hospitalId &&
          appointment.departmentId === departmentId &&
          (appointment.status === "requested" ||
            appointment.queueDate === todayKey ||
            sameIstDay(appointment.scheduledAt, now) ||
            (appointment.checkedInAt !== null &&
              sameIstDay(appointment.checkedInAt, now))),
      )
      .sort((first, second) => {
        const statusDifference =
          STATUS_ORDER[first.status] -
          STATUS_ORDER[second.status];

        if (statusDifference !== 0) {
          return statusDifference;
        }

        return (
          new Date(first.scheduledAt).getTime() -
          new Date(second.scheduledAt).getTime()
        );
      })
      .map((appointment) =>
        this.toView(appointment),
      );

    let currentServingToken = this.repository.getServingToken(
      hospitalId,
      departmentId,
      todayKey,
    );

    if (currentServingToken === null) {
      const inConsultation = appointments.find(
        (view) => view.appointment.status === "in_consultation",
      );
      if (inConsultation && inConsultation.appointment.tokenNumber !== null) {
        currentServingToken = inConsultation.appointment.tokenNumber;
      }
    }

    const activeCount = appointments.filter((view) =>
      ["checked_in", "waiting", "in_consultation"].includes(
        view.appointment.status,
      ),
    ).length;

    return {
      appointments,
      waitEstimate: this.computeWaitEstimate({
        hospital: selection.hospital,
        department: selection.department,
      }),
      currentServingToken,
      currentServingDigitalToken:
        currentServingToken !== null
          ? formatDigitalToken(currentServingToken)
          : null,
      activeCount,
      source: "demo",
      demoLabel: APPOINTMENT_DEMO_LABEL,
    };
  }

  createWalkIn(
    input: CreateWalkInInput,
    staffIdentity?: AppointmentAccessIdentity,
  ): AppointmentView {
    const hospitalId = asRequiredString(
      input.hospitalId,
      "Hospital",
    );
    const departmentId = asRequiredString(
      input.departmentId,
      "Department",
    );

    if (staffIdentity) {
      if (!isStaffAuthorizedForHospital(staffIdentity, hospitalId)) {
        throw new AppointmentError(
          403,
          "STAFF_HOSPITAL_FORBIDDEN",
          "You are not authorized to register walk-ins for this hospital.",
        );
      }
    }

    const patientName = asPatientName(input.patientName);
    const hospital = this.hospitals.find(
      (candidate) => candidate.id === hospitalId,
    );
    const department = hospital?.departments.find(
      (candidate) => candidate.id === departmentId,
    );

    if (!hospital || !department) {
      throw new AppointmentError(
        400,
        "INVALID_SELECTION",
        "Choose a valid hospital and department.",
      );
    }

    const doctorId =
      typeof input.doctorId === "string" &&
      input.doctorId.trim().length > 0
        ? input.doctorId.trim()
        : department.doctors[0]?.id;
    const doctor = department.doctors.find(
      (candidate) => candidate.id === doctorId,
    );

    if (!doctor) {
      throw new AppointmentError(
        400,
        "INVALID_DOCTOR",
        "Choose a valid doctor for this department.",
      );
    }

    const now = this.now();
    const queueDate = istDateKey(now);
    const tokenNumber = this.repository.allocateToken(
      hospital.id,
      department.id,
      queueDate,
    );
    const digitalToken = formatDigitalToken(tokenNumber);

    const appointment = this.addAppointment({
      userId: null,
      patientName,
      selection: { hospital, department, doctor },
      slotId: null,
      scheduledAt: now.toISOString(),
      status: "waiting",
      source: "walk_in",
      checkedInAt: now.toISOString(),
      queueDate,
      tokenNumber,
      digitalToken,
      calledAt: null,
    });

    return this.toView(appointment);
  }

  transitionAppointment(
    appointmentId: string,
    input: TransitionAppointmentInput,
    staffIdentity?: AppointmentAccessIdentity,
  ): AppointmentView {
    const appointment = this.findAppointment(
      appointmentId,
    );

    if (staffIdentity) {
      if (
        !isStaffAuthorizedForHospital(
          staffIdentity,
          appointment.hospitalId,
        )
      ) {
        throw new AppointmentError(
          403,
          "STAFF_HOSPITAL_FORBIDDEN",
          "You are not authorized to update visits for this hospital.",
        );
      }
    }

    const nextStatus = asStatus(input.status);
    const allowed =
      STAFF_TRANSITIONS[appointment.status] ?? [];

    if (!allowed.includes(nextStatus)) {
      throw new AppointmentError(
        409,
        "INVALID_TRANSITION",
        `Cannot move an appointment from ${appointment.status} to ${nextStatus}.`,
      );
    }

    if (
      nextStatus === "waiting" &&
      appointment.checkedInAt === null &&
      !sameIstDay(appointment.scheduledAt, this.now())
    ) {
      throw new AppointmentError(
        409,
        "CHECKIN_DATE_MISMATCH",
        "Staff check-in is only available on the appointment date.",
      );
    }

    const previousStatus = appointment.status;
    const now = this.now();

    appointment.status = nextStatus;
    appointment.updatedAt = now.toISOString();

    if (nextStatus === "confirmed" && appointment.tokenNumber === null) {
      const queueDate =
        appointment.queueDate ?? istDateKey(new Date(appointment.scheduledAt));
      appointment.queueDate = queueDate;
      appointment.tokenNumber = this.repository.allocateToken(
        appointment.hospitalId,
        appointment.departmentId,
        queueDate,
      );
      appointment.digitalToken = formatDigitalToken(appointment.tokenNumber);
    }

    if (nextStatus === "waiting") {
      appointment.checkedInAt = now.toISOString();
      if (appointment.tokenNumber === null) {
        const queueDate =
          appointment.queueDate ??
          istDateKey(new Date(appointment.scheduledAt));
        appointment.queueDate = queueDate;
        appointment.tokenNumber = this.repository.allocateToken(
          appointment.hospitalId,
          appointment.departmentId,
          queueDate,
        );
        appointment.digitalToken = formatDigitalToken(appointment.tokenNumber);
      }
    }

    if (nextStatus === "in_consultation") {
      appointment.consultationStartedAt = now.toISOString();
      appointment.calledAt = now.toISOString();
      if (appointment.tokenNumber !== null) {
        const qDate = appointment.queueDate ?? istDateKey(now);
        this.repository.setServingToken(
          appointment.hospitalId,
          appointment.departmentId,
          qDate,
          appointment.tokenNumber,
        );
      }
    }

    if (nextStatus === "completed") {
      appointment.completedAt = now.toISOString();
    }

    if (nextStatus === "cancelled") {
      appointment.cancelledAt = now.toISOString();
    }

    if (nextStatus === "missed") {
      appointment.missedAt = now.toISOString();
    }

    this.repository.saveAppointment(appointment);
    this.recordEvent(
      appointment.id,
      previousStatus,
      nextStatus,
      "staff",
      now,
    );

    return this.toView(appointment);
  }

  private assertUser(user: AppointmentUser): void {
    if (!user.id) {
      throw new AppointmentError(
        401,
        "AUTH_REQUIRED",
        "Sign in to use appointments.",
      );
    }
  }

  private resolveSelection(input: {
    hospitalId?: unknown;
    departmentId?: unknown;
    doctorId?: unknown;
  }): ResolvedSelection {
    const hospitalId = asRequiredString(
      input.hospitalId,
      "Hospital",
    );
    const departmentId = asRequiredString(
      input.departmentId,
      "Department",
    );
    const doctorId = asRequiredString(
      input.doctorId,
      "Doctor",
    );
    const hospital = this.hospitals.find(
      (candidate) => candidate.id === hospitalId,
    );
    const department = hospital?.departments.find(
      (candidate) => candidate.id === departmentId,
    );
    const doctor = department?.doctors.find(
      (candidate) => candidate.id === doctorId,
    );

    if (!hospital || !department || !doctor) {
      throw new AppointmentError(
        400,
        "INVALID_SELECTION",
        "Choose a valid hospital, department and doctor.",
      );
    }

    return { hospital, department, doctor };
  }

  private doctorSlots(
    selection: ResolvedSelection,
    dateKey: string,
  ): AppointmentSlot[] {
    const weekday = dateKeyToDate(dateKey).getUTCDay();

    if (
      !selection.doctor.availableWeekdays.includes(weekday)
    ) {
      return [];
    }

    const sessionStarts = [9 * 60, 14 * 60];
    const slots: AppointmentSlot[] = [];

    for (const startMinutes of sessionStarts) {
      for (
        let offset = 0;
        offset < 3 * 60;
        offset += SLOT_MINUTES
      ) {
        const totalMinutes = startMinutes + offset;
        const startsAt = localSlot(
          dateKey,
          Math.floor(totalMinutes / 60),
          totalMinutes % 60,
        );
        const endsAt = new Date(
          startsAt.getTime() + SLOT_MINUTES * 60 * 1000,
        );

        slots.push({
          slotId: slotIdFor(selection.doctor.id, startsAt),
          hospitalId: selection.hospital.id,
          departmentId: selection.department.id,
          doctorId: selection.doctor.id,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          label: timeLabel(startsAt),
        });
      }
    }

    return slots;
  }

  private findFutureSlot(
    selection: ResolvedSelection,
    slotId: string,
    now: Date,
  ): AppointmentSlot {
    const slot = dateKeysFrom(now, AVAILABILITY_DAYS)
      .flatMap((date) =>
        this.doctorSlots(selection, date),
      )
      .find((candidate) => candidate.slotId === slotId);

    if (
      !slot ||
      new Date(slot.startsAt).getTime() <= now.getTime()
    ) {
      throw new AppointmentError(
        409,
        "SLOT_UNAVAILABLE",
        "That appointment slot is no longer available. Refresh availability and choose another slot.",
      );
    }

    return slot;
  }

  private isSlotTaken(
    slotId: string,
    excludeAppointmentId?: string,
  ): boolean {
    return this.appointments.some(
      (appointment) =>
        appointment.id !== excludeAppointmentId &&
        appointment.slotId === slotId &&
        isSlotBlockingStatus(appointment.status),
    );
  }

  private hasUserConflict(
    userId: string,
    scheduledAt: string,
    excludeAppointmentId?: string,
  ): boolean {
    const target = new Date(scheduledAt).getTime();

    return this.appointments.some((appointment) => {
      if (
        appointment.id === excludeAppointmentId ||
        appointment.userId !== userId ||
        !isActiveStatus(appointment.status)
      ) {
        return false;
      }

      return (
        Math.abs(
          new Date(appointment.scheduledAt).getTime() -
            target,
        ) < BOOKING_CONFLICT_WINDOW_MS
      );
    });
  }

  private findAppointment(appointmentId: string): Appointment {
    const appointment = this.appointments.find(
      (candidate) => candidate.id === appointmentId,
    );

    if (!appointment) {
      throw new AppointmentError(
        404,
        "APPOINTMENT_NOT_FOUND",
        "Appointment not found.",
      );
    }

    return appointment;
  }

  private findOwnedAppointment(
    user: AppointmentUser,
    appointmentId: string,
  ): Appointment {
    this.assertUser(user);

    const appointment = this.appointments.find(
      (candidate) =>
        candidate.id === appointmentId &&
        candidate.userId === user.id,
    );

    if (!appointment) {
      throw new AppointmentError(
        404,
        "APPOINTMENT_NOT_FOUND",
        "Appointment not found.",
      );
    }

    return appointment;
  }

  private addAppointment(input: {
    userId: string | null;
    patientName: string;
    selection: ResolvedSelection;
    slotId: string | null;
    scheduledAt: string;
    status: AppointmentStatus;
    source: Appointment["source"];
    checkedInAt: string | null;
    queueDate: string | null;
    tokenNumber: number | null;
    digitalToken: string | null;
    calledAt: string | null;
  }): Appointment {
    const now = this.now();

    const appointment: Appointment = {
      id: randomUUID(),
      reference: makeReference(now),
      userId: input.userId,
      patientName: input.patientName,
      hospitalId: input.selection.hospital.id,
      hospitalName: input.selection.hospital.name,
      departmentId: input.selection.department.id,
      departmentName: input.selection.department.name,
      doctorId: input.selection.doctor.id,
      doctorName: input.selection.doctor.name,
      slotId: input.slotId,
      scheduledAt: input.scheduledAt,
      status: input.status,
      source: input.source,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      checkedInAt: input.checkedInAt,
      consultationStartedAt: null,
      completedAt: null,
      cancelledAt: null,
      missedAt: null,
      queueDate: input.queueDate,
      tokenNumber: input.tokenNumber,
      digitalToken: input.digitalToken,
      calledAt: input.calledAt,
    };

    this.repository.saveAppointment(appointment);
    this.recordEvent(
      appointment.id,
      null,
      appointment.status,
      input.userId ? "patient" : "staff",
      now,
    );

    return appointment;
  }

  private recordEvent(
    appointmentId: string,
    fromStatus: AppointmentStatus | null,
    toStatus: AppointmentStatus,
    actorRole: AppointmentActorRole,
    now: Date,
  ): void {
    this.repository.recordEvent({
      id: randomUUID(),
      appointmentId,
      fromStatus,
      toStatus,
      actorRole,
      createdAt: now.toISOString(),
    });
  }

  private toPublicAppointment(
    appointment: Appointment,
  ): PublicAppointment {
    const { userId: _userId, ...publicAppointment } = appointment;
    return publicAppointment;
  }

  private toView(appointment: Appointment): AppointmentView {
    return {
      appointment: this.toPublicAppointment(appointment),
      guidance: this.buildGuidance(appointment),
      waitEstimate: this.computeWaitEstimate({
        hospital:
          this.hospitals.find(
            (candidate) =>
              candidate.id === appointment.hospitalId,
          ) ?? {
            id: appointment.hospitalId,
            name: appointment.hospitalName,
            city: "",
            departments: [],
          },
        department: {
          id: appointment.departmentId,
          name: appointment.departmentName,
          doctors: [],
        },
        doctorId: appointment.doctorId,
        appointment,
      }),
      history: this.events
        .filter(
          (event) =>
            event.appointmentId === appointment.id,
        )
        .sort(
          (first, second) =>
            new Date(first.createdAt).getTime() -
            new Date(second.createdAt).getTime(),
        ),
      source: "demo",
      demoLabel: APPOINTMENT_DEMO_LABEL,
    };
  }

  private buildGuidance(
    appointment: Appointment,
  ): AppointmentGuidance {
    const tokenMessage = appointment.digitalToken
      ? `Your digital token is ${appointment.digitalToken}. `
      : "";

    const statusGuidance: Record<AppointmentStatus, string> = {
      requested:
        "Your request is waiting for hospital confirmation. A digital queue token will be allocated upon confirmation.",
      confirmed:
        `${tokenMessage}Arrive about 15 minutes before your appointment time. Check in here when you arrive or speak to registration staff.`,
      checked_in:
        `${tokenMessage}You are checked in. Watch your digital token and queue status on this screen.`,
      waiting:
        `${tokenMessage}You are in the queue. Hospital staff will call your digital token or name.`,
      in_consultation:
        "Your consultation is in progress. Ask hospital staff if you need help.",
      completed:
        "This visit is marked complete. Ask registration staff if you need a paper summary or follow-up instructions.",
      cancelled:
        "This appointment is cancelled. The assigned digital token is retired and will not be reused.",
      missed:
        "Hospital staff marked this appointment as missed. Contact registration staff to rebook. Walk-ins remain possible.",
    };

    return {
      arrival:
        appointment.status === "requested"
          ? "Wait for confirmation before travelling to the hospital."
          : "Arrive about 15 minutes before the scheduled time. Bring any documents the hospital asks for.",
      status: statusGuidance[appointment.status],
      assistance:
        "If you cannot use this page, go to the hospital registration desk. Assisted registration does not require a smartphone, email, or online payment. Walk-ins remain available.",
      notifications:
        "This page refreshes automatically while it is open; you can also refresh manually. SMS, WhatsApp, and phone-call notifications are not configured.",
    };
  }

  private computeWaitEstimate(input: {
    hospital: AppointmentHospital;
    department: AppointmentDepartment;
    doctorId?: string;
    appointment?: Appointment;
  }): WaitEstimate {
    const now = this.now();
    const hospitalId = input.hospital.id;
    const departmentId = input.department.id;
    const doctorId = input.doctorId;

    if (
      input.appointment &&
      input.appointment.status !== "checked_in" &&
      input.appointment.status !== "waiting"
    ) {
      const ineligibleReason =
        input.appointment.status === "completed"
          ? "This visit is complete, so no waiting-time estimate is needed."
          : input.appointment.status === "requested" ||
              input.appointment.status === "confirmed"
            ? "A waiting-time estimate is shown only after you check in."
            : "A waiting-time estimate is available only while you are checked in or waiting.";

      return {
        available: false,
        reason: ineligibleReason,
        activeQueueCount: 0,
        recentConsultations: 0,
      };
    }

    const activeQueue = this.appointments
      .filter(
        (appointment) =>
          appointment.hospitalId === hospitalId &&
          appointment.departmentId === departmentId &&
          (!doctorId ||
            appointment.doctorId === doctorId) &&
          sameIstDay(
            appointment.checkedInAt ??
              appointment.scheduledAt,
            now,
          ) &&
          (appointment.status === "checked_in" ||
            appointment.status === "waiting" ||
            appointment.status === "in_consultation"),
      )
      .sort((first, second) => {
        const firstTime = new Date(
          first.checkedInAt ?? first.scheduledAt,
        ).getTime();
        const secondTime = new Date(
          second.checkedInAt ?? second.scheduledAt,
        ).getTime();

        return firstTime - secondTime;
      });

    const recentSince =
      now.getTime() - RECENT_CONSULTATION_DAYS * DAY_MS;
    const completions = this.appointments
      .filter((appointment) => {
        if (
          appointment.hospitalId !== hospitalId ||
          appointment.departmentId !== departmentId ||
          (doctorId &&
            appointment.doctorId !== doctorId) ||
          appointment.status !== "completed" ||
          !appointment.completedAt
        ) {
          return false;
        }

        const completedAt = new Date(
          appointment.completedAt,
        ).getTime();
        const duration = consultationDurationMs(appointment);

        return (
          completedAt >= recentSince &&
          duration !== null &&
          duration >= 5 * 60 * 1000 &&
          duration <= 120 * 60 * 1000
        );
      })
      .sort(
        (first, second) =>
          new Date(second.completedAt ?? 0).getTime() -
          new Date(first.completedAt ?? 0).getTime(),
      );

    const weekday = dateKeyToDate(istDateKey(now)).getUTCDay();
    const doctorAvailability = input.department.doctors.length
      ? input.department.doctors.some((doctor) =>
          doctor.availableWeekdays.includes(weekday),
        )
      : true;

    if (!doctorAvailability) {
      return {
        available: false,
        reason:
          "No doctor availability is recorded for this department today.",
        activeQueueCount: activeQueue.length,
        recentConsultations: completions.length,
      };
    }

    if (activeQueue.length === 0) {
      return {
        available: false,
        reason:
          "No current-day active queue data is available for this department.",
        activeQueueCount: 0,
        recentConsultations: completions.length,
      };
    }

    if (completions.length < MIN_RECENT_CONSULTATIONS) {
      return {
        available: false,
        reason:
          "There are not enough recent consultation records to estimate waiting time.",
        activeQueueCount: activeQueue.length,
        recentConsultations: completions.length,
      };
    }

    const latestCompletion = new Date(
      completions[0].completedAt ?? 0,
    ).getTime();

    if (
      !Number.isFinite(latestCompletion) ||
      now.getTime() - latestCompletion >
        STALE_CONSULTATION_MS
    ) {
      return {
        available: false,
        reason:
          "Queue timing data is stale, so a waiting-time estimate is unavailable.",
        activeQueueCount: activeQueue.length,
        recentConsultations: completions.length,
      };
    }

    const totalDuration = completions.reduce(
      (total, appointment) =>
        total + (consultationDurationMs(appointment) ?? 0),
      0,
    );
    const averageMinutes =
      totalDuration / completions.length / (60 * 1000);

    let patientsAhead = activeQueue.length;

    if (input.appointment) {
      const index = activeQueue.findIndex(
        (appointment) =>
          appointment.id === input.appointment?.id,
      );

      patientsAhead =
        index >= 0 ? index : activeQueue.length;
    }

    const minutes = Math.min(
      MAX_WAIT_ESTIMATE_MINUTES,
      Math.max(
        5,
        Math.round(patientsAhead * averageMinutes),
      ),
    );

    return {
      available: true,
      minutes,
      basis: `Estimated from ${activeQueue.length} active queue ${
        activeQueue.length === 1 ? "entry" : "entries"
      } and ${completions.length} recent consultations. This is an estimate, not a guarantee.`,
      updatedAt: completions[0].completedAt ??
        now.toISOString(),
    };
  }
}

export const appointmentService = new AppointmentService();
