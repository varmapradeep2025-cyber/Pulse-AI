import { randomUUID } from "node:crypto";
import type {
  CreateInAppNotificationInput,
  DeliveryAttemptRecord,
  InAppNotification,
  NotificationChannel,
  NotificationDispatchResult,
  NotificationPreferences,
  NotificationType,
  PushSubscriptionInput,
  PushSubscriptionRecord,
  ScheduledNotificationJob,
  UpdatePreferencesInput,
} from "../types/notifications.js";
import {
  type NotificationRepository,
  InMemoryNotificationRepository,
} from "../repositories/notificationRepository.js";
import {
  type EmailProvider,
  MockEmailProvider,
  renderAppointmentCancelledEmail,
  renderAppointmentConfirmedEmail,
  renderAppointmentReminderEmail,
  renderQueueApproachingTurnEmail,
} from "./providers/emailProvider.js";
import {
  type PushProvider,
  MockPushProvider,
} from "./providers/pushProvider.js";
import {
  type SmsProvider,
  MockSmsProvider,
} from "./providers/smsProvider.js";

export class NotificationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "NotificationError";
  }
}

interface NotificationServiceOptions {
  repository?: NotificationRepository;
  emailProvider?: EmailProvider;
  pushProvider?: PushProvider;
  smsProvider?: SmsProvider;
  now?: () => Date;
  appUrl?: string;
}

export class NotificationService {
  private repository: NotificationRepository;
  private emailProvider: EmailProvider;
  private pushProvider: PushProvider;
  private smsProvider: SmsProvider;
  private now: () => Date;
  private appUrl: string;

  constructor(options: NotificationServiceOptions = {}) {
    this.repository = options.repository ?? new InMemoryNotificationRepository();
    this.emailProvider = options.emailProvider ?? new MockEmailProvider();
    this.pushProvider = options.pushProvider ?? new MockPushProvider();
    this.smsProvider = options.smsProvider ?? new MockSmsProvider();
    this.now = options.now ?? (() => new Date());
    this.appUrl = options.appUrl ?? "http://localhost:5173";
  }

  getRepository(): NotificationRepository {
    return this.repository;
  }

  getEmailProvider(): EmailProvider {
    return this.emailProvider;
  }

  getPushProvider(): PushProvider {
    return this.pushProvider;
  }

  getSmsProvider(): SmsProvider {
    return this.smsProvider;
  }

  reset(): void {
    this.repository.reset();
  }

  /* ------------------------------------------------------------------ */
  /* Preferences                                                        */
  /* ------------------------------------------------------------------ */

  getPreferences(userId: string): NotificationPreferences {
    const existing = this.repository.getPreferences(userId);
    if (existing) {
      return existing;
    }

    const defaultPrefs: NotificationPreferences = {
      userId,
      emailEnabled: true,
      pushEnabled: false,
      smsEnabled: false,
      inAppEnabled: true,
      reminderIntervals: [1440, 60, 15], // 24h, 1h, 15m
      notifyApproachingTurn: true,
      notifyDelay: true,
      notifyAppointmentChanges: true,
      phoneNumber: null,
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    };

    this.repository.savePreferences(defaultPrefs);
    return defaultPrefs;
  }

  updatePreferences(
    userId: string,
    input: UpdatePreferencesInput,
  ): NotificationPreferences {
    const current = this.getPreferences(userId);
    const updated: NotificationPreferences = {
      ...current,
      emailEnabled: input.emailEnabled ?? current.emailEnabled,
      pushEnabled: input.pushEnabled ?? current.pushEnabled,
      smsEnabled: input.smsEnabled ?? current.smsEnabled,
      inAppEnabled: input.inAppEnabled ?? current.inAppEnabled,
      reminderIntervals: input.reminderIntervals
        ? [...new Set(input.reminderIntervals.filter((m) => m > 0))].sort(
            (a, b) => b - a,
          )
        : current.reminderIntervals,
      notifyApproachingTurn:
        input.notifyApproachingTurn ?? current.notifyApproachingTurn,
      notifyDelay: input.notifyDelay ?? current.notifyDelay,
      notifyAppointmentChanges:
        input.notifyAppointmentChanges ?? current.notifyAppointmentChanges,
      phoneNumber:
        input.phoneNumber !== undefined ? input.phoneNumber : current.phoneNumber,
      updatedAt: this.now().toISOString(),
    };

    this.repository.savePreferences(updated);
    return updated;
  }

  /* ------------------------------------------------------------------ */
  /* In-App Notifications                                               */
  /* ------------------------------------------------------------------ */

  createInAppNotification(input: CreateInAppNotificationInput): InAppNotification {
    const notif: InAppNotification = {
      id: randomUUID(),
      userId: input.userId,
      appointmentId: input.appointmentId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link ?? null,
      metadata: input.metadata ?? {},
      read: false,
      readAt: null,
      createdAt: this.now().toISOString(),
    };

    this.repository.saveNotification(notif);
    return notif;
  }

  listNotifications(userId: string): InAppNotification[] {
    return this.repository.getNotifications(userId);
  }

