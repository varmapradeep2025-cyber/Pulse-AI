import assert from "node:assert/strict";
import test from "node:test";
import {
  AppointmentError,
  AppointmentService,
} from "../src/services/appointmentService.js";
import { hasAppointmentStaffAccess } from "../src/services/appointmentAccess.js";
import type {
  AppointmentSlot,
  AppointmentUser,
} from "../src/types/appointments.js";

const patientA: AppointmentUser = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Asha Patil",
};

const patientB: AppointmentUser = {
  id: "22222222-2222-4222-8222-222222222222",
  fullName: "Ravi Kumar",
};

const patientC: AppointmentUser = {
  id: "33333333-3333-4333-8333-333333333333",
  fullName: "Meena Joshi",
};

const patientD: AppointmentUser = {
  id: "44444444-4444-4444-8444-444444444444",
  fullName: "Imran Sheikh",
};

const generalSelection = {
  hospitalId: "H001",
  departmentId: "general-medicine",
  doctorId: "H001-GM-01",
};

function at(dateTime: string): Date {
  return new Date(dateTime);
}

function slotAt(
  service: AppointmentService,
  date: string,
  time: string,
  selection = generalSelection,
): AppointmentSlot {
  const availability = service.getAvailability(selection);
  const day = availability.days.find(
    (candidate) => candidate.date === date,
  );
  assert.ok(day, `Expected availability for ${date}`);

  const slot = day.slots.find(
    (candidate) =>
      candidate.startsAt ===
      new Date(`${date}T${time}:00+05:30`).toISOString(),
  );
  assert.ok(slot, `Expected a slot at ${date} ${time}`);

  return slot;
}

function bookWith(
  service: AppointmentService,
  user: AppointmentUser,
  selection: typeof generalSelection,
  slot: AppointmentSlot,
  patientName = user.fullName,
) {
  return service.createAppointment(user, {
    ...selection,
    slotId: slot.slotId,
    patientName,
  });
}

function book(
  service: AppointmentService,
  user: AppointmentUser,
  slot: AppointmentSlot,
  patientName = user.fullName,
) {
  return bookWith(
    service,
    user,
    generalSelection,
    slot,
    patientName,
  );
}

function expectAppointmentError(
  action: () => unknown,
  status: number,
  codePattern?: RegExp,
): AppointmentError {
  try {
    action();
    assert.fail("Expected an AppointmentError.");
  } catch (error) {
    assert.ok(error instanceof AppointmentError);
    assert.equal(error.status, status);

    if (codePattern) {
      assert.match(error.code, codePattern);
    }

    return error;
  }
}

test("exposes a clearly labelled fictional catalog", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:00:00+05:30"),
  });
  const catalog = service.getCatalog();

  assert.equal(catalog.source, "demo");
  assert.equal(catalog.timezone, "Asia/Kolkata");
  assert.match(catalog.demoLabel, /fictional/i);
  assert.equal(catalog.hospitals.length, 5);
  assert.ok(
    catalog.hospitals.every(
      (hospital) => hospital.departments.length > 0,
    ),
  );
});

test("only exposes future 30-minute demo slots for configured days", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:00:00+05:30"),
  });
  const availability = service.getAvailability(generalSelection);
  const monday = availability.days.find(
    (day) => day.date === "2026-10-26",
  );
  const saturday = availability.days.find(
    (day) => day.date === "2026-10-31",
  );

  assert.ok(monday);
  assert.equal(monday.slots[0].startsAt, at("2026-10-26T09:00:00+05:30").toISOString());
  assert.equal(monday.slots.length, 12);
  assert.ok(
    monday.slots.every(
      (slot) =>
        new Date(slot.endsAt).getTime() -
          new Date(slot.startsAt).getTime() ===
        30 * 60 * 1000,
    ),
  );
  assert.ok(saturday);
  assert.equal(saturday.slots.length, 0);
});

