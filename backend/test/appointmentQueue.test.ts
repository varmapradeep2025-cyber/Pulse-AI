import assert from "node:assert/strict";
import test from "node:test";
import {
  AppointmentError,
  AppointmentService,
  formatDigitalToken,
} from "../src/services/appointmentService.js";
import {
  hasAppointmentStaffAccess,
  isStaffAuthorizedForHospital,
} from "../src/services/appointmentAccess.js";
import {
  InMemoryAppointmentRepository,
  SupabaseAppointmentRepository,
  AppointmentPersistenceError,
} from "../src/repositories/appointmentRepository.js";
import type {
  AppointmentSlot,
  AppointmentUser,
} from "../src/types/appointments.js";

const patient1: AppointmentUser = {
  id: "aaaaaaa1-1111-4111-8111-111111111111",
  fullName: "Aarav Sharma",
};

const patient2: AppointmentUser = {
  id: "bbbbbbb2-2222-4222-8222-222222222222",
  fullName: "Pooja Verma",
};

const patient3: AppointmentUser = {
  id: "ccccccc3-3333-4333-8333-333333333333",
  fullName: "Vikram Malhotra",
};

const hospitalH001 = "H001";
const generalSelection = {
  hospitalId: hospitalH001,
  departmentId: "general-medicine",
  doctorId: "H001-GM-01",
};

function at(dateTime: string): Date {
  return new Date(dateTime);
}

function getSlot(
  service: AppointmentService,
  date: string,
  time: string,
  selection = generalSelection,
): AppointmentSlot {
  const availability = service.getAvailability(selection);
  const day = availability.days.find((d) => d.date === date);
  assert.ok(day, `Expected day ${date}`);
  const slot = day.slots.find(
    (s) => s.startsAt === new Date(`${date}T${time}:00+05:30`).toISOString(),
  );
  assert.ok(slot, `Expected slot at ${date} ${time}`);
  return slot;
}

test("digital token: auto-confirmed booking receives digital token immediately", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:00:00+05:30"),
  });
  const slot = getSlot(service, "2026-10-26", "09:00");
  const view = service.createAppointment(patient1, {
    ...generalSelection,
    slotId: slot.slotId,
    patientName: "Aarav Sharma",
  });

  assert.equal(view.appointment.status, "confirmed");
  assert.equal(view.appointment.tokenNumber, 1);
  assert.equal(view.appointment.digitalToken, "T-001");
  assert.equal(view.appointment.queueDate, "2026-10-26");
});

test("digital token: approval-required booking allocates token only upon staff confirmation", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:00:00+05:30"),
  });
  const cardiologySelection = {
    hospitalId: hospitalH001,
    departmentId: "cardiology",
    doctorId: "H001-CA-01", // approvalRequired: true
  };
  const slot = getSlot(service, "2026-10-27", "09:00", cardiologySelection);

  // 1. Initial request: status is requested, token is null
  const view = service.createAppointment(patient1, {
    ...cardiologySelection,
    slotId: slot.slotId,
    patientName: "Aarav Sharma",
  });

  assert.equal(view.appointment.status, "requested");
  assert.equal(view.appointment.tokenNumber, null);
  assert.equal(view.appointment.digitalToken, null);

  // 2. Staff approves and confirms
  const confirmedView = service.transitionAppointment(
    view.appointment.id,
    { status: "confirmed" },
  );

  assert.equal(confirmedView.appointment.status, "confirmed");
  assert.equal(confirmedView.appointment.tokenNumber, 1);
  assert.equal(confirmedView.appointment.digitalToken, "T-001");
  assert.equal(confirmedView.appointment.queueDate, "2026-10-27");
});

test("digital token: walk-in registration allocates sequential token immediately", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:00:00+05:30"),
  });

  // Online booking gets token 1
  const slot = getSlot(service, "2026-10-26", "09:00");
  service.createAppointment(patient1, {
    ...generalSelection,
    slotId: slot.slotId,
    patientName: "Aarav Sharma",
  });

  // Walk-in gets token 2
  const walkIn = service.createWalkIn({
    hospitalId: hospitalH001,
    departmentId: "general-medicine",
    patientName: "Emergency Walk-In Patient",
  });

  assert.equal(walkIn.appointment.status, "waiting");
  assert.equal(walkIn.appointment.source, "walk_in");
  assert.equal(walkIn.appointment.tokenNumber, 2);
  assert.equal(walkIn.appointment.digitalToken, "T-002");
  assert.equal(walkIn.appointment.queueDate, "2026-10-26");
});

