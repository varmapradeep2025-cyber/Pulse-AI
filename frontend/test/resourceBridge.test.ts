import test from "node:test";
import assert from "node:assert/strict";
import {
  createResourceRequest,
  EMPTY_BLOOD_FILTERS,
  EMPTY_HOSPITAL_FILTERS,
  EMPTY_REQUEST_FILTERS,
  EMPTY_SUPPLIER_FILTERS,
  filterBloodCentres,
  filterHospitalCandidates,
  filterResourceRequests,
  filterSupplierCandidates,
  getBloodCentreCandidates,
  getDemoSnapshot,
  getFreshness,
  getHospitalCandidates,
  getRecentActivity,
  getRequestCounts,
  getRequestStatusOptions,
  getSupplierCandidates,
  loadResourceRequests,
  resetResourceRequests,
  RESOURCE_BRIDGE_STORAGE_KEY,
  ResourceBridgeDataError,
  transitionDemoRequestStatus,
  validateResourceRequest,
} from "../src/api/resourceBridge";
import {
  DEMO_BLOOD_CENTRES,
  DEMO_HOSPITAL_RESOURCES,
  DEMO_RESOURCE_REQUESTS,
  DEMO_SUPPLIERS,
  RESOURCE_BRIDGE_DEMO_LABEL,
} from "../src/data/resourceBridgeDemo";
import type {
  ResourceRequestInput,
  StorageLike,
} from "../src/types/resourceBridge";

const NOW = new Date("2026-10-22T10:00:00+05:30");

const BASE_INPUT: ResourceRequestInput = {
  category: "medicines",
  resourceType: "Insulin",
  quantity: 12,
  unit: "vials",
  urgency: "urgent",
  requiredBy: "2026-10-23T10:00:00+05:30",
  requestingFacility: "Pulse Care Multispecialty Hospital",
  destination: "Central pharmacy store",
  notes: "Operational replenishment only. No patient details included.",
  preferredPartner: "MedLink Pharma Distribution",
};

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test("demo fixtures are deterministic and labelled", () => {
  assert.equal(RESOURCE_BRIDGE_DEMO_LABEL, "Demo data");
  assert.equal(DEMO_HOSPITAL_RESOURCES.length, 14);
  assert.equal(DEMO_SUPPLIERS.length, 8);
  assert.equal(DEMO_BLOOD_CENTRES.length, 5);
  assert.equal(DEMO_RESOURCE_REQUESTS.length, 7);
  assert.ok(
    DEMO_HOSPITAL_RESOURCES.every(
      (resource) => resource.verification === "demo",
    ),
  );
  assert.ok(
    DEMO_SUPPLIERS.every((supplier) => supplier.verification === "demo"),
  );
  assert.ok(
    DEMO_RESOURCE_REQUESTS.every((request) => request.source === "demo"),
  );
});

test("freshness is calculated from the demo snapshot", () => {
  assert.equal(getFreshness("2026-10-22T09:00:00+05:30", NOW), "fresh");
  assert.equal(getFreshness("2026-10-20T10:00:00+05:30", NOW), "aging");
  assert.equal(getFreshness("2026-10-01T10:00:00+05:30", NOW), "stale");
  assert.equal(getFreshness("not-a-date", NOW), "stale");
});

test("request validation rejects missing values and past deadlines", () => {
  const result = validateResourceRequest(
    {
      ...BASE_INPUT,
      resourceType: " ",
      quantity: 0,
      requestingFacility: "",
      requiredBy: "2026-10-21T10:00:00+05:30",
    },
    NOW,
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.resourceType);
  assert.ok(result.errors.quantity);
  assert.ok(result.errors.requestingFacility);
  assert.ok(result.errors.requiredBy);
});

test("logistics requests do not require a quantity but require a destination", () => {
  const result = validateResourceRequest(
    {
      ...BASE_INPUT,
      category: "logistics",
      quantity: null,
      unit: "",
      destination: "",
    },
    NOW,
  );

  assert.equal(result.valid, false);
  assert.equal(result.errors.quantity, undefined);
  assert.ok(result.errors.destination);
});