test("creates a confirmed appointment without exposing ownership data", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:00:00+05:30"),
  });
  const slot = slotAt(service, "2026-10-26", "09:00");
  const view = book(service, patientA, slot, "  Asha   Patil ");

  assert.equal(view.appointment.status, "confirmed");
  assert.equal(view.appointment.patientName, "Asha Patil");
  assert.equal(view.appointment.source, "online");
  assert.match(view.appointment.reference, /^APT-\d{8}-[A-Z0-9]{6}$/);
  assert.equal("userId" in view.appointment, false);
  assert.equal(view.history.length, 1);
  assert.equal(view.history[0].toStatus, "confirmed");
  assert.match(view.guidance.notifications, /not configured/i);
});

test("rejects double booking and the same patient's overlapping booking", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:00:00+05:30"),
  });
  const slot = slotAt(service, "2026-10-26", "09:00");
  const pediatricSelection = {
    hospitalId: "H001",
    departmentId: "pediatrics",
    doctorId: "H001-PE-01",
  };
  const pediatricSlot = slotAt(
    service,
    "2026-10-26",
    "09:00",
    pediatricSelection,
  );

  book(service, patientA, slot);

  expectAppointmentError(
    () =>
      bookWith(
        service,
        patientA,
        pediatricSelection,
        pediatricSlot,
      ),
    409,
    /BOOKING_CONFLICT/,
  );
  expectAppointmentError(
    () => book(service, patientB, slot),
    409,
    /SLOT_TAKEN/,
  );
});

test("keeps approval-required appointments pending staff confirmation", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:00:00+05:30"),
  });
  const availability = service.getAvailability({
    hospitalId: "H001",
    departmentId: "cardiology",
    doctorId: "H001-CA-01",
  });
  const tuesday = availability.days.find(
    (day) => day.date === "2026-10-27",
  );
  assert.ok(tuesday);
  assert.ok(tuesday.slots.length > 0);

  const view = service.createAppointment(patientA, {
    hospitalId: "H001",
    departmentId: "cardiology",
    doctorId: "H001-CA-01",
    slotId: tuesday.slots[0].slotId,
    patientName: "Asha Patil",
  });

  assert.equal(view.appointment.status, "requested");
  assert.match(view.guidance.arrival, /wait for confirmation/i);
  assert.ok(
    service
      .getQueue({
        hospitalId: "H001",
        departmentId: "cardiology",
      })
      .appointments.some(
        (entry) => entry.appointment.id === view.appointment.id,
      ),
  );
});

test("validates catalog selections, slots and patient names", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:00:00+05:30"),
  });
  const slot = slotAt(service, "2026-10-26", "09:00");

  expectAppointmentError(
    () =>
      service.createAppointment(patientA, {
        ...generalSelection,
        hospitalId: "unknown",
        slotId: slot.slotId,
        patientName: "Asha Patil",
      }),
    400,
    /INVALID_SELECTION/,
  );
  expectAppointmentError(
    () =>
      service.createAppointment(patientA, {
        ...generalSelection,
        slotId: "not-a-slot",
        patientName: "Asha Patil",
      }),
    409,
    /SLOT_UNAVAILABLE/,
  );
  expectAppointmentError(
    () =>
      service.createAppointment(patientA, {
        ...generalSelection,
        slotId: slot.slotId,
        patientName: "A",
      }),
    400,
    /INVALID_INPUT/,
  );
});

test("enforces patient ownership for reads and changes", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:00:00+05:30"),
  });
  const slot = slotAt(service, "2026-10-26", "09:00");
  const view = book(service, patientA, slot);

  expectAppointmentError(
    () => service.getAppointment(patientB, view.appointment.id),
    404,
    /NOT_FOUND/,
  );
  expectAppointmentError(
    () => service.cancelAppointment(patientB, view.appointment.id),
    404,
    /NOT_FOUND/,
  );
  expectAppointmentError(
    () => service.checkIn(patientB, view.appointment.id),
    404,
    /NOT_FOUND/,
  );
});

