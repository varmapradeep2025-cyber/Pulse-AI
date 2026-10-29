import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  AVAILABILITY_LABELS,
  createResourceRequest,
  EMPTY_BLOOD_FILTERS,
  EMPTY_HOSPITAL_FILTERS,
  EMPTY_REQUEST_FILTERS,
  EMPTY_SUPPLIER_FILTERS,
  filterBloodCentres,
  filterHospitalCandidates,
  filterResourceRequests,
  filterSupplierCandidates,
  formatAge,
  getBloodCentreCandidates,
  getDemoSnapshot,
  getDemoSnapshotLabel,
  getFreshness,
  getFreshnessLabel,
  getHospitalCandidates,
  getHospitalFilterOptions,
  getNextAction,
  getRecentActivity,
  getRequestCounts,
  getRequestDateRangeLabel,
  getRequestDraftFromBloodCentre,
  getRequestDraftFromHospital,
  getRequestDraftFromSupplier,
  getRequestStatusOptions,
  getSupplierCandidates,
  getSupplierFilterOptions,
  loadResourceRequests,
  resetResourceRequests,
  REQUEST_STATUS_LABELS,
  RESOURCE_CATEGORY_LABELS,
  transitionDemoRequestStatus,
  URGENCY_LABELS,
  validateResourceRequest,
} from "../api/resourceBridge";
import {
  DEMO_BLOOD_CENTRES,
  DEMO_HOSPITAL_RESOURCES,
  DEMO_SUPPLIERS,
  OFFICIAL_BLOOD_SERVICES,
  OFFICIAL_ORGAN_DONATION_SERVICES,
  RESOURCE_BRIDGE_DEMO_LABEL,
} from "../data/resourceBridgeDemo";
import { syntheticHospitals, SYNTHETIC_DATA_LABEL } from "../data/hospitals";
import type {
  BloodCentreCandidate,
  BloodComponent,
  BloodFilters,
  FreshnessFilter,
  HospitalCandidate,
  HospitalFilters,
  HospitalResource,
  RequestDraft,
  RequestFilters,
  RequestStatus,
  RequestUrgency,
  ResourceAvailability,
  ResourceCategory,
  ResourceRequest,
  ResourceRequestInput,
  SupplierCandidate,
  SupplierFilters,
} from "../types/resourceBridge";
import EmptyState from "../components/EmptyState";

type BridgeTab =
  | "overview"
  | "hospitals"
  | "suppliers"
  | "blood"
  | "requests"
  | "organ";

const TABS: Array<{ id: BridgeTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "hospitals", label: "Find hospitals" },
  { id: "suppliers", label: "Find suppliers" },
  { id: "blood", label: "Blood resources" },
  { id: "requests", label: "Requests" },
  { id: "organ", label: "Organ donation" },
];

const RESOURCE_CATEGORIES = Object.keys(
  RESOURCE_CATEGORY_LABELS,
) as ResourceCategory[];

const BLOOD_COMPONENTS: BloodComponent[] = [
  "Whole Blood",
  "Packed Red Cells",
  "Platelets",
  "Plasma",
  "Cryoprecipitate",
];

const AVAILABILITY_OPTIONS: Array<{
  value: ResourceAvailability | "any";
  label: string;
}> = [
  { value: "any", label: "Any availability" },
  { value: "available", label: AVAILABILITY_LABELS.available },
  { value: "low", label: AVAILABILITY_LABELS.low },
  { value: "unavailable", label: AVAILABILITY_LABELS.unavailable },
  { value: "unknown", label: AVAILABILITY_LABELS.unknown },
];

const FRESHNESS_OPTIONS: Array<{
  value: FreshnessFilter;
  label: string;
}> = [
  { value: "any", label: "Any update age" },
  { value: "24h", label: "Updated within 24h" },
  { value: "7d", label: "Updated within 7 days" },
  { value: "older7d", label: "Stale reports only" },
];

const URGENCY_OPTIONS: Array<{
  value: RequestUrgency | "any";
  label: string;
}> = [
  { value: "any", label: "Any urgency" },
  { value: "routine", label: URGENCY_LABELS.routine },
  { value: "urgent", label: URGENCY_LABELS.urgent },
  { value: "critical", label: URGENCY_LABELS.critical },
];

const STATUS_OPTIONS: Array<{
  value: RequestStatus | "all";
  label: string;
}> = [
  { value: "all", label: "All statuses" },
  ...Object.entries(REQUEST_STATUS_LABELS).map(([value, label]) => ({
    value: value as RequestStatus,
    label,
  })),
];

const DATE_RANGE_OPTIONS: Array<{
  value: RequestFilters["dateRange"];
  label: string;
}> = [
  { value: "all", label: getRequestDateRangeLabel("all") },
  { value: "7d", label: getRequestDateRangeLabel("7d") },
  { value: "30d", label: getRequestDateRangeLabel("30d") },
  { value: "older30d", label: getRequestDateRangeLabel("older30d") },
];