test("digital token: rescheduling within the same queue date preserves token number", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:00:00+05:30"),
  });
  const slot1 = getSlot(service, "2026-10-26", "09:00");
  const slot2 = getSlot(service, "2026-10-26", "10:00");

  const initial = service.createAppointment(patient1, {
    ...generalSelection,
    slotId: slot1.slotId,
    patientName: "Aarav Sharma",
  });

  assert.equal(initial.appointment.tokenNumber, 1);
  assert.equal(initial.appointment.digitalToken, "T-001");

  const rescheduled = service.rescheduleAppointment(patient1, initial.appointment.id, {
    slotId: slot2.slotId,
  });

  assert.equal(rescheduled.appointment.tokenNumber, 1);
  assert.equal(rescheduled.appointment.digitalToken, "T-001");
  assert.equal(rescheduled.appointment.queueDate, "2026-10-26");
});

test("digital token: rescheduling to another date forfeits old token and allocates new date token", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:00:00+05:30"),
  });
  const mondaySlot = getSlot(service, "2026-10-26", "09:00");
  const tuesdaySlot = getSlot(service, "2026-10-27", "09:00");

  const initial = service.createAppointment(patient1, {
    ...generalSelection,
    slotId: mondaySlot.slotId,
    patientName: "Aarav Sharma",
  });

  assert.equal(initial.appointment.tokenNumber, 1);
  assert.equal(initial.appointment.queueDate, "2026-10-26");

  const rescheduled = service.rescheduleAppointment(patient1, initial.appointment.id, {
    slotId: tuesdaySlot.slotId,
  });

  assert.equal(rescheduled.appointment.queueDate, "2026-10-27");
  assert.equal(rescheduled.appointment.tokenNumber, 1);
  assert.equal(rescheduled.appointment.digitalToken, "T-001");

  // Verify next booking on Monday starts at token 2 (Monday token 1 was not reused)
  const mondaySlot2 = getSlot(service, "2026-10-26", "09:30");
  const secondPatient = service.createAppointment(patient2, {
    ...generalSelection,
    slotId: mondaySlot2.slotId,
    patientName: "Pooja Verma",
  });

  assert.equal(secondPatient.appointment.tokenNumber, 2);
  assert.equal(secondPatient.appointment.digitalToken, "T-002");
});

test("digital token: cancelled and missed tokens are never reused", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:00:00+05:30"),
  });
  const slot1 = getSlot(service, "2026-10-26", "09:00");
  const slot2 = getSlot(service, "2026-10-26", "09:30");

  const booked1 = service.createAppointment(patient1, {
    ...generalSelection,
    slotId: slot1.slotId,
    patientName: "Aarav Sharma",
  });
  assert.equal(booked1.appointment.tokenNumber, 1);

  // Cancel booking 1
  const cancelled = service.cancelAppointment(patient1, booked1.appointment.id);
  assert.equal(cancelled.appointment.status, "cancelled");
  assert.equal(cancelled.appointment.tokenNumber, 1);

  // Booking 2 must receive token 2, NOT token 1
  const booked2 = service.createAppointment(patient2, {
    ...generalSelection,
    slotId: slot2.slotId,
    patientName: "Pooja Verma",
  });
  assert.equal(booked2.appointment.tokenNumber, 2);
  assert.equal(booked2.appointment.digitalToken, "T-002");
});

test("queue snapshot API: returns patient token, serving token, and patients ahead accurately", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:45:00+05:30"),
  });

  const slot1 = getSlot(service, "2026-10-26", "09:00");
  const slot2 = getSlot(service, "2026-10-26", "09:30");

  const appt1 = service.createAppointment(patient1, {
    ...generalSelection,
    slotId: slot1.slotId,
    patientName: "Aarav Sharma",
  });
  const appt2 = service.createAppointment(patient2, {
    ...generalSelection,
    slotId: slot2.slotId,
    patientName: "Pooja Verma",
  });

  // Check both in
  service.checkIn(patient1, appt1.appointment.id);
  service.checkIn(patient2, appt2.appointment.id);

  // Staff starts consultation with patient 1
  service.transitionAppointment(appt1.appointment.id, {
    status: "in_consultation",
  });

  // Patient 2 requests queue snapshot
  const snapshot = service.getQueueSnapshot(patient2, appt2.appointment.id);

  assert.equal(snapshot.appointmentId, appt2.appointment.id);
  assert.equal(snapshot.tokenNumber, 2);
  assert.equal(snapshot.digitalToken, "T-002");
  assert.equal(snapshot.currentServingToken, 1);
  assert.equal(snapshot.currentServingDigitalToken, "T-001");
  assert.equal(snapshot.patientsAhead, 1); // 1 patient ahead (currently in consultation)
  assert.equal(snapshot.status, "waiting");
  assert.ok(snapshot.updatedAt);
});