test("reschedules a confirmed appointment and frees the old slot", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:00:00+05:30"),
  });
  const firstSlot = slotAt(service, "2026-10-26", "09:00");
  const secondSlot = slotAt(service, "2026-10-26", "10:30");
  const view = book(service, patientA, firstSlot);

  const rescheduled = service.rescheduleAppointment(
    patientA,
    view.appointment.id,
    { slotId: secondSlot.slotId },
  );

  assert.equal(rescheduled.appointment.slotId, secondSlot.slotId);
  assert.equal(rescheduled.appointment.status, "confirmed");
  assert.ok(
    service
      .getAvailability(generalSelection)
      .days.flatMap((day) => day.slots)
      .some((slot) => slot.slotId === secondSlot.slotId) === false,
  );

  const another = book(service, patientB, firstSlot);
  assert.equal(another.appointment.slotId, firstSlot.slotId);
});

test("cancels only online-cancellable appointments", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:00:00+05:30"),
  });
  const slot = slotAt(service, "2026-10-26", "09:00");
  const view = book(service, patientA, slot);

  const cancelled = service.cancelAppointment(
    patientA,
    view.appointment.id,
  );

  assert.equal(cancelled.appointment.status, "cancelled");
  assert.ok(cancelled.appointment.cancelledAt);
  assert.match(cancelled.guidance.assistance, /walk-ins remain available/i);

  expectAppointmentError(
    () => service.cancelAppointment(patientA, view.appointment.id),
    409,
    /CANCEL_NOT_ALLOWED/,
  );
});

test("checks in only near the appointment time and only once", () => {
  let clock = at("2026-10-26T08:00:00+05:30");
  const service = new AppointmentService({
    now: () => clock,
  });
  const slot = slotAt(service, "2026-10-26", "09:00");
  const appointment = book(service, patientA, slot);

  clock = at("2026-10-26T07:30:00+05:30");
  expectAppointmentError(
    () => service.checkIn(patientA, appointment.appointment.id),
    409,
    /CHECKIN_TOO_EARLY/,
  );

  clock = at("2026-10-26T11:05:00+05:30");
  expectAppointmentError(
    () => service.checkIn(patientA, appointment.appointment.id),
    409,
    /CHECKIN_WINDOW_CLOSED/,
  );

  clock = at("2026-10-26T08:30:00+05:30");
  const checkedIn = service.checkIn(
    patientA,
    appointment.appointment.id,
  );
  assert.equal(checkedIn.appointment.status, "waiting");
  assert.ok(checkedIn.appointment.checkedInAt);
  assert.ok(
    service
      .getQueue(generalSelection)
      .appointments.some(
        (entry) => entry.appointment.id === appointment.appointment.id,
      ),
  );

  expectAppointmentError(
    () => service.checkIn(patientA, appointment.appointment.id),
    409,
    /ALREADY_CHECKED_IN/,
  );
});

test("retains queue state across sequential reads after check-in", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:30:00+05:30"),
  });
  const booking = book(
    service,
    patientA,
    slotAt(service, "2026-10-26", "09:00"),
  );

  service.checkIn(patientA, booking.appointment.id);

  const firstRead = service.getQueue(generalSelection);
  const secondRead = service.getQueue(generalSelection);

  assert.equal(firstRead.appointments.length, 1);
  assert.equal(secondRead.appointments.length, 1);
  assert.equal(
    secondRead.appointments[0].appointment.status,
    "waiting",
  );
  assert.ok(secondRead.appointments[0].appointment.checkedInAt);
});

test("does not mark a patient missed merely because time passes", () => {
  let clock = at("2026-10-26T08:00:00+05:30");
  const service = new AppointmentService({
    now: () => clock,
  });
  const slot = slotAt(service, "2026-10-26", "09:00");
  const booking = book(service, patientA, slot);

  clock = at("2026-10-27T12:00:00+05:30");

  const reloaded = service.getAppointment(
    patientA,
    booking.appointment.id,
  );

  assert.equal(reloaded.appointment.status, "confirmed");
  assert.equal(reloaded.appointment.missedAt, null);
});

