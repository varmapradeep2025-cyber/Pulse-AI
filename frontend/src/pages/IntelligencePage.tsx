import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  loadHospitalIntelligence,
  IntelligenceForbiddenError,
} from "../data/hospitalIntelligence";
import type {
  ForecastModelMetrics,
  IntelligenceSummary,
  SeriesForecast,
} from "../data/hospitalIntelligence";
import { projectHypotheticalDelivery } from "../data/inventoryScenario";
import LoadingState from "../components/LoadingState";
import { ROUTES } from "../routes";

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

function formatAxisDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function metricValue(value: number | null, digits = 3): string {
  return value === null ? "—" : value.toFixed(digits);
}

function metricCard(label: string, value: string, sub?: string, isHighlight?: boolean) {
  return (
    <div className="intel-metric">
      <div className="intel-metric__label">{label}</div>
      <div className={`intel-metric__value${isHighlight ? " intel-metric__value--highlight" : ""}`}>{value}</div>
      {sub && <div className="intel-metric__sub">{sub}</div>}
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
  const firstDate = series.history[0]?.date;
  const lastHistoryDate = series.history.at(-1)?.date;
  const lastForecastDate = series.forecast.at(-1)?.date;

  return (
    <div>
      <div style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "6px" }}>
        Demand — 30-day history + 7-day ML forecast
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", maxWidth: width, height: "auto", display: "block" }} role="img" aria-label="Daily demand history and forecast">
        <line x1="0" y1={height - 6} x2={width} y2={height - 6} stroke="var(--color-border)" strokeWidth="1" />
        <polyline points={historyLine} fill="none" stroke="#38bdf8" strokeWidth="2" />
        <polyline points={forecastLine} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 3" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", maxWidth: width, fontSize: "0.68rem", color: "var(--color-text-muted)" }}>
        <span>{firstDate ? formatAxisDate(firstDate) : "—"}</span>
        <span>{lastHistoryDate ? `${formatAxisDate(lastHistoryDate)} · forecast starts` : "—"}</span>
        <span>{lastForecastDate ? formatAxisDate(lastForecastDate) : "—"}</span>
      </div>
      <div style={{ display: "flex", gap: "14px", fontSize: "0.72rem", color: "var(--color-text-muted)" }}>
        <span><span style={{ display: "inline-block", width: "10px", height: "3px", background: "#38bdf8", verticalAlign: "middle", marginRight: "4px" }} /> history</span>
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
      <div style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "6px" }}>
        Stock projection (7-day forecast) vs safety stock {formatNumber(series.safetyStock)}
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
            const colour = value < 0 ? "#f87171" : value < series.safetyStock ? "#f59e0b" : "#38bdf8";
            return <rect key={index} x={x} y={y} width={barWidth} height={Math.max(1, barHeight)} fill={colour} rx="2" />;
          })}
        </svg>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", maxWidth: width, fontSize: "0.68rem", color: "var(--color-text-muted)" }}>
        <span>Now</span>
        <span>{series.forecast[0]?.date ? formatAxisDate(series.forecast[0].date) : "Day 1"}</span>
        <span>{series.forecast.at(-1)?.date ? formatAxisDate(series.forecast.at(-1)!.date) : "Day 7"}</span>
      </div>
      <div style={{ display: "flex", gap: "14px", fontSize: "0.72rem", color: "var(--color-text-muted)" }}>
        <span><span style={{ display: "inline-block", width: "10px", height: "3px", background: "#38bdf8", verticalAlign: "middle", marginRight: "4px" }} /> above safety</span>
        <span><span style={{ display: "inline-block", width: "10px", height: "3px", background: "#f59e0b", verticalAlign: "middle", marginRight: "4px" }} /> below safety</span>
        <span><span style={{ display: "inline-block", width: "10px", height: "3px", background: "#f87171", verticalAlign: "middle", marginRight: "4px" }} /> stock-out</span>
      </div>
    </div>
  );
}

