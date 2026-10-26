import type { AppointmentStatus } from "../api/appointments";

export const APPOINTMENT_STATUS_LABELS: Record<
  AppointmentStatus,
  string
> = {
  requested: "Awaiting confirmation",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  waiting: "Waiting",
  in_consultation: "In consultation",
  completed: "Completed",
  cancelled: "Cancelled",
  missed: "Missed",
};

export default function AppointmentStatusBadge({
  status,
}: {
  status: AppointmentStatus;
}) {
  return (
    <span className={`appointment-status appointment-status--${status}`}>
      {APPOINTMENT_STATUS_LABELS[status]}
    </span>
  );
}
