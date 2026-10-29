import { useMemo, useState } from "react";
import { runScenarioSimulation, type ScenarioResponse } from "../api/scenarios";
import { saveScenarioReport } from "../data/scenarioReports";
import LoadingState from "../components/LoadingState";

type ScenarioConfig = {
  id: number;
  name: string;
  description: string;
};

const SCENARIOS: ScenarioConfig[] = [
  {
    id: 1,
    name: "Supplier Failure",
    description: "Primary supplier unavailable for 7 days.",
  },
  {
    id: 2,
    name: "Transport Delay",
    description: "Expected deliveries delayed by 3 days.",
  },
  {
    id: 3,
    name: "Demand Surge",
    description: "Demand for selected resources increases by 30% for 7 days.",
  },
  {
    id: 4,
    name: "Hospital Disruption",
    description:
      "Facility-level demand rises 20%; redistribution matches surplus.",
  },
  {
    id: 5,
    name: "Combined Crisis",
    description: "Supplier failure + 30% demand rise + 3-day delivery delay.",
  },
];

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return String(value);
}

function riskBadgeClass(risk: string): string {
  switch (risk) {
    case "CRITICAL":
      return "intel-badge intel-badge--CRITICAL";
    case "RED":
    case "HIGH":
      return "intel-badge intel-badge--HIGH";
    case "YELLOW":
    case "MEDIUM":
      return "intel-badge intel-badge--MEDIUM";
    case "GREEN":
    case "LOW":
      return "intel-badge intel-badge--LOW";
    default:
      return "intel-badge";
  }
}

function buildDeterministicExplanation(result: ScenarioResponse): string {
  const worst = result.scenario?.worst_risk_label;
  const shortage = result.scenario?.projected_shortage_total;
  const hospitals = result.scenario?.affected_hospital_ids?.length ?? 0;
  const combos = result.results?.length ?? 0;
  const stockouts = result.results?.filter((r) => r.stock_out_day !== null).length ?? 0;
  const source = result.source === "demo" ? "synthetic/demo" : "database-backed";

  const parts: string[] = [];
  parts.push(
    `This ${source} simulation affects ${hospitals} hospital(s) across ${combos} hospital-medicine combination(s).`,
  );
  if (worst) {
    parts.push(`The worst projected risk is ${worst}.`);
  }
  if (typeof shortage === "number" && shortage > 0) {
    parts.push(`Aggregate projected shortage is ${shortage} units (by reported units).`);
  } else {
    parts.push("No aggregate shortage is projected under current assumptions.");
  }
  if (stockouts > 0) {
    parts.push(`${stockouts} combination(s) are projected to stock out within the window.`);
  }
  return parts.slice(0, 3).join(" ");
}

type SortKey =
  | "hospital"
  | "product"
  | "starting_stock"
  | "safety_stock"
  | "projected_remaining_stock"
  | "estimated_shortage_quantity"
  | "stock_out_day"
  | "risk_label";

function normalizeRiskCategory(label?: string | null): "Low" | "Caution" | "High" | "Unknown" {
  const l = (label || "").toString().toUpperCase();
  if (l === "GREEN" || l === "LOW") return "Low";
  if (l === "YELLOW" || l === "MEDIUM") return "Caution";
  if (l === "RED" || l === "HIGH" || l === "CRITICAL") return "High";
  return "Unknown";
}

