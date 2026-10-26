import test from "node:test";
import assert from "node:assert/strict";
import {
  CITIZEN_NAV_ITEMS,
  HOSPITAL_NAV_ITEMS,
  LEGACY_ROUTE_ALIASES,
  ROUTES,
  citizenHospitalPath,
  citizenSchemePath,
  isNavItemActive,
} from "../src/routes";

function navPairs(items: ReadonlyArray<{ to: string; label: string }>) {
  return items.map((item) => [item.to, item.label]);
}

test("citizen navigation keeps the six citizen sections in order", () => {
  assert.deepEqual(navPairs(CITIZEN_NAV_ITEMS), [
    ["/citizen", "Healthcare"],
    ["/citizen/appointments", "Appointments"],
    ["/citizen/schemes", "Schemes"],
    ["/citizen/documents", "Documents"],
    ["/citizen/reports", "Reports"],
    ["/assistant", "Assistant"],
  ]);
});

test("hospital navigation exposes the five operations sections", () => {
  assert.deepEqual(navPairs(HOSPITAL_NAV_ITEMS), [
    ["/hospital", "Dashboard"],
    ["/hospital/queue", "Queue"],
    ["/hospital/inventory-import", "Inventory Import"],
    ["/hospital/intelligence", "Hospital Intelligence"],
    ["/hospital/resource-bridge", "Resource Bridge"],
  ]);
});

test("legacy links redirect to the matching portal routes", () => {
  assert.deepEqual(
    LEGACY_ROUTE_ALIASES.map((alias) => [alias.from, alias.to]),
    [
      ["/dashboard", "/hospital"],
      ["/intelligence", "/hospital/intelligence"],
      ["/resource-bridge", "/hospital/resource-bridge"],
      ["/hospitals", "/citizen"],
      ["/schemes", "/citizen/schemes"],
      ["/documents", "/citizen/documents"],
      ["/reports", "/citizen/reports"],
    ],
  );
});

test("detail path helpers preserve existing deep-link identifiers", () => {
  assert.equal(citizenHospitalPath("HSP-001"), "/citizen/hospitals/HSP-001");
  assert.equal(citizenSchemePath("SCH-002"), "/citizen/schemes/SCH-002");
});

test("active states follow nested portal routes without cross-highlighting", () => {
  const healthcare = CITIZEN_NAV_ITEMS[0];
  const appointments = CITIZEN_NAV_ITEMS[1];
  const schemes = CITIZEN_NAV_ITEMS[2];
  const dashboard = HOSPITAL_NAV_ITEMS[0];
  const queue = HOSPITAL_NAV_ITEMS[1];
  const inventory = HOSPITAL_NAV_ITEMS[2];
  const intelligence = HOSPITAL_NAV_ITEMS[3];

  assert.equal(isNavItemActive(healthcare, ROUTES.citizen), true);
  assert.equal(
    isNavItemActive(healthcare, citizenHospitalPath("HSP-001")),
    true,
  );
  assert.equal(isNavItemActive(healthcare, ROUTES.citizenSchemes), false);
  assert.equal(
    isNavItemActive(appointments, ROUTES.citizenAppointments),
    true,
  );
  assert.equal(isNavItemActive(appointments, ROUTES.citizenSchemes), false);
  assert.equal(
    isNavItemActive(schemes, citizenSchemePath("SCH-002")),
    true,
  );
  assert.equal(isNavItemActive(dashboard, ROUTES.hospital), true);
  assert.equal(isNavItemActive(queue, ROUTES.hospitalQueue), true);
  assert.equal(isNavItemActive(queue, ROUTES.hospital), false);
  assert.equal(
    isNavItemActive(inventory, ROUTES.hospitalInventoryImport),
    true,
  );
  assert.equal(isNavItemActive(inventory, ROUTES.hospitalQueue), false);
  assert.equal(
    isNavItemActive(dashboard, ROUTES.hospitalIntelligence),
    false,
  );
  assert.equal(
    isNavItemActive(intelligence, ROUTES.hospitalIntelligence),
    true,
  );
});
