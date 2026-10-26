import type { HealthcareFacility } from "./domain";

export type ResourceCategory =
  | "medicines"
  | "consumables"
  | "ppe"
  | "equipment"
  | "blood"
  | "capacity"
  | "medical_gas"
  | "logistics";

export type ResourceAvailability =
  | "available"
  | "low"
  | "unavailable"
  | "unknown";

export type DataVerification =
  | "demo"
  | "reported"
  | "verified"
  | "unknown";

export type Freshness = "fresh" | "aging" | "stale";

export type RequestUrgency = "routine" | "urgent" | "critical";

export type RequestStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "arranged"
  | "in_transit"
  | "completed"
  | "cancelled";

export interface HospitalResource {
  id: string;
  hospitalId: string;
  category: ResourceCategory;
  resourceType: string;
  quantity: number | null;
  unit: string;
  availability: ResourceAvailability;
  acceptsUrgentRequests: boolean;
  lastUpdated: string;
  verification: DataVerification;
  note: string;
}

export interface HospitalCandidate {
  facility: HealthcareFacility;
  resources: HospitalResource[];
}

export interface SupplierResource {
  id: string;
  category: ResourceCategory;
  resourceType: string;
  quantity: number | null;
  unit: string;
  availability: ResourceAvailability;
  lastUpdated: string;
  verification: DataVerification;
  note: string;
}

export interface SupplierCandidate {
  supplierId: string;
  supplierName: string;
  city: string;
  state: string;
  resources: SupplierResource[];
  deliveryAvailable: boolean;
  normalLeadTimeDays: number | null;
  emergencyLeadTimeDays: number | null;
  lastUpdated: string;
  verification: DataVerification;
  note: string;
}

export type BloodComponent =
  | "Whole Blood"
  | "Packed Red Cells"
  | "Platelets"
  | "Plasma"
  | "Cryoprecipitate";

export interface BloodComponentAvailability {
  component: BloodComponent;
  availability: ResourceAvailability;
  units: number | null;
  lastUpdated: string;
  verification: DataVerification;
}

export interface BloodCentreCandidate {
  centreId: string;
  name: string;
  city: string;
  state: string;
  address: string;
  centreType: string;
  components: BloodComponentAvailability[];
  lastUpdated: string;
  verification: DataVerification;
  note: string;
}

export interface RequestStatusEvent {
  status: RequestStatus;
  at: string;
  actor: string;
  note: string;
  demo: true;
}

export interface ResourceRequest {
  id: string;
  reference: string;
  category: ResourceCategory;
  resourceType: string;
  quantity: number | null;
  unit: string;
  urgency: RequestUrgency;
  requiredBy: string;
  requestingFacility: string;
  destination: string;
  notes: string;
  preferredPartner: string;
  status: RequestStatus;
  responsibleOrganization: string;
  createdAt: string;
  updatedAt: string;
  source: "demo";
  events: RequestStatusEvent[];
}

export interface ResourceRequestInput {
  category: ResourceCategory;
  resourceType: string;
  quantity: number | null;
  unit: string;
  urgency: RequestUrgency;
  requiredBy: string;
  requestingFacility: string;
  destination: string;
  notes: string;
  preferredPartner: string;
}

export interface RequestValidation {
  valid: boolean;
  errors: Record<string, string>;
}

export interface RequestDraft {
  category?: ResourceCategory;
  resourceType?: string;
  quantity?: number | null;
  unit?: string;
  urgency?: RequestUrgency;
  preferredPartner?: string;
  notes?: string;
}

export type FreshnessFilter = "any" | "24h" | "7d" | "older7d";

export interface HospitalFilters {
  query: string;
  category: ResourceCategory | "all";
  resourceType: string;
  availability: ResourceAvailability | "any";
  urgency: RequestUrgency | "any";
  facilityType: string;
  city: string;
  freshness: FreshnessFilter;
}

export interface SupplierFilters {
  query: string;
  category: ResourceCategory | "all";
  availability: ResourceAvailability | "any";
  deliveryOnly: boolean;
  city: string;
  freshness: FreshnessFilter;
}

export interface BloodFilters {
  query: string;
  city: string;
  component: BloodComponent | "all";
  availability: ResourceAvailability | "any";
  freshness: FreshnessFilter;
}

export interface RequestFilters {
  query: string;
  status: RequestStatus | "all";
  category: ResourceCategory | "all";
  urgency: RequestUrgency | "all";
  dateRange: "all" | "7d" | "30d" | "older30d";
}
