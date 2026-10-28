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

export default function ScenarioSimulationPage() {
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<ScenarioResponse | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("risk_label");
  const [sortAsc, setSortAsc] = useState(false);

  const selectedScenario = SCENARIOS.find((s) => s.id === selectedScenarioId) || null;
  void selectedScenario;

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
      redistributionQty,
      disruptionDuration: result.scenario?.scenario?.duration_days ?? result.scenario?.scenario?.duration_days ?? null,
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

  const riskCounts = useMemo(() => {
    if (!result) return { CRITICAL: 0, RED: 0, YELLOW: 0, GREEN: 0 };
    const counts = { CRITICAL: 0, RED: 0, YELLOW: 0, GREEN: 0 } as Record<string, number>;
    for (const r of result.results || []) {
      const label = (r.risk_label || r.risk_level || "").toString();
      if (label in counts) counts[label]++;
      else if (label === "HIGH") counts["RED"]++;
      else if (label === "MEDIUM") counts["YELLOW"]++;
      else if (label === "LOW") counts["GREEN"]++;
    }
    return counts;
  }, [result]);

  return (
    <div className="container page">
      <header className="page__header">
        <h1>Five Scenarios Simulation</h1>
        <p>
          Simulate supply-chain disruptions with data-grounded metrics, charts, and detailed results.
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
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Proposed redistribution qty</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{kpis.redistributionQty}</div>
              </div>
              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius)", padding: "0.9rem" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Disruption duration</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{kpis.disruptionDuration ?? "—"} days</div>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.9rem" }}>
            <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "0.9rem" }}>
              <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>Hospital risk distribution</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {["CRITICAL", "RED", "YELLOW", "GREEN"].map((label) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <div style={{ width: "90px", fontSize: "0.85rem" }}>{label}</div>
                    <div style={{ flex: 1, background: "var(--color-surface-soft)", height: "10px", borderRadius: "999px", overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.max(4, ((riskCounts[label] || 0) / Math.max(1, result.results?.length || 1)) * 100)}%`,
                          background:
                            label === "CRITICAL"
                              ? "#dc2626"
                              : label === "RED"
                                ? "#ea580c"
                                : label === "YELLOW"
                                  ? "#f59e0b"
                                  : "#16a34a",
                        }}
                      />
                    </div>
                    <div style={{ width: "30px", textAlign: "right", fontSize: "0.85rem" }}>{riskCounts[label] || 0}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: "0.9rem" }}>
              <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>Inventory vs safety stock (top items)</div>
              <svg width="100%" height="200" viewBox="0 0 300 200" preserveAspectRatio="none">
                {(sortedResults.slice(0, 8)).map((item, idx) => {
                  const maxVal = Math.max(1, ...sortedResults.slice(0, 8).map((x) => Math.max(x.starting_stock || 0, x.safety_stock || 0, x.projected_remaining_stock || 0)));
                  const barW = 30;
                  const gap = 6;
                  const x = idx * (barW + gap) + 10;
                  const hStock = ((item.starting_stock || 0) / maxVal) * 140;
                  const hSafety = ((item.safety_stock || 0) / maxVal) * 140;
                  const hProj = ((item.projected_remaining_stock || 0) / maxVal) * 140;
                  return (
                    <g key={idx}>
                      <rect x={x} y={150 - hStock} width={barW / 3} height={hStock} fill="#94a3b8" />
                      <rect x={x + barW / 3} y={150 - hSafety} width={barW / 3} height={hSafety} fill="#f59e0b" />
                      <rect x={x + (2 * barW) / 3} y={150 - hProj} width={barW / 3} height={hProj} fill="#2563eb" />
                    </g>
                  );
                })}
              </svg>
              <div style={{ display: "flex", gap: "0.8rem", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                <span>■ Starting</span>
                <span>■ Safety</span>
                <span>■ Projected</span>
              </div>
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