test("request validation limits notes and accepts a valid request", () => {
  const tooLong = validateResourceRequest(
    { ...BASE_INPUT, notes: "x".repeat(501) },
    NOW,
  );
  assert.ok(tooLong.errors.notes);

  assert.deepEqual(validateResourceRequest(BASE_INPUT, NOW), {
    valid: true,
    errors: {},
  });
});

test("creating a request persists it with a demo-only audit event", () => {
  const storage = new MemoryStorage();
  const result = createResourceRequest(BASE_INPUT, { now: NOW, storage });

  assert.equal(result.request.reference, "RB-2026-0008");
  assert.equal(result.requests.length, 8);
  assert.equal(result.requests[0].reference, "RB-2026-0008");
  assert.equal(result.request.status, "pending");
  assert.equal(result.request.source, "demo");
  assert.equal(result.request.events.length, 1);
  assert.equal(result.request.events[0].demo, true);
  assert.match(result.request.events[0].note, /No facility/);

  const reloaded = loadResourceRequests(storage);
  assert.equal(reloaded[0].reference, "RB-2026-0008");
});

test("request storage rejects corrupt data instead of pretending it loaded", () => {
  const storage = new MemoryStorage();
  storage.setItem(RESOURCE_BRIDGE_STORAGE_KEY, "{not-json");

  assert.throws(
    () => loadResourceRequests(storage),
    ResourceBridgeDataError,
  );

  storage.setItem(RESOURCE_BRIDGE_STORAGE_KEY, JSON.stringify([{ id: "x" }]));

  assert.throws(
    () => loadResourceRequests(storage),
    ResourceBridgeDataError,
  );
});

test("resetting demo requests restores the local fixture", () => {
  const storage = new MemoryStorage();
  createResourceRequest(BASE_INPUT, { now: NOW, storage });
  assert.equal(loadResourceRequests(storage).length, 8);

  const reset = resetResourceRequests(storage);

  assert.equal(reset.length, DEMO_RESOURCE_REQUESTS.length);
  assert.equal(storage.getItem(RESOURCE_BRIDGE_STORAGE_KEY), null);
  assert.equal(loadResourceRequests(storage).length, DEMO_RESOURCE_REQUESTS.length);
});

test("requests cannot be created without browser storage", () => {
  assert.throws(
    () => createResourceRequest(BASE_INPUT, { now: NOW, storage: null }),
    ResourceBridgeDataError,
  );
});

test("status transitions are guarded and recorded as demo updates", () => {
  const storage = new MemoryStorage();
  const created = createResourceRequest(BASE_INPUT, { now: NOW, storage });

  assert.throws(
    () =>
      transitionDemoRequestStatus(created.request.id, "completed", {
        now: NOW,
        storage,
      }),
    ResourceBridgeDataError,
  );

  let current = transitionDemoRequestStatus(created.request.id, "accepted", {
    now: new Date(NOW.getTime() + 60_000),
    storage,
  });
  assert.equal(current.request.responsibleOrganization, BASE_INPUT.preferredPartner);
  assert.equal(current.request.events.at(-1)?.demo, true);
  assert.match(current.request.events.at(-1)?.note ?? "", /No real organisation/);

  for (const status of ["arranged", "in_transit", "completed"] as const) {
    current = transitionDemoRequestStatus(current.request.id, status, {
      now: new Date(NOW.getTime() + 120_000),
      storage,
    });
  }

  assert.equal(current.request.status, "completed");
  assert.equal(current.request.events.length, 5);
  assert.deepEqual(getRequestStatusOptions("completed"), []);
  assert.throws(
    () =>
      transitionDemoRequestStatus(current.request.id, "pending", {
        now: NOW,
        storage,
      }),
    ResourceBridgeDataError,
  );
});