test("enforces legal staff transitions and same-day staff check-in", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:00:00+05:30"),
  });
  const slot = slotAt(service, "2026-10-26", "09:00");
  const view = book(service, patientA, slot);

  const waiting = service.transitionAppointment(
    view.appointment.id,
    { status: "waiting" },
  );
  assert.equal(waiting.appointment.status, "waiting");
  assert.ok(waiting.appointment.checkedInAt);

  const inConsultation = service.transitionAppointment(
    view.appointment.id,
    { status: "in_consultation" },
  );
  assert.equal(inConsultation.appointment.status, "in_consultation");

  const completed = service.transitionAppointment(
    view.appointment.id,
    { status: "completed" },
  );
  assert.equal(completed.appointment.status, "completed");
  assert.ok(completed.appointment.completedAt);

  expectAppointmentError(
    () =>
      service.transitionAppointment(view.appointment.id, {
        status: "waiting",
      }),
    409,
    /INVALID_TRANSITION/,
  );

  const tomorrowSlot = slotAt(service, "2026-10-27", "09:00");
  const tomorrow = book(service, patientB, tomorrowSlot);
  expectAppointmentError(
    () =>
      service.transitionAppointment(tomorrow.appointment.id, {
        status: "waiting",
      }),
    409,
    /CHECKIN_DATE_MISMATCH/,
  );
});

test("creates walk-ins and includes them in the same-day department queue", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:30:00+05:30"),
  });
  const onlineSlot = slotAt(service, "2026-10-26", "09:00");
  book(service, patientA, onlineSlot);

  const walkIn = service.createWalkIn({
    ...generalSelection,
    patientName: "Walk In Patient",
  });
  const queue = service.getQueue(generalSelection);

  assert.equal(walkIn.appointment.status, "waiting");
  assert.equal(walkIn.appointment.source, "walk_in");
  assert.equal("userId" in walkIn.appointment, false);
  assert.equal(queue.appointments.length, 2);
  assert.ok(
    queue.appointments.some(
      (entry) => entry.appointment.id === walkIn.appointment.id,
    ),
  );
  assert.ok(
    queue.appointments.every(
      (entry) => !("userId" in entry.appointment),
    ),
  );
});

test("returns an unavailable wait estimate until real queue evidence exists", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:30:00+05:30"),
  });
  const slot = slotAt(service, "2026-10-26", "09:00");
  const view = book(service, patientA, slot);

  assert.equal(view.waitEstimate.available, false);

  service.checkIn(patientA, view.appointment.id);
  const checkedIn = service.getAppointment(
    patientA,
    view.appointment.id,
  );

  assert.equal(checkedIn.waitEstimate.available, false);
  assert.match(
    checkedIn.waitEstimate.available === false
      ? checkedIn.waitEstimate.reason
      : "",
    /not enough recent consultation/i,
  );
});

test("does not count stale active visits from an earlier day", () => {
  let clock = at("2026-10-26T08:30:00+05:30");
  const service = new AppointmentService({
    now: () => clock,
  });
  const monday = book(
    service,
    patientA,
    slotAt(service, "2026-10-26", "09:00"),
  );
  service.checkIn(patientA, monday.appointment.id);

  const tuesday = book(
    service,
    patientB,
    slotAt(service, "2026-10-27", "09:00"),
  );

  clock = at("2026-10-27T08:30:00+05:30");
  service.checkIn(patientB, tuesday.appointment.id);
  const view = service.getAppointment(
    patientB,
    tuesday.appointment.id,
  );

  assert.equal(view.waitEstimate.available, false);

  if (view.waitEstimate.available === false) {
    assert.equal(view.waitEstimate.activeQueueCount, 1);
  }
});

