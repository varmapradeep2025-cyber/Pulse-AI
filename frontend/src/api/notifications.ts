import { API_BASE_URL, accessToken, authHeaders } from "../lib/api";

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

export interface NotificationPreferences {
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  smsEnabled: boolean;
  inAppEnabled: boolean;
  reminderIntervals: number[];
  notifyApproachingTurn: boolean;
  notifyDelay: boolean;
  notifyAppointmentChanges: boolean;
  phoneNumber?: string | null;
}

export interface AssistantQueryResponse {
  success: boolean;
  source: string;
  answer: string;
  data?: Record<string, unknown>;
}

export async function getNotifications(): Promise<{
  notifications: InAppNotification[];
  unreadCount: number;
}> {
  const token = await accessToken();
  if (!token) {
    return { notifications: [], unreadCount: 0 };
  }

  const response = await fetch(`${API_BASE_URL}/api/notifications`, {
    headers: await authHeaders(),
  });

  if (!response.ok) {
    return { notifications: [], unreadCount: 0 };
  }

  const data = await response.json();
  return {
    notifications: data.notifications ?? [],
    unreadCount: data.unreadCount ?? 0,
  };
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const token = await accessToken();
  if (!token) return;

  await fetch(`${API_BASE_URL}/api/notifications/${id}/read`, {
    method: "PATCH",
    headers: await authHeaders(),
  });
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const token = await accessToken();
  if (!token) return;

  await fetch(`${API_BASE_URL}/api/notifications/mark-all-read`, {
    method: "POST",
    headers: await authHeaders(),
  });
}

export async function getNotificationPreferences(): Promise<NotificationPreferences | null> {
  const token = await accessToken();
  if (!token) return null;

  const response = await fetch(`${API_BASE_URL}/api/notifications/preferences`, {
    headers: await authHeaders(),
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data.preferences ?? null;
}

export async function updateNotificationPreferences(
  input: Partial<NotificationPreferences>,
): Promise<NotificationPreferences | null> {
  const token = await accessToken();
  if (!token) return null;

  const response = await fetch(`${API_BASE_URL}/api/notifications/preferences`, {
    method: "PUT",
    headers: {
      ...(await authHeaders()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data.preferences ?? null;
}

export async function registerPushSubscription(
  subscription: PushSubscriptionJSON,
): Promise<boolean> {
  const token = await accessToken();
  if (!token || !subscription.endpoint || !subscription.keys) return false;

  const response = await fetch(`${API_BASE_URL}/api/notifications/push/subscribe`, {
    method: "POST",
    headers: {
      ...(await authHeaders()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: navigator.userAgent,
    }),
  });

  return response.ok;
}

export async function queryLiveAssistant(input: {
  query: string;
  hospitalId?: string;
  departmentId?: string;
}): Promise<AssistantQueryResponse | null> {
  const token = await accessToken();
  if (!token) return null;

  const response = await fetch(`${API_BASE_URL}/api/appointments/assistant-query`, {
    method: "POST",
    headers: {
      ...(await authHeaders()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) return null;
  return response.json();
}