  markAsRead(userId: string, notificationId: string): InAppNotification {
    const notif = this.repository.markNotificationRead(
      userId,
      notificationId,
      this.now().toISOString(),
    );

    if (!notif) {
      throw new NotificationError(404, "NOT_FOUND", "Notification not found.");
    }

    return notif;
  }

  markAllAsRead(userId: string): number {
    return this.repository.markAllNotificationsRead(
      userId,
      this.now().toISOString(),
    );
  }

  getUnreadCount(userId: string): number {
    return this.repository.getUnreadCount(userId);
  }

  /* ------------------------------------------------------------------ */
  /* Push Subscriptions                                                */
  /* ------------------------------------------------------------------ */

  registerPushSubscription(
    userId: string,
    input: PushSubscriptionInput,
  ): PushSubscriptionRecord {
    if (!input.endpoint || !input.p256dh || !input.auth) {
      throw new NotificationError(
        400,
        "INVALID_SUBSCRIPTION",
        "Invalid push subscription parameters.",
      );
    }

    const record: PushSubscriptionRecord = {
      id: randomUUID(),
      userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
      isActive: true,
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    };

    this.repository.savePushSubscription(record);
    return record;
  }

  deactivatePushSubscription(userId: string, endpoint: string): boolean {
    return this.repository.deactivatePushSubscription(userId, endpoint);
  }

  /* ------------------------------------------------------------------ */
  /* Durable Scheduling & Immediate Notification Dispatch               */
  /* ------------------------------------------------------------------ */

  scheduleAppointmentReminders(input: {
    userId: string;
    appointmentId: string;
    patientName: string;
    hospitalName: string;
    departmentName: string;
    doctorName: string;
    scheduledAt: string;
    digitalToken?: string | null;
    userEmail?: string;
  }): ScheduledNotificationJob[] {
    const prefs = this.getPreferences(input.userId);
    const scheduledTime = new Date(input.scheduledAt).getTime();
    const jobs: ScheduledNotificationJob[] = [];

    for (const minutes of prefs.reminderIntervals) {
      const scheduledForTime = scheduledTime - minutes * 60 * 1000;
      const scheduledForIso = new Date(scheduledForTime).toISOString();

      // Only schedule if the reminder time is in the future
      if (scheduledForTime > this.now().getTime()) {
        const channels: NotificationChannel[] = [];
        if (prefs.inAppEnabled) channels.push("in_app");
        if (prefs.emailEnabled) channels.push("email");
        if (prefs.pushEnabled) channels.push("push");
        if (prefs.smsEnabled && prefs.phoneNumber) channels.push("sms");

        for (const channel of channels) {
          const idempotencyKey = `reminder:${input.appointmentId}:${minutes}:${channel}`;
          const job: ScheduledNotificationJob = {
            id: randomUUID(),
            idempotencyKey,
            userId: input.userId,
            appointmentId: input.appointmentId,
            eventType: "appointment_reminder",
            channel,
            scheduledFor: scheduledForIso,
            status: "pending",
            attempts: 0,
            maxAttempts: 3,
            payload: {
              ...input,
              minutesBefore: minutes,
            },
            createdAt: this.now().toISOString(),
            updatedAt: this.now().toISOString(),
          };

          this.repository.saveScheduledJob(job);
          jobs.push(job);
        }
      }
    }

    return jobs;
  }

  cancelAppointmentReminders(appointmentId: string): number {
    return this.repository.cancelPendingJobsForAppointment(appointmentId);
  }

  /* ------------------------------------------------------------------ */
  /* Immediate Multi-Channel Dispatch                                   */
  /* ------------------------------------------------------------------ */

  async sendImmediateNotification(input: {
    userId: string;
    appointmentId?: string;
    type: NotificationType;
    title: string;
    message: string;
    link?: string;
    recipientEmail?: string;
    recipientPhone?: string;
    metadata?: Record<string, unknown>;
  }): Promise<NotificationDispatchResult[]> {
    const prefs = this.getPreferences(input.userId);
    const results: NotificationDispatchResult[] = [];

    // 1. In-App
    if (prefs.inAppEnabled) {
      this.createInAppNotification({
        userId: input.userId,
        appointmentId: input.appointmentId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link,
        metadata: input.metadata,
      });

      results.push({
        channel: "in_app",
        recipient: input.userId,
        status: "delivered",
        provider: "supabase-in-app",
      });
    }

    // 2. Email
    if (prefs.emailEnabled && input.recipientEmail) {
      const emailResult = await this.emailProvider.sendEmail({
        to: input.recipientEmail,
        subject: `Pulse AI: ${input.title}`,
        html: `<p><strong>${input.title}</strong></p><p>${input.message}</p>`,
        text: `Pulse AI: ${input.title}\n${input.message}`,
      });
      results.push(emailResult);
    }

    // 3. Web Push
    if (prefs.pushEnabled) {
      const subs = this.repository.findPushSubscriptions(input.userId);
      for (const sub of subs) {
        const pushResult = await this.pushProvider.sendPush(sub, {
          title: input.title,
          body: input.message,
          url: input.link ? `${this.appUrl}${input.link}` : `${this.appUrl}/citizen/appointments`,
          data: input.metadata,
        });
        results.push(pushResult);
      }
    }

    // 4. SMS
    const phone = input.recipientPhone ?? prefs.phoneNumber;
    if (prefs.smsEnabled && phone) {
      const smsResult = await this.smsProvider.sendSms({
        phoneNumber: phone,
        message: `Pulse AI: ${input.message.slice(0, 150)}`,
      });
      results.push(smsResult);
    }

    return results;
  }

