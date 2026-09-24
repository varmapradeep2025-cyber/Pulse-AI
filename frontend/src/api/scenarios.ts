const API_BASE_URL = "http://localhost:4000";

export type SimulationDay = {
  day: number;
  projected_stock: number;
  status: "NORMAL" | "AT_RISK" | "STOCK_OUT";
};

export type SimulationResult = {
  hospital_id: number;
  medicine_id: number;
  starting_stock: number;
  safety_stock: number;
  predicted_daily_demand: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  recommendation: string;
  days: SimulationDay[];
  stock_out_day: number | null;
};

export async function runScenarioSimulation(
  scenarioId: number,
): Promise<SimulationResult[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/scenarios/simulate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scenarioId,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Simulation failed: ${response.status}`,
    );
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(
      data.message ?? "Simulation failed",
    );
  }

  return data.results;
}