interface RequestFormState {
  draft: RequestDraft;
  context: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The demo operation could not be completed.";
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function typeLabel(category: ResourceCategory): string {
  return RESOURCE_CATEGORY_LABELS[category];
}

function AvailabilityBadge({
  availability,
}: {
  availability: ResourceAvailability;
}) {
  return (
    <span className={`rb-badge rb-badge--${availability}`}>
      {AVAILABILITY_LABELS[availability]}
    </span>
  );
}

function FreshnessBadge({
  lastUpdated,
  now,
}: {
  lastUpdated: string;
  now: Date;
}) {
  const freshness = getFreshness(lastUpdated, now);

  return (
    <span className={`rb-fresh rb-fresh--${freshness}`}>
      {getFreshnessLabel(freshness)}
    </span>
  );
}

function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={`rb-status rb-status--${status}`}>
      {REQUEST_STATUS_LABELS[status]}
    </span>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rb-metric">
      <span className="rb-metric__label">{label}</span>
      <strong className="rb-metric__value">{value}</strong>
      <span className="rb-metric__detail">{detail}</span>
    </div>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="filter">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function hospitalMatchReason(
  candidate: HospitalCandidate,
  filters: HospitalFilters,
): string {
  const parts = [
    `${candidate.facility.hospital_type} in ${candidate.facility.city}`,
    `${candidate.resources.length} matching demo resource report${
      candidate.resources.length === 1 ? "" : "s"
    }`,
  ];

  if (filters.category !== "all") {
    parts.push(`${RESOURCE_CATEGORY_LABELS[filters.category]} selected`);
  }

  if (filters.availability !== "any") {
    parts.push(AVAILABILITY_LABELS[filters.availability].toLowerCase());
  }

  if (filters.urgency !== "any") {
    parts.push(`${URGENCY_LABELS[filters.urgency].toLowerCase()} need`);
  }

  return parts.join(" · ");
}

function supplierMatchReason(
  supplier: SupplierCandidate,
  filters: SupplierFilters,
): string {
  const parts = [
    `Fictional supplier in ${supplier.city}`,
    `${supplier.resources.length} matching demo resource listing${
      supplier.resources.length === 1 ? "" : "s"
    }`,
  ];

  if (supplier.deliveryAvailable) {
    parts.push("delivery listed");
  }

  if (filters.category !== "all") {
    parts.push(`${RESOURCE_CATEGORY_LABELS[filters.category]} selected`);
  }

  return parts.join(" · ");
}

function ResourceRow({
  resource,
  onRequest,
}: {
  resource: HospitalResource;
  onRequest: () => void;
}) {
  return (
    <div className="rb-resource">
      <div className="rb-resource__main">
        <div className="rb-resource__title">
          <strong>{resource.resourceType}</strong>
          <span className="chip">{typeLabel(resource.category)}</span>
        </div>
        <p className="rb-resource__quantity">
          {resource.quantity === null
            ? "Quantity not reported"
            : `${resource.quantity.toLocaleString("en-IN")} ${resource.unit}`}
        </p>
        <p className="rb-resource__note">{resource.note}</p>
        <div className="rb-resource__meta">
          <AvailabilityBadge availability={resource.availability} />
          <FreshnessBadge
            lastUpdated={resource.lastUpdated}
            now={getDemoSnapshot()}
          />
          <span>Updated {formatAge(resource.lastUpdated)}</span>
          <span>Verification: demo fixture</span>
          <span>
            Urgent requests:{" "}
            {resource.acceptsUrgentRequests ? "listed as accepted" : "not accepted"}
          </span>
        </div>
      </div>
      <button
        type="button"
        className="btn btn--secondary btn--small"
        onClick={onRequest}
      >
        Start request
      </button>
    </div>
  );
}

function HospitalCard({
  candidate,
  filters,
  onRequest,
}: {
  candidate: HospitalCandidate;
  filters: HospitalFilters;
  onRequest: (draft: RequestDraft, context: string) => void;
}) {
  return (
    <article className="rb-card">
      <div className="rb-card__head">
        <div>
          <h3>{candidate.facility.hospital_name}</h3>
          <p className="rb-card__meta">
            {candidate.facility.city}, {candidate.facility.state} ·{" "}
            {candidate.facility.hospital_type}
          </p>
        </div>
        <span className="badge badge--demo">Synthetic facility</span>
      </div>

      <p className="rb-card__address">{candidate.facility.address}</p>
      <p className="rb-why">
        <strong>Why it appears:</strong> {hospitalMatchReason(candidate, filters)}
      </p>

      <div className="rb-resource-list">
        {candidate.resources.map((resource) => (
          <ResourceRow
            key={resource.id}
            resource={resource}
            onRequest={() =>
              onRequest(
                getRequestDraftFromHospital(candidate, resource.id),
                `${resource.resourceType} at ${candidate.facility.hospital_name}`,
              )
            }
          />
        ))}
      </div>
    </article>
  );
}

function SupplierCard({
  supplier,
  filters,
  onRequest,
}: {
  supplier: SupplierCandidate;
  filters: SupplierFilters;
  onRequest: (draft: RequestDraft, context: string) => void;
}) {
  return (
    <article className="rb-card">
      <div className="rb-card__head">
        <div>
          <h3>{supplier.supplierName}</h3>
          <p className="rb-card__meta">
            {supplier.city}, {supplier.state}
          </p>
        </div>
        <span className="badge badge--demo">Fictional supplier</span>
      </div>

      <p className="rb-why">
        <strong>Why it appears:</strong>{" "}
        {supplierMatchReason(supplier, filters)}
      </p>

      <p className="rb-supplier-meta">
        Delivery: {supplier.deliveryAvailable ? "listed" : "not listed"} ·
        Emergency lead time:{" "}
        {supplier.emergencyLeadTimeDays === null
          ? "not reported"
          : `${supplier.emergencyLeadTimeDays} day${
              supplier.emergencyLeadTimeDays === 1 ? "" : "s"
            } (demo)`}
      </p>

      <div className="rb-resource-list">
        {supplier.resources.map((resource) => (
          <div className="rb-resource" key={resource.id}>
            <div className="rb-resource__main">
              <div className="rb-resource__title">
                <strong>{resource.resourceType}</strong>
                <span className="chip">{typeLabel(resource.category)}</span>
              </div>
              <p className="rb-resource__quantity">
                {resource.quantity === null
                  ? "Quantity not reported"
                  : `${resource.quantity.toLocaleString("en-IN")} ${resource.unit}`}
              </p>
              <p className="rb-resource__note">{resource.note}</p>
              <div className="rb-resource__meta">
                <AvailabilityBadge availability={resource.availability} />
                <FreshnessBadge
                  lastUpdated={resource.lastUpdated}
                  now={getDemoSnapshot()}
                />
                <span>Updated {formatAge(resource.lastUpdated)}</span>
                <span>Verification: demo fixture</span>
                <span>Lead times are not commitments</span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn--secondary btn--small"
              onClick={() =>
                onRequest(
                  getRequestDraftFromSupplier(supplier, resource.id),
                  `${resource.resourceType} from ${supplier.supplierName}`,
                )
              }
            >
              Start demo request
            </button>
          </div>
        ))}
      </div>

      <p className="rb-fineprint">{supplier.note}</p>
    </article>
  );
}

function BloodCard({
  centre,
  onRequest,
}: {
  centre: BloodCentreCandidate;
  onRequest: (draft: RequestDraft, context: string) => void;
}) {
  return (
    <article className="rb-card">
      <div className="rb-card__head">
        <div>
          <h3>{centre.name}</h3>
          <p className="rb-card__meta">
            {centre.city}, {centre.state} · {centre.centreType}
          </p>
        </div>
        <span className="badge badge--demo">Fictional centre</span>
      </div>

      <p className="rb-card__address">{centre.address}</p>
      <p className="rb-fineprint">{centre.note}</p>

      <div className="rb-blood-list">
        {centre.components.map((component) => (
          <div className="rb-blood-row" key={component.component}>
            <div>
              <strong>{component.component}</strong>
              <div className="rb-resource__meta">
                <AvailabilityBadge availability={component.availability} />
                <FreshnessBadge
                  lastUpdated={component.lastUpdated}
                  now={getDemoSnapshot()}
                />
                <span>Updated {formatAge(component.lastUpdated)}</span>
                <span>Verification: demo fixture</span>
              </div>
            </div>
            <div className="rb-blood-row__units">
              <span>
                {component.units === null
                  ? "Units not reported"
                  : `${component.units} units listed`}
              </span>
              <button
                type="button"
                className="btn btn--secondary btn--tiny"
                onClick={() =>
                  onRequest(
                    getRequestDraftFromBloodCentre(centre, component.component),
                    `${component.component} at ${centre.name}`,
                  )
                }
              >
                Start demo request
              </button>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function RequestCard({
  request,
  now,
  transitionError,
  onTransition,
}: {
  request: ResourceRequest;
  now: Date;
  transitionError: string;
  onTransition: (id: string, status: RequestStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<RequestStatus | "">("");
  const options = getRequestStatusOptions(request.status);
  const chosenStatus =
    nextStatus && options.includes(nextStatus) ? nextStatus : options[0];

  return (
    <article className={`rb-request${open ? " rb-request--open" : ""}`}>
      <button
        type="button"
        className="rb-request__head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="rb-request__title">
          <strong>{request.resourceType}</strong>
          <span>{request.reference}</span>
        </span>
        <span className="rb-request__badges">
          <span className={`rb-urgency rb-urgency--${request.urgency}`}>
            {URGENCY_LABELS[request.urgency]}
          </span>
          <StatusBadge status={request.status} />
          <span aria-hidden="true">{open ? "−" : "+"}</span>
        </span>
      </button>

      <div className="rb-request__summary">
        <span>{request.requestingFacility}</span>
        <span>Needed by {formatDateTime(request.requiredBy)}</span>
        <span>Updated {formatAge(request.updatedAt, now)}</span>
      </div>

      {open && (
        <div className="rb-request__detail">
          <div className="rb-detail-grid">
            <span>
              <strong>Quantity:</strong>{" "}
              {request.quantity === null
                ? "Not specified"
                : `${request.quantity} ${request.unit}`}
            </span>
            <span>
              <strong>Category:</strong>{" "}
              {RESOURCE_CATEGORY_LABELS[request.category]}
            </span>
            <span>
              <strong>Preferred partner:</strong>{" "}
              {request.preferredPartner || "Not specified"}
            </span>
            <span>
              <strong>Responsible organisation:</strong>{" "}
              {request.responsibleOrganization}
            </span>
            <span>
              <strong>Destination:</strong>{" "}
              {request.destination || "Not specified"}
            </span>
            <span>
              <strong>Created:</strong> {formatDateTime(request.createdAt)}
            </span>
          </div>

          {request.notes && (
            <p className="rb-request__notes">
              <strong>Notes:</strong> {request.notes}
            </p>
          )}

          <p className="rb-next-action">
            <strong>Next action:</strong> {getNextAction(request)}
          </p>

          <div className="rb-request__grid">
            <div>
              <h4>Status history</h4>
              <ol className="rb-timeline">
                {request.events.map((event, index) => (
                  <li key={`${event.at}-${index}`}>
                    <div className="rb-timeline__head">
                      <StatusBadge status={event.status} />
                      <span>{formatDateTime(event.at)}</span>
                    </div>
                    <p>{event.note}</p>
                    <span className="rb-timeline__actor">{event.actor}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <h4>Status control</h4>
              <p className="rb-fineprint">
                These controls only update this browser&apos;s demo record. No
                organisation is contacted and no transfer or delivery is
                confirmed.
              </p>

              {options.length === 0 ? (
                <p className="rb-fineprint">
                  This request is in a final state and cannot move further.
                </p>
              ) : (
                <div className="rb-status-form">
                  <label className="filter">
                    <span>Move to</span>
                    <select
                      value={chosenStatus}
                      onChange={(event) =>
                        setNextStatus(event.target.value as RequestStatus)
                      }
                    >
                      {options.map((status) => (
                        <option key={status} value={status}>
                          {REQUEST_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => onTransition(request.id, chosenStatus)}
                  >
                    Update status
                  </button>
                </div>
              )}

              {transitionError && (
                <p className="rb-error" role="alert">
                  {transitionError}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function RequestForm({
  state,
  onClose,
  onCreated,
}: {
  state: RequestFormState;
  onClose: () => void;
  onCreated: (request: ResourceRequest, requests: ResourceRequest[]) => void;
}) {
  const [input, setInput] = useState<ResourceRequestInput>(() => ({
    category: state.draft.category ?? "medicines",
    resourceType: state.draft.resourceType ?? "",
    quantity: state.draft.quantity ?? null,
    unit: state.draft.unit ?? "",
    urgency: state.draft.urgency ?? "urgent",
    requiredBy: defaultRequiredBy(state.draft.urgency ?? "urgent"),
    requestingFacility: syntheticHospitals[0].hospital_name,
    destination: "",
    notes: state.draft.notes ?? "",
    preferredPartner: state.draft.preferredPartner ?? "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  function update<K extends keyof ResourceRequestInput>(
    key: K,
    value: ResourceRequestInput[K],
  ) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateResourceRequest(input);
    setErrors(validation.errors);
    setSubmitError("");

    if (!validation.valid) {
      return;
    }

    try {
      const result = createResourceRequest(input);
      onCreated(result.request, result.requests);
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    }
  }

  return (
    <div
      className="rb-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rb-request-form-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
    >
      <form className="rb-modal__panel rb-form" onSubmit={handleSubmit}>
        <div className="rb-form__head">
          <div>
            <span className="badge badge--demo">{RESOURCE_BRIDGE_DEMO_LABEL}</span>
            <h2 id="rb-request-form-title">Create coordination request</h2>
            <p>{state.context}</p>
          </div>
          <button
            type="button"
            className="rb-modal__close"
            aria-label="Close request form"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="rb-form__boundary">
          <strong>Browser-local only:</strong> saving creates a demo record in
          this browser&apos;s local storage. No request is sent to a hospital,
          supplier, blood centre, coordinator, or government system.
        </div>

        <div className="rb-form__grid">
          <label className="rb-field">
            <span>Requesting facility</span>
            <select
              value={input.requestingFacility}
              onChange={(event) =>
                update("requestingFacility", event.target.value)
              }
            >
              {syntheticHospitals.map((facility) => (
                <option key={facility.id} value={facility.hospital_name}>
                  {facility.hospital_name}
                </option>
              ))}
            </select>
            {errors.requestingFacility && (
              <span className="rb-field__error">{errors.requestingFacility}</span>
            )}
          </label>

          <label className="rb-field">
            <span>Resource category</span>
            <select
              value={input.category}
              onChange={(event) =>
                update("category", event.target.value as ResourceCategory)
              }
            >
              {RESOURCE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {RESOURCE_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
            {errors.category && (
              <span className="rb-field__error">{errors.category}</span>
            )}
          </label>

          <label className="rb-field">
            <span>Resource needed</span>
            <input
              type="text"
              value={input.resourceType}
              onChange={(event) => update("resourceType", event.target.value)}
              placeholder="For example, insulin vials"
              aria-invalid={Boolean(errors.resourceType)}
            />
            {errors.resourceType && (
              <span className="rb-field__error">{errors.resourceType}</span>
            )}
          </label>

          <label className="rb-field">
            <span>Urgency</span>
            <select
              value={input.urgency}
              onChange={(event) =>
                update("urgency", event.target.value as RequestUrgency)
              }
            >
              <option value="routine">{URGENCY_LABELS.routine}</option>
              <option value="urgent">{URGENCY_LABELS.urgent}</option>
              <option value="critical">{URGENCY_LABELS.critical}</option>
            </select>
          </label>

          <label className="rb-field">
            <span>Quantity</span>
            <input
              type="number"
              min="1"
              step="1"
              value={input.quantity ?? ""}
              onChange={(event) =>
                update(
                  "quantity",
                  event.target.value === "" ? null : Number(event.target.value),
                )
              }
              aria-invalid={Boolean(errors.quantity)}
            />
            {errors.quantity && (
              <span className="rb-field__error">{errors.quantity}</span>
            )}
          </label>

          <label className="rb-field">
            <span>Unit</span>
            <input
              type="text"
              value={input.unit}
              onChange={(event) => update("unit", event.target.value)}
              placeholder="vials, units, beds"
              aria-invalid={Boolean(errors.unit)}
            />
            {errors.unit && (
              <span className="rb-field__error">{errors.unit}</span>
            )}
          </label>

          <label className="rb-field">
            <span>Needed by</span>
            <input
              type="datetime-local"
              value={input.requiredBy}
              onChange={(event) => update("requiredBy", event.target.value)}
              aria-invalid={Boolean(errors.requiredBy)}
            />
            {errors.requiredBy && (
              <span className="rb-field__error">{errors.requiredBy}</span>
            )}
          </label>

          <label className="rb-field">
            <span>Preferred partner</span>
            <input
              type="text"
              value={input.preferredPartner}
              onChange={(event) => update("preferredPartner", event.target.value)}
              placeholder="Optional facility or supplier"
            />
          </label>

          <label className="rb-field rb-field--wide">
            <span>Destination / delivery requirements</span>
            <input
              type="text"
              value={input.destination}
              onChange={(event) => update("destination", event.target.value)}
              placeholder="Store, ward, collection point, or logistics notes"
              aria-invalid={Boolean(errors.destination)}
            />
            {errors.destination && (
              <span className="rb-field__error">{errors.destination}</span>
            )}
          </label>

          <label className="rb-field rb-field--wide">
            <span>Notes</span>
            <textarea
              rows={3}
              maxLength={500}
              value={input.notes}
              onChange={(event) => update("notes", event.target.value)}
              placeholder="Operational details only"
              aria-invalid={Boolean(errors.notes)}
            />
            <span className="rb-field__hint">
              Do not include patient names, phone numbers, ID numbers,
              diagnoses, or other identifying information. {input.notes.length}
              /500 characters.
            </span>
            {errors.notes && (
              <span className="rb-field__error">{errors.notes}</span>
            )}
          </label>
        </div>

        <p className="rb-fineprint">
          This form collects operational coordination details only. It does not
          assess clinical suitability, blood compatibility, organ allocation, or
          patient eligibility.
        </p>

        {submitError && (
          <p className="rb-error" role="alert">
            {submitError}
          </p>
        )}

        <div className="rb-form__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Save request
          </button>
        </div>
      </form>
    </div>
  );
}

function defaultRequiredBy(urgency: RequestUrgency): string {
  const date = new Date(
    Date.now() +
      (urgency === "critical" ? 2 : urgency === "urgent" ? 4 : 24) * 3_600_000,
  );
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ResourceBridgePage() {
  const now = useMemo(() => new Date(), []);
  const demoNow = useMemo(() => getDemoSnapshot(), []);
  const [tab, setTab] = useState<BridgeTab>("overview");

  const [hospitalFilters, setHospitalFilters] = useState<HospitalFilters>({
    ...EMPTY_HOSPITAL_FILTERS,
  });
  const [supplierFilters, setSupplierFilters] = useState<SupplierFilters>({
    ...EMPTY_SUPPLIER_FILTERS,
  });
  const [bloodFilters, setBloodFilters] = useState<BloodFilters>({
    ...EMPTY_BLOOD_FILTERS,
  });
  const [requestFilters, setRequestFilters] = useState<RequestFilters>({
    ...EMPTY_REQUEST_FILTERS,
  });

  const [requestState, setRequestState] = useState<{
    requests: ResourceRequest[];
    error: string;
  }>(() => {
    try {
      return { requests: loadResourceRequests(), error: "" };
    } catch (error) {
      return { requests: [], error: getErrorMessage(error) };
    }
  });

  const [requestForm, setRequestForm] = useState<RequestFormState | null>(null);
  const [requestNotice, setRequestNotice] = useState("");
  const [transitionError, setTransitionError] = useState("");

  const hospitalCandidates = useMemo(() => getHospitalCandidates(), []);
  const supplierCandidates = useMemo(() => getSupplierCandidates(), []);
  const bloodCentreCandidates = useMemo(() => getBloodCentreCandidates(), []);

  const hospitalOptions = useMemo(
    () => getHospitalFilterOptions(hospitalCandidates),
    [hospitalCandidates],
  );
  const supplierOptions = useMemo(
    () => getSupplierFilterOptions(supplierCandidates),
    [supplierCandidates],
  );

  const filteredHospitals = useMemo(
    () => filterHospitalCandidates(hospitalCandidates, hospitalFilters, demoNow),
    [hospitalCandidates, hospitalFilters, demoNow],
  );
  const filteredSuppliers = useMemo(
    () => filterSupplierCandidates(supplierCandidates, supplierFilters, demoNow),
    [supplierCandidates, supplierFilters, demoNow],
  );
  const filteredBloodCentres = useMemo(
    () => filterBloodCentres(bloodCentreCandidates, bloodFilters, demoNow),
    [bloodCentreCandidates, bloodFilters, demoNow],
  );
  const filteredRequests = useMemo(
    () => filterResourceRequests(requestState.requests, requestFilters, now),
    [requestState.requests, requestFilters, now],
  );

  const requestCounts = useMemo(
    () => getRequestCounts(requestState.requests),
    [requestState.requests],
  );
  const recentActivity = useMemo(
    () => getRecentActivity(requestState.requests),
    [requestState.requests],
  );

  const availableReports = DEMO_HOSPITAL_RESOURCES.filter(
    (resource) => resource.availability === "available",
  ).length;
  const availableSupplierListings = DEMO_SUPPLIERS.flatMap(
    (supplier) => supplier.resources,
  ).filter((resource) => resource.availability === "available").length;

  function openRequestForm(draft: RequestDraft, context: string) {
    setRequestForm({ draft, context });
    setRequestNotice("");
  }

  function handleRequestCreated(
    request: ResourceRequest,
    requests: ResourceRequest[],
  ) {
    setRequestState({ requests, error: "" });
    setRequestForm(null);
    setTransitionError("");
    setRequestNotice(
      `Demo request ${request.reference} was saved in this browser only. No hospital, supplier, blood centre, or coordinator was contacted.`,
    );
    setTab("requests");
  }

  function handleTransition(requestId: string, status: RequestStatus) {
    try {
      const result = transitionDemoRequestStatus(requestId, status);
      setRequestState({ requests: result.requests, error: "" });
      setTransitionError("");
      setRequestNotice(
        `Demo status updated to ${REQUEST_STATUS_LABELS[status].toLowerCase()} in browser storage only. This is not a real acknowledgement or delivery confirmation.`,
      );
    } catch (error) {
      setTransitionError(getErrorMessage(error));
    }
  }

  function handleResetRequests() {
    try {
      const requests = resetResourceRequests();
      setRequestState({ requests, error: "" });
      setTransitionError("");
      setRequestNotice(
        "Demo requests were reset to the seeded local fixture. Nothing was sent or deleted from a backend.",
      );
    } catch (error) {
      setTransitionError(getErrorMessage(error));
    }
  }

  const sourceCards: Array<{
    tab: BridgeTab;
    title: string;
    count: number;
    unit: string;
    description: string;
  }> = [
    {
      tab: "hospitals",
      title: "Hospital resources",
      count: new Set(DEMO_HOSPITAL_RESOURCES.map((item) => item.hospitalId)).size,
      unit: "synthetic facilities",
      description:
        "Browse the existing synthetic facility directory with fictional resource availability reports.",
    },
    {
      tab: "suppliers",
      title: "Supplier network",
      count: DEMO_SUPPLIERS.length,
      unit: "fictional suppliers",
      description:
        "Explore clearly fictional supplier listings, demo lead times, and delivery flags.",
    },
    {
      tab: "blood",
      title: "Blood resources",
      count: DEMO_BLOOD_CENTRES.length,
      unit: "fictional centres",
      description:
        "View operational component reports and official national blood-service links. No compatibility matching.",
    },
    {
      tab: "organ",
      title: "Organ donation",
      count: OFFICIAL_ORGAN_DONATION_SERVICES.length,
      unit: "official services",
      description:
        "Official donation information only. Pulse AI does not list organs or match donors and recipients.",
    },
  ];

  return (
    <div className="container page rb-page">
      <header className="rb-hero">
        <div className="rb-hero__top">
          <div>
            <span className="badge badge--demo">
              {RESOURCE_BRIDGE_DEMO_LABEL}
            </span>
            <h1>Resource Bridge</h1>
            <p>
              Coordinate hospital resources, supplier listings, blood-service
              information, and operational requests in one place. This module
              is a prototype with no live integrations.
            </p>
          </div>
          <div className="rb-snapshot">
            <span>Current snapshot</span>
            <strong>{getDemoSnapshotLabel()}</strong>
            <small>
              No live hospital, supplier, blood-bank, or government feed is
              connected.
            </small>
          </div>
        </div>
        <div className="rb-hero__boundary">
          <strong>Prototype boundary:</strong> requests are stored in this
          browser only. There is no backend request API, coordinator
          authorisation, supplier integration, or confirmed availability.
        </div>
      </header>

      {requestNotice && (
        <div className="rb-notice" role="status">
          <span>{requestNotice}</span>
          <button
            type="button"
            className="rb-notice__close"
            onClick={() => setRequestNotice("")}
            aria-label="Dismiss notice"
          >
            ✕
          </button>
        </div>
      )}

      <nav className="rb-tabs" aria-label="Resource Bridge sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rb-tab${tab === item.id ? " rb-tab--active" : ""}`}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => {
              setTab(item.id);
              setTransitionError("");
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          <section className="rb-section">
            <div className="rb-section__head">
              <div>
                <h2>Network snapshot</h2>
                <p>
                  Counts describe deterministic demo fixtures, not real
                  facilities, stock, or demand.
                </p>
              </div>
              <span className="rb-source-tag">
                {SYNTHETIC_DATA_LABEL} + fictional resource fixtures
              </span>
            </div>

            <div className="rb-metrics">
              <Metric
                label="Hospital facilities"
                value={sourceCards[0].count}
                detail="synthetic directory entries with demo reports"
              />
              <Metric
                label="Reported available"
                value={availableReports}
                detail="hospital resource reports in the demo snapshot"
              />
              <Metric
                label="Fictional suppliers"
                value={DEMO_SUPPLIERS.length}
                detail={`${availableSupplierListings} available demo listings`}
              />
              <Metric
                label="Blood centres"
                value={DEMO_BLOOD_CENTRES.length}
                detail="fictional component reports only"
              />
              <Metric
                label="Active requests"
                value={requestState.requests.length}
                detail={`${requestCounts.open} open · ${requestCounts.urgent} urgent`}
              />
            </div>
          </section>

          <section className="rb-section">
            <div className="rb-section__head">
              <div>
                <h2>Browse the bridge</h2>
                <p>
                  Each section states its data source and what it does not
                  confirm.
                </p>
              </div>
            </div>

            <div className="rb-source-grid">
              {sourceCards.map((source) => (
                <article className="rb-card rb-source-card" key={source.tab}>
                  <div className="rb-card__head">
                    <div>
                      <h3>{source.title}</h3>
                      <p className="rb-card__meta">
                        {source.count} {source.unit}
                      </p>
                    </div>
                    <span className="badge badge--demo">Demo</span>
                  </div>
                  <p>{source.description}</p>
                  <button
                    type="button"
                    className="btn btn--secondary btn--small"
                    onClick={() => setTab(source.tab)}
                  >
                    Open section
                  </button>
                </article>
              ))}
            </div>
          </section>

          <div className="rb-two-col">
            <section className="rb-panel">
              <div className="rb-section__head">
                <div>
                  <h2>Request tracking</h2>
                  <p>Browser-local demo records and seeded status history.</p>
                </div>
                <span className="rb-source-tag">Local storage</span>
              </div>

              <div className="rb-request-counts">
                <span>
                  <strong>{requestCounts.open}</strong> open
                </span>
                <span>
                  <strong>{requestCounts.urgent}</strong> urgent
                </span>
                <span>
                  <strong>{requestCounts.awaitingResponse}</strong> pending
                </span>
                <span>
                  <strong>{requestCounts.completed}</strong> completed
                </span>
              </div>

              <p className="rb-fineprint">
                Backend persistence, pagination, coordinator queues, and
                role-based actions are not implemented.
              </p>

              <div className="rb-actions">
                <button
                  type="button"
                  className="btn btn--primary btn--small"
                  onClick={() => setTab("requests")}
                >
                  Open requests
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() =>
                    openRequestForm(
                      {},
                      "General operational coordination request",
                    )
                  }
                >
                  Create request
                </button>
              </div>
            </section>

            <section className="rb-panel">
              <div className="rb-section__head">
                <div>
                  <h2>Recent activity</h2>
                  <p>Status events from the local demo request history.</p>
                </div>
              </div>

              {recentActivity.length === 0 ? (
                <p className="rb-fineprint">No demo request activity yet.</p>
              ) : (
                <ul className="rb-activity">
                  {recentActivity.map((item, index) => (
                    <li key={`${item.requestId}-${item.at}-${index}`}>
                      <div className="rb-activity__head">
                        <strong>{item.reference}</strong>
                        <StatusBadge status={item.status} />
                      </div>
                      <span>
                        {item.resourceType} · {formatAge(item.at, demoNow)}
                      </span>
                      <p>{item.note}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="demo-note">
            <strong>Not implemented:</strong> live availability, backend
            persistence, coordinator authorisation, escalation SLAs, supplier
            confirmation, blood compatibility, organ allocation, and emergency
            dispatch. Do not use this prototype for real care or procurement
            decisions.
          </div>
        </>
      )}

      {tab === "hospitals" && (
        <section className="rb-section">
          <div className="rb-section__head">
            <div>
              <h2>Find hospitals</h2>
              <p>
                Search the existing synthetic facility directory and fictional
                resource reports. A listed facility does not imply real
                availability, transfer acceptance, or clinical suitability.
              </p>
            </div>
            <span className="rb-source-tag">{SYNTHETIC_DATA_LABEL}</span>
          </div>

          <div className="rb-note">
            <strong>Facility data:</strong> names, addresses, and capacities are
            fictional. Resource availability is a separate demo report and is
            never confirmed live.
          </div>

          <label className="search">
            <span className="sr-only">Search hospitals and resources</span>
            <input
              type="search"
              value={hospitalFilters.query}
              onChange={(event) =>
                setHospitalFilters((current) => ({
                  ...current,
                  query: event.target.value,
                }))
              }
              placeholder="Search hospital, city, or resource"
            />
          </label>

          <div className="filters" role="group" aria-label="Hospital filters">
            <SelectFilter
              label="Category"
              value={hospitalFilters.category}
              onChange={(value) =>
                setHospitalFilters((current) => ({
                  ...current,
                  category: value as ResourceCategory | "all",
                }))
              }
            >
              <option value="all">All categories</option>
              {hospitalOptions.categories.map((category) => (
                <option key={category} value={category}>
                  {RESOURCE_CATEGORY_LABELS[category]}
                </option>
              ))}
            </SelectFilter>

            <SelectFilter
              label="Availability"
              value={hospitalFilters.availability}
              onChange={(value) =>
                setHospitalFilters((current) => ({
                  ...current,
                  availability: value as ResourceAvailability | "any",
                }))
              }
            >
              {AVAILABILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectFilter>

            <SelectFilter
              label="Urgency fit"
              value={hospitalFilters.urgency}
              onChange={(value) =>
                setHospitalFilters((current) => ({
                  ...current,
                  urgency: value as RequestUrgency | "any",
                }))
              }
            >
              {URGENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectFilter>

            <SelectFilter
              label="Facility type"
              value={hospitalFilters.facilityType}
              onChange={(value) =>
                setHospitalFilters((current) => ({
                  ...current,
                  facilityType: value,
                }))
              }
            >
              <option value="all">All facility types</option>
              {hospitalOptions.facilityTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </SelectFilter>

            <SelectFilter
              label="City"
              value={hospitalFilters.city}
              onChange={(value) =>
                setHospitalFilters((current) => ({ ...current, city: value }))
              }
            >
              <option value="all">All cities</option>
              {hospitalOptions.cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </SelectFilter>

            <SelectFilter
              label="Update age"
              value={hospitalFilters.freshness}
              onChange={(value) =>
                setHospitalFilters((current) => ({
                  ...current,
                  freshness: value as FreshnessFilter,
                }))
              }
            >
              {FRESHNESS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectFilter>
          </div>

          <div className="rb-results-bar">
            <span>
              Showing <strong>{filteredHospitals.length}</strong> hospital
              candidate{filteredHospitals.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--tiny"
              onClick={() =>
                setHospitalFilters({ ...EMPTY_HOSPITAL_FILTERS })
              }
            >
              Clear filters
            </button>
          </div>

          {filteredHospitals.length === 0 ? (
            <EmptyState
              icon="🏥"
              title="No hospital resources match"
              description="Try a broader search, another city, or a different availability or update-age filter."
            />
          ) : (
            <div className="rb-card-list">
              {filteredHospitals.map((candidate) => (
                <HospitalCard
                  key={candidate.facility.hospital_id}
                  candidate={candidate}
                  filters={hospitalFilters}
                  onRequest={openRequestForm}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "suppliers" && (
        <section className="rb-section">
          <div className="rb-section__head">
            <div>
              <h2>Find suppliers</h2>
              <p>
                Explore fictional supplier listings and demo lead times. No
                supplier is real, and no listing is a quote, contract, or stock
                confirmation.
              </p>
            </div>
            <span className="rb-source-tag">Fictional supplier directory</span>
          </div>

          <div className="rb-note">
            <strong>Supplier boundary:</strong> names are fictional fixtures.
            Lead times and delivery flags are illustrative and must never be
            treated as commitments.
          </div>

          <label className="search">
            <span className="sr-only">Search suppliers and resources</span>
            <input
              type="search"
              value={supplierFilters.query}
              onChange={(event) =>
                setSupplierFilters((current) => ({
                  ...current,
                  query: event.target.value,
                }))
              }
              placeholder="Search supplier, city, or resource"
            />
          </label>

          <div className="filters" role="group" aria-label="Supplier filters">
            <SelectFilter
              label="Category"
              value={supplierFilters.category}
              onChange={(value) =>
                setSupplierFilters((current) => ({
                  ...current,
                  category: value as ResourceCategory | "all",
                }))
              }
            >
              <option value="all">All categories</option>
              {supplierOptions.categories.map((category) => (
                <option key={category} value={category}>
                  {RESOURCE_CATEGORY_LABELS[category]}
                </option>
              ))}
            </SelectFilter>

            <SelectFilter
              label="Availability"
              value={supplierFilters.availability}
              onChange={(value) =>
                setSupplierFilters((current) => ({
                  ...current,
                  availability: value as ResourceAvailability | "any",
                }))
              }
            >
              {AVAILABILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectFilter>

            <SelectFilter
              label="City"
              value={supplierFilters.city}
              onChange={(value) =>
                setSupplierFilters((current) => ({ ...current, city: value }))
              }
            >
              <option value="all">All cities</option>
              {supplierOptions.cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </SelectFilter>

            <SelectFilter
              label="Update age"
              value={supplierFilters.freshness}
              onChange={(value) =>
                setSupplierFilters((current) => ({
                  ...current,
                  freshness: value as FreshnessFilter,
                }))
              }
            >
              {FRESHNESS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectFilter>

            <label className="rb-check">
              <input
                type="checkbox"
                checked={supplierFilters.deliveryOnly}
                onChange={(event) =>
                  setSupplierFilters((current) => ({
                    ...current,
                    deliveryOnly: event.target.checked,
                  }))
                }
              />
              <span>Delivery listed only</span>
            </label>
          </div>

          <div className="rb-results-bar">
            <span>
              Showing <strong>{filteredSuppliers.length}</strong> fictional
              supplier{filteredSuppliers.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--tiny"
              onClick={() =>
                setSupplierFilters({ ...EMPTY_SUPPLIER_FILTERS })
              }
            >
              Clear filters
            </button>
          </div>

          {filteredSuppliers.length === 0 ? (
            <EmptyState
              icon="📦"
              title="No suppliers match"
              description="Try a broader search or remove the delivery and availability filters."
            />
          ) : (
            <div className="rb-card-list">
              {filteredSuppliers.map((supplier) => (
                <SupplierCard
                  key={supplier.supplierId}
                  supplier={supplier}
                  filters={supplierFilters}
                  onRequest={openRequestForm}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "blood" && (
        <section className="rb-section">
          <div className="rb-section__head">
            <div>
              <h2>Blood resources</h2>
              <p>
                Operational component reports from fictional demo centres, plus
                official national resources. Compatibility, cross-matching,
                donor eligibility, and release decisions are not handled here.
              </p>
            </div>
            <span className="rb-source-tag">Fictional centre reports</span>
          </div>

          <div className="rb-note rb-note--warning">
            <strong>Clinical boundary:</strong> never use this page to decide
            blood compatibility or transfusion. Contact a qualified blood bank
            or treating clinician. For an emergency, use local emergency
            services.
          </div>

          <label className="search">
            <span className="sr-only">Search blood centres or components</span>
            <input
              type="search"
              value={bloodFilters.query}
              onChange={(event) =>
                setBloodFilters((current) => ({
                  ...current,
                  query: event.target.value,
                }))
              }
              placeholder="Search centre, city, or component"
            />
          </label>

          <div className="filters" role="group" aria-label="Blood resource filters">
            <SelectFilter
              label="Component"
              value={bloodFilters.component}
              onChange={(value) =>
                setBloodFilters((current) => ({
                  ...current,
                  component: value as BloodComponent | "all",
                }))
              }
            >
              <option value="all">All components</option>
              {BLOOD_COMPONENTS.map((component) => (
                <option key={component} value={component}>
                  {component}
                </option>
              ))}
            </SelectFilter>

            <SelectFilter
              label="Availability"
              value={bloodFilters.availability}
              onChange={(value) =>
                setBloodFilters((current) => ({
                  ...current,
                  availability: value as ResourceAvailability | "any",
                }))
              }
            >
              {AVAILABILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectFilter>

            <SelectFilter
              label="City"
              value={bloodFilters.city}
              onChange={(value) =>
                setBloodFilters((current) => ({ ...current, city: value }))
              }
            >
              <option value="all">All cities</option>
              {Array.from(new Set(DEMO_BLOOD_CENTRES.map((centre) => centre.city)))
                .sort()
                .map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
            </SelectFilter>

            <SelectFilter
              label="Update age"
              value={bloodFilters.freshness}
              onChange={(value) =>
                setBloodFilters((current) => ({
                  ...current,
                  freshness: value as FreshnessFilter,
                }))
              }
            >
              {FRESHNESS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectFilter>
          </div>

          <div className="rb-results-bar">
            <span>
              Showing <strong>{filteredBloodCentres.length}</strong> fictional
              centre{filteredBloodCentres.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--tiny"
              onClick={() => setBloodFilters({ ...EMPTY_BLOOD_FILTERS })}
            >
              Clear filters
            </button>
          </div>

          {filteredBloodCentres.length === 0 ? (
            <EmptyState
              icon="🩸"
              title="No blood components match"
              description="Try another component, city, or availability filter. Availability is only a fictional demo report."
            />
          ) : (
            <div className="rb-card-list">
              {filteredBloodCentres.map((centre) => (
                <BloodCard
                  key={centre.centreId}
                  centre={centre}
                  onRequest={openRequestForm}
                />
              ))}
            </div>
          )}

          <section className="rb-official">
            <div className="rb-section__head">
              <div>
                <h2>Official blood services</h2>
                <p>
                  Use official government or Indian Red Cross resources for
                  real blood-bank information and donation guidance.
                </p>
              </div>
            </div>
            <div className="rb-official__grid">
              {OFFICIAL_BLOOD_SERVICES.map((service) => (
                <a
                  key={service.name}
                  className="rb-official__card"
                  href={service.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong>{service.name}</strong>
                  <span>{service.description}</span>
                  <em>Open official site →</em>
                </a>
              ))}
            </div>
          </section>
        </section>
      )}

      {tab === "requests" && (
        <section className="rb-section">
          <div className="rb-section__head">
            <div>
              <h2>Requests</h2>
              <p>
                Track browser-local demo requests from creation through
                recorded status changes. No backend request queue exists.
              </p>
            </div>
            <span className="rb-source-tag">Browser storage</span>
          </div>

          <div className="rb-request-counts">
            <span>
              <strong>{requestCounts.open}</strong> open
            </span>
            <span>
              <strong>{requestCounts.urgent}</strong> urgent
            </span>
            <span>
              <strong>{requestCounts.awaitingResponse}</strong> pending
            </span>
            <span>
              <strong>{requestCounts.completed}</strong> completed
            </span>
          </div>

          <div className="rb-note">
            <strong>Persistence boundary:</strong> records live only in this
            browser. Clearing site data removes them. This prototype has no
            authenticated coordinator, authorisation check, or server-side
            audit trail.
          </div>

          {requestState.error && (
            <div className="rb-error" role="alert">
              <strong>Local request data could not be read.</strong>{" "}
              {requestState.error}{" "}
              <button
                type="button"
                className="btn btn--ghost btn--tiny"
                onClick={handleResetRequests}
              >
                Reset requests
              </button>
            </div>
          )}

          {transitionError && (
            <div className="rb-error" role="alert">
              {transitionError}
            </div>
          )}

          <label className="search">
            <span className="sr-only">Search requests</span>
            <input
              type="search"
              value={requestFilters.query}
              onChange={(event) =>
                setRequestFilters((current) => ({
                  ...current,
                  query: event.target.value,
                }))
              }
              placeholder="Search reference, resource, facility, or partner"
            />
          </label>

          <div className="filters" role="group" aria-label="Request filters">
            <SelectFilter
              label="Status"
              value={requestFilters.status}
              onChange={(value) =>
                setRequestFilters((current) => ({
                  ...current,
                  status: value as RequestStatus | "all",
                }))
              }
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectFilter>

            <SelectFilter
              label="Category"
              value={requestFilters.category}
              onChange={(value) =>
                setRequestFilters((current) => ({
                  ...current,
                  category: value as ResourceCategory | "all",
                }))
              }
            >
              <option value="all">All categories</option>
              {RESOURCE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {RESOURCE_CATEGORY_LABELS[category]}
                </option>
              ))}
            </SelectFilter>

            <SelectFilter
              label="Urgency"
              value={requestFilters.urgency}
              onChange={(value) =>
                setRequestFilters((current) => ({
                  ...current,
                  urgency: value as RequestUrgency | "all",
                }))
              }
            >
              {URGENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectFilter>

            <SelectFilter
              label="Date range"
              value={requestFilters.dateRange}
              onChange={(value) =>
                setRequestFilters((current) => ({
                  ...current,
                  dateRange: value as RequestFilters["dateRange"],
                }))
              }
            >
              {DATE_RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectFilter>
          </div>

          <div className="rb-results-bar">
            <span>
              Showing <strong>{filteredRequests.length}</strong> of{" "}
              {requestState.requests.length} demo requests
            </span>
            <div className="rb-actions">
              <button
                type="button"
                className="btn btn--primary btn--tiny"
                onClick={() =>
                  openRequestForm({}, "General operational coordination request")
                }
              >
                Create demo request
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--tiny"
                onClick={() =>
                  setRequestFilters({ ...EMPTY_REQUEST_FILTERS })
                }
              >
                Clear filters
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--tiny"
                onClick={handleResetRequests}
              >
                Reset data
              </button>
            </div>
          </div>

          {filteredRequests.length === 0 ? (
            <EmptyState
              icon="📋"
              title="No demo requests match"
              description="Adjust the filters, create a demo request, or reset the local fixture."
            >
              <button
                type="button"
                className="btn btn--primary btn--small"
                onClick={() =>
                  openRequestForm({}, "General operational coordination request")
                }
              >
                Create demo request
              </button>
            </EmptyState>
          ) : (
            <div className="rb-request-list">
              {filteredRequests.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  now={now}
                  transitionError={transitionError}
                  onTransition={handleTransition}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "organ" && (
        <section className="rb-section">
          <div className="rb-section__head">
            <div>
              <h2>Organ donation</h2>
              <p>
                Official information only. Pulse AI does not run a donor
                registry, list organs, assess eligibility, or match donors and
                recipients.
              </p>
            </div>
            <span className="rb-source-tag">Official services</span>
          </div>

          <div className="rb-note rb-note--warning">
            <strong>No matching or allocation:</strong> organ donation and
            transplantation decisions must follow national law, official
            allocation systems, and qualified clinical teams. This page must
            not be used to seek or offer an organ.
          </div>

          <div className="rb-two-col">
            <section className="rb-panel">
              <h2>Use official pathways</h2>
              <ul className="rb-list">
                <li>
                  Contact the National Organ and Tissue Transplant Organization
                  (NOTTO) or the appropriate regional/state transplant
                  organisation.
                </li>
                <li>
                  Speak with a hospital transplant coordinator or treating
                  clinician for any clinical question.
                </li>
                <li>
                  Use official government or Indian Red Cross resources for
                  donation awareness and legal information.
                </li>
              </ul>
              <p className="rb-fineprint">
                Pulse AI does not collect donor or recipient details and does
                not provide medical or legal advice.
              </p>
            </section>

            <section className="rb-panel">
              <h2>What this module does not do</h2>
              <ul className="rb-list rb-list--no">
                <li>No organ availability listings.</li>
                <li>No donor or recipient registration.</li>
                <li>No blood-group, tissue, or compatibility matching.</li>
                <li>No allocation priority or waiting-list decisions.</li>
                <li>No transplant request submission or tracking.</li>
              </ul>
            </section>
          </div>

          <section className="rb-official">
            <div className="rb-section__head">
              <div>
                <h2>Official donation services</h2>
                <p>
                  External official websites. Review their current guidance
                  directly.
                </p>
              </div>
            </div>
            <div className="rb-official__grid">
              {OFFICIAL_ORGAN_DONATION_SERVICES.map((service) => (
                <a
                  key={service.name}
                  className="rb-official__card"
                  href={service.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong>{service.name}</strong>
                  <span>{service.description}</span>
                  <em>Open official site →</em>
                </a>
              ))}
            </div>
          </section>
        </section>
      )}

      {requestForm && (
        <RequestForm
          state={requestForm}
          onClose={() => setRequestForm(null)}
          onCreated={handleRequestCreated}
        />
      )}
    </div>
  );
}
