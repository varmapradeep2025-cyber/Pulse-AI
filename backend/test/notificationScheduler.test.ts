import test from "node:test";
import assert from "node:assert/strict";
import {
  NotificationService,
} from "../src/services/notificationService.js";
import { MockEmailProvider } from "../src/services/providers/emailProvider.js";

test("schedules reminder jobs matching user selected intervals", () => {
  let currentTime = new Date("2026-10-29T10:00:00Z");
  const emailMock = new MockEmailProvider();
  const service = new NotificationService({
    now: () => currentTime,
    emailProvider: emailMock,
  });

  // User 1 has default intervals [1440, 60, 15] minutes
  // Scheduled appointment: 2 hours from now (120 minutes)
  // 1440 min (24h) is in the past relative to 120m -> skipped
  // 60 min (1h) is due at 11:00:00Z -> scheduled!
  // 15 min is due at 11:45:00Z -> scheduled!
  const appointmentTime = new Date("2026-10-29T12:00:00Z").toISOString();

  const jobs = service.scheduleAppointmentReminders({
    userId: "user-1",
    appointmentId: "apt-1",
    patientName: "Aarav Sharma",
    hospitalName: "Bhopal District Hospital",
    departmentName: "General Medicine",
    doctorName: "Dr. Rajesh Sharma",
    scheduledAt: appointmentTime,
    digitalToken: "T-001",
    userEmail: "aarav@example.com",
  });

  // 2 active reminder intervals * (in_app + email) = 4 jobs
  assert.equal(jobs.length, 4);

  const email60 = jobs.find(
    (j) => j.channel === "email" && j.idempotencyKey.includes(":60:"),
  );
  assert.ok(email60);
  assert.equal(email60.scheduledFor, "2026-10-29T11:00:00.000Z");

  const email15 = jobs.find(
    (j) => j.channel === "email" && j.idempotencyKey.includes(":15:"),
  );
  assert.ok(email15);
  assert.equal(email15.scheduledFor, "2026-10-29T11:45:00.000Z");
});

test("cancelling appointment invalidates pending reminder jobs", () => {
  const currentTime = new Date("2026-10-29T10:00:00Z");
  const service = new NotificationService({
    now: () => currentTime,
  });

  const appointmentTime = new Date("2026-10-29T14:00:00Z").toISOString();

  service.scheduleAppointmentReminders({
    userId: "user-1",
    appointmentId: "apt-to-cancel",
    patientName: "Aarav",
    hospitalName: "Hospital",
    departmentName: "OPD",
    doctorName: "Doctor",
    scheduledAt: appointmentTime,
    digitalToken: "T-002",
  });

  const cancelledCount = service.cancelAppointmentReminders("apt-to-cancel");
  assert.ok(cancelledCount > 0);

  // Background worker finding due jobs will not pick cancelled jobs
  const due = service.getRepository().findDueJobs("2026-10-29T15:00:00Z");
  const aptJobs = due.filter((j) => j.appointmentId === "apt-to-cancel");
  assert.equal(aptJobs.length, 0);
});

test("background worker claims and dispatches due jobs with delivery attempt logging", async () => {
  let currentTime = new Date("2026-10-29T10:00:00Z");
  const emailMock = new MockEmailProvider();
  const service = new NotificationService({
    now: () => currentTime,
    emailProvider: emailMock,
  });

  const appointmentTime = new Date("2026-10-29T11:00:00Z").toISOString();

  service.scheduleAppointmentReminders({
    userId: "user-1",
    appointmentId: "apt-due",
    patientName: "Aarav",
    hospitalName: "District Hospital",
    departmentName: "Cardiology",
    doctorName: "Dr. Verma",
    scheduledAt: appointmentTime,
    digitalToken: "T-005",
    userEmail: "patient@example.com",
  });

  // Advance time to 10:46:00Z (both 60m and 15m reminders are now due!)
  currentTime = new Date("2026-10-29T10:46:00Z");

  const workerResult = await service.processDueJobs();
  assert.ok(workerResult.completed > 0);
  assert.equal(workerResult.failed, 0);

  // Email provider received the reminder
  assert.ok(emailMock.sentMessages.length > 0);
  const reminderEmail = emailMock.sentMessages[0];
  assert.equal(reminderEmail.to, "patient@example.com");
  assert.ok(reminderEmail.subject.includes("Reminder"));

  // In-app notification was generated for the user
  const notifs = service.listNotifications("user-1");
  assert.ok(notifs.some((n) => n.type === "appointment_reminder"));

  // Delivery attempts were recorded in ledger
  const attempts = service.getRepository().getDeliveryAttempts();
  assert.ok(attempts.length > 0);
  assert.equal(attempts[0].status, "delivered");
});
