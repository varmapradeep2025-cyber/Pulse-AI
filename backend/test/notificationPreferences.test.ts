import test from "node:test";
import assert from "node:assert/strict";
import {
  NotificationService,
} from "../src/services/notificationService.js";

test("notification preferences default to sensible values for new users", () => {
  const service = new NotificationService();
  const prefs = service.getPreferences("user-1");

  assert.equal(prefs.userId, "user-1");
  assert.equal(prefs.inAppEnabled, true);
  assert.equal(prefs.emailEnabled, true);
  assert.equal(prefs.pushEnabled, false);
  assert.equal(prefs.smsEnabled, false);
  assert.deepEqual(prefs.reminderIntervals, [1440, 60, 15]);
  assert.equal(prefs.notifyApproachingTurn, true);
  assert.equal(prefs.notifyDelay, true);
  assert.equal(prefs.notifyAppointmentChanges, true);
});

test("user can update reminder intervals and toggle channels independently", () => {
  const service = new NotificationService();
  service.getPreferences("user-1");

  const updated = service.updatePreferences("user-1", {
    reminderIntervals: [1440, 60, 30, 15],
    pushEnabled: true,
    smsEnabled: true,
    phoneNumber: "+919876543210",
  });

  assert.deepEqual(updated.reminderIntervals, [1440, 60, 30, 15]);
  assert.equal(updated.pushEnabled, true);
  assert.equal(updated.smsEnabled, true);
  assert.equal(updated.phoneNumber, "+919876543210");
  assert.equal(updated.emailEnabled, true); // remains unchanged

  // User 2 preferences remain isolated and unaffected
  const user2Prefs = service.getPreferences("user-2");
  assert.equal(user2Prefs.pushEnabled, false);
  assert.deepEqual(user2Prefs.reminderIntervals, [1440, 60, 15]);
});

test("in-app notifications support read, unread count, and mark-all-read", () => {
  const service = new NotificationService();

  const notif1 = service.createInAppNotification({
    userId: "user-1",
    type: "appointment_confirmed",
    title: "Appointment Confirmed",
    message: "Your appointment is confirmed.",
  });

  const notif2 = service.createInAppNotification({
    userId: "user-1",
    type: "queue_approaching_turn",
    title: "Approaching Your Turn",
    message: "You are next in line.",
  });

  assert.equal(service.getUnreadCount("user-1"), 2);
  assert.equal(service.getUnreadCount("user-2"), 0);

  const readNotif = service.markAsRead("user-1", notif1.id);
  assert.equal(readNotif.read, true);
  assert.equal(service.getUnreadCount("user-1"), 1);

  service.markAllAsRead("user-1");
  assert.equal(service.getUnreadCount("user-1"), 0);
});

test("push subscriptions can be registered and deactivated", () => {
  const service = new NotificationService();

  const sub = service.registerPushSubscription("user-1", {
    endpoint: "https://push.example.com/sub/123",
    p256dh: "key-p256dh",
    auth: "key-auth",
    userAgent: "Mozilla/5.0",
  });

  assert.equal(sub.userId, "user-1");
  assert.equal(sub.isActive, true);

  const active = service.getRepository().findPushSubscriptions("user-1");
  assert.equal(active.length, 1);

  const deactivated = service.deactivatePushSubscription(
    "user-1",
    "https://push.example.com/sub/123",
  );
  assert.equal(deactivated, true);

  const remaining = service.getRepository().findPushSubscriptions("user-1");
  assert.equal(remaining.length, 0);
});
