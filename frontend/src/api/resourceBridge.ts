import {
  DEMO_BLOOD_CENTRES,
  DEMO_HOSPITAL_RESOURCES,
  DEMO_RESOURCE_REQUESTS,
  DEMO_SUPPLIERS,
  RESOURCE_BRIDGE_DEMO_NOW,
} from "../data/resourceBridgeDemo";
import { syntheticHospitals } from "../data/hospitals";
import type {
  BloodCentreCandidate,
  BloodFilters,
  Freshness,
  FreshnessFilter,
  HospitalCandidate,
  HospitalFilters,
  RequestDraft,
  RequestFilters,
  RequestStatus,
  RequestUrgency,
  RequestValidation,
  ResourceAvailability,
  ResourceCategory,
  ResourceRequest,
  ResourceRequestInput,
  SupplierCandidate,
  SupplierFilters,
} from "../types/resourceBridge";

export const RESOURCE_CATEGORY_LABELS: Record<ResourceCategory, string> = {
  medicines: "Medicines",
  consumables: "Medical consumables",
  ppe: "PPE",
  equipment: "Medical equipment",
  blood: "Blood resources",
  capacity: "Facility capacity",
  medical_gas: "Medical gases",
  logistics: "Delivery / logistics",
};

export const AVAILABILITY_LABELS: Record<ResourceAvailability, string> = {
  available: "Reported available",
  low: "Reported low",
  unavailable: "Reported unavailable",
  unknown: "Availability unknown",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  arranged: "Arranged",
  in_transit: "In transit",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const URGENCY_LABELS: Record<RequestUrgency, string> = {
  routine: "Routine",
  urgent: "Urgent",
  critical: "Critical",
};

export const FRESHNESS_LABELS: Record<Freshness, string> = {
  fresh: "Updated within 24h",
  aging: "Updated 1â€“7 days ago",
  stale: "Stale â€” reconfirm",
};

export const OPEN_REQUEST_STATUSES: RequestStatus[] = [
  "pending",
  "accepted",
  "arranged",
  "in_transit",
];

export const ALLOWED_STATUS_TRANSITIONS: Record<
  RequestStatus,
  readonly RequestStatus[]
> = {
  pending: ["accepted", "declined", "cancelled"],
  accepted: ["arranged", "cancelled"],
  declined: [],
  arranged: ["in_transit", "cancelled"],
  in_transit: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const DATE_RANGE_DAYS = {
  "7d": 7,
  "30d": 30,
} as const;

export const RESOURCE_BRIDGE_STORAGE_KEY =
  "pulseai.resourceBridge.requests.v1";

export class ResourceBridgeDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceBridgeDataError";
  }
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function cloneRequests(requests: ResourceRequest[]): ResourceRequest[] {
  return requests.map((request) => ({
    ...request,
    events: request.events.map((event) => ({ ...event })),
  }));
}

export function getDemoSnapshot(): Date {
  return new Date(RESOURCE_BRIDGE_DEMO_NOW);
}

export function getDemoSnapshotLabel(): string {
  return getDemoSnapshot().toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function getFreshnessLabel(freshness: Freshness): string {
  return FRESHNESS_LABELS[freshness];
}

export function getFreshness(
  lastUpdated: string,
  now: Date = getDemoSnapshot(),
): Freshness {
  const timestamp = new Date(lastUpdated).getTime();

  if (!Number.isFinite(timestamp)) {
    return "stale";
  }

  const hours = (now.getTime() - timestamp) / 3_600_000;

  if (hours <= 24) {
    return "fresh";
  }

  if (hours <= 24 * 7) {
    return "aging";
  }

  return "stale";
}

export function formatAge(
  timestamp: string,
  now: Date = getDemoSnapshot(),
): string {
  const value = new Date(timestamp).getTime();

  if (!Number.isFinite(value)) {
    return "Unknown time";
  }

  const minutes = Math.max(0, Math.floor((now.getTime() - value) / 60_000));

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  return new Date(timestamp).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function matchesFreshness(
  lastUpdated: string,
  filter: FreshnessFilter,
  now: Date,
): boolean {
  if (filter === "any") {
    return true;
  }

  const freshness = getFreshness(lastUpdated, now);

  if (filter === "older7d") {
    return freshness === "stale";
  }

  return filter === "24h" ? freshness === "fresh" : freshness !== "stale";
}

function availabilityRank(availability: ResourceAvailability): number {
  if (availability === "available") return 0;
  if (availability === "low") return 1;
  if (availability === "unknown") return 2;
  return 3;
}

export function getHospitalCandidates(): HospitalCandidate[] {
  return syntheticHospitals
    .map((facility) => ({
      facility,
      resources: DEMO_HOSPITAL_RESOURCES.filter(
        (resource) => resource.hospitalId === facility.hospital_id,
      ).map((resource) => ({ ...resource })),
    }))
    .filter((candidate) => candidate.resources.length > 0);
}

export function filterHospitalCandidates(
  candidates: HospitalCandidate[],
  filters: HospitalFilters,
  now: Date = getDemoSnapshot(),
): HospitalCandidate[] {
  const query = filters.query.trim().toLowerCase();

  return candidates
    .map((candidate) => {
      const facilityQueryMatch =
        query.length === 0 ||
        [
          candidate.facility.hospital_name,
          candidate.facility.city,
          candidate.facility.state,
          candidate.facility.address,
          candidate.facility.hospital_type,
        ].some((value) => value.toLowerCase().includes(query));

      const resources = candidate.resources.filter((resource) => {
        const categoryMatch =
          filters.category === "all" || resource.category === filters.category;
        const typeMatch =
          filters.resourceType === "all" ||
          resource.resourceType === filters.resourceType;
        const availabilityMatch =
          filters.availability === "any" ||
          resource.availability === filters.availability;
        const freshnessMatch = matchesFreshness(
          resource.lastUpdated,
          filters.freshness,
          now,
        );
        const urgencyMatch =
          filters.urgency === "any" ||
          (filters.urgency === "routine"
            ? true
            : filters.urgency === "urgent"
              ? resource.acceptsUrgentRequests &&
                resource.availability !== "unavailable" &&
                resource.availability !== "unknown"
              : resource.acceptsUrgentRequests &&
                resource.availability === "available");
        const queryMatch =
          facilityQueryMatch ||
          [
            resource.resourceType,
            RESOURCE_CATEGORY_LABELS[resource.category],
            resource.note,
          ].some((value) => value.toLowerCase().includes(query));

        return (
          categoryMatch &&
          typeMatch &&
          availabilityMatch &&
          freshnessMatch &&
          urgencyMatch &&
          queryMatch
        );
      });

      if (resources.length === 0) {
        return null;
      }

      return { ...candidate, resources };
    })
    .filter((candidate): candidate is HospitalCandidate => candidate !== null)
    .filter((candidate) => {
      if (
        filters.facilityType !== "all" &&
        candidate.facility.hospital_type !== filters.facilityType
      ) {
        return false;
      }

      return filters.city === "all" || candidate.facility.city === filters.city;
    })
    .sort((a, b) => {
      const aRank = Math.min(
        ...a.resources.map((resource) => availabilityRank(resource.availability)),
      );
      const bRank = Math.min(
        ...b.resources.map((resource) => availabilityRank(resource.availability)),
      );

      return (
        aRank - bRank ||
        a.facility.hospital_name.localeCompare(b.facility.hospital_name)
      );
    });
}

export function getHospitalFilterOptions(candidates: HospitalCandidate[]) {
  const categories = new Set<ResourceCategory>();
  const cities = new Set<string>();
  const facilityTypes = new Set<string>();

  candidates.forEach((candidate) => {
    cities.add(candidate.facility.city);
    facilityTypes.add(candidate.facility.hospital_type);
    candidate.resources.forEach((resource) => categories.add(resource.category));
  });

  return {
    categories: Array.from(categories).sort(),
    cities: Array.from(cities).sort(),
    facilityTypes: Array.from(facilityTypes).sort(),
  };
}

export function getSupplierCandidates(): SupplierCandidate[] {
  return DEMO_SUPPLIERS.map((supplier) => ({
    ...supplier,
    resources: supplier.resources.map((resource) => ({ ...resource })),
  }));
}

export function filterSupplierCandidates(
  suppliers: SupplierCandidate[],
  filters: SupplierFilters,
  now: Date = getDemoSnapshot(),
): SupplierCandidate[] {
  const query = filters.query.trim().toLowerCase();

  return suppliers
    .map((supplier) => {
      const supplierQueryMatch =
        query.length === 0 ||
        [
          supplier.supplierName,
          supplier.city,
          supplier.state,
          supplier.note,
        ].some((value) => value.toLowerCase().includes(query));

      const resources = supplier.resources.filter((resource) => {
        const categoryMatch =
          filters.category === "all" || resource.category === filters.category;
        const availabilityMatch =
          filters.availability === "any" ||
          resource.availability === filters.availability;
        const freshnessMatch = matchesFreshness(
          resource.lastUpdated,
          filters.freshness,
          now,
        );
        const queryMatch =
          supplierQueryMatch ||
          [
            resource.resourceType,
            RESOURCE_CATEGORY_LABELS[resource.category],
            resource.note,
          ].some((value) => value.toLowerCase().includes(query));

        return (
          categoryMatch &&
          availabilityMatch &&
          freshnessMatch &&
          queryMatch
        );
      });

      if (resources.length === 0) {
        return null;
      }

      return { ...supplier, resources };
    })
    .filter((supplier): supplier is SupplierCandidate => supplier !== null)
    .filter(
      (supplier) =>
        (!filters.deliveryOnly || supplier.deliveryAvailable) &&
        (filters.city === "all" || supplier.city === filters.city),
    )
    .sort((a, b) => {
      const aRank = Math.min(
        ...a.resources.map((resource) => availabilityRank(resource.availability)),
      );
      const bRank = Math.min(
        ...b.resources.map((resource) => availabilityRank(resource.availability)),
      );

      return aRank - bRank || a.supplierName.localeCompare(b.supplierName);
    });
}

export function getSupplierFilterOptions(suppliers: SupplierCandidate[]) {
  const categories = new Set<ResourceCategory>();
  const cities = new Set<string>();

  suppliers.forEach((supplier) => {
    cities.add(supplier.city);
    supplier.resources.forEach((resource) => categories.add(resource.category));
  });

  return {
    categories: Array.from(categories).sort(),
    cities: Array.from(cities).sort(),
  };
}

export function getBloodCentreCandidates(): BloodCentreCandidate[] {
  return DEMO_BLOOD_CENTRES.map((centre) => ({
    ...centre,
    components: centre.components.map((component) => ({ ...component })),
  }));
}

export function filterBloodCentres(
  centres: BloodCentreCandidate[],
  filters: BloodFilters,
  now: Date = getDemoSnapshot(),
): BloodCentreCandidate[] {
  const query = filters.query.trim().toLowerCase();

  return centres
    .map((centre) => {
      const centreQueryMatch =
        query.length === 0 ||
        [centre.name, centre.city, centre.state, centre.address].some((value) =>
          value.toLowerCase().includes(query),
        );

      const components = centre.components.filter((component) => {
        const componentMatch =
          filters.component === "all" ||
          component.component === filters.component;
        const availabilityMatch =
          filters.availability === "any" ||
          component.availability === filters.availability;
        const freshnessMatch = matchesFreshness(
          component.lastUpdated,
          filters.freshness,
          now,
        );
        const queryMatch =
          centreQueryMatch || component.component.toLowerCase().includes(query);

        return componentMatch && availabilityMatch && freshnessMatch && queryMatch;
      });

      if (components.length === 0) {
        return null;
      }

      return { ...centre, components };
    })
    .filter((centre): centre is BloodCentreCandidate => centre !== null)
    .filter(
      (centre) => filters.city === "all" || centre.city === filters.city,
    )
    .sort((a, b) => {
      const aRank = Math.min(
        ...a.components.map((component) => availabilityRank(component.availability)),
      );
      const bRank = Math.min(
        ...b.components.map((component) => availabilityRank(component.availability)),
      );

      return aRank - bRank || a.name.localeCompare(b.name);
    });
}

export function getRequestDraftFromHospital(
  candidate: HospitalCandidate,
  resourceId?: string,
): RequestDraft {
  const resource =
    candidate.resources.find((item) => item.id === resourceId) ??
    candidate.resources[0];

  return {
    category: resource.category,
    resourceType: resource.resourceType,
    quantity: resource.quantity && resource.quantity > 4 ? 1 : null,
    unit: resource.unit,
    preferredPartner: candidate.facility.hospital_name,
    notes: `Coordination requested with ${candidate.facility.hospital_name} from the hospital discovery demo.`,
  };
}

export function getRequestDraftFromSupplier(
  supplier: SupplierCandidate,
  resourceId?: string,
): RequestDraft {
  const resource =
    supplier.resources.find((item) => item.id === resourceId) ??
    supplier.resources[0];

  return {
    category: resource.category,
    resourceType: resource.resourceType,
    quantity: 1,
    unit: resource.unit,
    preferredPartner: supplier.supplierName,
    notes: `Supply coordination requested from ${supplier.supplierName} in the supplier discovery demo.`,
  };
}

export function getRequestDraftFromBloodCentre(
  centre: BloodCentreCandidate,
  componentName?: string,
): RequestDraft {
  const component =
    centre.components.find((item) => item.component === componentName) ??
    centre.components[0];

  return {
    category: "blood",
    resourceType: component.component,
    quantity: 1,
    unit: "units",
    urgency: "urgent",
    preferredPartner: centre.name,
    notes: `Blood-resource coordination requested from ${centre.name} in the demo. Clinical compatibility and release are not assessed here.`,
  };
}

export function validateResourceRequest(
  input: ResourceRequestInput,
  now: Date = new Date(),
): RequestValidation {
  const errors: Record<string, string> = {};
  const resourceType = input.resourceType.trim();
  const requestingFacility = input.requestingFacility.trim();
  const destination = input.destination.trim();
  const notes = input.notes.trim();
  const quantityRequired = input.category !== "logistics";

  if (!RESOURCE_CATEGORY_LABELS[input.category]) {
    errors.category = "Choose a supported resource category.";
  }

  if (resourceType.length < 2) {
    errors.resourceType = "Enter a resource type.";
  }

  if (quantityRequired && (input.quantity === null || input.quantity <= 0)) {
    errors.quantity = "Enter a quantity greater than zero.";
  }

  if (
    input.quantity !== null &&
    (!Number.isFinite(input.quantity) || input.quantity <= 0)
  ) {
    errors.quantity = "Enter a quantity greater than zero.";
  }

  if (input.quantity !== null && input.unit.trim().length === 0) {
    errors.unit = "Enter the unit for this quantity.";
  }

  const requiredTime = new Date(input.requiredBy).getTime();

  if (!Number.isFinite(requiredTime)) {
    errors.requiredBy = "Choose a valid required-by date and time.";
  } else if (requiredTime < now.getTime() - 60_000) {
    errors.requiredBy = "The required-by time cannot be in the past.";
  }

  if (requestingFacility.length === 0) {
    errors.requestingFacility = "Choose the requesting facility.";
  }

  if (input.category === "logistics" && destination.length === 0) {
    errors.destination = "Describe the delivery or destination requirements.";
  }

  if (notes.length > 500) {
    errors.notes = "Keep notes under 500 characters.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function loadResourceRequests(
  storage: StorageLike | null = defaultStorage(),
): ResourceRequest[] {
  if (!storage) {
    return cloneRequests(DEMO_RESOURCE_REQUESTS);
  }

  try {
    const raw = storage.getItem(RESOURCE_BRIDGE_STORAGE_KEY);

    if (!raw) {
      return cloneRequests(DEMO_RESOURCE_REQUESTS);
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error("Stored request data is not an array.");
    }

    const requests = parsed.filter(
      (item): item is ResourceRequest =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as ResourceRequest).id === "string" &&
        typeof (item as ResourceRequest).reference === "string" &&
        Array.isArray((item as ResourceRequest).events),
    );

    if (requests.length !== parsed.length) {
      throw new Error("Stored request data contains invalid records.");
    }

    return cloneRequests(requests);
  } catch {
    throw new ResourceBridgeDataError(
      "Demo request storage could not be read. Reset the local demo requests to recover.",
    );
  }
}

export function saveResourceRequests(
  requests: ResourceRequest[],
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) {
    throw new ResourceBridgeDataError(
      "Browser storage is unavailable, so this demo request cannot be saved.",
    );
  }

  try {
    storage.setItem(RESOURCE_BRIDGE_STORAGE_KEY, JSON.stringify(requests));
  } catch {
    throw new ResourceBridgeDataError(
      "Browser storage could not save this demo request.",
    );
  }
}

export function resetResourceRequests(
  storage: StorageLike | null = defaultStorage(),
): ResourceRequest[] {
  if (storage) {
    try {
      storage.removeItem(RESOURCE_BRIDGE_STORAGE_KEY);
    } catch {
      throw new ResourceBridgeDataError(
        "Browser storage could not reset the demo requests.",
      );
    }
  }

  return cloneRequests(DEMO_RESOURCE_REQUESTS);
}

export function createResourceRequest(
  input: ResourceRequestInput,
  options: {
    now?: Date;
    storage?: StorageLike | null;
  } = {},
): { request: ResourceRequest; requests: ResourceRequest[] } {
  const now = options.now ?? new Date();
  const validation = validateResourceRequest(input, now);

  if (!validation.valid) {
    throw new ResourceBridgeDataError("The resource request is not valid.");
  }

  const requests = loadResourceRequests(options.storage);
  const reference = `RB-${now.getFullYear()}-${String(
    requests.length + 1,
  ).padStart(4, "0")}`;
  const request: ResourceRequest = {
    id: `RBDEMO${now.getTime()}${requests.length + 1}`,
    reference,
    category: input.category,
    resourceType: input.resourceType.trim(),
    quantity: input.quantity,
    unit: input.unit.trim() || (input.category === "logistics" ? "vehicles" : ""),
    urgency: input.urgency,
    requiredBy: input.requiredBy,
    requestingFacility: input.requestingFacility.trim(),
    destination: input.destination.trim(),
    notes: input.notes.trim(),
    preferredPartner: input.preferredPartner.trim(),
    status: "pending",
    responsibleOrganization: "Unassigned (demo)",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    source: "demo",
    events: [
      {
        status: "pending",
        at: now.toISOString(),
        actor: "Local requester (demo)",
        note: "Created in browser-local demo storage. No facility, supplier, blood centre, or coordinator has been contacted.",
        demo: true,
      },
    ],
  };

  const next = [request, ...requests];
  saveResourceRequests(next, options.storage);

  return { request, requests: next };
}

export function canTransitionRequestStatus(
  current: RequestStatus,
  next: RequestStatus,
): boolean {
  return ALLOWED_STATUS_TRANSITIONS[current].includes(next);
}

export function transitionDemoRequestStatus(
  requestId: string,
  nextStatus: RequestStatus,
  options: {
    now?: Date;
    storage?: StorageLike | null;
    note?: string;
  } = {},
): { request: ResourceRequest; requests: ResourceRequest[] } {
  const now = options.now ?? new Date();
  const requests = loadResourceRequests(options.storage);
  const index = requests.findIndex((request) => request.id === requestId);

  if (index < 0) {
    throw new ResourceBridgeDataError("The selected demo request was not found.");
  }

  const current = requests[index];

  if (!canTransitionRequestStatus(current.status, nextStatus)) {
    throw new ResourceBridgeDataError(
      `Cannot move a ${REQUEST_STATUS_LABELS[current.status].toLowerCase()} request to ${REQUEST_STATUS_LABELS[nextStatus].toLowerCase()}.`,
    );
  }

  const updated: ResourceRequest = {
    ...current,
    status: nextStatus,
    updatedAt: now.toISOString(),
    responsibleOrganization:
      nextStatus === "accepted" ||
      nextStatus === "arranged" ||
      nextStatus === "in_transit" ||
      nextStatus === "completed" ||
      nextStatus === "declined"
        ? current.preferredPartner || "Demo partner (unassigned)"
        : current.responsibleOrganization,
    events: [
      ...current.events,
      {
        status: nextStatus,
        at: now.toISOString(),
        actor: "Demo coordinator (local)",
        note:
          options.note ??
          "Browser-local demo status update. No real organisation was contacted and no transfer or delivery is confirmed.",
        demo: true,
      },
    ],
  };

  const nextRequests = requests.map((request, requestIndex) =>
    requestIndex === index ? updated : request,
  );
  saveResourceRequests(nextRequests, options.storage);

  return { request: updated, requests: nextRequests };
}

export function getNextAction(request: ResourceRequest): string {
  switch (request.status) {
    case "pending":
      return "Await partner acknowledgement. No transfer is confirmed.";
    case "accepted":
      return "Confirm quantity, collection point, and delivery responsibility with the partner.";
    case "declined":
      return "Review an alternate partner or prepare a coordinator escalation.";
    case "arranged":
      return "Track dispatch. Arrangement does not mean the resource has been delivered.";
    case "in_transit":
      return "Confirm receipt with the receiving facility before marking complete.";
    case "completed":
      return "No further action. Review the status history for the demo record.";
    case "cancelled":
      return "No further action. This demo request was withdrawn.";
  }
}

export function getRequestCounts(requests: ResourceRequest[]) {
  const open = requests.filter((request) =>
    OPEN_REQUEST_STATUSES.includes(request.status),
  );

  return {
    open: open.length,
    urgent: open.filter(
      (request) => request.urgency === "urgent" || request.urgency === "critical",
    ).length,
    awaitingResponse: requests.filter((request) => request.status === "pending")
      .length,
    completed: requests.filter((request) => request.status === "completed").length,
  };
}

export function getRecentActivity(
  requests: ResourceRequest[],
  limit = 6,
): Array<{
  requestId: string;
  reference: string;
  resourceType: string;
  status: RequestStatus;
  at: string;
  note: string;
}> {
  return requests
    .flatMap((request) =>
      request.events.map((event) => ({
        requestId: request.id,
        reference: request.reference,
        resourceType: request.resourceType,
        status: event.status,
        at: event.at,
        note: event.note,
      })),
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

export function filterResourceRequests(
  requests: ResourceRequest[],
  filters: RequestFilters,
  now: Date = new Date(),
): ResourceRequest[] {
  const query = filters.query.trim().toLowerCase();

  return requests
    .filter((request) => {
      const queryMatch =
        query.length === 0 ||
        [
          request.reference,
          request.resourceType,
          request.requestingFacility,
          request.preferredPartner,
        ].some((value) => value.toLowerCase().includes(query));

      if (!queryMatch) {
        return false;
      }

      if (filters.status !== "all" && request.status !== filters.status) {
        return false;
      }

      if (
        filters.category !== "all" &&
        request.category !== filters.category
      ) {
        return false;
      }

      if (filters.urgency !== "all" && request.urgency !== filters.urgency) {
        return false;
      }

      if (filters.dateRange === "all") {
        return true;
      }

      const created = new Date(request.createdAt).getTime();
      const ageDays = (now.getTime() - created) / 86_400_000;

      if (filters.dateRange === "older30d") {
        return ageDays > 30;
      }

      return ageDays <= DATE_RANGE_DAYS[filters.dateRange];
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function getRequestDateRangeLabel(
  range: RequestFilters["dateRange"],
): string {
  switch (range) {
    case "all":
      return "Any date";
    case "7d":
      return "Last 7 days";
    case "30d":
      return "Last 30 days";
    case "older30d":
      return "Older than 30 days";
  }
}

export function getRequestStatusOptions(
  current: RequestStatus,
): RequestStatus[] {
  return [...ALLOWED_STATUS_TRANSITIONS[current]];
}

export const EMPTY_HOSPITAL_FILTERS: HospitalFilters = {
  query: "",
  category: "all",
  resourceType: "all",
  availability: "any",
  urgency: "any",
  facilityType: "all",
  city: "all",
  freshness: "any",
};

export const EMPTY_SUPPLIER_FILTERS: SupplierFilters = {
  query: "",
  category: "all",
  availability: "any",
  deliveryOnly: false,
  city: "all",
  freshness: "any",
};

export const EMPTY_BLOOD_FILTERS: BloodFilters = {
  query: "",
  city: "all",
  component: "all",
  availability: "any",
  freshness: "any",
};

export const EMPTY_REQUEST_FILTERS: RequestFilters = {
  query: "",
  status: "all",
  category: "all",
  urgency: "all",
  dateRange: "all",
};
