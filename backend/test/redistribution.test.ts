import assert from "node:assert/strict";
import test from "node:test";
import {
  applyRedistribution,
} from "../src/services/scenarioService.js";
import type {
  SimulationResult,
} from "../src/services/scenarioService.js";

function createResult(
  hospitalId: number,
  projectedRemaining: number,
  safetyStock: number,
  shortage: number,
): SimulationResult {
  return {
    hospital_id: hospitalId,
    medicine_id: 1,
    starting_stock: projectedRemaining + 70,
    safety_stock: safetyStock,
    predicted_daily_demand: 10,
    risk_level: shortage > 0 ? "HIGH" : "LOW",
    recommendation: "",
    days: [],
    stock_out_day: null,
    hospital: {
      hospital_id: hospitalId,
      hospital_name: `Hospital ${hospitalId}`,
      city: "Test City",
      state: "Test State",
      facility_type: "Healthcare facility",
      departments: [],
      bed_capacity: 100,
      emergency_available: true,
      inventory_location: "Test store",
      supplier_ids: [],
      demonstration: true,
    },
    medicine: {
      medicine_id: 1,
      generic_name: "Test medicine",
      category: "Test",
      unit: "units",
      lead_time_days: 5,
      supplier_ids: [],
      criticality: "standard",
    },
    effective_daily_demand: 10,
    disruption_window_days: 7,
    supplier_disrupted: false,
    projected_demand: 70,
    projected_remaining_stock: projectedRemaining,
    days_of_stock_remaining: (projectedRemaining + 70) / 10,
    safety_stock_breach: projectedRemaining < safetyStock,
    estimated_shortage_quantity: shortage,
    risk_label: shortage > 0 ? "RED" : "GREEN",
    risk_reason: "Initial projection.",
    recommendations: [
      {
        type: "emergency_procurement",
        why: "Initial shortage.",
        action: "Procure stock.",
        expected_impact: "Restores stock.",
      },
      {
        type: "monitoring",
        why: "Initial monitoring.",
        action: "Monitor stock.",
        expected_impact: "Keeps stock visible.",
      },
    ],
  };
}

test("redistribution decrements donor stock and cannot over-allocate it", () => {
  const firstRecipient = createResult(1, 20, 100, 80);
  const secondRecipient = createResult(2, 20, 100, 80);
  const donor = createResult(3, 200, 100, 0);

  applyRedistribution([firstRecipient, secondRecipient, donor]);

  assert.equal(firstRecipient.redistribution?.transfer_units, 80);
  assert.equal(secondRecipient.redistribution?.transfer_units, 20);
  assert.equal(firstRecipient.projected_remaining_stock, 100);
  assert.equal(secondRecipient.projected_remaining_stock, 40);
  assert.equal(donor.projected_remaining_stock, 100);
  assert.ok(donor.projected_remaining_stock >= donor.safety_stock);
  assert.equal(
    (firstRecipient.redistribution?.transfer_units ?? 0) +
      (secondRecipient.redistribution?.transfer_units ?? 0),
    100,
  );
});

test("redistribution recomputes shortages, risk labels, and recommendations", () => {
  const recipient = createResult(1, 20, 100, 80);
  const donor = createResult(2, 200, 100, 0);

  applyRedistribution([recipient, donor]);

  assert.equal(recipient.estimated_shortage_quantity, 0);
  assert.equal(recipient.safety_stock_breach, false);
  assert.equal(recipient.risk_label, "YELLOW");
  assert.equal(recipient.risk_level, "MEDIUM");
  assert.equal(recipient.recommendations[0]?.type, "reallocate");
  assert.equal(
    recipient.recommendations.some(
      (recommendation) => recommendation.type === "emergency_procurement",
    ),
    false,
  );

  assert.equal(donor.projected_remaining_stock, 120);
  assert.equal(donor.estimated_shortage_quantity, 0);
  assert.equal(donor.risk_label, "YELLOW");
  assert.equal(donor.recommendations[0]?.type, "reallocate");
});

test("redistribution applies only the donor surplus when it is insufficient", () => {
  const recipient = createResult(1, 20, 100, 80);
  const donor = createResult(2, 130, 100, 0);

  applyRedistribution([recipient, donor]);

  assert.equal(recipient.redistribution?.transfer_units, 30);
  assert.equal(recipient.projected_remaining_stock, 50);
  assert.equal(recipient.estimated_shortage_quantity, 50);
  assert.equal(recipient.risk_label, "RED");
  assert.equal(donor.projected_remaining_stock, donor.safety_stock);
  assert.ok(donor.projected_remaining_stock >= 0);
});
