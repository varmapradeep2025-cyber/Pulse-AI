import type {
  DeliveryStatus,
  NotificationDispatchResult,
} from "../../types/notifications.js";

export interface SmsMessage {
  phoneNumber: string; // E.164, e.g. +919876543210
  message: string;
  templateId?: string;
}

export interface SmsProvider {
  readonly name: string;
  sendSms(message: SmsMessage): Promise<NotificationDispatchResult>;
}

export function normalizeIndianPhoneNumber(input: string): string | null {
  const digits = input.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }

  if (input.startsWith("+") && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

export class MockSmsProvider implements SmsProvider {
  readonly name = "mock-sms";
  public sentMessages: SmsMessage[] = [];

  async sendSms(message: SmsMessage): Promise<NotificationDispatchResult> {
    const normalized = normalizeIndianPhoneNumber(message.phoneNumber);

    if (!normalized) {
      return {
        channel: "sms",
        recipient: message.phoneNumber,
        status: "failed",
        provider: this.name,
        errorMessage: "Invalid phone number format. Expected valid 10-digit or E.164 number.",
      };
    }

    this.sentMessages.push({ ...message, phoneNumber: normalized });

    return {
      channel: "sms",
      recipient: normalized,
      status: "delivered",
      provider: this.name,
      providerMessageId: `mock-sms-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    };
  }

  clear(): void {
    this.sentMessages = [];
  }
}

export class ExotelSmsProvider implements SmsProvider {
  readonly name = "exotel";

  constructor(
    private readonly accountSid?: string,
    private readonly apiKey?: string,
    private readonly apiToken?: string,
    private readonly subDomain: string = "api.exotel.com",
    private readonly senderId: string = "PULSEH",
  ) {}

  async sendSms(message: SmsMessage): Promise<NotificationDispatchResult> {
    const normalized = normalizeIndianPhoneNumber(message.phoneNumber);

    if (!normalized) {
      return {
        channel: "sms",
        recipient: message.phoneNumber,
        status: "failed",
        provider: this.name,
        errorMessage: "Invalid phone number format. Expected 10-digit Indian number.",
      };
    }

    if (!this.accountSid || !this.apiKey || !this.apiToken) {
      return {
        channel: "sms",
        recipient: normalized,
        status: "failed",
        provider: this.name,
        errorMessage:
          "Exotel credentials not configured in backend environment. SMS dispatch skipped.",
      };
    }

    try {
      const auth = Buffer.from(`${this.apiKey}:${this.apiToken}`).toString("base64");
      const url = `https://${this.subDomain}/v1/Accounts/${this.accountSid}/Sms/send.json`;

      const formData = new URLSearchParams();
      formData.append("From", this.senderId);
      formData.append("To", normalized);
      formData.append("Body", message.message);
      if (message.templateId) {
        formData.append("DltTemplateId", message.templateId);
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          channel: "sms",
          recipient: normalized,
          status: "failed",
          provider: this.name,
          errorMessage: `Exotel HTTP ${response.status}: ${errorText}`,
        };
      }

      const data = (await response.json()) as { SMSMessage?: { Sid?: string } };

      return {
        channel: "sms",
        recipient: normalized,
        status: "accepted",
        provider: this.name,
        providerMessageId: data.SMSMessage?.Sid ?? `exotel-${Date.now()}`,
      };
    } catch (error) {
      return {
        channel: "sms",
        recipient: normalized,
        status: "failed",
        provider: this.name,
        errorMessage:
          error instanceof Error ? error.message : "Unknown network error",
      };
    }
  }
}
