import { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import LanguageSelector from "../components/LanguageSelector";
import ActionCard from "../components/ActionCard";
import VoiceAssistantCard from "../components/VoiceAssistantCard";
import {
  runScenarioSimulation,
} from "../api/scenarios";
import type {
  Recommendation,
  RiskLabel,
  ScenarioResponse,
  SimulationResult,
} from "../api/scenarios";
import {
  saveScenarioReport,
} from "../data/scenarioReports";
import type { ScenarioReport } from "../data/scenarioReports";
import { ROUTES } from "../routes";

const SCENARIOS: Array<{
  id: number;
  name: string;
  description: string;
}> = [
  {
    id: 1,
    name: "Supplier Failure",
    description:
      "A primary supplier becomes unavailable for 7 days; affected medicines must be covered from existing stock, alternates or transfers.",
  },
  {
    id: 2,
    name: "Transport Delay",
    description:
      "Expected deliveries are delayed by 3 days, adding exposure to the supply chain.",
  },
  {
    id: 3,
    name: "Demand Surge",
    description:
      "Demand for selected resources increases by 30% for 7 days.",
  },
  {
    id: 4,
    name: "Hospital Disruption",
    description:
      "Facility-level demand rises 20%; the redistribution engine matches surplus stock with projected shortfalls across the network.",
  },
  {
    id: 5,
    name: "Combined Crisis",
    description:
      "Supplier failure combined with a 30% demand rise over 7 days, plus a 3-day delivery delay.",
  },
];

const RECOMMENDATION_LABEL: Record<Recommendation["type"], string> = {
  reallocate: "Reallocate stock",
  alternate_supplier: "Activate alternate supplier",
  emergency_procurement: "Emergency procurement",
  monitoring: "Monitoring",
};

const RISK_BADGE: Record<RiskLabel, { background: string; color: string }> = {
  GREEN: { background: "#dcfce7", color: "#166534" },
  YELLOW: { background: "#fef9c3", color: "#854d0e" },
  RED: { background: "#fee2e2", color: "#991b1b" },
  CRITICAL: { background: "#7f1d1d", color: "#ffffff" },
};

const RISK_ORDER: Record<RiskLabel, number> = {
  GREEN: 1,
  YELLOW: 2,
  RED: 3,
  CRITICAL: 4,
};


function scenarioDataLabel(response: ScenarioResponse): string {
  switch (response.dataProvenance) {
    case "imported-real":
      return "Imported inventory reports";
    case "imported-synthetic":
      return "Imported synthetic inventory reports";
    case "legacy":
      return "Seeded inventory and demand history";
    default:
      return response.source === "demo"
        ? "Standard operational dataset"
        : "Supabase";
  }
}

const frameStyle = {
  border: "1px solid var(--color-border)",
  borderRadius: "10px",
  padding: "12px",
  marginTop: "10px",
  background: "var(--color-surface-soft)",
  color: "var(--color-text)",
} as const;

const frameHeading = {
  margin: "0 0 8px",
  fontSize: "13px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--color-text-muted)",
} as const;

export default function DashboardPage() {
  const { t } = useLanguage();

  const [scenarioId, setScenarioId] = useState(1);

  const [response, setResponse] = useState<ScenarioResponse | null>(null);

  const [savedReport, setSavedReport] = useState<ScenarioReport | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedScenario =
    SCENARIOS.find((scenario) => scenario.id === scenarioId) ??
    SCENARIOS[0];

  async function handleRunSimulation() {
    try {
      setLoading(true);
      setError("");
      setSavedReport(null);

      const data = await runScenarioSimulation(scenarioId);

      setResponse(data);

      const report = saveScenarioReport(data, scenarioId);

      setSavedReport(report);
      setLoading(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to run simulation.",
      );
      setLoading(false);
    }
  }

  const summary = response?.scenario;

  return (
    <div className="container dashboard">
      {/* ================= HEADER ================= */}

      <div className="dashboard__header">
        <h1 className="dashboard__heading">
          {t("dashboard.heading")}
        </h1>

        <div className="dashboard__tools">
          <LanguageSelector id="dashboard-language" />
        </div>
      </div>

      {/* ================= VOICE ASSISTANT ================= */}

      <VoiceAssistantCard />

      {/* ================= QUICK ACTIONS ================= */}

      <h2 className="dashboard__section-title">
        {t("dashboard.quickActions")}
      </h2>

      <div className="dashboard__grid">
        <ActionCard
          icon="🏥"
          titleKey="action.hospitals"
          titleSimpleKey="action.hospitals.simple"
          descriptionKey="action.hospitals.desc"
          to={ROUTES.citizen}
        />

        <ActionCard
          icon="🏛️"
          titleKey="action.schemes"
          titleSimpleKey="action.schemes.simple"
          descriptionKey="action.schemes.desc"
          to={ROUTES.citizenSchemes}
        />

        <ActionCard
          icon="📁"
          titleKey="action.documents"
          titleSimpleKey="action.documents.simple"
          descriptionKey="action.documents.desc"
          to={ROUTES.citizenDocuments}
        />

        <ActionCard
          icon="📋"
          titleKey="action.reports"
          titleSimpleKey="action.reports.simple"
          descriptionKey="action.reports.desc"
          to={ROUTES.citizenReports}
        />

        <ActionCard
          icon="🗣️"
          titleKey="assistant.heading"
          titleSimpleKey="action.assistant.simple"
          descriptionKey="action.assistant.desc"
          to={ROUTES.assistant}
          variant="primary"
        />
      </div>

      {/* =====================================================
          HOSPITAL INTELLIGENCE
          ===================================================== */}

      <section
        style={{
          marginTop: "40px",
          padding: "24px",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
          background: "var(--color-surface)",
        }}
      >
        <h2 className="dashboard__section-title">
          Hospital Intelligence
        </h2>
        <p style={{ color: "var(--color-text-muted)", marginTop: 0 }}>
          The ML demand forecast identifies which hospital and medicine stock
          needs attention first — with a recommended action for each item.
        </p>
        <Link to={ROUTES.hospitalIntelligence} className="btn btn--primary">
          Open Hospital Intelligence
        </Link>
      </section>

      {/* =====================================================
          PULSE AI SCENARIO SIMULATION
          ===================================================== */}

      <section style={{ marginTop: "40px" }}>
        <h2 className="dashboard__section-title">
          Pulse AI Scenario Simulation
        </h2>

        <div
          style={{
            padding: "24px",
            border: "1px solid var(--color-border)",
            borderRadius: "12px",
            background: "var(--color-surface)",
          }}
        >
          <div
            style={{
              margin: "-24px -24px 24px",
              padding: "10px 24px",
              borderRadius: "12px 12px 0 0",
              background: "var(--color-surface-soft)",
              borderBottom: "1px solid var(--color-border)",
              color: "var(--color-text)",
              fontSize: "13px",
            }}
          >
            <strong>Scenario Overview:</strong>{" "}
            {selectedScenario.description}
          </div>

          {/* ================= SCENARIO SELECTOR ================= */}

          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <label htmlFor="scenario">
              <strong>Scenario:</strong>
            </label>

            <select
              id="scenario"
              value={scenarioId}
              onChange={(e) =>
                setScenarioId(Number(e.target.value))
              }
              style={{
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid #ccc",
              }}
            >
              {SCENARIOS.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </option>
              ))}
            </select>

            <button
              onClick={handleRunSimulation}
              disabled={loading}
              className="btn btn--primary"
            >
              {loading ? "Running..." : "Run Simulation"}
            </button>
          </div>

          {/* ================= ERROR ================= */}

          {error && (
            <div
              style={{
                marginTop: "20px",
                padding: "12px",
                borderRadius: "8px",
                background: "#fee2e2",
              }}
            >
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* ================= SAVED-TO-REPORTS BANNER ================= */}

          {savedReport && (
            <div
              style={{
                marginTop: "20px",
                padding: "12px 14px",
                borderRadius: "8px",
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                color: "#1e3a8a",
                fontSize: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <span>
                Scenario report saved to the Reports Portal
                (simulation {savedReport.id}).
              </span>
              <Link
                to={ROUTES.citizenReports}
                className="report-card__link"
              >
                View in Reports Portal →
              </Link>
            </div>
          )}

          {/* =================================================
              SIMULATION RESULTS
              ================================================= */}

          {response && summary && (
            <div style={{ marginTop: "30px" }}>
              <h3>{summary.scenario.name}</h3>

              {/* ================= SCENARIO BANNER ================= */}

              <div
                style={{
                  padding: "16px",
                  borderRadius: "10px",
                  background: "var(--color-surface-soft)",
                  border: "1px solid var(--color-border)",
                  fontSize: "14px",
                }}
              >
                <p style={{ marginTop: 0, fontWeight: 600 }}>
                  {summary.headline}
                </p>

                <p
                  style={{
                    margin: "6px 0",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    background:
                      response.dataProvenance === "synthetic" ||
                      response.dataProvenance === "imported-synthetic" ||
                      response.source === "demo"
                        ? "#fef3c7"
                        : "#ecfdf5",
                    color:
                      response.dataProvenance === "synthetic" ||
                      response.dataProvenance === "imported-synthetic" ||
                      response.source === "demo"
                        ? "#92400e"
                        : "#065f46",
                    fontWeight: 600,
                  }}
                >
                  Data source: {scenarioDataLabel(response)}
                </p>

                <p style={{ margin: "6px 0" }}>
                  <strong>Demand change:</strong>{" "}
                  {summary.demand_change_label}
                  <span style={{ margin: "0 10px", opacity: 0.4 }}>|</span>
                  <strong>Supplier impact:</strong>{" "}
                  {summary.supplier_disruption_label}
                </p>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    margin: "10px 0",
                  }}
                >
                  {(
                    ["GREEN", "YELLOW", "RED", "CRITICAL"] as RiskLabel[]
                  ).map((label) => {
                    const count = summary.result_counts[label] ?? 0;

                    return (
                      <span
                        key={label}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontWeight: 600,
                          fontSize: "13px",
                          ...RISK_BADGE[label],
                        }}
                      >
                        {label}: {count}
                      </span>
                    );
                  })}

                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontSize: "13px",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    Projected shortage:{" "}
                    <strong>{summary.projected_shortage_total}</strong>{" "}
                    units
                  </span>
                </div>

                <p style={{ fontSize: "13px", color: "#475569", marginBottom: 0 }}>
                  <strong>Assumptions:</strong>
                </p>

                <ul
                  style={{
                    margin: "6px 0 0",
                    paddingLeft: "18px",
                    fontSize: "13px",
                    color: "#475569",
                  }}
                >
                  {summary.assumptions.map((assumption, index) => (
                    <li key={index}>{assumption}</li>
                  ))}
                </ul>
              </div>

              {/* =================================================
                  GROUP RESULTS BY MEDICINE
                  ================================================= */}

              {Array.from(
                new Set(
                  response.results.map(
                    (result) => result.medicine_id,
                  ),
                ),
              )
                .sort((a, b) => {
                  const worstA = worstRisk(
                    response.results.filter(
                      (result) => result.medicine_id === a,
                    ),
                  );

                  const worstB = worstRisk(
                    response.results.filter(
                      (result) => result.medicine_id === b,
                    ),
                  );

                  return RISK_ORDER[worstB] - RISK_ORDER[worstA] || a - b;
                })
                .map((medicineId) => {
                  const medicineResults = response.results
                    .filter(
                      (result) => result.medicine_id === medicineId,
                    )
                    .sort(
                      (a, b) =>
                        RISK_ORDER[b.risk_label] -
                          RISK_ORDER[a.risk_label] ||
                        a.hospital_id - b.hospital_id,
                    );

                  const first = medicineResults[0];

                  return (
                    <section
                      key={medicineId}
                      style={{
                        marginTop: "30px",
                      }}
                    >
                      {/* ================= MEDICINE TITLE ================= */}

                      <h3 style={{ marginBottom: "15px", fontSize: "20px" }}>
                        {first.medicine.generic_name}
                        <span
                          style={{
                            fontSize: "13px",
                            fontWeight: 400,
                            color: "var(--color-text-muted)",
                            marginLeft: "10px",
                          }}
                        >
                          {first.medicine.category} · {first.medicine.unit}
                        </span>
                      </h3>

                      {/* =================================================
                          HOSPITAL CARDS (BEFORE / DISRUPTION / AFTER / RESPONSE)
                          ================================================= */}

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(5, minmax(280px, 1fr))",
                          gap: "16px",
                          overflowX: "auto",
                          paddingBottom: "10px",
                        }}
                      >
                        {medicineResults.map((result) => (
                          <ResultCard key={`${result.hospital_id}-${result.medicine_id}`} result={result} />
                        ))}
                      </div>
                    </section>
                  );
                })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function worstRisk(items: SimulationResult[]): RiskLabel {
  return items.reduce<RiskLabel>(
    (worst, item) =>
      RISK_ORDER[item.risk_label] > RISK_ORDER[worst]
        ? item.risk_label
        : worst,
    "GREEN",
  );
}

function ResultCard({ result }: { result: SimulationResult }) {
  const badge = RISK_BADGE[result.risk_label];

  return (
    <div
      style={{
        padding: "20px",
        border: "1px solid var(--color-border)",
        borderRadius: "12px",
        background: "var(--color-surface)",
        minWidth: "280px",
      }}
    >
      {/* ================= HOSPITAL + RISK ================= */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "8px",
        }}
      >
        <h4 style={{ marginTop: 0, marginBottom: "4px" }}>
          {result.hospital.hospital_name}
        </h4>

        <span
          style={{
            padding: "3px 9px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: 700,
            whiteSpace: "nowrap",
            ...badge,
          }}
        >
          {result.risk_label}
        </span>
      </div>

      <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#6b7280" }}>
        {result.hospital.city}, {result.hospital.state} ·{" "}
        {result.hospital.facility_type}
      </p>

      {/* ================= BEFORE DISRUPTION ================= */}

      <div style={frameStyle}>
        <p style={frameHeading}>Before Disruption</p>
        <p style={{ margin: "2px 0", fontSize: "14px" }}>
          <strong>Current stock:</strong> {result.starting_stock}{" "}
          {result.medicine.unit}
        </p>
        <p style={{ margin: "2px 0", fontSize: "14px" }}>
          <strong>Safety stock:</strong> {result.safety_stock}{" "}
          {result.medicine.unit}
        </p>
        <p style={{ margin: "2px 0", fontSize: "14px" }}>
          <strong>Usual daily demand:</strong>{" "}
          {result.predicted_daily_demand}/{result.medicine.unit} per day
        </p>
      </div>

      {/* ================= DISRUPTION ================= */}

      <div style={frameStyle}>
        <p style={frameHeading}>During Disruption</p>
        <p style={{ margin: "2px 0", fontSize: "14px" }}>
          <strong>Effective demand:</strong>{" "}
          {result.effective_daily_demand} {result.medicine.unit}/day over{" "}
          {result.disruption_window_days} day(s)
        </p>
        {result.supplier_disrupted && (
          <p
            style={{
              margin: "2px 0",
              fontSize: "13px",
              color: "#9a3412",
            }}
          >
            Primary supplier for this medicine is unavailable.
          </p>
        )}
        <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#475569" }}>
          <em>{result.risk_reason}</em>
        </p>
      </div>

      {/* ================= AFTER DISRUPTION ================= */}

      <div style={frameStyle}>
        <p style={frameHeading}>After Disruption</p>
        <p style={{ margin: "2px 0", fontSize: "14px" }}>
          <strong>Projected demand:</strong> {result.projected_demand}{" "}
          {result.medicine.unit}
        </p>
        <p style={{ margin: "2px 0", fontSize: "14px" }}>
          <strong>Projected remaining:</strong>{" "}
          {result.projected_remaining_stock} {result.medicine.unit}
        </p>
        <p style={{ margin: "2px 0", fontSize: "14px" }}>
          <strong>Days of stock left:</strong>{" "}
          {result.days_of_stock_remaining}
        </p>
        <p style={{ margin: "2px 0", fontSize: "14px" }}>
          <strong>Estimated shortage:</strong>{" "}
          {result.estimated_shortage_quantity > 0
            ? `${result.estimated_shortage_quantity} ${result.medicine.unit}`
            : "None projected"}
        </p>
        {result.stock_out_day !== null && (
          <p
            style={{
              margin: "4px 0 0",
              fontSize: "14px",
              fontWeight: 700,
              color: "#991b1b",
            }}
          >
            Stock-out projected on day {result.stock_out_day}
          </p>
        )}
      </div>

      {/* ================= PULSE AI RESPONSE ================= */}

      <div style={{ ...frameStyle, background: "var(--color-primary-soft)" }}>
        <p style={{ ...frameHeading, color: "var(--color-primary)" }}>
          Pulse AI Response
        </p>

        {result.recommendations.length === 0 && (
          <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-muted)" }}>
            No action needed beyond routine monitoring.
          </p>
        )}

        {result.recommendations.map((recommendation, index) => (
          <div
            key={index}
            style={{
              padding: "8px 0",
              borderTop:
                index === 0 ? "none" : "1px dashed #e2e8f0",
            }}
          >
            <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: "13px" }}>
              {RECOMMENDATION_LABEL[recommendation.type]}
            </p>
            <p style={{ margin: "2px 0", fontSize: "13px", color: "#0f172a" }}>
              {recommendation.action}
            </p>
            <p style={{ margin: "2px 0", fontSize: "12px", color: "#334155" }}>
              <em>Why:</em> {recommendation.why}
            </p>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#475569" }}>
              <em>Expected impact:</em> {recommendation.expected_impact}
            </p>
          </div>
        ))}

        {result.redistribution && (
          <p
            style={{
              margin: "8px 0 0",
              padding: "6px 8px",
              borderRadius: "6px",
              background: "#e0f2fe",
              fontSize: "12px",
              color: "#075985",
            }}
          >
            Proposed reallocation: <strong>{result.redistribution.transfer_units}</strong>{" "}
            {result.medicine.unit} from{" "}
            <strong>{result.redistribution.donor_hospital_name}</strong>.
          </p>
        )}
      </div>

      {/* ================= DISRUPTION TIMELINE ================= */}

      <div style={{ marginTop: "12px" }}>
        <p style={{ ...frameHeading, marginBottom: "6px" }}>
          Disruption Window ({result.disruption_window_days}{" "}
          day{result.disruption_window_days !== 1 ? "s" : ""})
        </p>

        <div
          style={{
            display: "flex",
            gap: "6px",
            flexWrap: "wrap",
          }}
        >
          {result.days.map((day) => (
            <span
              key={day.day}
              style={{
                padding: "4px 8px",
                borderRadius: "6px",
                fontSize: "12px",
                background:
                  day.status === "STOCK_OUT"
                    ? "#7f1d1d"
                    : day.status === "AT_RISK"
                      ? "#fef9c3"
                      : "#dcfce7",
                color:
                  day.status === "STOCK_OUT"
                    ? "#fff"
                    : day.status === "AT_RISK"
                      ? "#854d0e"
                      : "#166534",
              }}
              title={`Day ${day.day}: ${day.projected_stock} ${result.medicine.unit} (${day.status})`}
            >
              D{day.day}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}