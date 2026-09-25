import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { sampleReports } from "../data/reports";
import { sampleDocuments } from "../data/documents";
import { SYNTHETIC_DATA_LABEL, syntheticHospitals } from "../data/hospitals";
import {
  clearScenarioReports,
  loadScenarioReports,
} from "../data/scenarioReports";
import type { ScenarioReport } from "../data/scenarioReports";
import { useLanguage } from "../context/LanguageContext";
import ReportCard from "../components/ReportCard";
import EmptyState from "../components/EmptyState";
import type { ReportStatus } from "../types/domain";
import type { RiskLabel } from "../api/scenarios";

const STATUS_FILTERS: Array<ReportStatus | "All"> = [
  "All",
  "Ready",
  "Pending",
  "Reviewed",
];

const RISK_BADGE: Record<RiskLabel, { background: string; color: string }> = {
  GREEN: { background: "#dcfce7", color: "#166534" },
  YELLOW: { background: "#fef9c3", color: "#854d0e" },
  RED: { background: "#fee2e2", color: "#991b1b" },
  CRITICAL: { background: "#7f1d1d", color: "#ffffff" },
};

function formatReportDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function ScenarioReportCard({ report }: { report: ScenarioReport }) {
  const [viewOpen, setViewOpen] = useState(false);
  const worst = report.worst_risk_label;
  const badge = RISK_BADGE[worst];

  const riskOrder: Record<RiskLabel, number> = {
    GREEN: 1,
    YELLOW: 2,
    RED: 3,
    CRITICAL: 4,
  };

  const items = [...report.items].sort(
    (a, b) =>
      riskOrder[b.risk_label] - riskOrder[a.risk_label] ||
      a.hospital_id - b.hospital_id,
  );

  return (
    <article className="report-card">
      <div className="report-card__head">
        <h3 className="report-card__title">
          {report.scenario_name}{" "}
          <span style={{ fontWeight: 400, opacity: 0.6 }}>
            ({report.scenario_id})
          </span>
        </h3>
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
          Risk: {worst}
        </span>
      </div>

      <p className="report-card__meta">
        Simulation {report.id} · {formatReportDate(report.created_at)}
      </p>

      <p className="report-card__meta">
        <strong>Headline:</strong> {report.headline}
      </p>

      <p className="report-card__meta">
        <strong>Supplier impact:</strong> {report.supplier_disruption_label} ·{" "}
        <strong>Demand change:</strong> {report.demand_change_label}
      </p>

      <p className="report-card__meta">
        <strong>Affected hospitals:</strong> {report.affected_hospitals.length}
        {" · "}
        <strong>Affected medicines:</strong> {report.affected_medicines.length}
        {" · "}
        <strong>Projected shortage:</strong>{" "}
        {report.projected_shortage_total} units
      </p>

      <p className="report-card__meta">
        {("GREEN YELLOW RED CRITICAL" as string).split(" ").map((label) => {
          const riskLabel = label as RiskLabel;
          const count = report.result_counts[riskLabel] ?? 0;
          const band = RISK_BADGE[riskLabel];

          return (
            <span
              key={riskLabel}
              style={{
                display: "inline-block",
                margin: "0 4px 4px 0",
                padding: "2px 8px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: 700,
                ...band,
              }}
            >
              {riskLabel}: {count}
            </span>
          );
        })}
      </p>

      <div className="report-card__actions">
        <button
          type="button"
          className="btn btn--small"
          aria-expanded={viewOpen}
          onClick={() => setViewOpen((open) => !open)}
        >
          {viewOpen ? "Hide details" : "View details"}
        </button>
      </div>

      {viewOpen && (
        <div className="report-card__panel">
          <h4>Disruption details</h4>

          <p>
            <strong>Demand change:</strong> {report.demand_change_label} ·{" "}
            <strong>Supplier impact:</strong>{" "}
            {report.supplier_disruption_label}
          </p>

          <p>
            <strong>Affected hospitals:</strong>{" "}
            {report.affected_hospitals.join(", ")}
          </p>

          <p>
            <strong>Affected medicines:</strong>{" "}
            {report.affected_medicines.join(", ")}
          </p>

          <p>
            <strong>Assumptions:</strong>
          </p>

          <ul style={{ margin: "4px 0", paddingLeft: "18px" }}>
            {report.assumptions.map((assumption, index) => (
              <li key={index}>{assumption}</li>
            ))}
          </ul>

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
              marginTop: "10px",
            }}
          >
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th>Hospital</th>
                <th>Medicine</th>
                <th>Risk</th>
                <th>Est. shortage</th>
                <th>Stock-out</th>
                <th>Recommended action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const itemBadge = RISK_BADGE[item.risk_label];

                return (
                  <tr
                    key={`${item.hospital_id}-${item.medicine_name}-${index}`}
                    style={{ borderTop: "1px solid #eee", verticalAlign: "top" }}
                  >
                    <td style={{ padding: "6px 8px" }}>
                      {item.hospital_name} ({item.city})
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      {item.medicine_name}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 700,
                          ...itemBadge,
                        }}
                      >
                        {item.risk_label}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      {item.shortage_quantity > 0
                        ? `${item.shortage_quantity} ${item.unit}`
                        : "—"}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      {item.stock_out_day !== null
                        ? `Day ${item.stock_out_day}`
                        : "—"}
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      {item.recommendation}
                      {item.transfer_units !== undefined && (
                        <span style={{ display: "block", color: "#0369a1" }}>
                          Transfer {item.transfer_units} {item.unit} from{" "}
                          {item.donor_hospital_name}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="demo-note">{report.disclaimer}</p>
        </div>
      )}
    </article>
  );
}

