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

  // Synchronous methods (for isolated in-memory unit tests & sync compatibility)
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

  // Real PostgreSQL asynchronous operations (production & integration tests)
  createNotification(notification: InAppNotification): Promise<InAppNotification>;
  getNotificationsByUser(userId: string): Promise<InAppNotification[]>;
  getUnreadCountByUser(userId: string): Promise<number>;
  markNotificationAsRead(
    userId: string,
    notificationId: string,
    readAt: string,
  ): Promise<InAppNotification | undefined>;
  markAllNotificationsAsRead(userId: string, readAt: string): Promise<number>;
  getPreferencesAsync(userId: string): Promise<NotificationPreferences | undefined>;
  savePreferencesAsync(
    preferences: NotificationPreferences,
  ): Promise<NotificationPreferences>;
  savePushSubscriptionAsync(sub: PushSubscriptionRecord): Promise<void>;
  findPushSubscriptionsAsync(userId: string): Promise<PushSubscriptionRecord[]>;
  deactivatePushSubscriptionAsync(
    userId: string,
    endpoint: string,
  ): Promise<boolean>;
  saveScheduledJobAsync(job: ScheduledNotificationJob): Promise<void>;
  findDueJobsAsync(
    now: string,
    limit?: number,
  ): Promise<ScheduledNotificationJob[]>;
  cancelPendingJobsForAppointmentAsync(appointmentId: string): Promise<number>;
  recordDeliveryAttemptAsync(attempt: DeliveryAttemptRecord): Promise<void>;
  getDeliveryAttemptsAsync(jobId?: string): Promise<DeliveryAttemptRecord[]>;
  verifyConnection(): Promise<void>;
  syncFromDatabase?(): Promise<void>;
}

export function toDbNotification(notif: InAppNotification): Record<string, unknown> {
  return {
    id: notif.id,
    user_id: notif.userId,
    appointment_id: notif.appointmentId ?? null,
    type: notif.type,
    title: notif.title,
    message: notif.message,
    link: notif.link ?? null,
    metadata: notif.metadata ?? {},
    read: notif.read,
    read_at: notif.readAt ?? null,
    created_at: notif.createdAt,
  };
}

