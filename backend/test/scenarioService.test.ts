import assert from "node:assert/strict";
import test from "node:test";
import {
  ScenarioError,
  simulateScenario,
} from "../src/services/scenarioService.js";
import type {
  ScenarioDataProvider,
  ScenarioDemandRow,
  ScenarioInventoryRow,
  ScenarioRecord,
} from "../src/services/scenarioService.js";

const scenario: ScenarioRecord = {
  id: 3,
  name: "Demand Surge",
  description: "Demand for selected resources increases by 30% for 7 days.",
  disruption_type: "demand_surge",
  duration_days: 7,
  demand_change_percent: 30,
  transport_delay_days: 0,
};

const inventory: ScenarioInventoryRow[] = [
  {
    hospital_id: 1,
    medicine_id: 1,
    current_stock: 18,
    safety_stock: 12,
  },
  {
    hospital_id: 1,
    medicine_id: 2,
    current_stock: 500,
    safety_stock: 100,
  },
  {
    hospital_id: 2,
    medicine_id: 1,
    current_stock: 400,
    safety_stock: 100,
  },
  {
    hospital_id: 2,
    medicine_id: 2,
    current_stock: 420,
    safety_stock: 100,
  },
];

function demandHistory(): ScenarioDemandRow[] {
  const rows: ScenarioDemandRow[] = [];

  for (const hospitalId of [1, 2]) {
    for (const medicineId of [1, 2]) {
      for (let day = 0; day < 30; day++) {
        const date = new Date(Date.UTC(2026, 8, day + 1))
          .toISOString()
          .slice(0, 10);

        rows.push({
          hospital_id: hospitalId,
          medicine_id: medicineId,
          date,
          demand: 10 + ((hospitalId * 3 + medicineId * 5 + day) % 7),
        });
      }
    }
  }

  return rows;
}

function provider(
  overrides: Partial<ScenarioDataProvider> = {},
): ScenarioDataProvider {
  return {
    loadScenario: async () => scenario,
    loadInventory: async () => inventory,
    loadDemandHistory: async () => demandHistory(),
    ...overrides,
  };
}

async function expectScenarioError(
  promise: Promise<unknown>,
  status: number,
  messagePattern: RegExp,
): Promise<ScenarioError> {
  try {
    await promise;
    assert.fail("Expected simulation to reject.");
  } catch (error) {
    assert.ok(error instanceof ScenarioError);
    assert.equal(error.status, status);
    assert.match(error.publicMessage, messagePattern);
    return error;
  }
}

test("runs a valid scenario with populated live data", async () => {
  const result = await simulateScenario(3, provider());

  assert.equal(result.source, "supabase");
  assert.equal(result.scenario.scenario.id, 3);
  assert.equal(result.scenario.scenario.disruption_type, "demand_surge");
  assert.equal(result.results.length, 4);
  assert.ok(result.model.trainRows > 0);
  assert.equal(result.results[0].days.length, 7);
  assert.ok(result.results[0].hospital.hospital_name);
  assert.ok(result.results[0].medicine.generic_name);
  assert.ok(Number.isFinite(result.results[0].effective_daily_demand));
  assert.ok(Array.isArray(result.results[0].recommendations));
});

test("uses code-defined defaults when the scenarios table has no row", async () => {
  const result = await simulateScenario(
    1,
    provider({ loadScenario: async () => null }),
  );

  assert.equal(result.source, "supabase");
  assert.equal(result.scenario.scenario.id, 1);
  assert.equal(result.scenario.scenario.name, "Supplier Failure");
  assert.equal(result.scenario.scenario.disruption_type, "supplier_failure");
  assert.ok(result.results.length > 0);
});

test("rejects an unknown scenario id with a clear 404", async () => {
  await expectScenarioError(
    simulateScenario(99, provider({ loadScenario: async () => null })),
    404,
    /Demo scenario IDs are 1, 2, 3, 4, 5/,
  );
});

test("rejects an unsupported disruption type", async () => {
  await expectScenarioError(
    simulateScenario(
      3,
      provider({
        loadScenario: async () => ({
          ...scenario,
          disruption_type: "earthquake",
        }),
      }),
    ),
    400,
    /unsupported disruption type/,
  );
});

test("rejects missing or invalid scenario input", async () => {
  for (const value of [undefined, null, 0, -1, 1.5, "abc", {}]) {
    await expectScenarioError(
      simulateScenario(value, provider()),
      400,
      /positive integer/,
    );
  }
});

test("falls back to deterministic demo inventory when inventory is empty", async () => {
  const result = await simulateScenario(
    3,
    provider({ loadInventory: async () => [] }),
  );

  assert.equal(result.source, "demo");
  assert.ok(result.results.length >= 20);
  assert.ok(
    result.scenario.assumptions.some((assumption) =>
      assumption.includes("synthetic demo inventory"),
    ),
  );
});

test("falls back to demo data when demand history is empty", async () => {
  const result = await simulateScenario(
    3,
    provider({ loadDemandHistory: async () => [] }),
  );

  assert.equal(result.source, "demo");
  assert.ok(result.results.length > 0);
  assert.ok(result.model.trainRows > 0);
});

test("surfaces database failures as a safe 503, not a demo success", async () => {
  const error = await expectScenarioError(
    simulateScenario(
      1,
      provider({
        loadInventory: async () => {
          throw new Error("connection refused to private database host");
        },
      }),
    ),
    503,
    /temporarily unavailable/,
  );

  assert.doesNotMatch(error.publicMessage, /connection refused|private host/);
  assert.match(error.message, /connection refused/);
});

test("repeated demo fallback runs produce equivalent results", async () => {
  const first = await simulateScenario(
    3,
    provider({ loadInventory: async () => [] }),
  );
  const second = await simulateScenario(
    3,
    provider({ loadInventory: async () => [] }),
  );

  assert.equal(first.source, "demo");
  assert.deepEqual(first, second);
});

test("response keeps the fields consumed by the frontend", async () => {
  const result = await simulateScenario(2, provider());
  const { success, results } = {
    success: true,
    results: result,
  };

  assert.equal(success, true);
  assert.equal(results.source, "supabase");
  assert.ok(results.scenario.headline);
  assert.ok(results.scenario.result_counts);
  assert.ok(Array.isArray(results.scenario.affected_hospital_ids));
  assert.ok(Array.isArray(results.scenario.affected_medicine_ids));
  assert.ok(Array.isArray(results.results));

  const item = results.results[0];

  assert.ok(item.hospital);
  assert.ok(item.medicine);
  assert.ok(Array.isArray(item.days));
  assert.equal(typeof item.risk_label, "string");
  assert.equal(typeof item.projected_remaining_stock, "number");
});
