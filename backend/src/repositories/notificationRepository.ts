import type {
  DeliveryAttemptRecord,
  InAppNotification,
  NotificationPreferences,
  PushSubscriptionRecord,
  ScheduledNotificationJob,
} from "../types/notifications.js";

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

  getPreferences(userId: string): NotificationPreferences | undefined {
    return this.cache.getPreferences(userId);
  }

  savePreferences(preferences: NotificationPreferences): void {
    this.cache.savePreferences(preferences);
  }

  getNotifications(userId: string): InAppNotification[] {
    return this.cache.getNotifications(userId);
  }

  findNotification(id: string): InAppNotification | undefined {
    return this.cache.findNotification(id);
  }

  saveNotification(notification: InAppNotification): void {
    this.cache.saveNotification(notification);
  }

  markNotificationRead(
    userId: string,
    notificationId: string,
    readAt: string,
  ): InAppNotification | undefined {
    return this.cache.markNotificationRead(userId, notificationId, readAt);
  }

  markAllNotificationsRead(userId: string, readAt: string): number {
    return this.cache.markAllNotificationsRead(userId, readAt);
  }

  getUnreadCount(userId: string): number {
    return this.cache.getUnreadCount(userId);
  }

  savePushSubscription(sub: PushSubscriptionRecord): void {
    this.cache.savePushSubscription(sub);
  }

  findPushSubscriptions(userId: string): PushSubscriptionRecord[] {
    return this.cache.findPushSubscriptions(userId);
  }

  deactivatePushSubscription(userId: string, endpoint: string): boolean {
    return this.cache.deactivatePushSubscription(userId, endpoint);
  }

  saveScheduledJob(job: ScheduledNotificationJob): void {
    this.cache.saveScheduledJob(job);
  }

  findScheduledJob(id: string): ScheduledNotificationJob | undefined {
    return this.cache.findScheduledJob(id);
  }

  findDueJobs(now: string, limit?: number): ScheduledNotificationJob[] {
    return this.cache.findDueJobs(now, limit);
  }

  cancelPendingJobsForAppointment(appointmentId: string): number {
    return this.cache.cancelPendingJobsForAppointment(appointmentId);
  }

  recordDeliveryAttempt(attempt: DeliveryAttemptRecord): void {
    this.cache.recordDeliveryAttempt(attempt);
  }

  getDeliveryAttempts(jobId?: string): DeliveryAttemptRecord[] {
    return this.cache.getDeliveryAttempts(jobId);
  }

  reset(): void {
    this.cache.reset();
  }
}