test("returns a bounded estimate from recent completed consultations only", () => {
  let clock = at("2026-10-26T08:00:00+05:30");
  const service = new AppointmentService({
    now: () => clock,
  });
  const slotNine = slotAt(service, "2026-10-26", "09:00");
  const slotNineThirty = slotAt(service, "2026-10-26", "09:30");
  const slotTen = slotAt(service, "2026-10-26", "10:00");
  const slotTenThirty = slotAt(service, "2026-10-26", "10:30");

  const first = book(service, patientA, slotNine);
  const second = book(service, patientB, slotNineThirty);
  const third = book(service, patientC, slotTen);
  const active = book(service, patientD, slotTenThirty);

  function complete(
    user: AppointmentUser,
    id: string,
    checkInAt: string,
    consultationAt: string,
    completedAt: string,
  ) {
    clock = at(checkInAt);
    service.checkIn(user, id);
    clock = at(consultationAt);
    service.transitionAppointment(id, {
      status: "in_consultation",
    });
    clock = at(completedAt);
    service.transitionAppointment(id, { status: "completed" });
  }

  complete(
    patientA,
    first.appointment.id,
    "2026-10-26T09:00:00+05:30",
    "2026-10-26T09:02:00+05:30",
    "2026-10-26T09:15:00+05:30",
  );
  complete(
    patientB,
    second.appointment.id,
    "2026-10-26T09:30:00+05:30",
    "2026-10-26T09:32:00+05:30",
    "2026-10-26T09:45:00+05:30",
  );
  complete(
    patientC,
    third.appointment.id,
    "2026-10-26T10:00:00+05:30",
    "2026-10-26T10:02:00+05:30",
    "2026-10-26T10:15:00+05:30",
  );

  clock = at("2026-10-26T10:30:00+05:30");
  service.checkIn(patientD, active.appointment.id);
  const view = service.getAppointment(
    patientD,
    active.appointment.id,
  );

  assert.equal(view.waitEstimate.available, true);

  if (view.waitEstimate.available) {
    assert.ok(view.waitEstimate.minutes >= 5);
    assert.ok(view.waitEstimate.minutes <= 30);
    assert.match(view.waitEstimate.basis, /estimate, not a guarantee/i);
    assert.equal(view.waitEstimate.updatedAt, at("2026-10-26T10:15:00+05:30").toISOString());
  }

  clock = at("2026-10-28T10:30:00+05:30");
  const stale = service.getAppointment(
    patientD,
    active.appointment.id,
  );

  assert.equal(stale.waitEstimate.available, false);
  assert.match(
    stale.waitEstimate.available === false
      ? stale.waitEstimate.reason
      : "",
    /stale|current-day/i,
  );
});

test("staff access requires an explicit allowlist or trusted app metadata", () => {
  assert.equal(
    hasAppointmentStaffAccess({
      id: patientA.id,
      staffUserIds: [],
    }),
    false,
  );
  assert.equal(
    hasAppointmentStaffAccess({
      id: patientA.id,
      staffUserIds: [patientA.id],
    }),
    true,
  );
  assert.equal(
    hasAppointmentStaffAccess({
      id: patientA.id,
      appMetadata: { appointment_staff: true },
    }),
    true,
  );
  assert.equal(
    hasAppointmentStaffAccess({
      id: patientA.id,
      appMetadata: { role: "appointment_staff" },
    }),
    true,
  );
  assert.equal(
    hasAppointmentStaffAccess({
      id: patientA.id,
      appMetadata: { appointment_staff: "true" },
    }),
    false,
  );
  assert.equal(
    hasAppointmentStaffAccess({
      id: patientA.id,
      appMetadata: { role: "patient" },
    }),
    false,
  );
});

test("rejects an invalid staff status without mutating the appointment", () => {
  const service = new AppointmentService({
    now: () => at("2026-10-26T08:00:00+05:30"),
  });
  const slot = slotAt(service, "2026-10-26", "09:00");
  const view = book(service, patientA, slot);

  expectAppointmentError(
    () =>
      service.transitionAppointment(view.appointment.id, {
        status: "teleported",
      }),
    400,
    /INVALID_STATUS/,
  );
  assert.equal(
    service.getAppointment(patientA, view.appointment.id).appointment
      .status,
    "confirmed",
  );
});
