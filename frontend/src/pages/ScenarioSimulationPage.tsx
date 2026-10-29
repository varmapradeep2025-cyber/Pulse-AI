import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

function simRiskBadgeClass(risk: string): string {
  const r = (risk || "").toUpperCase();
  return `sim-risk-badge sim-risk-badge--${r}`;
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

// SVG chart colors for dark theme
const CHART = {
  grid: "rgba(38,52,73,0.9)",
  axisText: "#94A3B8",
  axis: "#334155",
  projected: "#14B8A6",
  safety: "#F87171",
  safetyBar: "#FBBF24",
  shortage: "#F97316",
  baseline: "#94A3B8",
  disruption: "#FBBF24",
  intervention: "#22C55E",
  donutLow: "#22C55E",
  donutCaution: "#FBBF24",
  donutHigh: "#EF4444",
  donutUnknown: "#64748B",
};

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
    } catch {
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
      ? "Simulated dataset"
      : result?.source === "supabase"
        ? "Database data (Supabase)"
        : "Data source unavailable";

  const sourceLabelClass =
    result?.source === "demo" ? "sim-source-label sim-source-label--demo" : "sim-source-label sim-source-label--db";

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
    const items = result.results.slice(0, 10);
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
    <div className="container sim-page">
      {/* Header */}
      <header className="sim-header">
        <h1 className="sim-header__title">Scenario Simulation</h1>
        <p className="sim-header__subtitle">
          Simulate supply-chain disruptions and compare baseline, disruption, and intervention outcomes.
        </p>
        
      </header>

      {/* Operational Dataset Provenance Banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
          padding: "0.85rem 1.1rem",
          background: "var(--color-surface, #fff)",
          border: "1px solid var(--color-border, #e2e8f0)",
          borderRadius: "var(--radius, 8px)",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.2rem" }}>📦</span>
          <div>
            <strong>Operational Inventory Dataset:</strong>{" "}
            <span style={{ color: "var(--color-text-muted, #475569)" }}>
              {result?.dataProvenance === "imported-real"
                ? "Active Hospital Excel Ingestion (Real Data)"
                : result?.dataProvenance === "imported-synthetic"
                  ? "Active Hospital Excel Ingestion"
                  : result?.dataProvenance === "legacy"
                    ? "Supabase Database Inventory"
                    : "Standard Catalog Inventory"}
            </span>
          </div>
        </div>
        <Link
          to="/operations/inventory-import"
          className="btn btn--secondary btn--small"
          style={{ textDecoration: "none", fontSize: "0.85rem", padding: "0.35rem 0.75rem" }}
        >
          Import Custom Inventory Workbook →
        </Link>
      </div>

      {/* Scenario selector + controls */}
      <div className="sim-panel">
        <p className="sim-panel__title">
          <span className="sim-panel__title-icon">📋</span>
          Select a scenario
        </p>
        <div className="sim-scenario-grid">
          {SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              className={`sim-scenario-btn${selectedScenarioId === scenario.id ? " sim-scenario-btn--active" : ""}`}
              onClick={() => setSelectedScenarioId(scenario.id)}
              aria-pressed={selectedScenarioId === scenario.id}
            >
              <span className="sim-scenario-btn__name">{scenario.name}</span>
              <span className="sim-scenario-btn__desc">{scenario.description}</span>
            </button>
          ))}
        </div>

        <div className="sim-actions" style={{ marginTop: "1rem" }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleRunSimulation}
            disabled={selectedScenarioId === null || loading}
            aria-busy={loading}
          >
            {loading ? "Running Simulation…" : "Run Simulation"}
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
          {saveStatus && (
            <span
              className={`sim-status-msg ${
                saveStatus.includes("Failed") || saveStatus.includes("Cannot")
                  ? "sim-status-msg--error"
                  : "sim-status-msg--success"
              }`}
            >
              {saveStatus}
            </span>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="container">
          <LoadingState label="Running scenario simulation…" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="sim-error-box" role="alert">
          <strong>Error:</strong> {error}
          {(error.toLowerCase().includes("session") ||
            error.toLowerCase().includes("401")) && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.88rem" }}>
              You may need to sign in again.
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <>
          {/* Source + explanation */}
          <div className="sim-panel">
            <div className="sim-source-bar">
              <div style={{ flex: 1 }}>
                <p className="sim-explanation">{buildDeterministicExplanation(result)}</p>
                <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                  Explanation is deterministic and generated from simulation output — not a language model.
                </p>
              </div>
              <span className={sourceLabelClass}>{sourceLabel}</span>
            </div>
          </div>

          {/* KPI row */}
          {kpis && (
            <div className="sim-kpi-grid">
              <div className="sim-kpi">
                <div className="sim-kpi__label">Hospitals affected</div>
                <div className="sim-kpi__value">{kpis.hospitalsAffected}</div>
              </div>
              <div className="sim-kpi">
                <div className="sim-kpi__label">Distinct products at risk</div>
                <div className="sim-kpi__value">{kpis.distinctProducts}</div>
              </div>
              <div className={`sim-kpi${kpis.belowSafety > 0 ? " sim-kpi--warning" : ""}`}>
                <div className="sim-kpi__label">Below safety stock</div>
                <div className="sim-kpi__value">{kpis.belowSafety}</div>
                <div className="sim-kpi__sub">hospital-medicine pairs</div>
              </div>
              <div className={`sim-kpi${(kpis.aggregateShortage ?? 0) > 0 ? " sim-kpi--danger" : ""}`}>
                <div className="sim-kpi__label">Aggregate projected shortage</div>
                <div className="sim-kpi__value">
                  {kpis.aggregateShortage === null ? "Unavailable" : kpis.aggregateShortage}
                </div>
                {kpis.aggregateShortage !== null && <div className="sim-kpi__sub">units</div>}
              </div>
              <div className="sim-kpi">
                <div className="sim-kpi__label">Baseline projected shortage</div>
                <div className="sim-kpi__value">
                  {kpis.baselineShortage === null ? "—" : kpis.baselineShortage}
                </div>
              </div>
              <div className={`sim-kpi${(kpis.additionalShortage ?? 0) > 0 ? " sim-kpi--danger" : ""}`}>
                <div className="sim-kpi__label">Additional vs baseline</div>
                <div className="sim-kpi__value">
                  {kpis.additionalShortage === null ? "—" : kpis.additionalShortage}
                </div>
                <div className="sim-kpi__sub">shortage units</div>
              </div>
              <div className={`sim-kpi${kpis.redistributionQty > 0 ? " sim-kpi--success" : ""}`}>
                <div className="sim-kpi__label">Proposed redistribution</div>
                <div className="sim-kpi__value">{kpis.redistributionQty}</div>
                <div className="sim-kpi__sub">units (simulated)</div>
              </div>
              <div className="sim-kpi sim-kpi--primary">
                <div className="sim-kpi__label">Disruption duration</div>
                <div className="sim-kpi__value">{kpis.disruptionDuration ?? "—"}</div>
                {kpis.disruptionDuration && <div className="sim-kpi__sub">days</div>}
              </div>
            </div>
          )}

          {/* Charts row 1 */}
          <div className="sim-chart-grid">
            {/* Chart 1: Inventory vs Safety Stock */}
            <div className="sim-chart-card">
              <p className="sim-chart-card__title">Inventory vs. Safety Stock</p>
              <p className="sim-chart-card__desc">
                Projected remaining inventory vs. safety-stock threshold per hospital (up to 10 results shown).
              </p>
              {sortedResults.length > 0 ? (
                <svg width="100%" height="220" viewBox="0 0 320 220" preserveAspectRatio="xMidYMid meet" aria-label="Grouped bar chart: inventory vs safety stock by hospital">
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
                          <rect x={x} y={170 - hSafety} width={barW} height={hSafety} fill={CHART.safetyBar} opacity="0.85">
                            <title>{`Hospital: ${hospName}\nSafety stock: ${item.safety_stock} ${unitForHosp}\nProduct: ${item.medicine?.generic_name}`}</title>
                          </rect>
                          <rect x={x + barW} y={170 - hProj} width={barW} height={hProj} fill={CHART.projected} opacity="0.9">
                            <title>{`Hospital: ${hospName}\nProduct: ${item.medicine?.generic_name}\nProjected remaining stock: ${item.projected_remaining_stock} ${unitForHosp}\nSafety stock: ${item.safety_stock} ${unitForHosp}`}</title>
                          </rect>
                          <text x={x + barW} y={195} fontSize="7" textAnchor="middle" fill={CHART.axisText} transform={`rotate(-45 ${x + barW},195)`}>
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
                        <line x1="35" y1={y} x2="310" y2={y} stroke={CHART.grid} strokeDasharray="2 2" />
                        <text x="30" y={y + 3} fontSize="7" textAnchor="end" fill={CHART.axisText}>{val}</text>
                      </g>
                    );
                  })}
                  <line x1="35" y1="170" x2="310" y2="170" stroke={CHART.axis} />
                  <text x="170" y="215" fontSize="8" textAnchor="middle" fill={CHART.axisText}>Hospital</text>
                </svg>
              ) : (
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.88rem" }}>No data available</p>
              )}
              <div className="sim-chart-legend">
                <span><span className="sim-chart-legend__dot" style={{ background: CHART.safetyBar }}></span>Safety stock</span>
                <span><span className="sim-chart-legend__dot" style={{ background: CHART.projected }}></span>Projected remaining stock</span>
              </div>
            </div>

            {/* Chart 2: Risk Distribution Donut */}
            <div className="sim-chart-card">
              <p className="sim-chart-card__title">Hospital Risk Distribution</p>
              <p className="sim-chart-card__desc">Number of hospital-medicine combinations in each risk category.</p>
              {result.results && result.results.length > 0 ? (
                <svg width="100%" height="180" viewBox="0 0 200 180" aria-label="Donut chart: risk category distribution">
                  {(() => {
                    const total = result.results.length;
                    const colors: Record<string, string> = {
                      Low: CHART.donutLow,
                      Caution: CHART.donutCaution,
                      High: CHART.donutHigh,
                      Unknown: CHART.donutUnknown,
                    };
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
                      const y1 = 90 + 60 * Math.sin(start);
                      const x2 = 100 + 60 * Math.cos(end);
                      const y2 = 90 + 60 * Math.sin(end);
                      const large = pct > 0.5 ? 1 : 0;
                      const path = `M 100 90 L ${x1} ${y1} A 60 60 0 ${large} 1 ${x2} ${y2} Z`;
                      return (
                        <path key={cat} d={path} fill={colors[cat]} opacity="0.9">
                          <title>{`${cat}: ${count} (${Math.round(pct * 100)}%)`}</title>
                        </path>
                      );
                    });
                  })()}
                  <circle cx="100" cy="90" r="30" fill="#111B2E" />
                  <text x="100" y="86" textAnchor="middle" fontSize="9" fill={CHART.axisText}>Total</text>
                  <text x="100" y="98" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--color-text)">{result.results.length}</text>
                </svg>
              ) : (
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.88rem" }}>No data available</p>
              )}
              {result.results && result.results.length > 0 && (
                <div className="sim-chart-legend">
                  <span><span className="sim-chart-legend__dot" style={{ background: CHART.donutLow }}></span>Low ({hospitalRiskCats.Low})</span>
                  <span><span className="sim-chart-legend__dot" style={{ background: CHART.donutCaution }}></span>Caution ({hospitalRiskCats.Caution})</span>
                  <span><span className="sim-chart-legend__dot" style={{ background: CHART.donutHigh }}></span>High ({hospitalRiskCats.High})</span>
                  {hospitalRiskCats.Unknown > 0 && <span><span className="sim-chart-legend__dot" style={{ background: CHART.donutUnknown }}></span>Unknown ({hospitalRiskCats.Unknown})</span>}
                </div>
              )}
            </div>
          </div>

          {/* Charts row 2 */}
          <div className="sim-chart-grid">
            {/* Chart 3: Depletion Line */}
            <div className="sim-chart-card">
              <p className="sim-chart-card__title">Inventory Depletion Over Time</p>
              <p className="sim-chart-card__desc">
                Projected inventory over the disruption window (most data-rich item shown).
                {depletionSeries[0]?.unit ? ` Unit: ${depletionSeries[0].unit}.` : ""}
              </p>
              {depletionSeries.length > 0 ? (
                <svg width="100%" height="200" viewBox="0 0 300 200" aria-label="Line chart: inventory depletion over time">
                  {(() => {
                    const maxV = Math.max(1, ...depletionSeries.map((d: any) => Math.max(d.projected, d.safety || 0)));
                    const pts = depletionSeries.map((d: any, i: number) => {
                      const x = 30 + (i / Math.max(1, depletionSeries.length - 1)) * 250;
                      const y = 155 - (d.projected / maxV) * 120;
                      return `${x},${y}`;
                    }).join(" ");
                    const sPts = depletionSeries.map((d: any, i: number) => {
                      const x = 30 + (i / Math.max(1, depletionSeries.length - 1)) * 250;
                      const y = 155 - ((d.safety || 0) / maxV) * 120;
                      return `${x},${y}`;
                    }).join(" ");
                    return (
                      <>
                        {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
                          const y = 155 - t * 120;
                          const val = Math.round(maxV * t);
                          return (
                            <g key={`grid-${idx}`}>
                              <line x1="30" y1={y} x2="280" y2={y} stroke={CHART.grid} strokeDasharray="2 2" />
                              <text x="25" y={y + 3} fontSize="7" textAnchor="end" fill={CHART.axisText}>{val}</text>
                            </g>
                          );
                        })}
                        <polyline points={pts} fill="none" stroke={CHART.projected} strokeWidth="2.5" />
                        <polyline points={sPts} fill="none" stroke={CHART.safety} strokeWidth="2" strokeDasharray="4 2" />
                        {depletionSeries.map((d: any, i: number) => {
                          const x = 30 + (i / Math.max(1, depletionSeries.length - 1)) * 250;
                          const y = 155 - (d.projected / maxV) * 120;
                          return (
                            <circle key={i} cx={x} cy={y} r="3" fill={CHART.projected}>
                              <title>{`Day ${d.day}: ${d.projected} ${d.unit}. Safety: ${d.safety} ${d.unit}.`}</title>
                            </circle>
                          );
                        })}
                        {depletionSeries.map((d: any, i: number) => {
                          if (i % Math.max(1, Math.floor(depletionSeries.length / 5)) === 0 || i === depletionSeries.length - 1) {
                            const x = 30 + (i / Math.max(1, depletionSeries.length - 1)) * 250;
                            return <text key={`x-${i}`} x={x} y="175" fontSize="7" textAnchor="middle" fill={CHART.axisText}>{d.day}</text>;
                          }
                          return null;
                        })}
                        <text x="155" y="192" fontSize="8" textAnchor="middle" fill={CHART.axisText}>Day of disruption</text>
                        <line x1="30" y1="155" x2="280" y2="155" stroke={CHART.axis} />
                      </>
                    );
                  })()}
                </svg>
              ) : (
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.88rem" }}>No daily projections in API response.</p>
              )}
              <div className="sim-chart-legend">
                <span><span className="sim-chart-legend__dot" style={{ background: CHART.projected }}></span>Projected inventory</span>
                <span><span className="sim-chart-legend__dot" style={{ background: CHART.safety }}></span>Safety-stock threshold</span>
              </div>
            </div>

            {/* Chart 4: Product Risk */}
            <div className="sim-chart-card">
              <p className="sim-chart-card__title">Product Risk Comparison</p>
              <p className="sim-chart-card__desc">
                Aggregate projected shortage by product{productRisk[0]?.unit ? ` (${productRisk[0].unit})` : ""}. Up to 6 products shown.
              </p>
              {productRisk.length > 0 ? (
                <svg width="100%" height="180" viewBox="0 0 300 180" aria-label="Bar chart: shortage by product">
                  {productRisk.slice(0, 6).map((p, idx) => {
                    const maxS = Math.max(1, ...productRisk.slice(0, 6).map((x) => x.shortage));
                    const barH = (p.shortage / maxS) * 120;
                    const y = 150 - barH;
                    const x = 40 + idx * 40;
                    return (
                      <g key={idx}>
                        <rect x={x} y={y} width="28" height={barH} fill={CHART.shortage} opacity="0.85">
                          <title>{`${p.name} (${p.unit}): shortage ${p.shortage}, hospitals at risk ${p.atRiskHospitals}`}</title>
                        </rect>
                        <text x={x + 14} y={165} fontSize="7" textAnchor="middle" fill={CHART.axisText} transform={`rotate(-45 ${x + 14},165)`}>
                          {p.name.slice(0, 12)}
                        </text>
                      </g>
                    );
                  })}
                  <line x1="30" y1="150" x2="280" y2="150" stroke={CHART.axis} />
                </svg>
              ) : (
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.88rem" }}>No product-level shortage data available.</p>
              )}
            </div>
          </div>

          {/* Chart 5: Intervention Impact */}
          <div className="sim-chart-card">
            <p className="sim-chart-card__title">Intervention Impact — Before vs. After</p>
            <p className="sim-chart-card__desc">
              Baseline (no-disruption) vs. disrupted projection vs. projected stock after simulated redistribution. Redistribution is simulated — not a real inventory movement.
            </p>
            {interventionData.length > 0 ? (
              <svg width="100%" height="200" viewBox="0 0 340 200" aria-label="Grouped bar chart: baseline vs disruption vs post-intervention">
                {interventionData.slice(0, 6).map((d: any, idx: number) => {
                  const maxV = Math.max(1, ...interventionData.slice(0, 6).map((x: any) => Math.max(x.baseline || 0, x.afterDisruption || 0, x.postIntervention || 0)));
                  const barW = 18;
                  const groupW = barW * 3 + 4;
                  const x = 40 + idx * (groupW + 12);
                  const hBase = ((d.baseline || 0) / maxV) * 140;
                  const hAfter = ((d.afterDisruption || 0) / maxV) * 140;
                  const hPost = ((d.postIntervention || 0) / maxV) * 140;
                  return (
                    <g key={idx}>
                      <rect x={x} y={155 - hBase} width={barW} height={hBase} fill={CHART.baseline} opacity="0.75">
                        <title>{`Baseline: ${d.baseline} ${d.unit}`}</title>
                      </rect>
                      <rect x={x + barW + 2} y={155 - hAfter} width={barW} height={hAfter} fill={CHART.disruption} opacity="0.85">
                        <title>{`After disruption: ${d.afterDisruption} ${d.unit}`}</title>
                      </rect>
                      <rect x={x + barW * 2 + 4} y={155 - hPost} width={barW} height={hPost} fill={CHART.intervention} opacity="0.9">
                        <title>{`Post-intervention: ${d.postIntervention} ${d.unit}${d.redistributed ? " (redistribution applied)" : ""}`}</title>
                      </rect>
                      <text x={x + barW * 1.5 + 2} y={172} fontSize="6.5" textAnchor="middle" fill={CHART.axisText} transform={`rotate(-40 ${x + barW * 1.5 + 2},172)`}>
                        {d.label.slice(0, 18)}
                      </text>
                    </g>
                  );
                })}
                {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
                  const maxV = Math.max(1, ...interventionData.slice(0, 6).map((x: any) => Math.max(x.baseline || 0, x.afterDisruption || 0, x.postIntervention || 0)));
                  const y = 155 - t * 140;
                  const val = Math.round(maxV * t);
                  return (
                    <g key={`ig-${idx}`}>
                      <line x1="35" y1={y} x2="330" y2={y} stroke={CHART.grid} strokeDasharray="2 2" />
                      <text x="30" y={y + 3} fontSize="6.5" textAnchor="end" fill={CHART.axisText}>{val}</text>
                    </g>
                  );
                })}
                <line x1="35" y1="155" x2="330" y2="155" stroke={CHART.axis} />
              </svg>
            ) : (
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.88rem" }}>Intervention impact data unavailable.</p>
            )}
            <div className="sim-chart-legend">
              <span><span className="sim-chart-legend__dot" style={{ background: CHART.baseline }}></span>Baseline</span>
              <span><span className="sim-chart-legend__dot" style={{ background: CHART.disruption }}></span>After disruption</span>
              <span><span className="sim-chart-legend__dot" style={{ background: CHART.intervention }}></span>Post-intervention</span>
            </div>
          </div>

          {/* Detailed results table */}
          <div className="sim-panel">
            <div className="sim-sort-bar">
              <h2>Detailed Results</h2>
              <div className="sim-sort-controls">
                <span>Sort by</span>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  aria-label="Sort by column"
                >
                  <option value="risk_label">Risk</option>
                  <option value="hospital">Hospital</option>
                  <option value="product">Product</option>
                  <option value="starting_stock">Starting stock</option>
                  <option value="safety_stock">Safety stock</option>
                  <option value="projected_remaining_stock">Projected remaining</option>
                  <option value="estimated_shortage_quantity">Shortage qty</option>
                  <option value="stock_out_day">Stockout day</option>
                </select>
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}
                  onClick={() => setSortAsc((v) => !v)}
                  aria-label={sortAsc ? "Sort descending" : "Sort ascending"}
                >
                  {sortAsc ? "↑ Asc" : "↓ Desc"}
                </button>
              </div>
            </div>

            <div className="sim-table-wrapper">
              <table className="sim-table" aria-label="Scenario simulation detailed results">
                <thead>
                  <tr>
                    <th data-align="left">Hospital</th>
                    <th data-align="left">Product</th>
                    <th data-align="right">Starting stock</th>
                    <th data-align="right">Safety stock</th>
                    <th data-align="right">Proj. remaining</th>
                    <th data-align="right">Shortage qty</th>
                    <th data-align="right">Stockout day</th>
                    <th data-align="left">Risk</th>
                    <th data-align="left">Redistribution</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((item: any, idx: number) => {
                    const risk = item.risk_label || item.risk_level || "UNKNOWN";
                    const redistInfo = item.redistribution
                      ? `From H${item.redistribution.source_hospital_id}: ${item.redistribution.transfer_units} ${item.medicine?.unit || "units"}`
                      : "—";
                    return (
                      <tr key={`${item.hospital_id}-${item.medicine_id}-${idx}`}>
                        <td data-align="left">{item.hospital?.hospital_name || `Hospital ${item.hospital_id}`}</td>
                        <td data-align="left">{item.medicine?.generic_name || `Medicine ${item.medicine_id}`}</td>
                        <td data-align="right">{formatNumber(item.starting_stock)}</td>
                        <td data-align="right">{formatNumber(item.safety_stock)}</td>
                        <td data-align="right">{formatNumber(item.projected_remaining_stock)}</td>
                        <td data-align="right">{formatNumber(item.estimated_shortage_quantity)}</td>
                        <td data-align="right">{item.stock_out_day !== null && item.stock_out_day !== undefined ? item.stock_out_day : "—"}</td>
                        <td data-align="left">
                          <span className={simRiskBadgeClass(risk)}>{risk}</span>
                        </td>
                        <td data-align="left" style={{ fontSize: "0.8rem" }}>{redistInfo}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Scenario assumptions */}
            {result.scenario?.scenario && (
              <div className="sim-assumptions" style={{ marginTop: "1rem" }}>
                <p className="sim-assumptions__title">Scenario assumptions</p>
                <ul className="sim-assumptions__list">
                  {result.scenario.scenario.duration_days !== undefined && (
                    <li>Disruption duration: {result.scenario.scenario.duration_days} days</li>
                  )}
                  {result.scenario.scenario.demand_change_percent !== undefined && (
                    <li>Demand change: {result.scenario.scenario.demand_change_percent > 0 ? "+" : ""}{result.scenario.scenario.demand_change_percent}%</li>
                  )}
                  {result.scenario.scenario.transport_delay_days !== undefined && result.scenario.scenario.transport_delay_days > 0 && (
                    <li>Transport delay: {result.scenario.scenario.transport_delay_days} days</li>
                  )}
                  {result.scenario.scenario.disruption_type && (
                    <li>Disruption type: {result.scenario.scenario.disruption_type}</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
