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

/* ------------------------------------------------------------------ */
/* Fast2SMS Provider (India — free tier, no TRAI DLT needed for dev)  */
/* Sign up at https://www.fast2sms.com → Dev API → copy API Key       */
/* ------------------------------------------------------------------ */

export class Fast2SMSProvider implements SmsProvider {
  readonly name = "fast2sms";

  constructor(private readonly apiKey?: string) {}

  async sendSms(message: SmsMessage): Promise<NotificationDispatchResult> {
    const normalized = normalizeIndianPhoneNumber(message.phoneNumber);

    if (!normalized) {
      return {
        channel: "sms",
        recipient: message.phoneNumber,
        status: "failed",
        provider: this.name,
        errorMessage:
          "Invalid phone number. Expected a 10-digit Indian mobile number.",
      };
    }

    if (!this.apiKey) {
      return {
        channel: "sms",
        recipient: normalized,
        status: "failed",
        provider: this.name,
        errorMessage:
          "FAST2SMS_API_KEY is not configured in backend environment. SMS sending skipped.",
      };
    }

    // Fast2SMS Quick SMS (no template required)
    // Strips the +91 prefix — Fast2SMS expects 10-digit numbers
    const tenDigit = normalized.replace(/^\+91/, "");

    try {
      const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
        method: "POST",
        headers: {
          authorization: this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          route: "q",          // Quick / dev route
          message: message.message.slice(0, 160),
          language: "english",
          flash: 0,
          numbers: tenDigit,
        }),
      });

      const data = (await response.json()) as {
        return?: boolean;
        status_code?: number;
        request_id?: string;
        message?: string | string[];
      };

      if (!response.ok || !data.return) {
        const errorMsg = data.message
          ? (Array.isArray(data.message) ? data.message.join(", ") : String(data.message))
          : `HTTP ${response.status}`;
        console.warn(`[SMS Fast2SMS] Delivery failed to ${tenDigit}: ${errorMsg}`);
        return {
          channel: "sms",
          recipient: normalized,
          status: "failed",
          provider: this.name,
          errorMessage: `Fast2SMS error: ${errorMsg}`,
        };
      }

      console.log(`[SMS Fast2SMS] SMS successfully sent to ${tenDigit}! Request ID: ${data.request_id}`);

      return {
        channel: "sms",
        recipient: normalized,
        status: "accepted",
        provider: this.name,
        providerMessageId: data.request_id ?? `f2s-${Date.now()}`,
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

export class TwilioSmsProvider implements SmsProvider {
  readonly name = "twilio";

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string,
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

    if (!this.accountSid || !this.authToken || !this.fromNumber) {
      return {
        channel: "sms",
        recipient: normalized,
        status: "failed",
        provider: this.name,
        errorMessage: "Twilio credentials not configured in backend environment.",
      };
    }

    const isWhatsApp = this.fromNumber.startsWith("whatsapp:");
    const to = isWhatsApp ? `whatsapp:${normalized}` : normalized;

    try {
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;

      const formData = new URLSearchParams();
      formData.append("From", this.fromNumber);
      formData.append("To", to);
      formData.append("Body", message.message);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      const data = (await response.json()) as {
        sid?: string;
        error_code?: number | null;
        error_message?: string | null;
      };

      if (!response.ok || data.error_code) {
        const errorMsg = data.error_message || `Twilio HTTP ${response.status}`;
        console.warn(`[SMS Twilio] Delivery failed to ${normalized}: ${errorMsg}`);
        return {
          channel: "sms",
          recipient: normalized,
          status: "failed",
          provider: this.name,
          errorMessage: `Twilio error: ${errorMsg}`,
        };
      }

      console.log(`[SMS Twilio] ${isWhatsApp ? "WhatsApp" : "SMS"} successfully sent to ${normalized}! SID: ${data.sid}`);
      return {
        channel: "sms",
        recipient: normalized,
        status: "accepted",
        provider: this.name,
        providerMessageId: data.sid ?? `twilio-${Date.now()}`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown network error";
      console.warn(`[SMS Twilio] Network error: ${errorMsg}`);
      return {
        channel: "sms",
        recipient: normalized,
        status: "failed",
        provider: this.name,
        errorMessage: errorMsg,
      };
    }
  }
}
