import { supabase } from "../utils/supabase.js";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type SimulationResult = {
  hospital_id: number;
  medicine_id: number;
  starting_stock: number;
  safety_stock: number;
  predicted_daily_demand: number;
  risk_level: RiskLevel;
  recommendation: string;
  days: {
    day: number;
    projected_stock: number;
    status: "NORMAL" | "AT_RISK" | "STOCK_OUT";
  }[];
  stock_out_day: number | null;
};

function getRecommendation(
  riskLevel: RiskLevel,
): string {
  switch (riskLevel) {
    case "CRITICAL":
      return "Emergency procurement or stock reallocation required.";

    case "HIGH":
      return "Replenish inventory urgently.";

    case "MEDIUM":
      return "Plan inventory replenishment.";

    case "LOW":
      return "Continue monitoring inventory.";

    default:
      return "Continue monitoring inventory.";
  }
}

export async function simulateScenario(
  scenarioId: number,
): Promise<SimulationResult[]> {
  // 1. Get the scenario
  const { data: scenario, error: scenarioError } =
    await supabase
      .from("scenarios")
      .select(
        "id, name, disruption_type, duration_days",
      )
      .eq("id", scenarioId)
      .single();

  if (scenarioError) {
    throw new Error(
      `Scenario lookup failed: ${scenarioError.message}`,
    );
  }

  if (!scenario) {
    throw new Error("Scenario not found");
  }

  // Currently implemented scenario
  if (scenario.disruption_type !== "supplier_failure") {
    throw new Error(
      `Scenario "${scenario.name}" is not implemented yet.`,
    );
  }

  // 2. Get inventory
  const { data: inventory, error: inventoryError } =
    await supabase
      .from("inventory")
      .select(
        "hospital_id, medicine_id, current_stock, safety_stock",
      );

  if (inventoryError) {
    throw new Error(
      `Inventory lookup failed: ${inventoryError.message}`,
    );
  }

  // 3. Get demand history
  const { data: demandHistory, error: demandError } =
    await supabase
      .from("demand_history")
      .select(
        "hospital_id, medicine_id, demand_date, demand",
      )
      .order("demand_date", { ascending: false });

  if (demandError) {
    throw new Error(
      `Demand history lookup failed: ${demandError.message}`,
    );
  }

  if (!inventory || inventory.length === 0) {
    return [];
  }

  // 4. Group demand by hospital + medicine
  const demandMap = new Map<string, number[]>();

  for (const row of demandHistory ?? []) {
    const key = `${row.hospital_id}-${row.medicine_id}`;

    if (!demandMap.has(key)) {
      demandMap.set(key, []);
    }

    demandMap.get(key)!.push(Number(row.demand));
  }

  // 5. Simulate each inventory item
  const results: SimulationResult[] = inventory.map(
    (item) => {
      const key = `${item.hospital_id}-${item.medicine_id}`;

      const historicalDemand =
        demandMap.get(key) ?? [];

      // Current Phase 1 prediction:
      // average historical daily demand
      const predictedDailyDemand =
        historicalDemand.length > 0
          ? historicalDemand.reduce(
              (sum, value) => sum + value,
              0,
            ) / historicalDemand.length
          : 0;

      let projectedStock = Number(
        item.current_stock,
      );

      const safetyStock = Number(
        item.safety_stock,
      );

      const days: SimulationResult["days"] = [];

      let stockOutDay: number | null = null;

      let minimumProjectedStock = projectedStock;

      // 6. Project inventory
      for (
        let day = 1;
        day <= scenario.duration_days;
        day++
      ) {
        projectedStock -= predictedDailyDemand;

        minimumProjectedStock = Math.min(
          minimumProjectedStock,
          projectedStock,
        );

        let status:
          | "NORMAL"
          | "AT_RISK"
          | "STOCK_OUT";

        if (projectedStock <= 0) {
          projectedStock = 0;
          status = "STOCK_OUT";

          if (stockOutDay === null) {
            stockOutDay = day;
          }
        } else if (
          projectedStock <= safetyStock
        ) {
          status = "AT_RISK";
        } else {
          status = "NORMAL";
        }

        days.push({
          day,
          projected_stock: Number(
            projectedStock.toFixed(2),
          ),
          status,
        });
      }

      // 7. Calculate risk
      let riskLevel: RiskLevel;

      if (stockOutDay !== null) {
        riskLevel = "CRITICAL";
      } else if (
        minimumProjectedStock <
        safetyStock * 0.5
      ) {
        riskLevel = "HIGH";
      } else if (
        minimumProjectedStock <= safetyStock
      ) {
        riskLevel = "MEDIUM";
      } else {
        riskLevel = "LOW";
      }

      // 8. Generate recommendation
      const recommendation =
        getRecommendation(riskLevel);

      // 9. Return complete result
      return {
        hospital_id: Number(item.hospital_id),
        medicine_id: Number(item.medicine_id),
        starting_stock: Number(item.current_stock),
        safety_stock: safetyStock,

        predicted_daily_demand: Number(
          predictedDailyDemand.toFixed(2),
        ),

        risk_level: riskLevel,

        recommendation,

        days,

        stock_out_day: stockOutDay,
      };
    },
  );

  return results;
}