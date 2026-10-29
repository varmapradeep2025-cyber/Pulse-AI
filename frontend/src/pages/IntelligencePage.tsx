import { useEffect, useState } from "react";
import { loadHospitalIntelligence } from "../data/hospitalIntelligence";
import type {
  IntelligenceSummary,
  SeriesForecast,
} from "../data/hospitalIntelligence";
import { SYNTHETIC_DATA_LABEL } from "../data/hospitals";
import LoadingState from "../components/LoadingState";

const PIPELINE_STEPS = [
  "Inventory",
  "Demand history",
  "ML forecast",
  "Risk level",
  "Recommendation",
  "Action",
];

function riskBadge(risk: SeriesForecast["riskLevel"]) {
  return <span className={`intel-badge intel-badge--${risk}`}>{risk}</span>;
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : "—";
}

function metricCard(label: string, value: string, sub?: string) {
  return (
    <div className="intel-metric">
      <div className="intel-metric__label">{label}</div>
      <div className="intel-metric__value">{value}</div>
      {sub && (
        <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "2px" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function DemandSparkline({ series }: { series: SeriesForecast }) {
  const history = series.history.map((point) => point.demand);
  const forecast = series.forecast.map((point) => point.predicted);

  const values = [...history, ...forecast];
  const max = Math.max(1, ...values);
  const width = 320;
  const height = 70;

  const point = (index: number, value: number) =>
    `${(index / Math.max(1, values.length - 1)) * (width - 4) + 2},${height - 6 - (value / max) * (height - 12)}`;

  const historyLine = history.map((value, index) => point(index, value)).join(" ");
  const forecastLine = forecast
    .map((value, index) => point(history.length + index, value))
    .join(" ");

  return (
    <div>
      <div style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "#64748b", marginBottom: "6px" }}>
        Demand — 30-day history + 7-day ML forecast
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", maxWidth: width, height: "auto", display: "block" }} role="img" aria-label="Daily demand history and forecast">
        <line x1="0" y1={height - 6} x2={width} y2={height - 6} stroke="#e2e8f0" strokeWidth="1" />
        <polyline points={historyLine} fill="none" stroke="#2563eb" strokeWidth="2" />
        <polyline points={forecastLine} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 3" />
      </svg>
      <div style={{ display: "flex", gap: "14px", fontSize: "0.72rem", color: "#64748b" }}>
        <span><span style={{ display: "inline-block", width: "10px", height: "3px", background: "#2563eb", verticalAlign: "middle", marginRight: "4px" }} /> history</span>
        <span><span style={{ display: "inline-block", width: "10px", height: "3px", background: "#f59e0b", verticalAlign: "middle", marginRight: "4px" }} /> forecast</span>
      </div>
    </div>
  );
}

function StockProjection({ series }: { series: SeriesForecast }) {
  let running = series.currentStock;
  const bars = [running];

  for (const day of series.forecast) {
    running -= day.predicted;
    bars.push(running);
  }

  const max = Math.max(1, ...bars);
  const width = 320;
  const height = 70;
  const barWidth = width / bars.length - 4;

  return (
    <div>
      <div style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "#64748b", marginBottom: "6px" }}>
        Stock projection (14-day view) vs safety stock {formatNumber(series.safetyStock)}
      </div>
      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", maxWidth: width, height: "auto", display: "block" }} role="img" aria-label="Projected stock over the next 7 days">
          {(() => {
            const safetyY = height - 6 - (series.safetyStock / max) * (height - 12);
            return Number.isFinite(safetyY) && safetyY > -20 && safetyY <= height
              ? (
                <line x1="0" y1={safetyY} x2={width} y2={safetyY} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 3" />
              )
              : null;
          })()}
          {bars.map((value, index) => {
            const barHeight = (value / max) * (height - 12);
            const x = index * (barWidth + 4) + 2;
            const y = height - 6 - barHeight;
            const colour = value < 0 ? "#dc2626" : value < series.safetyStock ? "#f59e0b" : "#2563eb";
            return <rect key={index} x={x} y={y} width={barWidth} height={Math.max(1, barHeight)} fill={colour} rx="2" />;
          })}
        </svg>
      </div>
      <div style={{ display: "flex", gap: "14px", fontSize: "0.72rem", color: "#64748b" }}>
        <span><span style={{ display: "inline-block", width: "10px", height: "3px", background: "#2563eb", verticalAlign: "middle", marginRight: "4px" }} /> above safety</span>
        <span><span style={{ display: "inline-block", width: "10px", height: "3px", background: "#f59e0b", verticalAlign: "middle", marginRight: "4px" }} /> below safety</span>
        <span><span style={{ display: "inline-block", width: "10px", height: "3px", background: "#dc2626", verticalAlign: "middle", marginRight: "4px" }} /> stock-out</span>
      </div>
    </div>
  );
}

