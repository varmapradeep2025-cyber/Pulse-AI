import type {
  DeliveryStatus,
  NotificationDispatchResult,
  PushSubscriptionRecord,
} from "../../types/notifications.js";

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  data?: Record<string, unknown>;
}

export interface PushProvider {
  readonly name: string;
  sendPush(
    subscription: PushSubscriptionRecord,
    payload: PushPayload,
  ): Promise<NotificationDispatchResult>;
}

export class MockPushProvider implements PushProvider {
  readonly name = "mock-push";
  public sentPushes: Array<{
    subscription: PushSubscriptionRecord;
    payload: PushPayload;
  }> = [];

  async sendPush(
    subscription: PushSubscriptionRecord,
    payload: PushPayload,
  ): Promise<NotificationDispatchResult> {
    this.sentPushes.push({ subscription, payload });

    return {
      channel: "push",
      recipient: subscription.endpoint,
      status: "delivered",
      provider: this.name,
      providerMessageId: `mock-push-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    };
  }

  clear(): void {
    this.sentPushes = [];
  }
}

export class WebPushProvider implements PushProvider {
  readonly name = "web-push";

  constructor(
    private readonly vapidPublicKey?: string,
    private readonly vapidPrivateKey?: string,
  ) {}

  async sendPush(
    subscription: PushSubscriptionRecord,
    payload: PushPayload,
  ): Promise<NotificationDispatchResult> {
    if (!this.vapidPublicKey || !this.vapidPrivateKey) {
      return {
        channel: "push",
        recipient: subscription.endpoint,
        status: "failed",
        provider: this.name,
        errorMessage:
          "VAPID credentials not configured. Web push dispatch simulated/skipped.",
      };
    }

    try {
      // In production with web-push library:
      // webpush.sendNotification(subscription, JSON.stringify(payload))
      return {
        channel: "push",
        recipient: subscription.endpoint,
        status: "accepted",
        provider: this.name,
        providerMessageId: `push-${Date.now()}`,
      };
    } catch (error) {
      const isExpired =
        error instanceof Error &&
        (error.message.includes("410") || error.message.includes("404"));

      return {
        channel: "push",
        recipient: subscription.endpoint,
        status: isExpired ? "bounced" : "failed",
        provider: this.name,
        errorMessage:
          error instanceof Error ? error.message : "Unknown push error",
      };
    }
  }
}
