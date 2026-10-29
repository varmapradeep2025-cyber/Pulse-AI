import type { AppointmentUser } from "../types/appointments.js";
import {
  appointmentService,
  type AppointmentService,
} from "./appointmentService.js";
import {
  notificationService,
  type NotificationService,
} from "./notificationService.js";
import {
  type AppointmentAccessIdentity,
  isStaffAuthorizedForHospital,
} from "./appointmentAccess.js";

export interface AssistantResponse {
  source: "live-authoritative";
  answer: string;
  data?: Record<string, unknown>;
}

export class AssistantToolsService {
  constructor(
    private readonly appointments: AppointmentService = appointmentService,
    private readonly notifications: NotificationService = notificationService,
  ) {}

  async handleCitizenQuery(
    user: AppointmentUser,
    query: string,
  ): Promise<AssistantResponse> {
    const normalized = query.toLowerCase();
    const userAppointments = this.appointments.listAppointments(user);

    // 1. Notifications query
    if (
      normalized.includes("notification") ||
      normalized.includes("alert") ||
      normalized.includes("message") ||
      normalized.includes("update")
    ) {
      const recent = this.notifications.listNotifications(user.id).slice(0, 5);
      const unread = this.notifications.getUnreadCount(user.id);

      if (recent.length === 0) {
        return {
          source: "live-authoritative",
          answer: "You currently have no notifications on file.",
          data: { unreadCount: 0, notifications: [] },
        };
      }

      const listText = recent
        .map(
          (notif, idx) =>
            `${idx + 1}. [${notif.read ? "Read" : "NEW"}] ${notif.title}: ${notif.message}`,
        )
        .join("\n");

      return {
        source: "live-authoritative",
        answer: `You have ${unread} unread notification(s). Here are your recent updates:\n\n${listText}`,
        data: { unreadCount: unread, notifications: recent },
      };
    }

    // 2. No appointments found
    if (userAppointments.length === 0) {
      return {
        source: "live-authoritative",
        answer:
          "You currently have no scheduled or past appointments on file. You can book an outpatient appointment via the Appointments section.",
        data: { appointmentsCount: 0 },
      };
    }

    const active = userAppointments.find((v) =>
      ["confirmed", "waiting", "checked_in", "in_consultation"].includes(
        v.appointment.status,
      ),
    );

    const latest = active ?? userAppointments[0];
    const apt = latest.appointment;

    // 3. Queue status, token, or position query
    if (
      normalized.includes("queue") ||
      normalized.includes("token") ||
      normalized.includes("position") ||
      normalized.includes("turn") ||
      normalized.includes("wait") ||
      normalized.includes("ahead") ||
      normalized.includes("serving")
    ) {
      try {
        const snapshot = this.appointments.getQueueSnapshot(user, apt.id);
        const waitText = snapshot.waitEstimate.available
          ? `Estimated wait is approximately ${snapshot.waitEstimate.minutes} minutes (estimates can vary depending on clinical needs).`
          : "Estimated wait time is currently unavailable.";

        return {
          source: "live-authoritative",
          answer:
            `Your appointment at ${apt.hospitalName} (${apt.departmentName}) with ${apt.doctorName} is ${apt.status.toUpperCase()}.\n\n` +
            `• Digital Token: ${snapshot.digitalToken || "Assigned upon check-in"}\n` +
            `• Now Serving: ${snapshot.currentServingDigitalToken || "Starting shortly"}\n` +
            `• Patients Ahead of You: ${snapshot.patientsAhead}\n` +
            `• Status: ${waitText}`,
          data: { snapshot },
        };
      } catch {
        // Fallback to appointment summary if queue snapshot not available yet
      }
    }

    // 4. Default Appointment Summary query
    return {
      source: "live-authoritative",
      answer:
        `Here is your latest appointment summary:\n\n` +
        `• Hospital: ${apt.hospitalName} (${apt.departmentName})\n` +
        `• Doctor: ${apt.doctorName}\n` +
        `• Scheduled Time: ${apt.scheduledAt}\n` +
        `• Status: ${apt.status}\n` +
        `• Token: ${apt.digitalToken || "N/A"}\n` +
        `• Reference: ${apt.reference}`,
      data: { appointment: apt },
    };
  }

  async handleDoctorQuery(
    identity: AppointmentAccessIdentity,
    hospitalId: string,
    departmentId: string,
    query: string,
  ): Promise<AssistantResponse> {
    if (!isStaffAuthorizedForHospital(identity, hospitalId)) {
      return {
        source: "live-authoritative",
        answer: "Access Denied: You are not authorized to view queue information for this hospital.",
      };
    }

    const queue = this.appointments.getQueue(
      { hospitalId, departmentId },
      identity,
    );

    const waiting = queue.appointments.filter(
      (v) => v.appointment.status === "waiting",
    );
    const inConsult = queue.appointments.find(
      (v) => v.appointment.status === "in_consultation",
    );

    const nextPatient = waiting[0];

    const normalized = query.toLowerCase();

    if (
      normalized.includes("next") ||
      normalized.includes("who is next") ||
      normalized.includes("call")
    ) {
      if (!nextPatient) {
        return {
          source: "live-authoritative",
          answer: "There are currently no waiting patients in this department queue.",
          data: { nextPatient: null, activeCount: queue.activeCount },
        };
      }

      return {
        source: "live-authoritative",
        answer:
          `The next eligible patient is:\n\n` +
          `• Token: ${nextPatient.appointment.digitalToken}\n` +
          `• Patient: ${nextPatient.appointment.patientName}\n` +
          `• Source: ${nextPatient.appointment.source}\n` +
          `• Scheduled/Arrival: ${nextPatient.appointment.checkedInAt || nextPatient.appointment.scheduledAt}`,
        data: { nextPatient: nextPatient.appointment },
      };
    }

    return {
      source: "live-authoritative",
      answer:
        `Department Queue Summary:\n\n` +
        `• Active Patients: ${queue.activeCount}\n` +
        `• Currently In Consultation: ${inConsult ? `${inConsult.appointment.digitalToken} (${inConsult.appointment.patientName})` : "None"}\n` +
        `• Now Serving Token: ${queue.currentServingDigitalToken || "None"}\n` +
        `• Waiting in Line: ${waiting.length} patient(s)\n` +
        `• Next Eligible: ${nextPatient ? `${nextPatient.appointment.digitalToken} (${nextPatient.appointment.patientName})` : "None"}`,
      data: {
        activeCount: queue.activeCount,
        servingToken: queue.currentServingDigitalToken,
        waitingCount: waiting.length,
      },
    };
  }
}

export const assistantToolsService = new AssistantToolsService();
