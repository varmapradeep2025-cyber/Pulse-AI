import type { NotificationDispatchResult } from "../../types/notifications.js";
import type { SmsMessage, SmsProvider } from "./smsProvider.js";

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export class TelegramNotificationProvider implements SmsProvider {
  readonly name = "telegram";

  constructor(
    private readonly botToken: string,
    private readonly defaultChatId?: string,
    private readonly appUrl: string = "https://pulse-ai-ruby.vercel.app",
  ) {}

  async sendSms(message: SmsMessage): Promise<NotificationDispatchResult> {
    const rawRecipient = message.phoneNumber ? message.phoneNumber.trim() : "";

    // If recipient is a numeric chat ID (positive user ID or negative group ID), prioritize it;
    // otherwise fallback to the configured defaultChatId
    let targetChatId = this.defaultChatId;
    if (rawRecipient && /^-?\d{5,}$/.test(rawRecipient)) {
      targetChatId = rawRecipient;
    }

    if (!targetChatId) {
      const errorMsg =
        "No Telegram chat ID provided and TELEGRAM_CHAT_ID is not set in backend environment.";
      console.warn(`[Telegram] Dispatch skipped: ${errorMsg}`);
      return {
        channel: "sms",
        recipient: rawRecipient || "unknown",
        status: "failed",
        provider: this.name,
        errorMessage: errorMsg,
      };
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const escapedBody = escapeHtml(message.message);
      const text = `🏥 <b>Pulse AI — Appointment & Queue Alert</b>\n\n${escapedBody}\n\n🔗 <a href="${this.appUrl}/citizen/appointments">Open Citizen Queue Portal</a>`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: targetChatId,
          text,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🎫 Open Citizen Queue Portal",
                  url: `${this.appUrl}/citizen/appointments`,
                },
              ],
            ],
          },
        }),
      });

      const data = (await response.json()) as {
        ok: boolean;
        result?: { message_id: number };
        description?: string;
      };

      if (!response.ok || !data.ok) {
        const errorMsg = data.description || `Telegram HTTP ${response.status}`;
        console.warn(`[Telegram] Delivery failed to chat ${targetChatId}: ${errorMsg}`);
        return {
          channel: "sms",
          recipient: targetChatId,
          status: "failed",
          provider: this.name,
          errorMessage: errorMsg,
        };
      }

      console.log(
        `[Telegram] Notification successfully delivered to chat ${targetChatId}! Message ID: ${data.result?.message_id}`,
      );
      return {
        channel: "sms",
        recipient: targetChatId,
        status: "accepted",
        provider: this.name,
        providerMessageId: String(data.result?.message_id ?? Date.now()),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Network error";
      console.warn(`[Telegram] Network error delivering to ${targetChatId}: ${errorMsg}`);
      return {
        channel: "sms",
        recipient: targetChatId,
        status: "failed",
        provider: this.name,
        errorMessage: errorMsg,
      };
    }
  }
}
