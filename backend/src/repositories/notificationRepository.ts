import type {
  DeliveryAttemptRecord,
  InAppNotification,
  NotificationPreferences,
  PushSubscriptionRecord,
  ScheduledNotificationJob,
} from "../types/notifications.js";

const MISSING_SCHEMA_CODES = new Set(["42P01", "PGRST202", "PGRST205"]);

export class NotificationPersistenceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "NotificationPersistenceError";
  }
}

export interface NotificationRepository {
  readonly mode: "memory" | "supabase";
  getPreferences(userId: string): NotificationPreferences | undefined;
  savePreferences(preferences: NotificationPreferences): void;
  getNotifications(userId: string): InAppNotification[];
  findNotification(id: string): InAppNotification | undefined;
  saveNotification(notification: InAppNotification): void;
  markNotificationRead(
    userId: string,
    notificationId: string,
    readAt: string,
  ): InAppNotification | undefined;
  markAllNotificationsRead(userId: string, readAt: string): number;
  getUnreadCount(userId: string): number;
  savePushSubscription(sub: PushSubscriptionRecord): void;
  findPushSubscriptions(userId: string): PushSubscriptionRecord[];
  deactivatePushSubscription(userId: string, endpoint: string): boolean;
  saveScheduledJob(job: ScheduledNotificationJob): void;
  findScheduledJob(id: string): ScheduledNotificationJob | undefined;
  findDueJobs(now: string, limit?: number): ScheduledNotificationJob[];
  cancelPendingJobsForAppointment(appointmentId: string): number;
  recordDeliveryAttempt(attempt: DeliveryAttemptRecord): void;
  getDeliveryAttempts(jobId?: string): DeliveryAttemptRecord[];
  reset(): void;
  // Optional async operations for direct database persistence
  savePreferencesAsync?(preferences: NotificationPreferences): Promise<void>;
  saveNotificationAsync?(notification: InAppNotification): Promise<void>;
  syncFromDatabase?(): Promise<void>;
}

export class InMemoryNotificationRepository implements NotificationRepository {
  readonly mode = "memory" as const;
  private preferences = new Map<string, NotificationPreferences>();
  private notifications = new Map<string, InAppNotification>();
  private pushSubscriptions = new Map<string, PushSubscriptionRecord>();
  private scheduledJobs = new Map<string, ScheduledNotificationJob>();
  private deliveryAttempts: DeliveryAttemptRecord[] = [];

  getPreferences(userId: string): NotificationPreferences | undefined {
    return this.preferences.get(userId);
  }

  savePreferences(preferences: NotificationPreferences): void {
    this.preferences.set(preferences.userId, preferences);
  }

  getNotifications(userId: string): InAppNotification[] {
    return Array.from(this.notifications.values())
      .filter((notif) => notif.userId === userId)
      .sort(
        (first, second) =>
          new Date(second.createdAt).getTime() -
          new Date(first.createdAt).getTime(),
      );
  }

  findNotification(id: string): InAppNotification | undefined {
    return this.notifications.get(id);
  }

  saveNotification(notification: InAppNotification): void {
    this.notifications.set(notification.id, notification);
  }

  markNotificationRead(
    userId: string,
    notificationId: string,
    readAt: string,
  ): InAppNotification | undefined {
    const notif = this.notifications.get(notificationId);
    if (!notif || notif.userId !== userId) {
      return undefined;
    }

    const updated: InAppNotification = {
      ...notif,
      read: true,
      readAt,
    };
    this.notifications.set(notificationId, updated);
    return updated;
  }

  markAllNotificationsRead(userId: string, readAt: string): number {
    let count = 0;
    for (const [id, notif] of this.notifications.entries()) {
      if (notif.userId === userId && !notif.read) {
        this.notifications.set(id, {
          ...notif,
          read: true,
          readAt,
        });
        count++;
      }
    }
    return count;
  }