  /* ------------------------------------------------------------------ */
  /* Background Worker Job Processing                                   */
  /* ------------------------------------------------------------------ */

  async processDueJobs(limit = 20): Promise<{
    processed: number;
    completed: number;
    failed: number;
  }> {
    const dueJobs = this.repository.findDueJobs(
      this.now().toISOString(),
      limit,
    );

    let completed = 0;
    let failed = 0;

    for (const job of dueJobs) {
      try {
        job.status = "processing";
        job.attempts += 1;
        job.lastAttemptAt = this.now().toISOString();

        const payload = job.payload as {
          patientName?: string;
          hospitalName?: string;
          departmentName?: string;
          doctorName?: string;
          scheduledAt?: string;
          digitalToken?: string;
          minutesBefore?: number;
          userEmail?: string;
          phoneNumber?: string;
        };

        let result: NotificationDispatchResult;

        if (job.channel === "in_app") {
          const timeDesc =
            (payload.minutesBefore ?? 60) >= 1440
              ? "tomorrow"
              : `in ${payload.minutesBefore ?? 60} minutes`;

          this.createInAppNotification({
            userId: job.userId,
            appointmentId: job.appointmentId,
            type: job.eventType,
            title: `Appointment Reminder (${timeDesc})`,
            message: `Your appointment at ${payload.hospitalName} (${payload.departmentName}) is scheduled for ${payload.scheduledAt}. Token: ${payload.digitalToken || "N/A"}.`,
            link: "/citizen/appointments",
            metadata: job.payload,
          });

          result = {
            channel: "in_app",
            recipient: job.userId,
            status: "delivered",
            provider: "in-app",
          };
        } else if (job.channel === "email" && payload.userEmail) {
          const email = renderAppointmentReminderEmail({
            patientName: payload.patientName ?? "Patient",
            hospitalName: payload.hospitalName ?? "Hospital",
            departmentName: payload.departmentName ?? "OPD",
            doctorName: payload.doctorName ?? "Doctor",
            scheduledAt: payload.scheduledAt ?? "",
            digitalToken: payload.digitalToken,
            minutesBefore: payload.minutesBefore ?? 60,
            appUrl: this.appUrl,
          });
          email.to = payload.userEmail;
          result = await this.emailProvider.sendEmail(email);
        } else if (job.channel === "push") {
          const subs = this.repository.findPushSubscriptions(job.userId);
          if (subs.length > 0) {
            result = await this.pushProvider.sendPush(subs[0], {
              title: "Appointment Reminder",
              body: `Your appointment is scheduled for ${payload.scheduledAt}. Token: ${payload.digitalToken || "N/A"}.`,
              url: `${this.appUrl}/citizen/appointments`,
            });
          } else {
            result = {
              channel: "push",
              recipient: job.userId,
              status: "failed",
              provider: "push",
              errorMessage: "No active push subscriptions found for user.",
            };
          }
        } else if (job.channel === "sms" && payload.phoneNumber) {
          result = await this.smsProvider.sendSms({
            phoneNumber: payload.phoneNumber,
            message: `Pulse AI Reminder: Appointment at ${payload.hospitalName} scheduled for ${payload.scheduledAt}. Token: ${payload.digitalToken || "N/A"}.`,
          });
        } else {
          result = {
            channel: job.channel,
            recipient: job.userId,
            status: "failed",
            provider: "none",
            errorMessage: "Missing recipient details for channel.",
          };
        }

        const attempt: DeliveryAttemptRecord = {
          id: randomUUID(),
          scheduledNotificationId: job.id,
          channel: job.channel,
          recipient: result.recipient,
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          status: result.status,
          errorMessage: result.errorMessage,
          metadata: { attempts: job.attempts },
          createdAt: this.now().toISOString(),
        };
        this.repository.recordDeliveryAttempt(attempt);

        if (result.status === "delivered" || result.status === "accepted") {
          job.status = "completed";
          completed++;
        } else {
          job.status = job.attempts >= job.maxAttempts ? "failed" : "pending";
          job.lastError = result.errorMessage;
          failed++;
        }
      } catch (err) {
        job.status = job.attempts >= job.maxAttempts ? "failed" : "pending";
        job.lastError = err instanceof Error ? err.message : "Processing error";
        failed++;
      } finally {
        job.updatedAt = this.now().toISOString();
        this.repository.saveScheduledJob(job);
      }
    }

    return { processed: dueJobs.length, completed, failed };
  }
}

export const notificationService = new NotificationService();