export default function ReportsPage() {
  const { t } = useLanguage();

  const [statusFilter, setStatusFilter] =
    useState<ReportStatus | "All">("All");

  const [scenarioReports, setScenarioReports] =
    useState<ScenarioReport[]>(() => loadScenarioReports());

  const filteredReports = useMemo(() => {
    if (statusFilter === "All") {
      return sampleReports;
    }

    return sampleReports.filter(
      (report) => report.status === statusFilter,
    );
  }, [statusFilter]);

  /*
   * Data provenance: reports are derived from the shared prototype dataset.
   * Count how many reference a real synthetic source document / hospital.
   */
  const linkage = useMemo(() => {
    const documentIds = new Set(sampleDocuments.map((doc) => doc.document_id));
    const hospitalIds = new Set(syntheticHospitals.map((hospital) => hospital.hospital_id));

    const linkedDocs = sampleReports.filter((report) => documentIds.has(report.document_id)).length;
    const linkedHospitals = sampleReports.filter((report) => hospitalIds.has(report.hospital_id)).length;
    const reportJournals = sampleReports.map((report) => report.patient_id);

    return {
      linkedDocs,
      linkedHospitals,
      patients: new Set(reportJournals).size,
    };
  }, []);

  const heading = t("action.reports");

  return (
    <div className="container page">
      <header className="page__header">
        <h1>{heading}</h1>
        <p>{t("report.subtitle")}</p>
      </header>

      {/* Synthetic demo information */}
      <div
        style={{
          marginBottom: "20px",
          padding: "14px 16px",
          borderRadius: "10px",
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          color: "#1e3a8a",
          fontSize: "14px",
        }}
      >
        <strong>{SYNTHETIC_DATA_LABEL}:</strong> The
        reports shown here are fictional demonstration
        records created from the same synthetic dataset
        as the hospital and document portals. They are
        not real patient results.
      </div>

      {/* Data linkage to the shared prototype dataset */}
      <div className="report-linkage">
        <span>
          <strong>{sampleReports.length}</strong> reports
        </span>
        <span>
          <strong>{linkage.linkedDocs}</strong> linked to source documents
        </span>
        <span>
          <strong>{linkage.linkedHospitals}</strong> linked to hospitals
        </span>
        <span>
          <strong>{linkage.patients}</strong> synthetic patient records
        </span>
      </div>

      {/* Status filters */}
      <div
        className="filters"
        role="group"
        aria-label="Filter medical reports by status"
      >
        {STATUS_FILTERS.map((status) => {
          const active = statusFilter === status;

          return (
            <button
              key={status}
              type="button"
              className={`chip chip--filter${
                active ? " chip--active" : ""
              }`}
              aria-pressed={active}
              onClick={() => setStatusFilter(status)}
            >
              {status === "All"
                ? "All Reports"
                : status}
            </button>
          );
        })}
      </div>

      {/* Result count */}
      {filteredReports.length > 0 && (
        <p
          style={{
            margin: "18px 0 12px",
            fontSize: "14px",
            opacity: 0.75,
          }}
        >
          Showing{" "}
          <strong>{filteredReports.length}</strong>{" "}
          medical report
          {filteredReports.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Reports */}
      {filteredReports.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No reports found"
          description="There are no reports matching the selected status."
        />
      ) : (
        <div className="card-grid">
          {filteredReports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
            />
          ))}
        </div>
      )}

      {/* =====================================================
          PULSE AI SCENARIO SIMULATION REPORTS
          ===================================================== */}

      <section style={{ marginTop: "34px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div>
            <h2 className="dashboard__section-title">
              Pulse AI Scenario Simulations
            </h2>
            <p style={{ color: "#555", margin: "4px 0 0", fontSize: "14px" }}>
              Supply-chain disruption simulations you ran from the dashboard are
              saved here alongside the medical reports.
            </p>
          </div>

          {scenarioReports.length > 0 && (
            <button
              type="button"
              className="btn btn--small btn--secondary"
              onClick={() => {
                clearScenarioReports();
                setScenarioReports([]);
              }}
            >
              Clear simulation history
            </button>
          )}
        </div>

        {scenarioReports.length === 0 ? (
          <div
            style={{
              marginTop: "16px",
              padding: "18px",
              borderRadius: "10px",
              border: "1px dashed #cbd5e1",
              background: "#f8fafc",
              fontSize: "14px",
              color: "#475569",
            }}
          >
            No simulation reports yet. Run a scenario from the{" "}
            <Link to="/" className="report-card__link">
              Dashboard
            </Link>{" "}
            to generate one.
          </div>
        ) : (
          <div className="card-grid" style={{ marginTop: "16px" }}>
            {scenarioReports.map((report) => (
              <ScenarioReportCard key={report.id} report={report} />
            ))}
          </div>
        )}

        <p style={{ fontSize: "13px", color: "#6b7280", marginTop: "12px" }}>
          Simulation reports are generated locally in your browser and are
          demonstration data only — not for clinical decision-making.
        </p>
      </section>

      {/* Medical disclaimer */}
      <div
        style={{
          marginTop: "28px",
          padding: "16px",
          borderRadius: "10px",
          background: "#fff7ed",
          border: "1px solid #fed7aa",
          color: "#7c2d12",
          fontSize: "14px",
        }}
      >
        <strong>Important:</strong>{" "}
        Report explanations shown in this prototype are
        for demonstration and accessibility purposes only.
        They are not a diagnosis or a replacement for advice
        from a qualified healthcare professional.
      </div>
    </div>
  );
}