function ForecastComparison({ summary }: { summary: IntelligenceSummary }) {
  const comparison = summary.comparison;
  if (!comparison) {
    return (
      <section className="intel-pipeline-card">
        <h2 style={{ marginTop: 0 }}>Forecast comparison</h2>
        <p>
          Rolling-origin comparison is not available.{" "}
          {summary.comparisonError ?? "The Python ML comparison service is not connected."}
        </p>
        <p style={{ color: "var(--color-text-muted)", marginBottom: 0 }}>
          The existing forecast remains active; no candidate is represented as evaluated.
        </p>
      </section>
    );
  }

  const modelLabels: Record<string, string> = {
    seasonal_naive: "Seasonal naive",
    ridge: "Ridge regression",
    xgboost: "XGBoost",
  };
  const modelOrder = ["seasonal_naive", "ridge", "xgboost"];
  const validation = comparison.validation;

  return (
    <section className="intel-pipeline-card">
      <div className="page__header--split" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "12px" }}>
        <div>
          <div className="intel-pipeline-card__label">Forecast comparison</div>
          <h2 style={{ margin: "4px 0 8px" }}>
            Selected: {modelLabels[comparison.selectedModel] ?? comparison.selectedModel}
          </h2>
          <p style={{ margin: 0 }}>{comparison.selectionReason}</p>
        </div>
        <span className="intel-source intel-source--offline">
          {summary.provenance === "imported-real" ? "Imported real data" : "Synthetic/demo data"}
        </span>
      </div>

      <p style={{ color: "var(--color-text-muted)", fontSize: "0.88rem" }}>
        Same recursive 7-day forecasts · {validation.folds} chronological folds ·{" "}
        {validation.seriesCount} series · {validation.minimumTrainingDays}+ training days ·{" "}
        {validation.firstForecastDate ?? "—"} to {validation.lastForecastDate ?? "—"}.
        {" "}Seasonal-naive is the benchmark; candidates must beat its macro MASE by 5%
        without increasing WAPE by more than 5%.
      </p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
              {["Model", "MAE", "RMSE", "WAPE", "Macro MASE", "Predictions", "Decision"].map((heading) => (
                <th key={heading} style={{ padding: "8px 10px" }}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modelOrder.map((name) => {
              const metrics: ForecastModelMetrics | undefined = comparison.models[name];
              const selected = name === comparison.selectedModel;
              return (
                <tr key={name} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{modelLabels[name]}</td>
                  <td style={{ padding: "8px 10px" }}>{metrics?.available ? metricValue(metrics.mae) : "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{metrics?.available ? metricValue(metrics.rmse) : "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{metrics?.available ? metricValue(metrics.wape, 4) : "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{metrics?.available ? metricValue(metrics.macroMase, 4) : "—"}</td>
                  <td style={{ padding: "8px 10px" }}>{metrics?.observations.toLocaleString() ?? "—"}</td>
                  <td style={{ padding: "8px 10px", color: selected ? "var(--color-success)" : "var(--color-text-muted)" }}>
                    {selected ? "Selected" : metrics?.available ? "Compared" : "Unavailable"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!comparison.xgboost.available && (
        <p role="status" style={{ color: "var(--color-warning)" }}>
          XGBoost is unavailable in the Python service; no XGBoost result is fabricated.
        </p>
      )}
      {validation.excludedSeries.length > 0 && (
        <p style={{ color: "var(--color-warning)", fontSize: "0.85rem" }}>
          {validation.excludedSeries.length} series excluded because of missing daily dates or insufficient history.
        </p>
      )}
      <details style={{ marginTop: "8px" }}>
        <summary style={{ cursor: "pointer" }}>What do these metrics mean?</summary>
        <p><strong>MAE</strong> is the average miss in each medicine’s own units; <strong>RMSE</strong> weighs large misses more; <strong>WAPE</strong> normalizes total absolute error by total demand; <strong>macro MASE</strong> averages per-series errors relative to a seasonal-naive training benchmark. A zero-denominator series is omitted from macro MASE and counted in “MASE series.”</p>
        <p>{comparison.metricDefinitions.macroMase} MASE series: {comparison.models[comparison.selectedModel]?.maseSeriesCount ?? 0}; zero-denominator series excluded: {comparison.models[comparison.selectedModel]?.zeroMaseDenominatorSeries ?? 0}.</p>
        <p>Adoption rule: {comparison.selectionRule}</p>
        {comparison.xgboost.available && (
          <p>XGBoost settings: {Object.entries(comparison.xgboost.parameters).map(([key, value]) => `${key}=${value}`).join(", ")}; target transform {comparison.xgboost.targetTransform}.</p>
        )}
      </details>
    </section>
  );
}

function DeliveryDelayDemo({
  series,
  hospital,
  medicine,
}: {
  series: SeriesForecast;
  hospital: string;
  medicine: string;
}) {
  const [arrivalDay, setArrivalDay] = useState(2);
  const [delayDays, setDelayDays] = useState(3);
  const [deliveryQuantity, setDeliveryQuantity] = useState(
    Math.max(1, Math.round(series.safetyStock)),
  );
  const projection = projectHypotheticalDelivery({
    startingStock: series.currentStock,
    safetyStock: series.safetyStock,
    forecast: series.forecast,
    arrivalDay,
    delayDays,
    deliveryQuantity,
  });
  const points = [projection.onTime.points, projection.delayed.points];
  const maxStock = Math.max(
    1,
    series.safetyStock,
    ...points.flatMap((line) => line.map((point) => point.stock)),
  );
  const linePoints = (line: typeof projection.onTime.points) =>
    line.map((point, index) =>
      `${(index / Math.max(1, line.length - 1)) * 300 + 10},${64 - (point.stock / maxStock) * 54}`,
    ).join(" ");
  const summaryText = (value: typeof projection.onTime) =>
    `Safety buffer: ${value.belowSafetyDay === null ? "not breached" : `breached day ${value.belowSafetyDay}`} · Stock-out: ${value.stockOutDay === null ? "not projected" : `day ${value.stockOutDay}`} · Ending stock: ${value.endingStock}`;

  return (
    <section className="intel-pipeline-card" style={{ marginTop: "16px" }}>
      <div className="intel-pipeline-card__label">Operational what-if · hypothetical inbound order</div>
      <h2 style={{ margin: "4px 0" }}>{hospital} · {medicine}</h2>
      <p style={{ color: "var(--color-text-muted)" }}>
        This example order is entered for the demo; it is not read from the workbook and no purchase order is created.
        Receipts are applied at the start of the arrival day, then that day’s forecast demand is deducted.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "10px" }}>
        <label>Expected arrival day
          <input type="number" min={1} max={14} value={arrivalDay} onChange={(event) => setArrivalDay(Math.max(1, Math.min(14, Number(event.target.value) || 1)))} style={{ display: "block", width: "110px" }} />
        </label>
        <label>Delay (days)
          <input type="number" min={0} max={14} value={delayDays} onChange={(event) => setDelayDays(Math.max(0, Math.min(14, Number(event.target.value) || 0)))} style={{ display: "block", width: "110px" }} />
        </label>
        <label>Hypothetical quantity
          <input type="number" min={0} value={deliveryQuantity} onChange={(event) => setDeliveryQuantity(Math.max(0, Number(event.target.value) || 0))} style={{ display: "block", width: "130px" }} />
        </label>
      </div>
      <svg viewBox="0 0 320 76" style={{ width: "100%", maxWidth: 420, height: "auto", display: "block" }} role="img" aria-label="On-time and delayed delivery stock projection compared with safety stock">
        <line x1="10" y1={64 - (series.safetyStock / maxStock) * 54} x2="310" y2={64 - (series.safetyStock / maxStock) * 54} stroke="#ef4444" strokeDasharray="4 3" />
        <polyline points={linePoints(projection.onTime.points)} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
        <polyline points={linePoints(projection.delayed.points)} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="5 3" />
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", fontSize: "0.8rem" }}>
        <span style={{ color: "#38bdf8" }}>— On-time arrival day {arrivalDay}</span>
        <span style={{ color: "#f59e0b" }}>- - Delayed arrival day {arrivalDay + delayDays}</span>
        <span style={{ color: "var(--color-danger)" }}>- - Safety stock {series.safetyStock}</span>
      </div>
      <div style={{ display: "grid", gap: "6px", marginTop: "10px", fontSize: "0.88rem" }}>
        <div><strong>On time:</strong> {summaryText(projection.onTime)}</div>
        <div><strong>With delay:</strong> {summaryText(projection.delayed)}</div>
      </div>
      <p style={{ marginBottom: 0 }}>
        Suggested response for human review: verify the supplier ETA; if the delayed projection breaches the buffer earlier, consider an alternate supplier or a feasible transfer. No order or transfer is executed.
      </p>
    </section>
  );
}

export default function IntelligencePage() {
  const [summary, setSummary] = useState<IntelligenceSummary | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbiddenError, setForbiddenError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    loadHospitalIntelligence()
      .then((data) => {
        if (active) {
          setSummary(data);
        }
      })
      .catch((err) => {
        if (active) {
          if (err instanceof IntelligenceForbiddenError) {
            setForbiddenError(err.message);
          } else {
            setError("Hospital intelligence data could not be loaded.");
          }
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
        <LoadingState label="Loading the demand forecast and model comparison..." />
      </div>
    );
  }

  if (forbiddenError) {
    return (
      <div className="container page">
        <header className="page__header">
          <h1>Hospital Intelligence</h1>
        </header>
        <section className="appointment-access-card" role="region" aria-labelledby="intel-access-title">
          <h2 id="intel-access-title">Hospital staff authorization required</h2>
          <p>{forbiddenError}</p>
          <p className="appointment-muted" style={{ marginTop: "0.5rem" }}>
            Operational forecasts, demand trends, and model comparisons contain sensitive hospital supply-chain data. Ask an administrator to assign your authorized hospital scope in <code>INVENTORY_STAFF_USER_IDS</code> or trusted app metadata.
          </p>
          <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Link to={ROUTES.citizen} className="btn btn--primary btn--small">
              Go to Citizen Healthcare
            </Link>
            <Link to={ROUTES.hospital} className="btn btn--secondary btn--small">
              Hospital Operations Overview
            </Link>
          </div>
        </section>
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
            Prioritised replenishment decisions from demand forecasting.
          </p>
        </div>
        <span className={summary.online ? "intel-source intel-source--online" : "intel-source intel-source--offline"}>
          {summary.online ? "● Live backend ML engine" : "◐ Offline local ML engine"}
        </span>
      </header>



      {/* Pipeline */}
      <section className="intel-pipeline-card">
        <div className="intel-pipeline-card__label">
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
            `${summary.model.name} MAE`,
            formatNumber(summary.model.ml.mae),
                summary.comparison
                  ? "rolling-origin selected model"
                  : "existing forecast; comparison unavailable",
              )}
              {metricCard(
                summary.comparison ? "Seasonal-naive MAE" : "Historical-mean MAE",
                formatNumber(summary.model.baseline.mae),
                summary.comparison ? "weekly seasonal benchmark" : "legacy baseline",
              )}
              {metricCard(
                "Relative MAE change",
                improvement >= 0
                  ? `${improvement.toFixed(1)}% better`
                  : `${Math.abs(improvement).toFixed(1)}% worse`,
                summary.comparison
                  ? "selected model vs seasonal naive"
                  : "existing model vs historical mean",
                improvement >= 0,
              )}
              {metricCard("RMSE", formatNumber(summary.model.ml.rmse))}
              {summary.comparison && metricCard("Evaluation forecasts", String(summary.model.evaluationDays), "rolling-origin predictions")}
              {metricCard("Active series", String(summary.series.length), "hospital × medicine combinations")}
        </div>
      </section>

      <ForecastComparison summary={summary} />

      {summary.series[0] && (
        <DeliveryDelayDemo
          key={`${summary.series[0].hospitalId}-${summary.series[0].medicineId}`}
          series={summary.series[0]}
          hospital={hospitalName(summary.series[0].hospitalId)}
          medicine={medicineName(summary.series[0].medicineId)}
        />
      )}

      {/* Risk overview */}
      <section style={{ display: "flex", gap: "18px", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontWeight: 700 }}>Risk overview</div>
        {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((level) => (
          <div key={level} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {riskBadge(level)}
            <span style={{ color: "var(--color-text-muted)" }}>{byRisk(level)}</span>
          </div>
        ))}
      </section>

      {/* Attention ranking */}
      <section>
        <h2 style={{ marginBottom: "6px" }}>Needs attention first</h2>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", marginTop: 0 }}>
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
                    <span style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>({medicineUnit(item.medicineId)})</span>
                  </span>
                  <span>{riskBadge(item.riskLevel)}</span>
                  <span className="intel-sheet__hide-mobile" style={{ color: "var(--color-text-muted)" }}>
                    {formatNumber(item.predictedDailyDemand)}
                  </span>
                  <span className="intel-sheet__hide-mobile" style={{ color: "var(--color-text-muted)" }}>
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
                      <div style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-muted)", marginBottom: "6px" }}>
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

        <p style={{ color: "var(--color-text-muted)", fontSize: "0.82rem", marginTop: "10px" }}>
          Operational forecast: {summary.model.name} · seven-day horizon.{" "}
          {summary.comparison
            ? `${summary.comparison.validation.folds} rolling-origin folds evaluated on ${summary.comparison.validation.seriesCount} series.`
            : "No comparison was available, so the existing forecast remains active."}
          {" "}Forecasts are demand projections, not medical guidance.
        </p>
      </section>

    </div>
  );
}