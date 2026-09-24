import { useMemo, useState } from "react";
import { sampleReports } from "../data/reports";
import { useLanguage } from "../context/LanguageContext";
import ReportCard from "../components/ReportCard";
import EmptyState from "../components/EmptyState";
import type { ReportStatus } from "../types/domain";

const STATUS_FILTERS: Array<ReportStatus | "All"> = [
  "All",
  "Ready",
  "Pending",
  "Reviewed",
];

export default function ReportsPage() {
  const { t } = useLanguage();

  const [statusFilter, setStatusFilter] =
    useState<ReportStatus | "All">("All");

  const filteredReports = useMemo(() => {
    if (statusFilter === "All") {
      return sampleReports;
    }

    return sampleReports.filter(
      (report) => report.status === statusFilter,
    );
  }, [statusFilter]);

  const heading = t("action.reports");

  return (
    <div className="container page">
      <header className="page__header">
        <h1>{heading}</h1>
        <p>{t("report.subtitle")}</p>
      </header>

      {/* Prototype information */}
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
        <strong>Prototype information:</strong>{" "}
        The reports shown here are demonstration records.
        In deployment, this portal can be connected to
        verified hospital and laboratory records.
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