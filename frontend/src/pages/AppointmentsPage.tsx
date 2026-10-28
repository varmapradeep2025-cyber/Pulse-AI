import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "../context/AuthContext";
import AppointmentStatusBadge, {
  APPOINTMENT_STATUS_LABELS,
} from "../components/AppointmentStatusBadge";
import {
  AppointmentApiError,
  cancelAppointment,
  checkInAppointment,
  createAppointment,
  getAppointmentAvailability,
  getAppointmentCatalog,
  getMyAppointments,
  rescheduleAppointment,
  type AppointmentAvailability,
  type AppointmentCatalog,
  type AppointmentStatus,
  type AppointmentView,
  type AppointmentSlot,
  type WaitEstimate,
  getAppointmentQueueSnapshot,
  type QueueSnapshot,
} from "../api/appointments";

const ACTIVE_STATUSES: AppointmentStatus[] = [
  "requested",
  "confirmed",
  "checked_in",
  "waiting",
  "in_consultation",
];

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function formatShortDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The appointment request could not be completed.";
}

function isSlotConflict(error: unknown): boolean {
  return (
    error instanceof AppointmentApiError &&
    (error.code === "SLOT_TAKEN" || error.code === "SLOT_UNAVAILABLE")
  );
}

function WaitEstimateCard({
  estimate,
}: {
  estimate: WaitEstimate;
}) {
  if (!estimate.available) {
    return (
      <div className="appointment-estimate appointment-estimate--unavailable">
        <strong>Waiting-time estimate unavailable</strong>
        <p>{estimate.reason}</p>
        <small>
          Active queue entries: {estimate.activeQueueCount}. Recent completed
          consultations used: {estimate.recentConsultations}.
        </small>
      </div>
    );
  }

  return (
    <div className="appointment-estimate">
      <strong>Estimated wait: about {estimate.minutes} minutes</strong>
      <p>{estimate.basis}</p>
      <small>Based on data refreshed {formatShortDateTime(estimate.updatedAt)}.</small>
    </div>
  );
}