test("hospital filtering narrows candidates and resource reports", () => {
  const candidates = getHospitalCandidates();

  assert.equal(candidates.length, 5);

  const gwalior = filterHospitalCandidates(candidates, {
    ...EMPTY_HOSPITAL_FILTERS,
    query: "Gwalior",
  });
  assert.equal(gwalior.length, 1);
  assert.equal(gwalior[0].facility.hospital_id, "H001");
  assert.equal(gwalior[0].resources.length, 3);

  const critical = filterHospitalCandidates(candidates, {
    ...EMPTY_HOSPITAL_FILTERS,
    urgency: "critical",
  });
  assert.ok(critical.length > 0);
  assert.ok(
    critical
      .flatMap((candidate) => candidate.resources)
      .every(
        (resource) =>
          resource.acceptsUrgentRequests &&
          resource.availability === "available",
      ),
  );

  const stale = filterHospitalCandidates(candidates, {
    ...EMPTY_HOSPITAL_FILTERS,
    freshness: "older7d",
  });
  assert.ok(stale.length > 0);
  assert.ok(
    stale
      .flatMap((candidate) => candidate.resources)
      .every((resource) => getFreshness(resource.lastUpdated, NOW) === "stale"),
  );

  const bhopal = filterHospitalCandidates(candidates, {
    ...EMPTY_HOSPITAL_FILTERS,
    city: "Bhopal",
  });
  assert.deepEqual(
    bhopal.map((candidate) => candidate.facility.hospital_id),
    ["H003"],
  );
});

test("supplier filtering respects category and delivery availability", () => {
  const suppliers = getSupplierCandidates();
  const filtered = filterSupplierCandidates(suppliers, {
    ...EMPTY_SUPPLIER_FILTERS,
    category: "ppe",
    deliveryOnly: true,
    city: "Bhopal",
  });

  assert.ok(filtered.length > 0);
  assert.ok(filtered.every((supplier) => supplier.deliveryAvailable));
  assert.ok(
    filtered
      .flatMap((supplier) => supplier.resources)
      .every((resource) => resource.category === "ppe"),
  );
});

test("blood filtering returns only the selected component and stale records", () => {
  const centres = getBloodCentreCandidates();
  const platelets = filterBloodCentres(centres, {
    ...EMPTY_BLOOD_FILTERS,
    component: "Platelets",
  });

  assert.ok(platelets.length > 0);
  assert.ok(
    platelets
      .flatMap((centre) => centre.components)
      .every((component) => component.component === "Platelets"),
  );

  const stale = filterBloodCentres(centres, {
    ...EMPTY_BLOOD_FILTERS,
    freshness: "older7d",
  });

  assert.ok(stale.some((centre) => centre.centreId === "B04"));
  assert.ok(
    stale
      .flatMap((centre) => centre.components)
      .every((component) => getFreshness(component.lastUpdated, NOW) === "stale"),
  );
});

test("request filtering and counts cover history, urgency, and search", () => {
  const seeds = loadResourceRequests(null);

  assert.deepEqual(getRequestCounts(seeds), {
    open: 4,
    urgent: 3,
    awaitingResponse: 1,
    completed: 1,
  });

  const pending = filterResourceRequests(
    seeds,
    { ...EMPTY_REQUEST_FILTERS, status: "pending" },
    NOW,
  );
  assert.deepEqual(
    pending.map((request) => request.reference),
    ["RB-2026-0001"],
  );

  const search = filterResourceRequests(
    seeds,
    { ...EMPTY_REQUEST_FILTERS, query: "MedLink" },
    NOW,
  );
  assert.deepEqual(
    search.map((request) => request.reference),
    ["RB-2026-0002"],
  );

  const older = filterResourceRequests(
    seeds,
    { ...EMPTY_REQUEST_FILTERS, dateRange: "older30d" },
    NOW,
  );
  assert.deepEqual(older, []);
});

test("recent activity is sorted newest first", () => {
  const activity = getRecentActivity(loadResourceRequests(null), 6);

  assert.equal(activity.length, 6);
  assert.ok(
    activity.every(
      (item, index) =>
        index === 0 ||
        new Date(activity[index - 1].at).getTime() >=
          new Date(item.at).getTime(),
    ),
  );
});

test("snapshot helper returns the fixed demo reference time", () => {
  assert.equal(getDemoSnapshot().toISOString(), NOW.toISOString());
});