export default function ScenarioSimulationPage() {
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<ScenarioResponse | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("risk_label");
  const [sortAsc, setSortAsc] = useState(false);

  async function handleRunSimulation() {
    if (selectedScenarioId === null || loading) {
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setSaveStatus("");

    try {
      const response = await runScenarioSimulation(selectedScenarioId);
      setResult(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Simulation failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleSaveReport() {
    if (!result || selectedScenarioId === null) {
      setSaveStatus("Cannot save report: no valid results.");
      return;
    }

    try {
      saveScenarioReport(result, selectedScenarioId);
      setSaveStatus("Report saved to Reports page.");
    } catch (err) {
      setSaveStatus("Failed to save report.");
    }
  }

  const kpis = useMemo(() => {
    if (!result) return null;
    const hospitalsSet = new Set<number>();
    const productsSet = new Set<string>();
    let belowSafety = 0;
    let shortageAgg = 0;
    let redistributionQty = 0;
    let hasUnits = true;

    for (const r of result.results || []) {
      hospitalsSet.add(r.hospital_id);
      if (r.medicine?.generic_name) productsSet.add(r.medicine.generic_name);
      if (r.projected_remaining_stock < r.safety_stock) belowSafety++;
      if (typeof r.estimated_shortage_quantity === "number") {
        shortageAgg += r.estimated_shortage_quantity;
      }
      if (r.redistribution?.transfer_units) {
        redistributionQty += r.redistribution.transfer_units;
      }
      if (!r.medicine?.unit) hasUnits = false;
    }

    return {
      hospitalsAffected: hospitalsSet.size,
      distinctProducts: productsSet.size,
      belowSafety,
      aggregateShortage: hasUnits ? shortageAgg : null,
      baselineShortage:
        result.scenario?.baseline?.projected_shortage_total ?? null,
      additionalShortage:
        result.scenario?.impact_vs_baseline?.additional_projected_shortage ??
        null,
      redistributionQty,
      disruptionDuration: result.scenario?.scenario?.duration_days ?? null,
    };
  }, [result]);

  const sortedResults = useMemo(() => {
    if (!result?.results) return [];
    const items = [...result.results];
    items.sort((a, b) => {
      const getVal = (x: any): any => {
        if (sortKey === "hospital") return x.hospital?.hospital_name || x.hospital_id;
        if (sortKey === "product") return x.medicine?.generic_name || x.medicine_id;
        if (sortKey === "risk_label") return x.risk_label || x.risk_level || "";
        return x[sortKey];
      };
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === "number" && typeof vb === "number") {
        return sortAsc ? va - vb : vb - va;
      }
      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      if (sa < sb) return sortAsc ? -1 : 1;
      if (sa > sb) return sortAsc ? 1 : -1;
      return 0;
    });
    return items;
  }, [result, sortKey, sortAsc]);

  const sourceLabel =
    result?.source === "demo"
      ? "Demo data (synthetic)"
      : result?.source === "supabase"
        ? "Database data (Supabase)"
        : "Data source unavailable";

  const hospitalRiskCats = useMemo(() => {
    if (!result?.results) return { Low: 0, Caution: 0, High: 0, Unknown: 0 };
    const counts = { Low: 0, Caution: 0, High: 0, Unknown: 0 } as Record<string, number>;
    for (const r of result.results) {
      const cat = normalizeRiskCategory(r.risk_label || r.risk_level);
      counts[cat]++;
    }
    return counts;
  }, [result]);

  const productRisk = useMemo(() => {
    if (!result?.results) return [];
    const map = new Map<string, { name: string; unit: string; shortage: number; atRiskHospitals: number }>();
    for (const r of result.results) {
      const name = r.medicine?.generic_name || `Medicine ${r.medicine_id}`;
      const unit = r.medicine?.unit || "";
      const key = `${name}|${unit}`;
      if (!map.has(key)) {
        map.set(key, { name, unit, shortage: 0, atRiskHospitals: 0 });
      }
      const entry = map.get(key)!;
      if (typeof r.estimated_shortage_quantity === "number") entry.shortage += r.estimated_shortage_quantity;
      const cat = normalizeRiskCategory(r.risk_label || r.risk_level);
      if (cat !== "Low") entry.atRiskHospitals++;
    }
    return Array.from(map.values()).sort((a, b) => b.shortage - a.shortage || b.atRiskHospitals - a.atRiskHospitals);
  }, [result]);

  const depletionSeries = useMemo(() => {
    if (!result?.results) return [];
    // Use first representative item with days array; prefer item with most days
    let best: any = null;
    for (const r of result.results) {
      if (r.days && r.days.length > 0) {
        if (!best || r.days.length > best.days.length) best = r;
      }
    }
    if (!best || !best.days) return [];
    return best.days.map((d: any) => ({
      day: d.day,
      projected: d.projected_stock,
      safety: best.safety_stock,
      unit: best.medicine?.unit || "",
    }));
  }, [result]);

  const interventionData = useMemo(() => {
    if (!result?.results) return [];
    // Aggregate across all results for same scope where possible
    const items = result.results.slice(0, 10); // limit for readability
    return items.map((r: any) => {
      const baseline = r.baseline?.projected_remaining_stock ?? r.starting_stock;
      const afterDisruption = (r.projected_remaining_stock_before_redistribution !== undefined && r.projected_remaining_stock_before_redistribution !== null)
        ? r.projected_remaining_stock_before_redistribution
        : r.projected_remaining_stock;
      const post = r.projected_remaining_stock;
      return {
        label: `${r.hospital?.hospital_name || r.hospital_id} - ${r.medicine?.generic_name || r.medicine_id}`,
        baseline,
        afterDisruption,
        postIntervention: post,
        unit: r.medicine?.unit || "",
        redistributed: !!r.redistribution,
      };
    });
  }, [result]);

  const unitForHosp = result?.results?.find((r) => r.medicine?.unit)?.medicine?.unit || "";

  return (
    <div className="container page">
      <header className="page__header">
        <h1>Five Scenarios Simulation</h1>
        <p>
          Simulate supply-chain disruptions with data-grounded metrics and interactive charts.
        </p>
      </header>

      <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div>
          <h2 style={{ marginBottom: "0.5rem" }}>Select a scenario</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "0.75rem",
            }}
          >
            {SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                onClick={() => setSelectedScenarioId(scenario.id)}
                style={{
                  textAlign: "left",
                  padding: "1rem",
                  borderRadius: "var(--radius)",
                  border:
                    selectedScenarioId === scenario.id
                      ? "2px solid var(--color-primary)"
                      : "1px solid var(--color-border)",
                  background:
                    selectedScenarioId === scenario.id
                      ? "var(--color-primary-soft)"
                      : "var(--color-surface)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "border-color 0.15s ease, background 0.15s ease",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>
                  {scenario.name}
                </div>
                <div
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {scenario.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleRunSimulation}
            disabled={selectedScenarioId === null || loading}
          >
            {loading ? "Running Simulation..." : "Run Simulation"}
          </button>
          {result && selectedScenarioId !== null && (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleSaveReport}
            >
              Save Report
            </button>
          )}
        </div>

        {saveStatus && (
          <div
            style={{
              padding: "0.6rem 0.9rem",
              borderRadius: "var(--radius-sm)",
              background: saveStatus.includes("Failed") || saveStatus.includes("Cannot")
                ? "var(--color-danger-soft)"
                : "var(--color-primary-soft)",
              color: saveStatus.includes("Failed") || saveStatus.includes("Cannot")
                ? "var(--color-danger)"
                : "var(--color-primary-dark)",
              fontSize: "0.9rem",
            }}
          >
            {saveStatus}
          </div>
        )}
      </section>

      {loading && (
        <div className="container page">
          <LoadingState label="Running scenario simulation..." />
        </div>
      )}

      {error && !loading && (
        <section
          style={{
            padding: "1rem",
            borderRadius: "var(--radius)",
            background: "var(--color-danger-soft)",
            color: "var(--color-danger)",
            border: "1px solid rgba(179, 38, 30, 0.35)",
          }}
        >
          <strong>Error:</strong> {error}
          {(error.toLowerCase().includes("session") ||
            error.toLowerCase().includes("401")) && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
              You may need to sign in again.
            </div>
          )}
        </section>
      )}

      {result && !loading && (
        <section style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              padding: "1rem 1.1rem",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <div style={{ fontWeight: 700 }}>AI explanation (deterministic)</div>
                <div style={{ color: "var(--color-text-muted)", fontSize: "0.92rem", marginTop: "0.25rem" }}>
                  {buildDeterministicExplanation(result)}
                </div>
              </div>
              <div style={{ fontSize: "0.9rem" }}>
                <strong>Source:</strong> {sourceLabel}
              </div>
            </div>
          </div>

          {kpis && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "0.75rem",
              }}
            >
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius)", padding: "0.9rem" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Hospitals affected</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{kpis.hospitalsAffected}</div>
              </div>
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius)", padding: "0.9rem" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Distinct products at risk</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{kpis.distinctProducts}</div>
              </div>
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius)", padding: "0.9rem" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Hospitals below safety stock</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{kpis.belowSafety}</div>
              </div>
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius)", padding: "0.9rem" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Aggregate projected shortage</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{kpis.aggregateShortage === null ? "Unavailable" : kpis.aggregateShortage}</div>
              </div>
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius)", padding: "0.9rem" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Baseline projected shortage</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{kpis.baselineShortage === null ? "Unavailable" : kpis.baselineShortage}</div>
              </div>
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius)", padding: "0.9rem" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Additional shortage vs baseline</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{kpis.additionalShortage === null ? "Unavailable" : kpis.additionalShortage}</div>
              </div>
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius)", padding: "0.9rem" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Proposed redistribution qty</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{kpis.redistributionQty} (simulated)</div>
              </div>
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius)", padding: "0.9rem" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Disruption duration</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{kpis.disruptionDuration ?? "—"} days</div>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.9rem" }}>
            <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "0.9rem" }}>
              <div style={{ fontWeight: 700, marginBottom: "0.3rem" }}>Chart 1: Inventory vs. Safety Stock — Grouped Bar Chart</div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginBottom: "0.2rem" }}>Compare projected remaining inventory against safety stock for each hospital</div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginBottom: "0.4rem" }}>X-axis: Hospital names | Y-axis: Inventory quantity{unitForHosp ? ` (${unitForHosp})` : ""}</div>
              {sortedResults.length > 0 ? (
                <svg width="100%" height="240" viewBox="0 0 320 240" preserveAspectRatio="xMidYMid meet">
                  {(() => {
                    const topItems = sortedResults.slice(0, 10);
                    const maxVal = Math.max(1, ...topItems.map((x: any) => Math.max(x.safety_stock || 0, x.projected_remaining_stock || 0)));
                    return topItems.map((item: any, idx: number) => {
                      const barW = 22;
                      const gap = 10;
                      const x = idx * (barW * 2 + gap) + 40;
                      const hSafety = ((item.safety_stock || 0) / maxVal) * 140;
                      const hProj = ((item.projected_remaining_stock || 0) / maxVal) * 140;
                      const hospName = item.hospital?.hospital_name || `H${item.hospital_id}`;
                      return (
                        <g key={idx}>
                          <rect x={x} y={170 - hSafety} width={barW} height={hSafety} fill="#f59e0b">
                            <title>{`Hospital: ${hospName}\nSafety stock: ${item.safety_stock} ${unitForHosp}\nProduct: ${item.medicine?.generic_name}`}</title>
                          </rect>
                          <rect x={x + barW} y={170 - hProj} width={barW} height={hProj} fill="#2563eb">
                            <title>{`Hospital: ${hospName}\nProduct: ${item.medicine?.generic_name}\nProjected remaining stock: ${item.projected_remaining_stock} ${unitForHosp}\nSafety stock: ${item.safety_stock} ${unitForHosp}`}</title>
                          </rect>
                          <text x={x + barW} y={195} fontSize="7" textAnchor="middle" transform={`rotate(-45 ${x + barW},195)`}>
                            {hospName.length > 14 ? hospName.slice(0, 14) + "…" : hospName}
                          </text>
                        </g>
                      );
                    });
                  })()}
                  {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
                    const maxVal = Math.max(1, ...sortedResults.slice(0, 10).map((x: any) => Math.max(x.safety_stock || 0, x.projected_remaining_stock || 0)));
                    const y = 170 - t * 140;
                    const val = Math.round(maxVal * t);
                    return (
                      <g key={`g1-${idx}`}>
                        <line x1="35" y1={y} x2="310" y2={y} stroke="#e2e8f0" strokeDasharray="2 2" />
                        <text x="30" y={y + 3} fontSize="7" textAnchor="end" fill="#64748b">{val}</text>
                      </g>
                    );
                  })}
                  <line x1="35" y1="170" x2="310" y2="170" stroke="#cbd5e1" />
                  <text x="170" y="230" fontSize="8" textAnchor="middle" fill="#475569">Hospital</text>
                </svg>
              ) : (
                <div style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>No data</div>
              )}
              <div style={{ display: "flex", gap: "0.8rem", fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "0.3rem" }}>
                <span>■ Projected remaining stock (Series 1)</span>
                <span>■ Safety stock (Series 2)</span>
              </div>
            </div>

            <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "0.9rem" }}>
              <div style={{ fontWeight: 700, marginBottom: "0.3rem" }}>Chart 2: Hospital Risk Distribution — Donut Chart</div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginBottom: "0.4rem" }}>Number of hospitals in each risk category (from simulation risk categories)</div>
              {result.results && result.results.length > 0 ? (
                <svg width="100%" height="200" viewBox="0 0 200 200">
                  {(() => {
                    const total = result.results.length;
                    const colors: Record<string, string> = { Low: "#16a34a", Caution: "#f59e0b", High: "#dc2626", Unknown: "#94a3b8" };
                    let angle = 0;
                    const cats = ["Low", "Caution", "High", "Unknown"] as const;
                    return cats.map((cat) => {
                      const count = hospitalRiskCats[cat] || 0;
                      if (count === 0) return null;
                      const pct = count / total;
                      const start = angle;
                      const end = angle + pct * 2 * Math.PI;
                      angle = end;
                      const x1 = 100 + 60 * Math.cos(start);
                      const y1 = 100 + 60 * Math.sin(start);
                      const x2 = 100 + 60 * Math.cos(end);
                      const y2 = 100 + 60 * Math.sin(end);
                      const large = pct > 0.5 ? 1 : 0;
                      const path = `M 100 100 L ${x1} ${y1} A 60 60 0 ${large} 1 ${x2} ${y2} Z`;
                      return <path key={cat} d={path} fill={colors[cat]}><title>{`${cat}: ${count} (${Math.round(pct * 100)}%)`}</title></path>;
                    });
                  })()}
                  <circle cx="100" cy="100" r="30" fill="white" />
                </svg>
              ) : (
                <div style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>No data</div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                <span>■ Low risk (Green)</span>
                <span>■ Caution (Yellow)</span>
                <span>■ High risk (Red)</span>
                <span>■ Unknown</span>
              </div>
              {result.results && result.results.length > 0 && (
                <div style={{ fontSize: "0.8rem", marginTop: "0.3rem" }}>
                  Low: {hospitalRiskCats.Low} ({Math.round((hospitalRiskCats.Low / result.results.length) * 100)}%), Caution: {hospitalRiskCats.Caution} ({Math.round((hospitalRiskCats.Caution / result.results.length) * 100)}%), High: {hospitalRiskCats.High} ({Math.round((hospitalRiskCats.High / result.results.length) * 100)}%){hospitalRiskCats.Unknown > 0 ? `, Unknown: ${hospitalRiskCats.Unknown} (${Math.round((hospitalRiskCats.Unknown / result.results.length) * 100)}%)` : ""}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.9rem" }}>
            <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "0.9rem" }}>
              <div style={{ fontWeight: 700, marginBottom: "0.3rem" }}>Chart 3: Inventory Depletion — Line Chart</div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginBottom: "0.2rem" }}>Projected inventory over time during the disruption window</div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginBottom: "0.4rem" }}>X-axis: Day of disruption | Y-axis: Projected inventory quantity{depletionSeries[0]?.unit ? ` (${depletionSeries[0].unit})` : ""}</div>
              {depletionSeries.length > 0 ? (
                <svg width="100%" height="220" viewBox="0 0 300 220">
                  {(() => {
                    const maxV = Math.max(1, ...depletionSeries.map((d: any) => Math.max(d.projected, d.safety || 0)));
                    const pts = depletionSeries.map((d: any, i: number) => {
                      const x = 30 + (i / Math.max(1, depletionSeries.length - 1)) * 250;
                      const y = 170 - (d.projected / maxV) * 140;
                      return `${x},${y}`;
                    }).join(" ");
                    const sPts = depletionSeries.map((d: any, i: number) => {
                      const x = 30 + (i / Math.max(1, depletionSeries.length - 1)) * 250;
                      const y = 170 - ((d.safety || 0) / maxV) * 140;
                      return `${x},${y}`;
                    }).join(" ");
                    return (
                      <>
                        <polyline points={pts} fill="none" stroke="#2563eb" strokeWidth="2" />
                        <polyline points={sPts} fill="none" stroke="#dc2626" strokeWidth="2" strokeDasharray="4 2" />
                        {depletionSeries.map((d: any, i: number) => {
                          const x = 30 + (i / Math.max(1, depletionSeries.length - 1)) * 250;
                          const y = 170 - (d.projected / maxV) * 140;
                          return <circle key={i} cx={x} cy={y} r="3" fill="#2563eb"><title>{`Day ${d.day}: ${d.projected} ${d.unit}. Safety stock threshold: ${d.safety} ${d.unit}.`}</title></circle>;
                        })}
                        {/* Y-axis ticks and grid */}
                        {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
                          const y = 170 - t * 140;
                          const val = Math.round(maxV * t);
                          return (
                            <g key={`grid-${idx}`}>
                              <line x1="30" y1={y} x2="280" y2={y} stroke="#e2e8f0" strokeDasharray="2 2" />
                              <text x="25" y={y + 3} fontSize="7" textAnchor="end" fill="#64748b">{val}</text>
                            </g>
                          );
                        })}
                        {/* X-axis ticks */}
                        {depletionSeries.map((d: any, i: number) => {
                          if (i % Math.max(1, Math.floor(depletionSeries.length / 5)) === 0 || i === depletionSeries.length - 1) {
                            const x = 30 + (i / Math.max(1, depletionSeries.length - 1)) * 250;
                            return <text key={`x-${i}`} x={x} y="190" fontSize="7" textAnchor="middle" fill="#64748b">{d.day}</text>;
                          }
                          return null;
                        })}
                        <text x="155" y="210" fontSize="8" textAnchor="middle" fill="#475569">Day of disruption</text>
                      </>
                    );
                  })()}
                  <line x1="30" y1="170" x2="280" y2="170" stroke="#cbd5e1" />
                </svg>
              ) : (
                <div style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>No daily projections available from API response.</div>
              )}
              <div style={{ display: "flex", gap: "0.8rem", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                <span>— Projected inventory</span>
                <span>-- Safety-stock threshold</span>
              </div>
            </div>

            <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "0.9rem" }}>
              <div style={{ fontWeight: 700, marginBottom: "0.3rem" }}>Chart 4: Product Risk Comparison — Bar Chart</div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginBottom: "0.2rem" }}>Inventory risk across products</div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginBottom: "0.4rem" }}>Metric: Aggregate projected shortage by product{productRisk[0]?.unit ? ` (${productRisk[0].unit})` : ""} when available; otherwise hospitals at risk per product</div>
              {productRisk.length > 0 ? (
                <svg width="100%" height="200" viewBox="0 0 300 200">
                  {productRisk.slice(0, 6).map((p, idx) => {
                    const maxS = Math.max(1, ...productRisk.slice(0, 6).map((x) => x.shortage));
                    const barH = (p.shortage / maxS) * 120;
                    const y = 170 - barH;
                    const x = 40 + idx * 40;
                    return (
                      <g key={idx}>
                        <rect x={x} y={y} width="28" height={barH} fill="#ea580c">
                          <title>{`${p.name} (${p.unit}): shortage ${p.shortage}, hospitals at risk ${p.atRiskHospitals}`}</title>
                        </rect>
                        <text x={x + 14} y={185} fontSize="7" textAnchor="middle" transform={`rotate(-45 ${x + 14},185)`}>
                          {p.name.slice(0, 12)}
                        </text>
                      </g>
                    );
                  })}
                  <line x1="30" y1="170" x2="280" y2="170" stroke="#cbd5e1" />
                </svg>
              ) : (
                <div style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>No product-level shortage data available.</div>
              )}
            </div>
          </div>

            <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "0.9rem" }}>
            <div style={{ fontWeight: 700, marginBottom: "0.3rem" }}>Chart 5: Intervention Impact — Before-and-After Chart (grouped bars)</div>
            <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginBottom: "0.2rem" }}>Same-window no-disruption baseline vs disrupted projection vs projected inventory after simulated redistribution</div>
            <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginBottom: "0.4rem" }}>Redistribution is labeled as simulated, not a real inventory movement. Values use actual simulation results from the same scope.</div>
            {interventionData.length > 0 ? (
              <svg width="100%" height="220" viewBox="0 0 340 220">
                  {interventionData.slice(0, 6).map((d: any, idx: number) => {
                  const maxV = Math.max(1, ...interventionData.slice(0, 6).map((x: any) => Math.max(x.baseline || 0, x.afterDisruption || 0, x.postIntervention || 0)));
                  const barW = 18;
                  const gap = 10;
                  const groupW = barW * 3 + gap;
                  const x = 40 + idx * (groupW + 12);
                  const hBase = ((d.baseline || 0) / maxV) * 150;
                  const hAfter = ((d.afterDisruption || 0) / maxV) * 150;
                  const hPost = ((d.postIntervention || 0) / maxV) * 150;
                  return (
                    <g key={idx}>
                      <rect x={x} y={170 - hBase} width={barW} height={hBase} fill="#94a3b8"><title>{`Baseline: ${d.baseline} ${d.unit}`}</title></rect>
                      <rect x={x + barW + 2} y={170 - hAfter} width={barW} height={hAfter} fill="#f59e0b"><title>{`After disruption: ${d.afterDisruption} ${d.unit}`}</title></rect>
                      <rect x={x + (barW + 2) * 2} y={170 - hPost} width={barW} height={hPost} fill="#16a34a"><title>{`Post-intervention (simulated): ${d.postIntervention} ${d.unit}`}</title></rect>
                      <text x={x + groupW / 2} y={185} fontSize="7" textAnchor="middle" transform={`rotate(-45 ${x + groupW / 2},185)`}>
                        {d.label.slice(0, 18)}
                      </text>
                    </g>
                  );
                })}
                <line x1="30" y1="170" x2="320" y2="170" stroke="#cbd5e1" />
              </svg>
            ) : (
              <div style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>Insufficient data for before/after comparison.</div>
            )}
            <div style={{ display: "flex", gap: "0.8rem", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
              <span>■ Baseline projected stock</span>
              <span>■ After disruption</span>
              <span>■ Projected after simulated redistribution</span>
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
              <h2 style={{ margin: 0 }}>Detailed results table</h2>
              <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                Sort by:{" "}
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  style={{ padding: "0.3rem 0.5rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}
                >
                  <option value="risk_label">Risk</option>
                  <option value="hospital">Hospital</option>
                  <option value="product">Product</option>
                  <option value="projected_remaining_stock">Projected stock</option>
                  <option value="estimated_shortage_quantity">Shortage</option>
                  <option value="stock_out_day">Stock-out day</option>
                </select>
                <button
                  type="button"
                  className="btn btn--tiny"
                  onClick={() => setSortAsc((v) => !v)}
                  style={{ marginLeft: "0.4rem" }}
                >
                  {sortAsc ? "Asc" : "Desc"}
                </button>
              </div>
            </div>
            {sortedResults.length > 0 ? (
              <div style={{ overflowX: "auto", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
                  <thead>
                    <tr style={{ background: "var(--color-surface-soft)" }}>
                      <th style={{ textAlign: "left", padding: "0.6rem 0.8rem", fontSize: "0.85rem" }}>Hospital</th>
                      <th style={{ textAlign: "left", padding: "0.6rem 0.8rem", fontSize: "0.85rem" }}>Product</th>
                      <th style={{ textAlign: "left", padding: "0.6rem 0.8rem", fontSize: "0.85rem" }}>Unit</th>
                      <th style={{ textAlign: "right", padding: "0.6rem 0.8rem", fontSize: "0.85rem" }}>Starting stock</th>
                      <th style={{ textAlign: "right", padding: "0.6rem 0.8rem", fontSize: "0.85rem" }}>Safety stock</th>
                      <th style={{ textAlign: "right", padding: "0.6rem 0.8rem", fontSize: "0.85rem" }}>Projected stock</th>
                      <th style={{ textAlign: "right", padding: "0.6rem 0.8rem", fontSize: "0.85rem" }}>Shortage</th>
                      <th style={{ textAlign: "right", padding: "0.6rem 0.8rem", fontSize: "0.85rem" }}>Stock-out day</th>
                      <th style={{ textAlign: "left", padding: "0.6rem 0.8rem", fontSize: "0.85rem" }}>Risk</th>
                      <th style={{ textAlign: "left", padding: "0.6rem 0.8rem", fontSize: "0.85rem" }}>Intervention</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedResults.map((item, idx) => (
                      <tr key={idx} style={{ borderTop: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "0.6rem 0.8rem" }}>{item.hospital?.hospital_name || item.hospital_id}</td>
                        <td style={{ padding: "0.6rem 0.8rem" }}>{item.medicine?.generic_name || item.medicine_id}</td>
                        <td style={{ padding: "0.6rem 0.8rem" }}>{item.medicine?.unit || "—"}</td>
                        <td style={{ padding: "0.6rem 0.8rem", textAlign: "right" }}>{formatNumber(item.starting_stock)}</td>
                        <td style={{ padding: "0.6rem 0.8rem", textAlign: "right" }}>{formatNumber(item.safety_stock)}</td>
                        <td style={{ padding: "0.6rem 0.8rem", textAlign: "right" }}>{formatNumber(item.projected_remaining_stock)}</td>
                        <td style={{ padding: "0.6rem 0.8rem", textAlign: "right" }}>{formatNumber(item.estimated_shortage_quantity)}</td>
                        <td style={{ padding: "0.6rem 0.8rem", textAlign: "right" }}>{item.stock_out_day === null ? "None" : formatNumber(item.stock_out_day)}</td>
                        <td style={{ padding: "0.6rem 0.8rem" }}>
                          <span className={riskBadgeClass(item.risk_label || item.risk_level || "")}>
                            {item.risk_label || item.risk_level || "—"}
                          </span>
                        </td>
                        <td style={{ padding: "0.6rem 0.8rem" }}>
                          {item.redistribution ? `Transfer ${item.redistribution.transfer_units} from ${item.redistribution.donor_hospital_name} (simulated)` : (item.recommendations?.[0]?.type === "reallocate" ? "Reallocation suggested" : "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state__icon">📊</div>
                <h3 className="empty-state__title">No results</h3>
                <p className="empty-state__description">
                  The simulation returned no results.
                </p>
              </div>
            )}
          </div>

          {result.scenario?.assumptions && result.scenario.assumptions.length > 0 && (
            <div
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                padding: "1rem 1.1rem",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: "0.4rem" }}>Assumptions</div>
              <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {result.scenario.assumptions.map((assumption, idx) => (
                  <li key={idx} style={{ fontSize: "0.9rem" }}>
                    {assumption}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.scenario?.disclaimer && (
            <div className="demo-note">{result.scenario.disclaimer}</div>
          )}
        </section>
      )}
    </div>
  );
}