function SlotPicker({
  availability,
  loading,
  error,
  selectedDate,
  selectedSlotId,
  onSelectDate,
  onSelectSlot,
  emptyMessage,
}: {
  availability: AppointmentAvailability | null;
  loading: boolean;
  error: string;
  selectedDate: string;
  selectedSlotId: string;
  onSelectDate: (date: string) => void;
  onSelectSlot: (slotId: string) => void;
  emptyMessage: string;
}) {
  if (loading) {
    return <p className="appointment-muted">Loading demo availability...</p>;
  }

  if (error) {
    return (
      <p className="appointment-inline-error" role="alert">
        {error}
      </p>
    );
  }

  if (!availability) {
    return null;
  }

  const availableDays = availability.days.filter(
    (day) => day.slots.length > 0,
  );

  if (availableDays.length === 0) {
    return <p className="appointment-empty">{emptyMessage}</p>;
  }

  const activeDate =
    availableDays.find((day) => day.date === selectedDate)?.date ??
    availableDays[0].date;
  const activeDay =
    availableDays.find((day) => day.date === activeDate) ??
    availableDays[0];

  return (
    <div className="appointment-slots">
      <div
        className="appointment-date-chips"
        role="group"
        aria-label="Choose an appointment date"
      >
        {availableDays.map((day) => {
          const active = day.date === activeDate;

          return (
            <button
              key={day.date}
              type="button"
              className={`appointment-date-chip${
                active ? " appointment-date-chip--active" : ""
              }`}
              aria-pressed={active}
              onClick={() => {
                onSelectDate(day.date);
                onSelectSlot("");
              }}
            >
              <strong>{day.label}</strong>
              <span>
                {day.slots.length} slot{day.slots.length === 1 ? "" : "s"}
              </span>
            </button>
          );
        })}
      </div>

      <p className="appointment-slot-heading">
        Available times on {activeDay.label} (India Standard Time)
      </p>

      <div
        className="appointment-time-grid"
        role="group"
        aria-label="Choose an appointment time"
      >
        {activeDay.slots.map((slot) => {
          const active = slot.slotId === selectedSlotId;

          return (
            <button
              key={slot.slotId}
              type="button"
              className={`appointment-time${
                active ? " appointment-time--active" : ""
              }`}
              aria-pressed={active}
              onClick={() => onSelectSlot(slot.slotId)}
            >
              {slot.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AppointmentDetail({
  view,
  onUpdated,
  onClose,
}: {
  view: AppointmentView;
  onUpdated: (view: AppointmentView, message: string) => void;
  onClose: () => void;
}) {
  const appointment = view.appointment;
  const canReschedule =
    appointment.status === "requested" ||
    appointment.status === "confirmed";
  const canCheckIn = appointment.status === "confirmed";

  const [busy, setBusy] = useState<"cancel" | "check-in" | "reschedule" | "">(
    "",
  );
  const [actionError, setActionError] = useState("");
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (appointment.status === "waiting" || appointment.status === "checked_in") {
      getAppointmentQueueSnapshot(appointment.id)
        .then((data) => {
          if (!cancelled) setSnapshot(data);
        })
        .catch(() => {});
    } else {
      setSnapshot(null);
    }
    return () => {
      cancelled = true;
    };
  }, [appointment.id, appointment.status]);
  const [availability, setAvailability] =
    useState<AppointmentAvailability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [availabilityVersion, setAvailabilityVersion] = useState(0);

  useEffect(() => {
    setBusy("");
    setActionError("");
    setRescheduleOpen(false);
    setAvailability(null);
    setAvailabilityError("");
    setSelectedDate("");
    setSelectedSlotId("");
  }, [appointment.id]);

  useEffect(() => {
    if (!rescheduleOpen) {
      return;
    }

    let cancelled = false;
    setAvailabilityLoading(true);
    setAvailabilityError("");

    getAppointmentAvailability({
      hospitalId: appointment.hospitalId,
      departmentId: appointment.departmentId,
      doctorId: appointment.doctorId,
    })
      .then((result) => {
        if (cancelled) return;
        setAvailability(result);
        setSelectedDate(
          result.days.find((day) => day.slots.length > 0)?.date ?? "",
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setAvailabilityError(errorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAvailabilityLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    appointment.departmentId,
    appointment.doctorId,
    appointment.hospitalId,
    availabilityVersion,
    rescheduleOpen,
  ]);

  async function handleCheckIn() {
    setBusy("check-in");
    setActionError("");

    try {
      const updated = await checkInAppointment(appointment.id);
      onUpdated(
        updated,
        "You are checked in and waiting. Your digital queue token is active.",
      );
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy("");
    }
  }

  async function handleCancel() {
    const confirmed = window.confirm(
      "Cancel this appointment? You can book another appointment or use assisted registration.",
    );

    if (!confirmed) {
      return;
    }

    setBusy("cancel");
    setActionError("");

    try {
      const updated = await cancelAppointment(appointment.id);
      onUpdated(updated, "Appointment cancelled.");
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy("");
    }
  }

  async function handleReschedule(event: FormEvent) {
    event.preventDefault();

    if (!selectedSlotId) {
      setActionError("Choose a new appointment slot.");
      return;
    }

    setBusy("reschedule");
    setActionError("");

    try {
      const updated = await rescheduleAppointment(
        appointment.id,
        selectedSlotId,
      );
      setRescheduleOpen(false);
      onUpdated(updated, "Appointment moved to the selected slot.");
    } catch (error) {
      setActionError(errorMessage(error));

      if (isSlotConflict(error)) {
        setSelectedSlotId("");
        setAvailabilityVersion((version) => version + 1);
      }
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="appointment-detail" aria-live="polite">
      <div className="appointment-detail__head">
        <div>
          <p className="appointment-eyebrow">Appointment details</p>
          <h2>{appointment.reference}</h2>
        </div>
        <button
          type="button"
          className="appointment-close"
          onClick={onClose}
          aria-label="Close appointment details"
        >
          Close
        </button>
      </div>

      <div className="appointment-detail__summary">
        <AppointmentStatusBadge status={appointment.status} />
        {appointment.digitalToken && (
          <span
            className="badge badge--token"
            style={{
              backgroundColor: "#0284c7",
              color: "#ffffff",
              padding: "2px 8px",
              borderRadius: "4px",
              fontWeight: 600,
              fontSize: "0.85rem",
              marginLeft: "6px",
            }}
          >
            Token: {appointment.digitalToken}
          </span>
        )}
        <p>
          <strong>{formatDateTime(appointment.scheduledAt)}</strong>
          <br />
          {appointment.hospitalName}
          <br />
          {appointment.departmentName} - {appointment.doctorName}
        </p>
        <p className="appointment-muted">
          Patient: {appointment.patientName} |{" "}
          {appointment.source === "walk_in"
            ? "Walk-in registration"
            : "Online request"}
        </p>
      </div>

      {actionError && (
        <p className="appointment-inline-error" role="alert">
          {actionError}
        </p>
      )}

      <div className="appointment-detail__actions">
        {canCheckIn && (
          <button
            type="button"
            className="btn btn--primary btn--small"
            disabled={busy !== ""}
            onClick={handleCheckIn}
          >
            {busy === "check-in" ? "Checking in..." : "I have arrived - check in"}
          </button>
        )}
        {canReschedule && (
          <button
            type="button"
            className="btn btn--secondary btn--small"
            disabled={busy !== ""}
            onClick={() => {
              setRescheduleOpen((open) => !open);
              setActionError("");
            }}
          >
            {rescheduleOpen ? "Stop rescheduling" : "Reschedule"}
          </button>
        )}
        {canReschedule && (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={busy !== ""}
            onClick={handleCancel}
          >
            {busy === "cancel" ? "Cancelling..." : "Cancel appointment"}
          </button>
        )}
      </div>

      {rescheduleOpen && (
        <form
          className="appointment-reschedule"
          onSubmit={handleReschedule}
        >
          <h3>Choose a new slot</h3>
          <SlotPicker
            availability={availability}
            loading={availabilityLoading}
            error={availabilityError}
            selectedDate={selectedDate}
            selectedSlotId={selectedSlotId}
            onSelectDate={setSelectedDate}
            onSelectSlot={setSelectedSlotId}
            emptyMessage="No demo slots are currently published for this doctor. Keep the existing appointment, contact hospital registration staff, or use walk-in registration."
          />
          <button
            type="submit"
            className="btn btn--primary btn--small"
            disabled={busy !== "" || !selectedSlotId}
          >
            {busy === "reschedule" ? "Moving..." : "Confirm new slot"}
          </button>
        </form>
      )}

      {snapshot && (appointment.status === "waiting" || appointment.status === "checked_in") && (
        <div
          className="appointment-estimate"
          style={{
            borderLeft: "4px solid #0284c7",
            padding: "10px 14px",
            marginBottom: "12px",
            background: "rgba(2, 132, 199, 0.06)",
            borderRadius: "4px",
          }}
        >
          <strong>Digital Token: {snapshot.digitalToken ?? appointment.digitalToken}</strong>
          <p style={{ margin: "4px 0" }}>
            {snapshot.currentServingDigitalToken
              ? `Now serving: ${snapshot.currentServingDigitalToken}`
              : "Consultation in preparation"}
            {" • "}
            {snapshot.patientsAhead === 0
              ? "You are next in line!"
              : `${snapshot.patientsAhead} ${
                  snapshot.patientsAhead === 1 ? "patient" : "patients"
                } ahead`}
          </p>
          <small>Queue position updated: {formatShortDateTime(snapshot.updatedAt)}</small>
        </div>
      )}
      <WaitEstimateCard estimate={view.waitEstimate} />

      <div className="appointment-guidance">
        <h3>What to do</h3>
        <p>{view.guidance.status}</p>
        <p>{view.guidance.arrival}</p>
        <p>{view.guidance.assistance}</p>
        <p className="appointment-muted">{view.guidance.notifications}</p>
      </div>

      <div className="appointment-history">
        <h3>Status history</h3>
        <ol>
          {view.history.map((event) => (
            <li key={event.id}>
              <strong>{APPOINTMENT_STATUS_LABELS[event.toStatus]}</strong>
              <span>
                {formatShortDateTime(event.createdAt)} by{" "}
                {event.actorRole === "staff" ? "hospital staff" : "you"}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <p className="appointment-demo-caption">{view.demoLabel}</p>
    </section>
  );
}

export default function AppointmentsPage() {
  const { user } = useAuth();

  const [catalog, setCatalog] = useState<AppointmentCatalog | null>(null);
  const [appointments, setAppointments] = useState<AppointmentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<
    string | null
  >(null);

  const [hospitalId, setHospitalId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [patientName, setPatientName] = useState("");

  const [availability, setAvailability] =
    useState<AppointmentAvailability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [availabilityVersion, setAvailabilityVersion] = useState(0);

  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState("");

  useEffect(() => {
    const metadataName = user?.user_metadata?.full_name;
    const fallbackName =
      typeof metadataName === "string" ? metadataName : "";

    if (fallbackName) {
      setPatientName((current) => current || fallbackName);
    }
  }, [user?.user_metadata?.full_name]);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      setPageError("");

      try {
        const [nextCatalog, nextAppointments] = await Promise.all([
          getAppointmentCatalog(),
          getMyAppointments(),
        ]);

        if (cancelled) return;

        setCatalog(nextCatalog);
        setAppointments(nextAppointments);

        const firstHospital = nextCatalog.hospitals[0];
        const firstDepartment = firstHospital?.departments[0];
        const firstDoctor = firstDepartment?.doctors[0];

        if (firstHospital && firstDepartment && firstDoctor) {
          setHospitalId(firstHospital.id);
          setDepartmentId(firstDepartment.id);
          setDoctorId(firstDoctor.id);
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(errorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPage();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      getMyAppointments()
        .then((nextAppointments) => {
          if (!cancelled) {
            setAppointments(nextAppointments);
          }
        })
        .catch(() => {
          // Keep the last known statuses; the next manual action can retry.
        });
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!hospitalId || !departmentId || !doctorId) {
      setAvailability(null);
      return;
    }

    let cancelled = false;
    setAvailabilityLoading(true);
    setAvailabilityError("");
    setSelectedSlotId("");

    getAppointmentAvailability({
      hospitalId,
      departmentId,
      doctorId,
    })
      .then((result) => {
        if (cancelled) return;
        setAvailability(result);
        setSelectedDate(
          (current) =>
            result.days.find(
              (day) => day.date === current && day.slots.length > 0,
            )?.date ??
            result.days.find((day) => day.slots.length > 0)?.date ??
            "",
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setAvailabilityError(errorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAvailabilityLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    availabilityVersion,
    departmentId,
    doctorId,
    hospitalId,
  ]);

  const selectedHospital = useMemo(
    () => catalog?.hospitals.find((hospital) => hospital.id === hospitalId),
    [catalog, hospitalId],
  );
  const selectedDepartment = useMemo(
    () =>
      selectedHospital?.departments.find(
        (department) => department.id === departmentId,
      ),
    [departmentId, selectedHospital],
  );
  const selectedDoctor = useMemo(
    () =>
      selectedDepartment?.doctors.find(
        (doctor) => doctor.id === doctorId,
      ),
    [departmentId, doctorId, selectedDepartment],
  );

  const selectedAppointment =
    appointments.find(
      (view) => view.appointment.id === selectedAppointmentId,
    ) ?? null;

  const selectedSlot: AppointmentSlot | null =
    availability?.days
      .flatMap((day) => day.slots)
      .find((slot) => slot.slotId === selectedSlotId) ?? null;

  const hasAnySlots =
    availability?.days.some((day) => day.slots.length > 0) ?? false;

  const activeCount = appointments.filter((view) =>
    ACTIVE_STATUSES.includes(view.appointment.status),
  ).length;

  const applyUpdate = useCallback(
    (view: AppointmentView, message: string) => {
      setAppointments((current) => {
        const exists = current.some(
          (item) => item.appointment.id === view.appointment.id,
        );

        return exists
          ? current.map((item) =>
              item.appointment.id === view.appointment.id ? view : item,
            )
          : [view, ...current];
      });
      setSelectedAppointmentId(view.appointment.id);
      setNotice(message);
      setPageError("");
    },
    [],
  );

  function handleHospitalChange(nextHospitalId: string) {
    const hospital = catalog?.hospitals.find(
      (candidate) => candidate.id === nextHospitalId,
    );
    const department = hospital?.departments[0];
    const doctor = department?.doctors[0];

    setHospitalId(nextHospitalId);
    setDepartmentId(department?.id ?? "");
    setDoctorId(doctor?.id ?? "");
    setBookingError("");
  }

  function handleDepartmentChange(nextDepartmentId: string) {
    const department = selectedHospital?.departments.find(
      (candidate) => candidate.id === nextDepartmentId,
    );

    setDepartmentId(nextDepartmentId);
    setDoctorId(department?.doctors[0]?.id ?? "");
    setBookingError("");
  }

  async function handleBook(event: FormEvent) {
    event.preventDefault();
    setBookingError("");
    setNotice("");

    if (!hospitalId || !departmentId || !doctorId) {
      setBookingError("Choose a hospital, department, and doctor.");
      return;
    }

    if (!selectedSlotId) {
      setBookingError("Choose an available appointment slot.");
      return;
    }

    if (patientName.trim().length < 2) {
      setBookingError("Enter the patient's name.");
      return;
    }

    setBooking(true);

    try {
      const view = await createAppointment({
        hospitalId,
        departmentId,
        doctorId,
        slotId: selectedSlotId,
        patientName: patientName.trim(),
      });

      applyUpdate(
        view,
        view.appointment.status === "requested"
          ? "Appointment request sent. It is awaiting hospital confirmation."
          : "Appointment booked. Digital queue token allocated.",
      );
      setSelectedSlotId("");
      setAvailabilityVersion((version) => version + 1);
    } catch (error) {
      setBookingError(errorMessage(error));

      if (isSlotConflict(error)) {
        setSelectedSlotId("");
        setAvailabilityVersion((version) => version + 1);
      }
    } finally {
      setBooking(false);
    }
  }

  return (
    <div className="container page appointments-page">
      <header className="page__header page__header--split">
        <div>
          <h1>Appointments</h1>
          <p>
            Request an appointment, check in when you arrive, and follow your
            place with your digital queue token.
          </p>
        </div>
        <div className="appointment-page-meta">
          <span>
            <strong>{activeCount}</strong> active
          </span>
          <span>
            <strong>{appointments.length}</strong> total
          </span>
        </div>
      </header>

      <div className="appointment-demo-note">
        <strong>Demo scheduling:</strong> hospitals, doctors, slots, and queue
        records are fictional and reset when the backend restarts. No real
        appointment, doctor availability, or notification is created.
      </div>

      {notice && (
        <div className="appointment-success" role="status">
          {notice}
        </div>
      )}

      {pageError && (
        <div className="appointment-page-error" role="alert">
          <strong>Could not load appointments.</strong>
          <p>{pageError}</p>
          <button
            type="button"
            className="btn btn--small btn--secondary"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      )}

      <div className="appointment-layout">
        <div className="appointment-column">
          <section className="appointment-panel">
            <div className="appointment-panel__head">
              <div>
                <p className="appointment-eyebrow">Step 1</p>
                <h2>Book an appointment</h2>
              </div>
            </div>

            {loading ? (
              <p className="appointment-muted">Loading demo catalog...</p>
            ) : (
              <form onSubmit={handleBook} className="appointment-form">
                <div className="appointment-fields">
                  <label>
                    Hospital
                    <select
                      value={hospitalId}
                      onChange={(event) =>
                        handleHospitalChange(event.target.value)
                      }
                      disabled={!catalog || catalog.hospitals.length === 0}
                    >
                      {catalog?.hospitals.map((hospital) => (
                        <option key={hospital.id} value={hospital.id}>
                          {hospital.name} - {hospital.city}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Department
                    <select
                      value={departmentId}
                      onChange={(event) =>
                        handleDepartmentChange(event.target.value)
                      }
                      disabled={!selectedHospital}
                    >
                      {selectedHospital?.departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Doctor
                    <select
                      value={doctorId}
                      onChange={(event) => {
                        setDoctorId(event.target.value);
                        setBookingError("");
                      }}
                      disabled={!selectedDepartment}
                    >
                      {selectedDepartment?.doctors.map((doctor) => (
                        <option key={doctor.id} value={doctor.id}>
                          {doctor.name}
                          {doctor.approvalRequired
                            ? " - approval required"
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {selectedDoctor?.approvalRequired && (
                  <p className="appointment-note">
                    This doctor's demo slot requires staff confirmation. The
                    request will show as awaiting confirmation until hospital
                    staff approve it.
                  </p>
                )}

                <SlotPicker
                  availability={availability}
                  loading={availabilityLoading}
                  error={availabilityError}
                  selectedDate={selectedDate}
                  selectedSlotId={selectedSlotId}
                  onSelectDate={setSelectedDate}
                  onSelectSlot={setSelectedSlotId}
                  emptyMessage="No demo appointment slots are currently published for this doctor. Do not assume the hospital is available. Contact registration staff or use walk-in registration."
                />

                {availability && !hasAnySlots && (
                  <p className="appointment-assistance">
                    Appointment help is still available without a smartphone:
                    go to the hospital registration desk. Walk-ins remain
                    possible. Emergency care should not wait for an online
                    appointment.
                  </p>
                )}

                <label className="appointment-name">
                  Patient name
                  <input
                    type="text"
                    value={patientName}
                    maxLength={80}
                    onChange={(event) =>
                      setPatientName(event.target.value)
                    }
                    placeholder="Name for this appointment"
                    autoComplete="name"
                    required
                  />
                </label>

                {selectedSlot && (
                  <p className="appointment-selection">
                    Selected: <strong>{selectedSlot.label}</strong> with{" "}
                    {selectedDoctor?.name}
                  </p>
                )}

                {bookingError && (
                  <p className="appointment-inline-error" role="alert">
                    {bookingError}
                  </p>
                )}

                <div className="appointment-form__actions">
                  <button
                    type="submit"
                    className="btn btn--primary"
                    disabled={booking || !selectedSlotId}
                  >
                    {booking ? "Requesting..." : "Request appointment"}
                  </button>
                  <span className="appointment-muted">
                    Online appointments do not replace emergency care.
                  </span>
                </div>
              </form>
            )}
          </section>

          <section className="appointment-panel">
            <div className="appointment-panel__head">
              <div>
                <p className="appointment-eyebrow">Your records</p>
                <h2>My appointments</h2>
              </div>
              <button
                type="button"
                className="btn btn--small btn--ghost"
                onClick={() => {
                  getMyAppointments()
                    .then((next) => {
                      setAppointments(next);
                      setPageError("");
                    })
                    .catch((error) => setPageError(errorMessage(error)));
                }}
              >
                Refresh
              </button>
            </div>

            {appointments.length === 0 ? (
              <p className="appointment-empty">
                No appointments yet. Choose a hospital, department, doctor, and
                available slot above.
              </p>
            ) : (
              <div className="appointment-list">
                {appointments.map((view) => {
                  const item = view.appointment;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`appointment-list__item${
                        selectedAppointmentId === item.id
                          ? " appointment-list__item--active"
                          : ""
                      }`}
                      onClick={() => setSelectedAppointmentId(item.id)}
                    >
                      <span className="appointment-list__top">
                        <strong>{item.reference}</strong>
                        <AppointmentStatusBadge status={item.status} />
                      </span>
                      <span className="appointment-list__hospital">
                        {item.hospitalName}
                      </span>
                      <span className="appointment-list__meta">
                        {item.departmentName} - {item.doctorName}
                      </span>
                      <span className="appointment-list__meta">
                        {formatDateTime(item.scheduledAt)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="appointment-aside">
          {selectedAppointment ? (
            <AppointmentDetail
              view={selectedAppointment}
              onUpdated={applyUpdate}
              onClose={() => setSelectedAppointmentId(null)}
            />
          ) : (
            <section className="appointment-help-card">
              <p className="appointment-eyebrow">Digital queue system</p>
              <h2>What happens on arrival</h2>
              <ol>
                <li>Check in here when you arrive, or speak to registration staff.</li>
                <li>Watch the status on this page or listen for your name.</li>
                <li>
                  Waiting-time estimates appear only when recent queue data is
                  available.
                </li>
              </ol>
              <p>
                If you cannot use this page, assisted registration at the
                hospital does not require a smartphone, email, or online
                payment. Walk-ins remain available.
              </p>
              <p className="appointment-muted">
                SMS, WhatsApp, and phone-call notifications are not configured.
              </p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