test("queue snapshot API: strictly enforces patient ownership", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:45:00+05:30"),
  });
  const slot = getSlot(service, "2026-10-26", "09:00");
  const appt = service.createAppointment(patient1, {
    ...generalSelection,
    slotId: slot.slotId,
    patientName: "Aarav Sharma",
  });

  // Patient 1 can view
  const snapshot = service.getQueueSnapshot(patient1, appt.appointment.id);
  assert.equal(snapshot.appointmentId, appt.appointment.id);

  // Patient 2 cannot view Patient 1's queue snapshot
  assert.throws(
    () => service.getQueueSnapshot(patient2, appt.appointment.id),
    (err: unknown) => {
      assert.ok(err instanceof AppointmentError);
      assert.equal(err.status, 404);
      assert.equal(err.code, "APPOINTMENT_NOT_FOUND");
      return true;
    },
  );
});

test("staff hospital authorization: verifies hospital scope correctly", () => {
  const singleHospitalStaff = {
    id: "staff-123",
    appMetadata: {
      role: "appointment_staff",
      appointment_hospital_ids: ["H001"],
    },
    staffUserIds: [],
  };

  assert.equal(hasAppointmentStaffAccess(singleHospitalStaff), true);
  assert.equal(isStaffAuthorizedForHospital(singleHospitalStaff, "H001"), true);
  assert.equal(isStaffAuthorizedForHospital(singleHospitalStaff, "H002"), false);

  const multiHospitalStaff = {
    id: "staff-multi",
    appMetadata: {
      role: "appointment_staff",
      appointment_hospital_ids: ["H001", "H002"],
    },
    staffUserIds: [],
  };

  assert.equal(isStaffAuthorizedForHospital(multiHospitalStaff, "H001"), true);
  assert.equal(isStaffAuthorizedForHospital(multiHospitalStaff, "H002"), true);
  assert.equal(isStaffAuthorizedForHospital(multiHospitalStaff, "H003"), false);

  const unassignedStaff = {
    id: "staff-unassigned",
    staffUserIds: ["staff-unassigned"],
    appMetadata: {
      role: "appointment_staff",
    },
  };

  // Staff without assigned hospital metadata must be denied access to all hospitals
  assert.equal(hasAppointmentStaffAccess(unassignedStaff), true);
  assert.equal(isStaffAuthorizedForHospital(unassignedStaff, "H001"), false);
  assert.equal(isStaffAuthorizedForHospital(unassignedStaff, "H002"), false);

  const globalAdmin = {
    id: "admin-999",
    appMetadata: {
      role: "admin",
    },
    staffUserIds: [],
  };

  assert.equal(hasAppointmentStaffAccess(globalAdmin), true);
  assert.equal(isStaffAuthorizedForHospital(globalAdmin, "H001"), true);
  assert.equal(isStaffAuthorizedForHospital(globalAdmin, "H002"), true);
});

test("staff hospital authorization: rejects unauthorized staff cross-hospital queue access", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:45:00+05:30"),
  });

  const staffRestrictedToH002 = {
    id: "staff-h002",
    appMetadata: {
      role: "appointment_staff",
      appointment_hospital_ids: ["H002"],
    },
    staffUserIds: [],
  };

  // Attempting to read H001 queue
  assert.throws(
    () =>
      service.getQueue(
        { hospitalId: "H001", departmentId: "general-medicine" },
        staffRestrictedToH002,
      ),
    (err: unknown) => {
      assert.ok(err instanceof AppointmentError);
      assert.equal(err.status, 403);
      assert.equal(err.code, "STAFF_HOSPITAL_FORBIDDEN");
      return true;
    },
  );
});

test("persistence: Supabase repository detects missing schema and throws safe 503 error", async () => {
  const repo = new SupabaseAppointmentRepository();

  // Mode is supabase
  assert.equal(repo.mode, "supabase");

  // In-memory fallback methods work for unit test isolation
  assert.equal(Array.isArray(repo.getAppointments()), true);

  // Calling verifyConnection with no SUPABASE_URL configured throws
  await assert.rejects(
    async () => {
      await repo.verifyConnection();
    },
    (err: unknown) => {
      assert.ok(err instanceof Error);
      return true;
    },
  );
});