export default function IntelligencePage() {
  const [summary, setSummary] = useState<IntelligenceSummary | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    loadHospitalIntelligence()
      .then((data) => {
        if (active) {
          setSummary(data);
        }
      })
      .catch(() => {
        if (active) {
          setError("Hospital intelligence data could not be loaded.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const byRisk = (level: SeriesForecast["riskLevel"]) =>
    summary ? summary.series.filter((item) => item.riskLevel === level).length : 0;

  const hospitalName = (id: number) =>
    summary?.hospitals.find((hospital) => hospital.id === id)?.name ?? `Hospital ${id}`;

  const medicineName = (id: number) =>
    summary?.medicines.find((medicine) => medicine.id === id)?.name ?? `Medicine ${id}`;

  const medicineUnit = (id: number) =>
    summary?.medicines.find((medicine) => medicine.id === id)?.unit ?? "units";

  if (loading) {
    return (
      <div className="container page">
        <LoadingState label="Training the ML forecast model..." />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="container page">
        <header className="page__header">
          <h1>Hospital Intelligence</h1>
          <p>{error || "No intelligence data is available."}</p>
        </header>
      </div>
    );
  }

  const improvement =
    summary.model.baseline.mae > 0
      ? ((summary.model.baseline.mae - summary.model.ml.mae) / summary.model.baseline.mae) * 100
      : 0;

  return (
    <div className="container page">

      <header className="page__header page__header--split">
        <div>
          <h1>Hospital Intelligence</h1>
          <p>
            Prioritised replenishment decisions from demand forecasting — for demo purposes.
          </p>
        </div>
        <span className={summary.online ? "intel-source intel-source--online" : "intel-source intel-source--offline"}>
          {summary.online ? "● Live backend ML engine" : "◐ Offline local ML engine"}
        </span>
      </header>

      <div className="demo-note">
        <strong>{SYNTHETIC_DATA_LABEL}:</strong>{" "}
        {summary.provenance === "imported-real"
          ? "Forecasts use imported real inventory reports. Validate stock levels before procurement decisions."
          : summary.provenance === "imported-synthetic"
            ? "Forecasts use imported inventory reports explicitly marked as synthetic demo data."
            : summary.online
              ? "Forecasts are computed by the Pulse AI backend from seeded demo demand history. Do not base real procurement decisions on this prototype."
              : "The backend is not running, so a local ML engine is forecasting on deterministic demo data. Do not base real procurement decisions on this prototype."}
      </div>

      {/* Pipeline */}
      <section style={{ borderRadius: "14px", border: "1px solid #e2e8f0", background: "#fff", padding: "16px 18px" }}>
        <div style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "#64748b", marginBottom: "10px" }}>
          Intelligence pipeline
        </div>
        <div className="intel-pipeline">
          {PIPELINE_STEPS.map((step, index) => (
            <div key={step} className="intel-pipeline__stepwrap" style={{ display: "contents" }}>
              {index > 0 && <span className="intel-pipeline__arrow" aria-hidden="true">→</span>}
              <div className={`intel-pipeline__step${index >= 4 ? " intel-pipeline__step--active" : ""}`}>
                {step}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Model metrics */}
      <section>
        <div className="intel-metrics">
          {metricCard(
            "ML forecast MAE",
            formatNumber(summary.model.ml.mae),
            "ridge regression (log-scaled target)",
          )}
          {metricCard(
            "Phase-1 average MAE",
            formatNumber(summary.model.baseline.mae),
            "baseline: per-series historical mean",
          )}
          {metricCard(
            "Improvement",
            improvement > 0 ? `${improvement.toFixed(1)}% lower error` : "no gain",
            improvement > 0 ? "vs the Phase-1 predictor" : "within noise of baseline",
          )}
          {metricCard("RMSE", formatNumber(summary.model.ml.rmse))}
          {metricCard("MAPE", `${formatNumber(summary.model.ml.mape)}%`)}
          {metricCard("Features", String(summary.model.featureNames.length), "time + hospital × medicine")}
          {metricCard("Series", String(summary.series.length), "hospital × medicine combinations")}
        </div>
      </section>

      {/* Risk overview */}
      <section style={{ display: "flex", gap: "18px", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontWeight: 700 }}>Risk overview</div>
        {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((level) => (
          <div key={level} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {riskBadge(level)}
            <span style={{ color: "#475569" }}>{byRisk(level)}</span>
          </div>
        ))}
      </section>

      {/* Attention ranking */}
      <section>
        <h2 style={{ marginBottom: "6px" }}>Needs attention first</h2>
        <p style={{ color: "#64748b", fontSize: "0.9rem", marginTop: 0 }}>
          Ranked by risk severity, then projected stock-out / safety-breach day. Select a row for the full detail.
        </p>

        <div className="intel-sheet">
          <div className="intel-sheet__head">
            <span>#</span>
            <span>Hospital</span>
            <span>Medicine</span>
            <span>Risk</span>
            <span className="intel-sheet__hide-mobile">Demand/day</span>
            <span className="intel-sheet__hide-mobile">Days to safety</span>
            <span className="intel-sheet__hide-mobile">Order qty</span>
          </div>

          {summary.series.map((item) => {
            const isOpen = expanded === item.priority;
            const stockOut = item.daysToStockout !== null;

            return (
              <div key={item.priority}>
                <div
                  className={`intel-sheet__row${isOpen ? " intel-sheet__row--focus" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onClick={() => setExpanded(isOpen ? null : item.priority)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setExpanded(isOpen ? null : item.priority);
                    }
                  }}
                >
                  <span className="intel-sheet__rank">{item.priority}</span>
                  <span style={{ fontWeight: 600 }}>{hospitalName(item.hospitalId)}</span>
                  <span>
                    {medicineName(item.medicineId)}{" "}
                    <span style={{ color: "#64748b", fontSize: "0.8rem" }}>({medicineUnit(item.medicineId)})</span>
                  </span>
                  <span>{riskBadge(item.riskLevel)}</span>
                  <span className="intel-sheet__hide-mobile" style={{ color: "#475569" }}>
                    {formatNumber(item.predictedDailyDemand)}
                  </span>
                  <span className="intel-sheet__hide-mobile" style={{ color: "#475569" }}>
                    {stockOut
                      ? `stock ${item.daysToStockout}d`
                      : item.belowSafetyDay !== null
                        ? `${item.belowSafetyDay}d`
                        : "—"}
                  </span>
                  <span className="intel-sheet__hide-mobile" style={{ fontWeight: 600 }}>
                    {formatNumber(item.suggestedOrderQty)}
                  </span>
                </div>

                {isOpen && (
                  <div className="intel-sheet__detail">
                    <div>
                      <div style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "#64748b", marginBottom: "6px" }}>
                        Recommended action
                      </div>
                      <p style={{ margin: "0 0 10px" }}>{item.suggestedAction}</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: "0.92rem" }}>
                        <span>Current stock: <strong>{formatNumber(item.currentStock)}</strong></span>
                        <span>Safety stock: <strong>{formatNumber(item.safetyStock)}</strong></span>
                        <span>Stock cover: <strong>{formatNumber(item.coverageDays)} days</strong></span>
                        <span>Mean demand: <strong>{formatNumber(item.meanHistoricalDemand)}/day</strong></span>
                        <span>Forecast demand: <strong>{formatNumber(item.predictedDailyDemand)}/day</strong></span>
                        <span>
                          Projection:
                          <strong>
                            {" "}
                            {stockOut
                              ? `stock-out day ${item.daysToStockout}`
                              : item.belowSafetyDay !== null
                                ? `below safety on day ${item.belowSafetyDay}`
                                : "stays above safety"}
                          </strong>
                        </span>
                      </div>
                    </div>
                    <div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
                        <DemandSparkline series={item} />
                        <StockProjection series={item} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p style={{ color: "#64748b", fontSize: "0.82rem", marginTop: "10px" }}>
          Model: {summary.model.name} · {summary.model.trainRows.toLocaleString()} training rows ·{" "}
          {summary.model.evaluationDays} holdout evaluation days. Forecasts are demand projections, not medical guidance.
        </p>
      </section>

    </div>
  );
}