  getUnreadCount(userId: string): number {
    let unread = 0;
    for (const notif of this.notifications.values()) {
      if (notif.userId === userId && !notif.read) {
        unread++;
      }
    }
    return unread;
  }

  savePushSubscription(sub: PushSubscriptionRecord): void {
    this.pushSubscriptions.set(sub.endpoint, sub);
  }

  findPushSubscriptions(userId: string): PushSubscriptionRecord[] {
    return Array.from(this.pushSubscriptions.values()).filter(
      (sub) => sub.userId === userId && sub.isActive,
    );
  }

  deactivatePushSubscription(userId: string, endpoint: string): boolean {
    const sub = this.pushSubscriptions.get(endpoint);
    if (!sub || sub.userId !== userId) {
      return false;
    }

    this.pushSubscriptions.set(endpoint, {
      ...sub,
      isActive: false,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  saveScheduledJob(job: ScheduledNotificationJob): void {
    this.scheduledJobs.set(job.idempotencyKey, job);
  }

  findScheduledJob(id: string): ScheduledNotificationJob | undefined {
    for (const job of this.scheduledJobs.values()) {
      if (job.id === id) {
        return job;
      }
    }
    return undefined;
  }

  findDueJobs(now: string, limit = 50): ScheduledNotificationJob[] {
    const nowTime = new Date(now).getTime();
    return Array.from(this.scheduledJobs.values())
      .filter(
        (job) =>
          (job.status === "pending" ||
            (job.status === "failed" && job.attempts < job.maxAttempts)) &&
          new Date(job.scheduledFor).getTime() <= nowTime,
      )
      .slice(0, limit);
  }

  cancelPendingJobsForAppointment(appointmentId: string): number {
    let count = 0;
    const now = new Date().toISOString();
    for (const [key, job] of this.scheduledJobs.entries()) {
      if (
        job.appointmentId === appointmentId &&
        (job.status === "pending" || job.status === "processing")
      ) {
        this.scheduledJobs.set(key, {
          ...job,
          status: "cancelled",
          updatedAt: now,
        });
        count++;
      }
    }
    return count;
  }

  recordDeliveryAttempt(attempt: DeliveryAttemptRecord): void {
    this.deliveryAttempts.push(attempt);
  }

  getDeliveryAttempts(jobId?: string): DeliveryAttemptRecord[] {
    if (!jobId) {
      return [...this.deliveryAttempts];
    }
    return this.deliveryAttempts.filter(
      (attempt) => attempt.scheduledNotificationId === jobId,
    );
  }

  reset(): void {
    this.preferences.clear();
    this.notifications.clear();
    this.pushSubscriptions.clear();
    this.scheduledJobs.clear();
    this.deliveryAttempts = [];
  }
}

export class SupabaseNotificationRepository implements NotificationRepository {
  readonly mode = "supabase" as const;
  private cache = new InMemoryNotificationRepository();

  private assertSchemaAvailable(error?: {
    code?: string;
    message?: string;
  }): never {
    if (
      error &&
      (MISSING_SCHEMA_CODES.has(error.code ?? "") ||
        error.message?.includes("does not exist"))
    ) {
      throw new NotificationPersistenceError(
        503,
        "NOTIFICATION_SCHEMA_NOT_READY",
        "Notification database storage is not configured yet. Apply migrations before using database persistence.",
      );
    }

    throw new NotificationPersistenceError(
      500,
      "NOTIFICATION_DB_ERROR",
      `Notification database query failed: ${error?.message ?? "unknown error"}`,
    );
  }

  getPreferences(userId: string): NotificationPreferences | undefined {
    return this.cache.getPreferences(userId);
  }

  savePreferences(preferences: NotificationPreferences): void {
    this.cache.savePreferences(preferences);
    this.savePreferencesAsync(preferences).catch((err) => {
      console.warn("Supabase background savePreferences warning:", err);
    });
  }

  async savePreferencesAsync(
    preferences: NotificationPreferences,
  ): Promise<void> {
    try {
      const { supabase } = await import("../utils/supabase.js");
      const { error } = await supabase.from("notification_preferences").upsert({
        user_id: preferences.userId,
        email_enabled: preferences.emailEnabled,
        push_enabled: preferences.pushEnabled,
        sms_enabled: preferences.smsEnabled,
        in_app_enabled: preferences.inAppEnabled,
        reminder_intervals: preferences.reminderIntervals,
        notify_approaching_turn: preferences.notifyApproachingTurn,
        notify_delay: preferences.notifyDelay,
        notify_appointment_changes: preferences.notifyAppointmentChanges,
        phone_number: preferences.phoneNumber ?? null,
        updated_at: new Date().toISOString(),
      });

      if (error) {
        this.assertSchemaAvailable(error);
      }
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.assertSchemaAvailable(err as { code?: string; message?: string });
    }
  }

  getNotifications(userId: string): InAppNotification[] {
    return this.cache.getNotifications(userId);
  }

  findNotification(id: string): InAppNotification | undefined {
    return this.cache.findNotification(id);
  }

  saveNotification(notification: InAppNotification): void {
    this.cache.saveNotification(notification);
    this.saveNotificationAsync(notification).catch((err) => {
      console.warn("Supabase background saveNotification warning:", err);
    });
  }

  async saveNotificationAsync(
    notification: InAppNotification,
  ): Promise<void> {
    try {
      const { supabase } = await import("../utils/supabase.js");
      const { error } = await supabase.from("notifications").upsert({
        id: notification.id,
        user_id: notification.userId,
        appointment_id: notification.appointmentId ?? null,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        link: notification.link ?? null,
        metadata: notification.metadata ?? {},
        read: notification.read,
        read_at: notification.readAt ?? null,
        created_at: notification.createdAt,
      });

      if (error) {
        this.assertSchemaAvailable(error);
      }
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.assertSchemaAvailable(err as { code?: string; message?: string });
    }
  }

  markNotificationRead(
    userId: string,
    notificationId: string,
    readAt: string,
  ): InAppNotification | undefined {
    const updated = this.cache.markNotificationRead(
      userId,
      notificationId,
      readAt,
    );
    import("../utils/supabase.js")
      .then(({ supabase }) =>
        supabase
          .from("notifications")
          .update({ read: true, read_at: readAt })
          .eq("id", notificationId)
          .eq("user_id", userId),
      )
      .catch((err) => {
        console.warn("Supabase background markNotificationRead warning:", err);
      });
    return updated;
  }

  markAllNotificationsRead(userId: string, readAt: string): number {
    const count = this.cache.markAllNotificationsRead(userId, readAt);
    import("../utils/supabase.js")
      .then(({ supabase }) =>
        supabase
          .from("notifications")
          .update({ read: true, read_at: readAt })
          .eq("user_id", userId)
          .eq("read", false),
      )
      .catch((err) => {
        console.warn(
          "Supabase background markAllNotificationsRead warning:",
          err,
        );
      });
    return count;
  }

  getUnreadCount(userId: string): number {
    return this.cache.getUnreadCount(userId);
  }

  savePushSubscription(sub: PushSubscriptionRecord): void {
    this.cache.savePushSubscription(sub);
    import("../utils/supabase.js")
      .then(({ supabase }) =>
        supabase.from("push_subscriptions").upsert({
          id: sub.id,
          user_id: sub.userId,
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
          user_agent: sub.userAgent ?? null,
          is_active: sub.isActive,
          created_at: sub.createdAt,
          updated_at: sub.updatedAt,
        }),
      )
      .catch((err) => {
        console.warn("Supabase background savePushSubscription warning:", err);
      });
  }

  findPushSubscriptions(userId: string): PushSubscriptionRecord[] {
    return this.cache.findPushSubscriptions(userId);
  }

  deactivatePushSubscription(userId: string, endpoint: string): boolean {
    const success = this.cache.deactivatePushSubscription(userId, endpoint);
    import("../utils/supabase.js")
      .then(({ supabase }) =>
        supabase
          .from("push_subscriptions")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("endpoint", endpoint),
      )
      .catch((err) => {
        console.warn(
          "Supabase background deactivatePushSubscription warning:",
          err,
        );
      });
    return success;
  }

  saveScheduledJob(job: ScheduledNotificationJob): void {
    this.cache.saveScheduledJob(job);
    import("../utils/supabase.js")
      .then(({ supabase }) =>
        supabase.from("scheduled_notifications").upsert({
          id: job.id,
          idempotency_key: job.idempotencyKey,
          user_id: job.userId,
          appointment_id: job.appointmentId ?? null,
          event_type: job.eventType,
          channel: job.channel,
          scheduled_for: job.scheduledFor,
          status: job.status,
          attempts: job.attempts,
          max_attempts: job.maxAttempts,
          last_attempt_at: job.lastAttemptAt ?? null,
          last_error: job.lastError ?? null,
          payload: job.payload ?? {},
          created_at: job.createdAt,
          updated_at: job.updatedAt,
        }),
      )
      .catch((err) => {
        console.warn("Supabase background saveScheduledJob warning:", err);
      });
  }

  findScheduledJob(id: string): ScheduledNotificationJob | undefined {
    return this.cache.findScheduledJob(id);
  }

  findDueJobs(now: string, limit = 50): ScheduledNotificationJob[] {
    return this.cache.findDueJobs(now, limit);
  }

  cancelPendingJobsForAppointment(appointmentId: string): number {
    const count = this.cache.cancelPendingJobsForAppointment(appointmentId);
    import("../utils/supabase.js")
      .then(({ supabase }) =>
        supabase
          .from("scheduled_notifications")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("appointment_id", appointmentId)
          .in("status", ["pending", "processing"]),
      )
      .catch((err) => {
        console.warn(
          "Supabase background cancelPendingJobs warning:",
          err,
        );
      });
    return count;
  }

  recordDeliveryAttempt(attempt: DeliveryAttemptRecord): void {
    this.cache.recordDeliveryAttempt(attempt);
    import("../utils/supabase.js")
      .then(({ supabase }) =>
        supabase.from("notification_delivery_attempts").insert({
          id: attempt.id,
          scheduled_notification_id: attempt.scheduledNotificationId ?? null,
          channel: attempt.channel,
          recipient: attempt.recipient,
          provider: attempt.provider,
          provider_message_id: attempt.providerMessageId ?? null,
          status: attempt.status,
          error_message: attempt.errorMessage ?? null,
          metadata: attempt.metadata ?? {},
          created_at: attempt.createdAt,
        }),
      )
      .catch((err) => {
        console.warn(
          "Supabase background recordDeliveryAttempt warning:",
          err,
        );
      });
  }

  getDeliveryAttempts(jobId?: string): DeliveryAttemptRecord[] {
    return this.cache.getDeliveryAttempts(jobId);
  }

  async syncFromDatabase(): Promise<void> {
    try {
      const { supabase } = await import("../utils/supabase.js");
      const { data, error } = await supabase.from("notifications").select("*");
      if (error) {
        this.assertSchemaAvailable(error);
      }
      if (Array.isArray(data)) {
        for (const row of data) {
          this.cache.saveNotification({
            id: String(row.id),
            userId: String(row.user_id),
            appointmentId: row.appointment_id
              ? String(row.appointment_id)
              : undefined,
            type: row.type,
            title: String(row.title),
            message: String(row.message),
            link: row.link ? String(row.link) : undefined,
            metadata: (row.metadata as Record<string, unknown>) ?? {},
            read: Boolean(row.read),
            readAt: row.read_at ? String(row.read_at) : undefined,
            createdAt: String(row.created_at),
          });
        }
      }
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.assertSchemaAvailable(err as { code?: string; message?: string });
    }
  }

  reset(): void {
    this.cache.reset();
  }
}
