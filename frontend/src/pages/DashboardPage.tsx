import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import LanguageSelector from "../components/LanguageSelector";
import ActionCard from "../components/ActionCard";
import VoiceAssistantCard from "../components/VoiceAssistantCard";
import { runScenarioSimulation } from "../api/scenarios";

export default function DashboardPage() {
  const { t } = useLanguage();

  const [scenarioId, setScenarioId] = useState(1);

  const [results, setResults] = useState<
    Awaited<ReturnType<typeof runScenarioSimulation>>
  >([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRunSimulation() {
    try {
      setLoading(true);
      setError("");

      const data = await runScenarioSimulation(scenarioId);

      setResults(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to run simulation.",
      );
    } finally {
      setLoading(false);
    }
  }

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
          to="/hospitals"
        />

        <ActionCard
          icon="🏛️"
          titleKey="action.schemes"
          titleSimpleKey="action.schemes.simple"
          descriptionKey="action.schemes.desc"
          to="/schemes"
        />

        <ActionCard
          icon="📁"
          titleKey="action.documents"
          titleSimpleKey="action.documents.simple"
          descriptionKey="action.documents.desc"
          to="/documents"
        />

        <ActionCard
          icon="📋"
          titleKey="action.reports"
          titleSimpleKey="action.reports.simple"
          descriptionKey="action.reports.desc"
          to="/reports"
        />

        <ActionCard
          icon="🗣️"
          titleKey="assistant.heading"
          titleSimpleKey="action.assistant.simple"
          descriptionKey="action.assistant.desc"
          to="/assistant"
          variant="primary"
        />
      </div>

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
            border: "1px solid #ddd",
            borderRadius: "12px",
            background: "#fff",
          }}
        >
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
              <option value={1}>
                Supplier Failure
              </option>
            </select>

            <button
              onClick={handleRunSimulation}
              disabled={loading}
              style={{
                padding: "10px 18px",
                borderRadius: "8px",
                border: "none",
                cursor: loading
                  ? "not-allowed"
                  : "pointer",
              }}
            >
              {loading
                ? "Running..."
                : "Run Simulation"}
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

          {/* =================================================
              SIMULATION RESULTS
              ================================================= */}

          {results.length > 0 && (
            <div style={{ marginTop: "30px" }}>
              <h3>Simulation Results</h3>

              {/* =================================================
                  GROUP RESULTS BY MEDICINE
                  ================================================= */}

              {Array.from(
                new Set(
                  results.map(
                    (result) => result.medicine_id,
                  ),
                ),
              )
                .sort((a, b) => a - b)
                .map((medicineId) => {
                  const medicineResults = results
                    .filter(
                      (result) =>
                        result.medicine_id ===
                        medicineId,
                    )
                    .sort(
                      (a, b) =>
                        a.hospital_id -
                        b.hospital_id,
                    );

                  return (
                    <section
                      key={medicineId}
                      style={{
                        marginTop: "30px",
                      }}
                    >
                      {/* ================= MEDICINE TITLE ================= */}

                      <h3
                        style={{
                          marginBottom: "15px",
                          fontSize: "20px",
                        }}
                      >
                        Medicine {medicineId}
                      </h3>

                      {/* =================================================
                          HOSPITAL ROW
                          Hospital 1 → 2 → 3 → 4 → 5
                          ================================================= */}

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(5, minmax(220px, 1fr))",
                          gap: "16px",
                          overflowX: "auto",
                          paddingBottom: "10px",
                        }}
                      >
                        {medicineResults.map(
                          (result) => (
                            <div
                              key={`${result.hospital_id}-${result.medicine_id}`}
                              style={{
                                padding: "20px",
                                border:
                                  "1px solid #ddd",
                                borderRadius:
                                  "12px",
                                background: "#fff",
                                minWidth: "220px",
                              }}
                            >
                              {/* ================= HOSPITAL ================= */}

                              <h4
                                style={{
                                  marginTop: 0,
                                }}
                              >
                                Hospital{" "}
                                {result.hospital_id}
                              </h4>

                              {/* ================= STOCK ================= */}

                              <p>
                                <strong>
                                  Starting Stock:
                                </strong>{" "}
                                {
                                  result.starting_stock
                                }
                              </p>

                              <p>
                                <strong>
                                  Safety Stock:
                                </strong>{" "}
                                {
                                  result.safety_stock
                                }
                              </p>

                              {/* ================= DEMAND ================= */}

                              <p>
                                <strong>
                                  Predicted Demand:
                                </strong>{" "}
                                {
                                  result.predicted_daily_demand
                                }
                                /day
                              </p>

                              {/* ================= RISK ================= */}

                              <p>
                                <strong>
                                  Risk:
                                </strong>{" "}
                                {result.risk_level}
                              </p>

                              {/* ================= RECOMMENDATION ================= */}

                              <p>
                                <strong>
                                  Recommendation:
                                </strong>{" "}
                                {
                                  result.recommendation
                                }
                              </p>

                              {/* ================= STOCK OUT ================= */}

                              {result.stock_out_day !==
                                null && (
                                <p>
                                  <strong>
                                    Stock-out Day:
                                  </strong>{" "}
                                  Day{" "}
                                  {
                                    result.stock_out_day
                                  }
                                </p>
                              )}

                              <hr />

                              {/* ================= 7-DAY PROJECTION ================= */}

                              <strong>
                                7-Day Projection
                              </strong>

                              <div
                                style={{
                                  marginTop: "10px",
                                }}
                              >
                                {result.days.map(
                                  (day) => (
                                    <div
                                      key={
                                        day.day
                                      }
                                      style={{
                                        display:
                                          "grid",
                                        gridTemplateColumns:
                                          "50px 1fr auto",
                                        gap: "8px",
                                        padding:
                                          "4px 0",
                                        fontSize:
                                          "14px",
                                      }}
                                    >
                                      <span>
                                        Day{" "}
                                        {
                                          day.day
                                        }
                                      </span>

                                      <span>
                                        {
                                          day.projected_stock
                                        }
                                      </span>

                                      <span>
                                        {
                                          day.status
                                        }
                                      </span>
                                    </div>
                                  ),
                                )}
                              </div>
                            </div>
                          ),
                        )}
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