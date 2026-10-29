import test from "node:test";
import assert from "node:assert/strict";
import { AppointmentService } from "../src/services/appointmentService.js";
import { NotificationService } from "../src/services/notificationService.js";
import { AssistantToolsService } from "../src/services/assistantToolsService.js";

const DEMO_USER = {
  id: "user-assistant-1",
  email: "citizen@example.com",
  fullName: "Priya Patel",
  isStaff: false,
};

const DOCTOR_IDENTITY = {
  id: "doc-1",
  staffUserIds: ["doc-1"],
};

test("assistant returns accurate appointment summary for citizen with scheduled appointment", async () => {
  const notifService = new NotificationService();
  const apptService = new AppointmentService({
    notificationService: notifService,
    now: () => new Date("2026-10-26T08:00:00+05:30"),
  });
  const assistantService = new AssistantToolsService(apptService, notifService);

  const catalog = apptService.getCatalog();
  const hospital = catalog.hospitals[0];
  const department = hospital.departments[0];
  const doctor = department.doctors[0];
  const avail = apptService.getAvailability({
    hospitalId: hospital.id,
    departmentId: department.id,
    doctorId: doctor.id,
  });
  const slot = avail.days[0].slots[0];

  const view = apptService.createAppointment(DEMO_USER, {
    hospitalId: hospital.id,
    departmentId: department.id,
    doctorId: doctor.id,
    slotId: slot.slotId,
    patientName: "Priya Patel",
  });

  const response = await assistantService.handleCitizenQuery(
    DEMO_USER,
    "What is my appointment status and token?",
  );

  assert.equal(response.source, "live-authoritative");
  assert.ok(response.answer.includes(view.appointment.hospitalName));
  assert.ok(response.answer.includes(view.appointment.digitalToken ?? ""));
});

test("assistant returns notification history when queried by citizen", async () => {
  const notifService = new NotificationService();
  const apptService = new AppointmentService({
    notificationService: notifService,
  });
  const assistantService = new AssistantToolsService(apptService, notifService);

  notifService.createInAppNotification({
    userId: DEMO_USER.id,
    type: "appointment_confirmed",
    title: "Appointment Booked",
    message: "Your appointment is confirmed for tomorrow.",
  });

  const response = await assistantService.handleCitizenQuery(
    DEMO_USER,
    "Show me my recent notifications and alerts",
  );

  assert.equal(response.source, "live-authoritative");
  assert.ok(response.answer.includes("Appointment Booked"));
  assert.ok(response.answer.includes("unread notification(s)"));
});

test("assistant returns doctor queue summary and next patient for authorized staff", async () => {
  const notifService = new NotificationService();
  const apptService = new AppointmentService({
    notificationService: notifService,
  });
  const assistantService = new AssistantToolsService(apptService, notifService);

  const catalog = apptService.getCatalog();
  const hospital = catalog.hospitals[0];
  const department = hospital.departments[0];
  const doctor = department.doctors[0];

  apptService.createWalkIn(
    {
      hospitalId: hospital.id,
      departmentId: department.id,
      doctorId: doctor.id,
      patientName: "Emergency WalkIn",
    },
    DOCTOR_IDENTITY,
  );

  const response = await assistantService.handleDoctorQuery(
    DOCTOR_IDENTITY,
    hospital.id,
    department.id,
    "Who is the next patient waiting?",
  );

  assert.equal(response.source, "live-authoritative");
  assert.ok(response.answer.includes("Emergency WalkIn"));
  assert.ok(response.answer.includes("T-001"));
});

test("assistant rejects doctor queue query for unauthorized hospital", async () => {
  const assistantService = new AssistantToolsService();

  const unauthorizedIdentity = {
    id: "doctor-restricted",
    appMetadata: {
      appointment_hospital_ids: ["HSP-OTHER"],
    },
  };

  const response = await assistantService.handleDoctorQuery(
    unauthorizedIdentity,
    "hosp-bhopal-dist",
    "dept-gen-med",
    "Who is the next patient?",
  );

  assert.ok(response.answer.includes("Access Denied"));
});
