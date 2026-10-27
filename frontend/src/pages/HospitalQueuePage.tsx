import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import AppointmentStatusBadge from "../components/AppointmentStatusBadge";
import {
  AppointmentApiError,
  createWalkIn,
  getAppointmentCatalog,
  getStaffQueue,
  transitionAppointmentStatus,
  type AppointmentCatalog,
  type AppointmentStatus,
  type QueueView,
  type WaitEstimate,
} from "../api/appointments";

interface StatusAction {
  status: AppointmentStatus;
  label: string;
  tone: "primary" | "secondary" | "ghost";
}

const NEXT_ACTIONS: Partial<Record<AppointmentStatus, StatusAction[]>> = {
  requested: [
    { status: "confirmed", label: "Confirm", tone: "primary" },
    { status: "cancelled", label: "Cancel", tone: "ghost" },
  ],
  confirmed: [
    { status: "waiting", label: "Check in", tone: "primary" },
    { status: "missed", label: "Mark missed", tone: "secondary" },
    { status: "cancelled", label: "Cancel", tone: "ghost" },
  ],
  checked_in: [
    { status: "waiting", label: "Move to waiting", tone: "primary" },
    { status: "cancelled", label: "Cancel", tone: "ghost" },
  ],
  waiting: [
    {
      status: "in_consultation",
      label: "Start consultation",
      tone: "primary",
    },
    { status: "missed", label: "Mark missed", tone: "secondary" },
    { status: "cancelled", label: "Cancel", tone: "ghost" },
  ],
  in_consultation: [
    { status: "completed", label: "Complete visit", tone: "primary" },
  ],
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function formatUpdated(iso: string): string {
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
    : "The queue request could not be completed.";
}

function isStaffAccessError(error: unknown): boolean {
  return (
    error instanceof AppointmentApiError &&
    (error.status === 403 || error.code === "STAFF_ACCESS_REQUIRED")
  );
}

function QueueEstimate({ estimate }: { estimate: WaitEstimate }) {
  if (!estimate.available) {
    return (
      <div className="appointment-estimate appointment-estimate--unavailable">
        <strong>Department waiting-time estimate unavailable</strong>
        <p>{estimate.reason}</p>
        <small>
          {estimate.activeQueueCount} active queue entr
          {estimate.activeQueueCount === 1 ? "y" : "ies"};{" "}
          {estimate.recentConsultations} recent completed consultation
          {estimate.recentConsultations === 1 ? "" : "s"}.
        </small>
      </div>
    );
  }

  return (
    <div className="appointment-estimate">
      <strong>Department estimate: about {estimate.minutes} minutes</strong>
      <p>{estimate.basis}</p>
      <small>Last estimate update: {formatUpdated(estimate.updatedAt)}.</small>
    </div>
  );
}

export default function HospitalQueuePage() {
  const [catalog, setCatalog] = useState<AppointmentCatalog | null>(null);
  const [hospitalId, setHospitalId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [walkInDoctorId, setWalkInDoctorId] = useState("");
  const [walkInName, setWalkInName] = useState("");

  const [queue, setQueue] = useState<QueueView | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [actionError, setActionError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyKey, setBusyKey] = useState("");
  const [walkInBusy, setWalkInBusy] = useState(false);
  const [walkInError, setWalkInError] = useState("");

  useEffect(() => {
    let cancelled = false;

    getAppointmentCatalog()
      .then((result) => {
        if (cancelled) return;
        setCatalog(result);

        const firstHospital = result.hospitals[0];
        const firstDepartment = firstHospital?.departments[0];
        const firstDoctor = firstDepartment?.doctors[0];

        setHospitalId(firstHospital?.id ?? "");
        setDepartmentId(firstDepartment?.id ?? "");
        setWalkInDoctorId(firstDoctor?.id ?? "");
      })
      .catch((error) => {
        if (!cancelled) {
          setPageError(errorMessage(error));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (accessDenied) {
      return;
    }

    const timer = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        !loading &&
        busyKey === "" &&
        !walkInBusy
      ) {
        setRefreshKey((key) => key + 1);
      }
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [accessDenied, busyKey, loading, walkInBusy]);

  useEffect(() => {
    if (!hospitalId || !departmentId) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setPageError("");
    setActionError("");
    setAccessDenied(false);

    getStaffQueue(hospitalId, departmentId)
      .then((result) => {
        if (!cancelled) {
          setQueue(result);
        }
      })
      .catch((error) => {
        if (cancelled) return;

        if (isStaffAccessError(error)) {
          setAccessDenied(true);
          setQueue(null);
        } else {
          setPageError(errorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [departmentId, hospitalId, refreshKey]);

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

  function handleHospitalChange(nextHospitalId: string) {
    const hospital = catalog?.hospitals.find(
      (candidate) => candidate.id === nextHospitalId,
    );
    const department = hospital?.departments[0];
    const doctor = department?.doctors[0];

    setHospitalId(nextHospitalId);
    setDepartmentId(department?.id ?? "");
    setWalkInDoctorId(doctor?.id ?? "");
    setWalkInError("");
  }

  function handleDepartmentChange(nextDepartmentId: string) {
    const department = selectedHospital?.departments.find(
      (candidate) => candidate.id === nextDepartmentId,
    );

    setDepartmentId(nextDepartmentId);
    setWalkInDoctorId(department?.doctors[0]?.id ?? "");
    setWalkInError("");
  }

  async function handleTransition(
    appointmentId: string,
    status: AppointmentStatus,
  ) {
    if (
      (status === "cancelled" || status === "missed") &&
      !window.confirm(
        `Mark this visit as ${status === "cancelled" ? "cancelled" : "missed"}?`,
      )
    ) {
      return;
    }

    setBusyKey(`${appointmentId}:${status}`);
    setActionError("");
    setNotice("");

    try {
      await transitionAppointmentStatus(appointmentId, status);
      setNotice("Queue status updated.");
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusyKey("");
    }
  }

  async function handleWalkIn(event: FormEvent) {
    event.preventDefault();
    setWalkInError("");
    setActionError("");
    setNotice("");

    if (walkInName.trim().length < 2) {
      setWalkInError("Enter the patient's name.");
      return;
    }

    setWalkInBusy(true);

    try {
      const view = await createWalkIn({
        hospitalId,
        departmentId,
        doctorId: walkInDoctorId,
        patientName: walkInName.trim(),
      });
      setWalkInName("");
      setNotice(
        `Walk-in ${view.appointment.reference} (Token: ${view.appointment.digitalToken ?? "Allocated"}) checked in and waiting.`,
      );
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setWalkInError(errorMessage(error));
    } finally {
      setWalkInBusy(false);
    }
  }

  return (
    <div className="container page appointments-page">
      <header className="page__header page__header--split">
        <div>
          <h1>Tokenless Queue</h1>
          <p>
            Review same-day arrivals, check patients in, and move each visit
            through explicit staff-controlled statuses.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--small btn--ghost"
          disabled={loading || accessDenied}
          onClick={() => setRefreshKey((key) => key + 1)}
        >
          Refresh queue
        </button>
      </header>

      <div className="appointment-demo-note">
        <strong>Demo operations:</strong> queue records and timing estimates
        use fictional data and reset when the backend restarts. This page
        refreshes automatically every 30 seconds. No real patient, hospital,
        or clinical decision is represented here.
      </div>

      {notice && (
        <div className="appointment-success" role="status">
          {notice}
        </div>
      )}

      {actionError && (
        <div className="appointment-page-error" role="alert">
          <strong>Action not completed.</strong>
          <p>{actionError}</p>
        </div>
      )}

      {selectedHospital && (
        <div className="appointment-fields appointment-fields--queue">
          <label>
            Hospital
            <select
              value={hospitalId}
              onChange={(event) =>
                handleHospitalChange(event.target.value)
              }
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
            >
              {selectedHospital.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {accessDenied ? (
        <section className="appointment-access-card">
          <h2>Staff access required</h2>
          <p>
            This account is signed in but is not authorized for the appointment
            staff queue. Ask an administrator to add this user ID to{" "}
            <code>APPOINTMENT_STAFF_USER_IDS</code> or set trusted app metadata{" "}
            <code>appointment_staff</code>. Users cannot grant this access
            themselves.
          </p>
        </section>
      ) : pageError ? (
        <section className="appointment-page-error" role="alert">
          <strong>Could not load the queue.</strong>
          <p>{pageError}</p>
          <button
            type="button"
            className="btn btn--small btn--secondary"
            onClick={() => setRefreshKey((key) => key + 1)}
          >
            Retry
          </button>
        </section>
      ) : loading && !queue ? (
        <p className="appointment-muted">Loading queue...</p>
      ) : (
        <>
          {queue && <QueueEstimate estimate={queue.waitEstimate} />}
          {queue?.currentServingDigitalToken && (
            <div
              className="appointment-notice"
              style={{
                marginBottom: "16px",
                padding: "10px 16px",
                backgroundColor: "#eff6ff",
                borderLeft: "4px solid #0284c7",
                borderRadius: "4px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                <strong>Now Calling / Serving Token:</strong>{" "}
                <span
                  style={{
                    fontSize: "1.2rem",
                    fontWeight: 700,
                    color: "#0284c7",
                    marginLeft: "6px",
                  }}
                >
                  {queue.currentServingDigitalToken}
                </span>
              </span>
              <span>
                <strong>{queue.activeCount ?? 0}</strong> active visits in queue
              </span>
            </div>
          )}

          <div className="queue-layout">
            <section className="appointment-panel">
              <div className="appointment-panel__head">
                <div>
                  <p className="appointment-eyebrow">
                    Pending requests and same-day arrivals
                  </p>
                  <h2>Department queue</h2>
                </div>
                <span className="appointment-page-meta">
                  <span>
                    <strong>{queue?.appointments.length ?? 0}</strong> visits
                  </span>
                </span>
              </div>

              {!queue || queue.appointments.length === 0 ? (
                <p className="appointment-empty">
                  No pending requests or same-day arrivals are recorded for
                  this department. Checked-in online appointments and walk-ins
                  will appear here.
                </p>
              ) : (
                <div className="queue-list">
                  {queue.appointments.map((view) => {
                    const item = view.appointment;
                    const actions = NEXT_ACTIONS[item.status] ?? [];

                    return (
                      <article key={item.id} className="queue-card">
                        <div className="queue-card__head">
                          <div>
                            <strong>{item.patientName}</strong>
                            <span>{item.reference}</span>
                          </div>
                          <AppointmentStatusBadge status={item.status} />
                        </div>

                        <p className="queue-card__meta">
                          {item.source === "walk_in"
                            ? "Walk-in"
                            : "Online appointment"}{" "}
                          | {formatDateTime(item.scheduledAt)} |{" "}
                          {item.doctorName}
                        </p>

                        <p className="queue-card__meta">
                          Checked in:{" "}
                          {item.checkedInAt
                            ? formatDateTime(item.checkedInAt)
                            : "Not yet"}
                        </p>

                        {actions.length > 0 && (
                          <div className="queue-card__actions">
                            {actions.map((action) => (
                              <button
                                key={action.status}
                                type="button"
                                className={`btn btn--${action.tone} btn--small`}
                                disabled={busyKey !== ""}
                                onClick={() =>
                                  handleTransition(item.id, action.status)
                                }
                              >
                                {busyKey === `${item.id}:${action.status}`
                                  ? "Updating..."
                                  : action.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <aside className="appointment-column">
              <section className="appointment-panel">
                <div className="appointment-panel__head">
                  <div>
                    <p className="appointment-eyebrow">Assisted registration</p>
                    <h2>Add a walk-in</h2>
                  </div>
                </div>

                <form className="appointment-form" onSubmit={handleWalkIn}>
                  <label>
                    Patient name
                    <input
                      type="text"
                      value={walkInName}
                      maxLength={80}
                      onChange={(event) =>
                        setWalkInName(event.target.value)
                      }
                      placeholder="Walk-in patient name"
                      required
                    />
                  </label>

                  <label>
                    Doctor
                    <select
                      value={walkInDoctorId}
                      onChange={(event) =>
                        setWalkInDoctorId(event.target.value)
                      }
                      disabled={!selectedDepartment}
                    >
                      {selectedDepartment?.doctors.map((doctor) => (
                        <option key={doctor.id} value={doctor.id}>
                          {doctor.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {walkInError && (
                    <p className="appointment-inline-error" role="alert">
                      {walkInError}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="btn btn--primary"
                    disabled={walkInBusy || !departmentId}
                  >
                    {walkInBusy ? "Adding..." : "Check in walk-in"}
                  </button>
                </form>

                <p className="appointment-muted">
                  Walk-in registration stays available for people who cannot
                  book online. Walk-ins receive an atomic digital queue token automatically upon registration.
                </p>
              </section>

              <section className="appointment-help-card">
                <p className="appointment-eyebrow">Clinical safety</p>
                <h2>No automatic priority</h2>
                <p>
                  This queue does not assign emergency or clinical priority.
                  Follow the hospital's existing emergency process for urgent
                  cases. Staff must make all priority and care decisions.
                </p>
                <p className="appointment-muted">
                  Waiting estimates appear only when recent queue and
                  consultation records exist. They are not guarantees.
                </p>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
