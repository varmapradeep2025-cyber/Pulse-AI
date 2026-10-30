import test from "node:test";
import assert from "node:assert/strict";
import { AppointmentService } from "../src/services/appointmentService.js";
import { NotificationService } from "../src/services/notificationService.js";
import { MockEmailProvider } from "../src/services/providers/emailProvider.js";

const DEMO_USER = {
  id: "user-patient-1",
  email: "patient1@example.com",
  fullName: "Aarav Sharma",
  isStaff: false,
};

const STAFF_USER = {
  id: "staff-1",
  email: "doctor@example.com",
  fullName: "Dr. Sharma",
  isStaff: true,
  staffUserIds: ["staff-1"],
  appMetadata: {
    role: "appointment_staff",
    appointment_hospital_ids: ["H001", "hosp-bhopal-dist"],
  },
};

test("booking confirmed appointment sends immediate confirmation notification and schedules reminders", () => {
  const notifService = new NotificationService();
  const emailMock = notifService.getEmailProvider() as MockEmailProvider;
  const apptService = new AppointmentService({
    notificationService: notifService,
    now: () => new Date("2026-10-26T08:00:00+05:30"),
  });

  const catalog = apptService.getCatalog();
  const hospital = catalog.hospitals[0];
  const department = hospital.departments[0];
  const doctor = department.doctors.find((d) => !d.approvalRequired) ?? department.doctors[0];

  const avail = apptService.getAvailability({
    hospitalId: hospital.id,
    departmentId: department.id,
    doctorId: doctor.id,
  });

  const slot = avail.days.flatMap((d) => d.slots)[0];

  const view = apptService.createAppointment(DEMO_USER, {
    hospitalId: hospital.id,
    departmentId: department.id,
    doctorId: doctor.id,
    slotId: slot.slotId,
    patientName: "Aarav Sharma",
  });

  assert.equal(view.appointment.status, "confirmed");

  // In-app notification was created
  const notifs = notifService.listNotifications(DEMO_USER.id);
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].type, "appointment_confirmed");
  assert.ok(notifs[0].message.includes(view.appointment.digitalToken ?? ""));

  // Email confirmation was sent
  assert.equal(emailMock.sentMessages.length, 1);
  assert.equal(emailMock.sentMessages[0].to, "patient1@example.com");
  assert.ok(emailMock.sentMessages[0].subject.includes("Confirmed"));
});

test("check-in generates queue_registered notification", () => {
  const notifService = new NotificationService();
  const apptService = new AppointmentService({
    notificationService: notifService,
    now: () => new Date("2026-10-26T08:00:00+05:30"),
  });

  const catalog = apptService.getCatalog();
  const hospital = catalog.hospitals[0];
  const department = hospital.departments[0];
  const doctor = department.doctors[0];
  const avail = apptService.getAvailability({
    hospitalId: hospital.id,
    departmentId: department.id,
    doctorId: doctor.id,
  });
  const slot = avail.days.flatMap((d) => d.slots)[0];

  const view = apptService.createAppointment(DEMO_USER, {
    hospitalId: hospital.id,
    departmentId: department.id,
    doctorId: doctor.id,
    slotId: slot.slotId,
    patientName: "Aarav Sharma",
  });

  // Fast forward to appointment check-in window
  const checkInTime = new Date(slot.startsAt);
  const checkInService = new AppointmentService({
    notificationService: notifService,
    now: () => checkInTime,
    repository: apptService.getRepository(),
  });

  checkInService.checkIn(DEMO_USER, view.appointment.id);

  const notifs = notifService.listNotifications(DEMO_USER.id);
  const queueNotif = notifs.find((n) => n.type === "queue_registered");
  assert.ok(queueNotif);
  assert.ok(queueNotif.message.includes(view.appointment.digitalToken ?? ""));
});

test("doctor calling patient generates queue_called and approaching turn alerts", () => {
  const notifService = new NotificationService();
  const apptService = new AppointmentService({
    notificationService: notifService,
    now: () => new Date("2026-10-26T08:00:00+05:30"),
  });

  const catalog = apptService.getCatalog();
  const hospital = catalog.hospitals[0];
  const department = hospital.departments[0];
  const doctor = department.doctors[0];

  // Create Patient 1 (walk-in 1)
  const p1 = apptService.createWalkIn(
    {
      hospitalId: hospital.id,
      departmentId: department.id,
      doctorId: doctor.id,
      patientName: "Patient One",
    },
    STAFF_USER,
  );

  // Manually link user ID for patient 1 to test notifications
  const apt1 = apptService.getRepository().findAppointment(p1.appointment.id)!;
  apt1.userId = "user-p1";
  apptService.getRepository().saveAppointment(apt1);

  // Create Patient 2 (waiting behind)
  const p2 = apptService.createWalkIn(
    {
      hospitalId: hospital.id,
      departmentId: department.id,
      doctorId: doctor.id,
      patientName: "Patient Two",
    },
    STAFF_USER,
  );
  const apt2 = apptService.getRepository().findAppointment(p2.appointment.id)!;
  apt2.userId = "user-p2";
  apptService.getRepository().saveAppointment(apt2);

  // Doctor calls Patient 1 into consultation
  apptService.transitionAppointment(
    p1.appointment.id,
    { status: "in_consultation" },
    STAFF_USER,
  );

  // Patient 1 received queue_called notification
  const p1Notifs = notifService.listNotifications("user-p1");
  assert.ok(p1Notifs.some((n) => n.type === "queue_called"));

  // Patient 2 received queue_approaching_turn notification because they are now next in line!
  const p2Notifs = notifService.listNotifications("user-p2");
  assert.ok(p2Notifs.some((n) => n.type === "queue_approaching_turn"));
});
