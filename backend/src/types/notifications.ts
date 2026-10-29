export type NotificationType =
  | "appointment_confirmed"
  | "appointment_reminder"
  | "appointment_rescheduled"
  | "appointment_cancelled"
  | "queue_registered"
  | "queue_approaching_turn"
  | "queue_called"
  | "queue_delayed"
  | "queue_paused"
  | "queue_resumed"
  | "consultation_completed";

export type NotificationChannel = "in_app" | "email" | "push" | "sms";

export type NotificationJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type DeliveryStatus =
  | "pending"
  | "accepted"
  | "delivered"
  | "failed"
  | "bounced";

export interface NotificationPreferences {
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  smsEnabled: boolean;
  inAppEnabled: boolean;
  reminderIntervals: number[]; // in minutes, e.g. [1440, 60, 15]
  notifyApproachingTurn: boolean;
  notifyDelay: boolean;
  notifyAppointmentChanges: boolean;
  phoneNumber?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePreferencesInput {
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  smsEnabled?: boolean;
  inAppEnabled?: boolean;
  reminderIntervals?: number[];
  notifyApproachingTurn?: boolean;
  notifyDelay?: boolean;
  notifyAppointmentChanges?: boolean;
  phoneNumber?: string | null;
}

export interface InAppNotification {
  id: string;
  userId: string;
  appointmentId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  metadata: Record<string, unknown>;
  read: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface CreateInAppNotificationInput {
  userId: string;
  appointmentId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledNotificationJob {
  id: string;
  idempotencyKey: string;
  userId: string;
  appointmentId?: string | null;
  eventType: NotificationType;
  channel: NotificationChannel;
  scheduledFor: string;
  status: NotificationJobStatus;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: string | null;
  lastError?: string | null;
  payload: Record<string, unknown>;
  claimedAt?: string | null;
  claimedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryAttemptRecord {
  id: string;
  scheduledNotificationId?: string | null;
  channel: NotificationChannel;
  recipient: string;
  provider: string;
  providerMessageId?: string | null;
  status: DeliveryStatus;
  errorMessage?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface NotificationDispatchResult {
  channel: NotificationChannel;
  recipient: string;
  status: DeliveryStatus;
  provider: string;
  providerMessageId?: string;
  errorMessage?: string;
}
