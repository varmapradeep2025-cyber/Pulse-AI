import assert from "node:assert/strict";
import test from "node:test";
import {
  simulateScenario,
  type ScenarioDataProvider,
} from "../src/services/scenarioService.js";

const MEDICINE_ID = 2;
const HOSPITALS = [1, 2, 3, 4];

function history() {
  const rows = [];

  for (let index = 0; index < 30; index++) {
    const date = new Date(Date.UTC(2026, 8, 1 + index))
      .toISOString()
      .slice(0, 10);

    for (const hospitalId of HOSPITALS) {
      rows.push({
        hospital_id: hospitalId,
        medicine_id: MEDICINE_ID,
        date,
        demand: 10,
      });
    }
  }

  return rows;
}

function provider(
  stocks: Record<number, number>,
): ScenarioDataProvider {
  return {
    async loadScenario() {
      return null;
    },
    async loadInventory() {
      return HOSPITALS.map((hospitalId) => ({
        hospital_id: hospitalId,
        medicine_id: MEDICINE_ID,
        current_stock: stocks[hospitalId],
        safety_stock: 100,
      }));
    },
    async loadDemandHistory() {
      return history();
    },
    async loadProvenance() {
      return "imported-real";
    },
  };
}

test("redistribution deducts transfers from the donor and reruns risk", async () => {
  const response = await simulateScenario(
    3,
    provider({ 1: 20, 2: 700, 3: 20, 4: 700 }),
  );

  const byHospital = new Map(
    response.results.map((result) => [result.hospital_id, result]),
  );
  const recipients = [1, 3].map((id) => byHospital.get(id)!);
  const donors = [2, 4].map((id) => byHospital.get(id)!);

  assert.equal(response.dataProvenance, "imported-real");

  for (const recipient of recipients) {
    assert.ok(recipient.redistribution);
    assert.ok(recipient.redistribution.transfer_units > 0);
    assert.equal(recipient.estimated_shortage_quantity, 0);
    assert.equal(recipient.stock_out_day, null);
    assert.notEqual(recipient.risk_label, "CRITICAL");
    assert.equal(recipient.safety_stock_breach, false);
  }

  const totalTransfers = recipients.reduce(
    (total, recipient) =>
      total + (recipient.redistribution?.transfer_units ?? 0),
    0,
  );
  const donor = donors.find(
    (candidate) => candidate.hospital_id ===
      recipients[0].redistribution?.donor_hospital_id,
  )!;
  const projectedBeforeTransfer =
    donor.starting_stock -
    donor.effective_daily_demand * donor.disruption_window_days;

  assert.ok(totalTransfers > 0);
  assert.ok(
    Math.abs(
      donor.projected_remaining_stock -
        (projectedBeforeTransfer - totalTransfers),
    ) < 0.02,
  );
  assert.ok(donor.projected_remaining_stock >= donor.safety_stock);
});

test("redistribution does not promise more stock than a donor has", async () => {
  const response = await simulateScenario(
    3,
    provider({ 1: 20, 2: 230, 3: 20, 4: 20 }),
  );

  const transfers = response.results
    .map((result) => result.redistribution?.transfer_units ?? 0)
    .filter((units) => units > 0);
  const totalTransfers = transfers.reduce(
    (total, units) => total + units,
    0,
  );
  const donor = response.results.find(
    (result) => result.hospital_id === 2,
  )!;
  const initialSurplus =
    donor.projected_remaining_stock + totalTransfers - donor.safety_stock;

  assert.ok(transfers.length >= 1);
  assert.ok(totalTransfers > 0);
  assert.ok(totalTransfers <= initialSurplus + 0.02);
});
