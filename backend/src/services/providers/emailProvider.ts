import type {
  DeliveryStatus,
  NotificationDispatchResult,
} from "../../types/notifications.js";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  readonly name: string;
  sendEmail(message: EmailMessage): Promise<NotificationDispatchResult>;
}

export class MockEmailProvider implements EmailProvider {
  readonly name = "mock-email";
  public sentMessages: EmailMessage[] = [];

  async sendEmail(message: EmailMessage): Promise<NotificationDispatchResult> {
    this.sentMessages.push(message);

    return {
      channel: "email",
      recipient: message.to,
      status: "delivered",
      provider: this.name,
      providerMessageId: `mock-msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    };
  }

  clear(): void {
    this.sentMessages = [];
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";

  constructor(
    private readonly apiKey?: string,
    private readonly fromAddress: string = "Pulse AI <appointments@pulseai.health>",
  ) {}

  async sendEmail(message: EmailMessage): Promise<NotificationDispatchResult> {
    if (!this.apiKey) {
      return {
        channel: "email",
        recipient: message.to,
        status: "failed",
        provider: this.name,
        errorMessage:
          "RESEND_API_KEY is not configured in backend environment. Email sending skipped.",
      };
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          channel: "email",
          recipient: message.to,
          status: "failed",
          provider: this.name,
          errorMessage: `Resend HTTP ${response.status}: ${errorBody}`,
        };
      }

      const data = (await response.json()) as { id?: string };

      return {
        channel: "email",
        recipient: message.to,
        status: "accepted",
        provider: this.name,
        providerMessageId: data.id ?? `resend-${Date.now()}`,
      };
    } catch (error) {
      return {
        channel: "email",
        recipient: message.to,
        status: "failed",
        provider: this.name,
        errorMessage:
          error instanceof Error ? error.message : "Unknown network error",
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Branded Email Templates (HTML + Plain Text)                         */
/* ------------------------------------------------------------------ */

export function emailFrame(title: string, contentHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b132b; color: #e2e8f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #1c2541; border: 1px solid #3a506b; border-radius: 12px; overflow: hidden;">
    <tr>
      <td style="padding: 24px; background-color: #111d4a; border-bottom: 2px solid #48cae4;">
        <span style="font-size: 24px; margin-right: 8px;">🏥</span>
        <span style="font-size: 20px; font-weight: 700; color: #ffffff;">Pulse AI Healthcare</span>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px 24px; line-height: 1.6; color: #cbd5e1;">
        ${contentHtml}
      </td>
    </tr>
    <tr>
      <td style="padding: 16px 24px; background-color: #0d1b2a; border-top: 1px solid #1e293b; font-size: 12px; color: #94a3b8; text-align: center;">
        <p style="margin: 0 0 6px;">Pulse AI Prototype • Operational Healthcare Resilience Platform</p>
        <p style="margin: 0;">This is an automated operational notification. Waiting times are estimates and may vary.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderAppointmentConfirmedEmail(input: {
  patientName: string;
  hospitalName: string;
  departmentName: string;
  doctorName: string;
  scheduledAt: string;
  reference: string;
  digitalToken?: string | null;
  appUrl?: string;
}): EmailMessage {
  const tokenHtml = input.digitalToken
    ? `<div style="margin: 20px 0; padding: 16px; background-color: #0f172a; border-left: 4px solid #48cae4; border-radius: 8px;">
         <span style="font-size: 13px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px;">Your Digital Queue Token</span><br>
         <span style="font-size: 32px; font-weight: 800; color: #48cae4;">${input.digitalToken}</span>
       </div>`
    : "";

  const link = input.appUrl
    ? `<div style="margin-top: 24px;">
         <a href="${input.appUrl}/citizen/appointments" style="display: inline-block; padding: 12px 24px; background-color: #48cae4; color: #0b132b; font-weight: 700; text-decoration: none; border-radius: 6px;">Open Citizen Queue Portal</a>
       </div>`
    : "";

  const html = emailFrame(
    "Appointment Confirmed - Pulse AI",
    `<h2 style="color: #ffffff; margin-top: 0;">Appointment Confirmed</h2>
     <p>Dear <strong>${input.patientName}</strong>,</p>
     <p>Your outpatient clinic appointment has been successfully scheduled:</p>
     <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
       <tr><td style="padding: 6px 0; color: #94a3b8;">Hospital:</td><td style="padding: 6px 0; font-weight: 600; color: #f1f5f9;">${input.hospitalName}</td></tr>
       <tr><td style="padding: 6px 0; color: #94a3b8;">Department:</td><td style="padding: 6px 0; font-weight: 600; color: #f1f5f9;">${input.departmentName}</td></tr>
       <tr><td style="padding: 6px 0; color: #94a3b8;">Doctor:</td><td style="padding: 6px 0; font-weight: 600; color: #f1f5f9;">${input.doctorName}</td></tr>
       <tr><td style="padding: 6px 0; color: #94a3b8;">Scheduled Time:</td><td style="padding: 6px 0; font-weight: 600; color: #f1f5f9;">${input.scheduledAt}</td></tr>
       <tr><td style="padding: 6px 0; color: #94a3b8;">Booking Reference:</td><td style="padding: 6px 0; font-family: monospace; color: #48cae4;">${input.reference}</td></tr>
     </table>
     ${tokenHtml}
     <p style="font-size: 14px; color: #94a3b8;">Please arrive 15 minutes before your slot. You can check in online up to 60 minutes prior.</p>
     ${link}`,
  );

  const text = `Pulse AI - Appointment Confirmed
Dear ${input.patientName},

Your appointment at ${input.hospitalName} (${input.departmentName}) with ${input.doctorName} is confirmed for ${input.scheduledAt}.
Reference: ${input.reference}
${input.digitalToken ? `Token: ${input.digitalToken}` : ""}

Please arrive 15 minutes prior. View details at: ${input.appUrl || "Pulse AI"}`;

  return {
    to: "",
    subject: `Appointment Confirmed: ${input.departmentName} at ${input.hospitalName} (${input.digitalToken || input.reference})`,
    html,
    text,
  };
}

export function renderAppointmentReminderEmail(input: {
  patientName: string;
  hospitalName: string;
  departmentName: string;
  doctorName: string;
  scheduledAt: string;
  digitalToken?: string | null;
  minutesBefore: number;
  appUrl?: string;
}): EmailMessage {
  const timeDesc =
    input.minutesBefore >= 1440
      ? "tomorrow"
      : input.minutesBefore >= 60
        ? `in ${Math.round(input.minutesBefore / 60)} hour(s)`
        : `in ${input.minutesBefore} minutes`;

  const html = emailFrame(
    `Reminder: Appointment ${timeDesc} - Pulse AI`,
    `<h2 style="color: #ffffff; margin-top: 0;">Upcoming Appointment Reminder</h2>
     <p>Dear <strong>${input.patientName}</strong>,</p>
     <p>This is a reminder that you have an appointment <strong>${timeDesc}</strong> at <strong>${input.scheduledAt}</strong>.</p>
     <div style="margin: 20px 0; padding: 16px; background-color: #0f172a; border-radius: 8px;">
       <p style="margin: 0 0 6px;"><strong>Facility:</strong> ${input.hospitalName}</p>
       <p style="margin: 0 0 6px;"><strong>Department:</strong> ${input.departmentName}</p>
       <p style="margin: 0 0 6px;"><strong>Doctor:</strong> ${input.doctorName}</p>
       ${input.digitalToken ? `<p style="margin: 0;"><strong>Active Token:</strong> <span style="color: #48cae4; font-weight: 700;">${input.digitalToken}</span></p>` : ""}
     </div>
     <p style="font-size: 14px; color: #94a3b8;">If you are unable to attend, please reschedule or cancel in the Citizen Portal.</p>`,
  );

  const text = `Pulse AI: Reminder: Your appointment at ${input.hospitalName} (${input.departmentName}) is scheduled for ${input.scheduledAt} (${timeDesc}). Active Token: ${input.digitalToken || "N/A"}.`;

  return {
    to: "",
    subject: `Reminder: Clinic Appointment ${timeDesc} (${input.digitalToken || input.scheduledAt})`,
    html,
    text,
  };
}

export function renderQueueApproachingTurnEmail(input: {
  patientName: string;
  hospitalName: string;
  departmentName: string;
  digitalToken: string;
  currentServingToken: string | null;
  patientsAhead: number;
  waitEstimateMinutes?: number | null;
  appUrl?: string;
}): EmailMessage {
  const waitText = input.waitEstimateMinutes
    ? `~${input.waitEstimateMinutes} min`
    : "Estimated wait unavailable";

  const html = emailFrame(
    "Approaching Your Turn - Pulse AI",
    `<h2 style="color: #38bdf8; margin-top: 0;">You Are Approaching Your Turn</h2>
     <p>Dear <strong>${input.patientName}</strong>,</p>
     <p>Please remain near the OPD consultation room at <strong>${input.hospitalName} (${input.departmentName})</strong>.</p>
     <div style="margin: 20px 0; padding: 20px; background-color: #0f172a; border-left: 4px solid #38bdf8; border-radius: 8px;">
       <table style="width: 100%;">
         <tr><td>Your Token:</td><td style="font-size: 24px; font-weight: 800; color: #38bdf8;">${input.digitalToken}</td></tr>
         <tr><td>Now Calling / Serving:</td><td style="font-size: 18px; font-weight: 700; color: #fbbf24;">${input.currentServingToken || "Starting"}</td></tr>
         <tr><td>Patients Ahead:</td><td style="font-size: 16px; font-weight: 600; color: #ffffff;">${input.patientsAhead}</td></tr>
         <tr><td>Estimated Wait:</td><td style="font-size: 16px; color: #94a3b8;">${waitText}</td></tr>
       </table>
     </div>
     <p style="font-size: 13px; color: #94a3b8;">Estimated waiting times can change depending on clinic requirements. Listen for your token call.</p>`,
  );

  const text = `Pulse AI: You are approaching your turn! Token: ${input.digitalToken}. Currently serving: ${input.currentServingToken || "Starting"}. Patients ahead: ${input.patientsAhead}. Please remain near the clinic area.`;

  return {
    to: "",
    subject: `Approaching Your Turn: Token ${input.digitalToken} at ${input.hospitalName}`,
    html,
    text,
  };
}

export function renderAppointmentCancelledEmail(input: {
  patientName: string;
  hospitalName: string;
  departmentName: string;
  reference: string;
  cancelledAt: string;
}): EmailMessage {
  const html = emailFrame(
    "Appointment Cancelled - Pulse AI",
    `<h2 style="color: #f87171; margin-top: 0;">Appointment Cancelled</h2>
     <p>Dear <strong>${input.patientName}</strong>,</p>
     <p>Your appointment at <strong>${input.hospitalName} (${input.departmentName})</strong> (Ref: ${input.reference}) has been cancelled.</p>
     <p style="font-size: 14px; color: #94a3b8;">All associated queue reminders have been deactivated. You can book a new appointment at any time through Pulse AI.</p>`,
  );

  const text = `Pulse AI: Your appointment at ${input.hospitalName} (${input.departmentName}) (Ref: ${input.reference}) was cancelled. All reminders have been cleared.`;

  return {
    to: "",
    subject: `Appointment Cancelled: Ref ${input.reference}`,
    html,
    text,
  };
}