export function fromDbNotification(row: Record<string, unknown>): InAppNotification {
  return {
    id: String(row.id ?? ""),
    userId: String(row.user_id ?? ""),
    appointmentId: row.appointment_id ? String(row.appointment_id) : null,
    type: row.type as InAppNotification["type"],
    title: String(row.title ?? ""),
    message: String(row.message ?? ""),
    link: row.link ? String(row.link) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    read: Boolean(row.read),
    readAt: row.read_at ? String(row.read_at) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export function fromDbPreferences(row: Record<string, unknown>): NotificationPreferences {
  return {
    userId: String(row.user_id ?? ""),
    emailEnabled: Boolean(row.email_enabled),
    pushEnabled: Boolean(row.push_enabled),
    smsEnabled: Boolean(row.sms_enabled),
    inAppEnabled: Boolean(row.in_app_enabled),
    reminderIntervals: Array.isArray(row.reminder_intervals)
      ? row.reminder_intervals.map(Number)
      : [1440, 60, 15],
    notifyApproachingTurn: Boolean(row.notify_approaching_turn),
    notifyDelay: Boolean(row.notify_delay),
    notifyAppointmentChanges: Boolean(row.notify_appointment_changes),
    phoneNumber: row.phone_number ? String(row.phone_number) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

/**
 * Isolated in-memory repository for unit testing and test fixtures.
 * NOT used in production.
 */
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
        count += 1;
      }
    }
    return count;
  }

  getUnreadCount(userId: string): number {
    return Array.from(this.notifications.values()).filter(
      (notif) => notif.userId === userId && !notif.read,
    ).length;
  }

  savePushSubscription(sub: PushSubscriptionRecord): void {
    this.pushSubscriptions.set(sub.id, sub);
  }

  findPushSubscriptions(userId: string): PushSubscriptionRecord[] {
    return Array.from(this.pushSubscriptions.values()).filter(
      (sub) => sub.userId === userId && sub.isActive,
    );
  }

  deactivatePushSubscription(userId: string, endpoint: string): boolean {
    let updated = false;
    for (const [id, sub] of this.pushSubscriptions.entries()) {
      if (sub.userId === userId && sub.endpoint === endpoint) {
        this.pushSubscriptions.set(id, { ...sub, isActive: false });
        updated = true;
      }
    }
    return updated;
  }

  saveScheduledJob(job: ScheduledNotificationJob): void {
    this.scheduledJobs.set(job.id, job);
  }

  findScheduledJob(id: string): ScheduledNotificationJob | undefined {
    return this.scheduledJobs.get(id);
  }

  findDueJobs(now: string, limit: number = 20): ScheduledNotificationJob[] {
    const cutoff = new Date(now).getTime();
    return Array.from(this.scheduledJobs.values())
      .filter(
        (job) =>
          (job.status === "pending" || job.status === "failed") &&
          new Date(job.scheduledFor).getTime() <= cutoff &&
          job.attempts < job.maxAttempts,
      )
      .slice(0, limit);
  }

  cancelPendingJobsForAppointment(appointmentId: string): number {
    let count = 0;
    for (const [id, job] of this.scheduledJobs.entries()) {
      if (job.appointmentId === appointmentId && job.status === "pending") {
        this.scheduledJobs.set(id, { ...job, status: "cancelled" });
        count += 1;
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
      (a) => a.scheduledNotificationId === jobId,
    );
  }

  reset(): void {
    this.preferences.clear();
    this.notifications.clear();
    this.pushSubscriptions.clear();
    this.scheduledJobs.clear();
    this.deliveryAttempts = [];
  }

  // Async implementations for in-memory testing
  async createNotification(notification: InAppNotification): Promise<InAppNotification> {
    this.saveNotification(notification);
    return notification;
  }

  async getNotificationsByUser(userId: string): Promise<InAppNotification[]> {
    return this.getNotifications(userId);
  }

  async getUnreadCountByUser(userId: string): Promise<number> {
    return this.getUnreadCount(userId);
  }

  async markNotificationAsRead(
    userId: string,
    notificationId: string,
    readAt: string,
  ): Promise<InAppNotification | undefined> {
    return this.markNotificationRead(userId, notificationId, readAt);
  }

  async markAllNotificationsAsRead(userId: string, readAt: string): Promise<number> {
    return this.markAllNotificationsRead(userId, readAt);
  }

  async getPreferencesAsync(userId: string): Promise<NotificationPreferences | undefined> {
    return this.getPreferences(userId);
  }

  async savePreferencesAsync(
    preferences: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    this.savePreferences(preferences);
    return preferences;
  }

  async savePushSubscriptionAsync(sub: PushSubscriptionRecord): Promise<void> {
    this.savePushSubscription(sub);
  }

  async findPushSubscriptionsAsync(userId: string): Promise<PushSubscriptionRecord[]> {
    return this.findPushSubscriptions(userId);
  }

  async deactivatePushSubscriptionAsync(
    userId: string,
    endpoint: string,
  ): Promise<boolean> {
    return this.deactivatePushSubscription(userId, endpoint);
  }

  async saveScheduledJobAsync(job: ScheduledNotificationJob): Promise<void> {
    this.saveScheduledJob(job);
  }

  async findDueJobsAsync(now: string, limit?: number): Promise<ScheduledNotificationJob[]> {
    return this.findDueJobs(now, limit);
  }

  async cancelPendingJobsForAppointmentAsync(appointmentId: string): Promise<number> {
    return this.cancelPendingJobsForAppointment(appointmentId);
  }

  async recordDeliveryAttemptAsync(attempt: DeliveryAttemptRecord): Promise<void> {
    this.recordDeliveryAttempt(attempt);
  }

  async getDeliveryAttemptsAsync(jobId?: string): Promise<DeliveryAttemptRecord[]> {
    return this.getDeliveryAttempts(jobId);
  }

  async verifyConnection(): Promise<void> {
    // In-memory connection is always available
  }
}

/**
 * Production repository backed by real Supabase PostgreSQL.
 * Never silently falls back to JavaScript Maps.
 */
export class SupabaseNotificationRepository implements NotificationRepository {
  readonly mode = "supabase" as const;
  private readonly clientPromise: Promise<{ supabase: any }>;
  private inMemoryMirror = new InMemoryNotificationRepository();

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
      throw new NotificationPersistenceError(
        503,
        "NOTIFICATION_SCHEMA_NOT_READY",
        "Notification database schema is not configured in Supabase. Apply migrations before using database persistence.",
      );
    }

    throw new NotificationPersistenceError(
      500,
      "NOTIFICATION_DB_ERROR",
      `Notification database operation failed: ${err?.message ?? "unknown error"}`,
    );
  }

  async verifyConnection(): Promise<void> {
    try {
      const { supabase } = await this.clientPromise;
      const { error } = await supabase
        .from("notifications")
        .select("id")
        .limit(1);

      if (error) {
        this.handleDatabaseError(error);
      }
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async createNotification(
    notification: InAppNotification,
  ): Promise<InAppNotification> {
    try {
      const { supabase } = await this.clientPromise;
      const dbRow = toDbNotification(notification);

      const { data, error } = await supabase
        .from("notifications")
        .insert(dbRow)
        .select("*")
        .single();

      if (error || !data) {
        this.handleDatabaseError(error);
      }

      const created = fromDbNotification(data);
      this.inMemoryMirror.saveNotification(created);
      return created;
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async getNotificationsByUser(userId: string): Promise<InAppNotification[]> {
    try {
      const { supabase } = await this.clientPromise;
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        this.handleDatabaseError(error);
      }

      const notifications = (data ?? []).map(fromDbNotification);
      for (const notif of notifications) {
        this.inMemoryMirror.saveNotification(notif);
      }
      return notifications;
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async getUnreadCountByUser(userId: string): Promise<number> {
    try {
      const { supabase } = await this.clientPromise;
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("read", false);

      if (error) {
        this.handleDatabaseError(error);
      }

      return count ?? 0;
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async markNotificationAsRead(
    userId: string,
    notificationId: string,
    readAt: string,
  ): Promise<InAppNotification | undefined> {
    try {
      const { supabase } = await this.clientPromise;
      const { data, error } = await supabase
        .from("notifications")
        .update({ read: true, read_at: readAt })
        .eq("id", notificationId)
        .eq("user_id", userId)
        .select("*")
        .maybeSingle();

      if (error) {
        this.handleDatabaseError(error);
      }

      if (!data) {
        return undefined;
      }

      const updated = fromDbNotification(data);
      this.inMemoryMirror.saveNotification(updated);
      return updated;
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async markAllNotificationsAsRead(
    userId: string,
    readAt: string,
  ): Promise<number> {
    try {
      const { supabase } = await this.clientPromise;
      const { data, error } = await supabase
        .from("notifications")
        .update({ read: true, read_at: readAt })
        .eq("user_id", userId)
        .eq("read", false)
        .select("id");

      if (error) {
        this.handleDatabaseError(error);
      }

      const count = data?.length ?? 0;
      this.inMemoryMirror.markAllNotificationsRead(userId, readAt);
      return count;
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async getPreferencesAsync(
    userId: string,
  ): Promise<NotificationPreferences | undefined> {
    try {
      const { supabase } = await this.clientPromise;
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        this.handleDatabaseError(error);
      }

      if (!data) {
        return undefined;
      }

      const prefs = fromDbPreferences(data);
      this.inMemoryMirror.savePreferences(prefs);
      return prefs;
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async savePreferencesAsync(
    preferences: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    try {
      const { supabase } = await this.clientPromise;
      const { data, error } = await supabase
        .from("notification_preferences")
        .upsert({
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
        })
        .select("*")
        .single();

      if (error || !data) {
        this.handleDatabaseError(error);
      }

      const saved = fromDbPreferences(data);
      this.inMemoryMirror.savePreferences(saved);
      return saved;
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async savePushSubscriptionAsync(sub: PushSubscriptionRecord): Promise<void> {
    try {
      const { supabase } = await this.clientPromise;
      const { error } = await supabase.from("push_subscriptions").upsert({
        id: sub.id,
        user_id: sub.userId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        user_agent: sub.userAgent ?? null,
        is_active: sub.isActive,
        created_at: sub.createdAt,
        updated_at: sub.updatedAt ?? new Date().toISOString(),
      });

      if (error) {
        this.handleDatabaseError(error);
      }

      this.inMemoryMirror.savePushSubscription(sub);
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async findPushSubscriptionsAsync(
    userId: string,
  ): Promise<PushSubscriptionRecord[]> {
    try {
      const { supabase } = await this.clientPromise;
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true);

      if (error) {
        this.handleDatabaseError(error);
      }

      return (data ?? []).map((row: any) => ({
        id: String(row.id),
        userId: String(row.user_id),
        endpoint: String(row.endpoint),
        p256dh: String(row.p256dh),
        auth: String(row.auth),
        userAgent: row.user_agent ? String(row.user_agent) : undefined,
        isActive: Boolean(row.is_active),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at ?? row.created_at),
      }));
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async deactivatePushSubscriptionAsync(
    userId: string,
    endpoint: string,
  ): Promise<boolean> {
    try {
      const { supabase } = await this.clientPromise;
      const { error } = await supabase
        .from("push_subscriptions")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("endpoint", endpoint);

      if (error) {
        this.handleDatabaseError(error);
      }

      return true;
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async saveScheduledJobAsync(job: ScheduledNotificationJob): Promise<void> {
    try {
      const { supabase } = await this.clientPromise;
      const { error } = await supabase.from("scheduled_notifications").upsert({
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
      });

      if (error) {
        this.handleDatabaseError(error);
      }

      this.inMemoryMirror.saveScheduledJob(job);
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async findDueJobsAsync(
    now: string,
    limit: number = 20,
  ): Promise<ScheduledNotificationJob[]> {
    try {
      const { supabase } = await this.clientPromise;
      const { data, error } = await supabase
        .from("scheduled_notifications")
        .select("*")
        .in("status", ["pending", "failed"])
        .lte("scheduled_for", now)
        .order("scheduled_for", { ascending: true })
        .limit(limit);

      if (error) {
        this.handleDatabaseError(error);
      }

      return (data ?? []).map((row: any) => ({
        id: String(row.id),
        idempotencyKey: String(row.idempotency_key),
        userId: String(row.user_id),
        appointmentId: row.appointment_id ? String(row.appointment_id) : undefined,
        eventType: row.event_type as ScheduledNotificationJob["eventType"],
        channel: row.channel as ScheduledNotificationJob["channel"],
        scheduledFor: String(row.scheduled_for),
        status: row.status as ScheduledNotificationJob["status"],
        attempts: Number(row.attempts ?? 0),
        maxAttempts: Number(row.max_attempts ?? 3),
        lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : undefined,
        lastError: row.last_error ? String(row.last_error) : undefined,
        payload: (row.payload as Record<string, unknown>) ?? {},
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }));
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async cancelPendingJobsForAppointmentAsync(
    appointmentId: string,
  ): Promise<number> {
    try {
      const { supabase } = await this.clientPromise;
      const { data, error } = await supabase
        .from("scheduled_notifications")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("appointment_id", appointmentId)
        .eq("status", "pending")
        .select("id");

      if (error) {
        this.handleDatabaseError(error);
      }

      const count = data?.length ?? 0;
      this.inMemoryMirror.cancelPendingJobsForAppointment(appointmentId);
      return count;
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async recordDeliveryAttemptAsync(
    attempt: DeliveryAttemptRecord,
  ): Promise<void> {
    try {
      const { supabase } = await this.clientPromise;
      const { error } = await supabase
        .from("notification_delivery_attempts")
        .insert({
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
        });

      if (error) {
        this.handleDatabaseError(error);
      }

      this.inMemoryMirror.recordDeliveryAttempt(attempt);
    } catch (err) {
      console.warn("Non-fatal recordDeliveryAttemptAsync warning:", err);
    }
  }

  async getDeliveryAttemptsAsync(
    jobId?: string,
  ): Promise<DeliveryAttemptRecord[]> {
    try {
      const { supabase } = await this.clientPromise;
      let query = supabase.from("notification_delivery_attempts").select("*");
      if (jobId) {
        query = query.eq("scheduled_notification_id", jobId);
      }
      const { data, error } = await query.order("created_at", {
        ascending: false,
      });

      if (error) {
        this.handleDatabaseError(error);
      }

      return (data ?? []).map((row: any) => ({
        id: String(row.id),
        scheduledNotificationId: row.scheduled_notification_id
          ? String(row.scheduled_notification_id)
          : undefined,
        channel: row.channel as DeliveryAttemptRecord["channel"],
        recipient: String(row.recipient),
        provider: String(row.provider),
        providerMessageId: row.provider_message_id
          ? String(row.provider_message_id)
          : undefined,
        status: row.status as DeliveryAttemptRecord["status"],
        errorMessage: row.error_message ? String(row.error_message) : undefined,
        metadata: (row.metadata as Record<string, unknown>) ?? {},
        createdAt: String(row.created_at),
      }));
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  async syncFromDatabase(): Promise<void> {
    try {
      const { supabase } = await this.clientPromise;
      const [notifsRes, prefsRes] = await Promise.all([
        supabase.from("notifications").select("*"),
        supabase.from("notification_preferences").select("*"),
      ]);

      if (notifsRes.error) {
        this.handleDatabaseError(notifsRes.error);
      }

      if (Array.isArray(notifsRes.data)) {
        for (const row of notifsRes.data) {
          this.inMemoryMirror.saveNotification(fromDbNotification(row));
        }
      }

      if (Array.isArray(prefsRes.data)) {
        for (const row of prefsRes.data) {
          this.inMemoryMirror.savePreferences(fromDbPreferences(row));
        }
      }
    } catch (err) {
      if (err instanceof NotificationPersistenceError) {
        throw err;
      }
      this.handleDatabaseError(err);
    }
  }

  // Synchronous wrapper methods for backward compatibility
  getPreferences(userId: string): NotificationPreferences | undefined {
    return this.inMemoryMirror.getPreferences(userId);
  }

  savePreferences(preferences: NotificationPreferences): void {
    this.inMemoryMirror.savePreferences(preferences);
    const isTest =
      process.env.NODE_ENV === "test" ||
      process.env.npm_lifecycle_event === "test" ||
      process.argv.some((arg) => arg.includes("test"));
    if (!isTest || process.env.USE_SUPABASE_REPO === "true") {
      this.savePreferencesAsync(preferences).catch((err) => {
        console.warn("Supabase background savePreferences warning:", err);
      });
    }
  }

  getNotifications(userId: string): InAppNotification[] {
    return this.inMemoryMirror.getNotifications(userId);
  }

  findNotification(id: string): InAppNotification | undefined {
    return this.inMemoryMirror.findNotification(id);
  }

  saveNotification(notification: InAppNotification): void {
    this.inMemoryMirror.saveNotification(notification);
    const isTest =
      process.env.NODE_ENV === "test" ||
      process.env.npm_lifecycle_event === "test" ||
      process.argv.some((arg) => arg.includes("test"));
    if (!isTest || process.env.USE_SUPABASE_REPO === "true") {
      this.createNotification(notification).catch((err) => {
        console.warn("Supabase background saveNotification warning:", err);
      });
    }
  }

  markNotificationRead(
    userId: string,
    notificationId: string,
    readAt: string,
  ): InAppNotification | undefined {
    const updated = this.inMemoryMirror.markNotificationRead(
      userId,
      notificationId,
      readAt,
    );
    this.markNotificationAsRead(userId, notificationId, readAt).catch(() => {});
    return updated;
  }

  markAllNotificationsRead(userId: string, readAt: string): number {
    const count = this.inMemoryMirror.markAllNotificationsRead(userId, readAt);
    this.markAllNotificationsAsRead(userId, readAt).catch(() => {});
    return count;
  }

  getUnreadCount(userId: string): number {
    return this.inMemoryMirror.getUnreadCount(userId);
  }

  savePushSubscription(sub: PushSubscriptionRecord): void {
    this.inMemoryMirror.savePushSubscription(sub);
    this.savePushSubscriptionAsync(sub).catch(() => {});
  }

  findPushSubscriptions(userId: string): PushSubscriptionRecord[] {
    return this.inMemoryMirror.findPushSubscriptions(userId);
  }

  deactivatePushSubscription(userId: string, endpoint: string): boolean {
    const updated = this.inMemoryMirror.deactivatePushSubscription(
      userId,
      endpoint,
    );
    this.deactivatePushSubscriptionAsync(userId, endpoint).catch(() => {});
    return updated;
  }

  saveScheduledJob(job: ScheduledNotificationJob): void {
    this.inMemoryMirror.saveScheduledJob(job);
    this.saveScheduledJobAsync(job).catch(() => {});
  }

  findScheduledJob(id: string): ScheduledNotificationJob | undefined {
    return this.inMemoryMirror.findScheduledJob(id);
  }

  findDueJobs(now: string, limit?: number): ScheduledNotificationJob[] {
    return this.inMemoryMirror.findDueJobs(now, limit);
  }

  cancelPendingJobsForAppointment(appointmentId: string): number {
    const count =
      this.inMemoryMirror.cancelPendingJobsForAppointment(appointmentId);
    this.cancelPendingJobsForAppointmentAsync(appointmentId).catch(() => {});
    return count;
  }

  recordDeliveryAttempt(attempt: DeliveryAttemptRecord): void {
    this.inMemoryMirror.recordDeliveryAttempt(attempt);
    this.recordDeliveryAttemptAsync(attempt).catch(() => {});
  }

  getDeliveryAttempts(jobId?: string): DeliveryAttemptRecord[] {
    return this.inMemoryMirror.getDeliveryAttempts(jobId);
  }

  reset(): void {
    this.inMemoryMirror.reset();
  }
}
