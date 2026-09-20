import { useState } from "react";
import type { MedicalReport } from "../types/domain";
import { useLanguage } from "../context/LanguageContext";
import type { TranslationKey } from "../data/translations";

const REPORT_TYPE_KEYS: Record<MedicalReport["reportType"], TranslationKey> = {
  "Blood Test": "report.type.blood",
  Imaging: "report.type.imaging",
  "Heart Test": "report.type.heart",
};

const STATUS_KEYS: Record<MedicalReport["status"], TranslationKey> = {
  Ready: "report.ready",
  Pending: "report.pending",
  Reviewed: "report.reviewed",
};

interface ReportCardProps {
  report: MedicalReport;
}

export default function ReportCard({ report }: ReportCardProps) {
  const { t } = useLanguage();
  const [viewOpen, setViewOpen] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);

  return (
    <article className="report-card">
      <div className="report-card__head">
        <h3 className="report-card__title">{report.title}</h3>
        {report.isDemo && <span className="badge badge--demo">{t("report.demo")}</span>}
      </div>

      <p className="report-card__meta">
        {t(REPORT_TYPE_KEYS[report.reportType])} · {report.date}
      </p>

      <span className={`chip chip--status chip--${report.status.toLowerCase().replaceAll(" ", "-")}`}>
        {t(STATUS_KEYS[report.status])}
      </span>

      <div className="report-card__actions">
        <button
          type="button"
          className="btn btn--small"
          aria-expanded={viewOpen}
          onClick={() => setViewOpen((open) => !open)}
        >
          {t("report.view")}
        </button>
        <button
          type="button"
          className="btn btn--small btn--secondary"
          aria-expanded={explainOpen}
          onClick={() => setExplainOpen((open) => !open)}
        >
          {t("report.explain")}
        </button>
      </div>

      {viewOpen && (
        <div className="report-card__panel">
          <h4>{t("report.preview")}</h4>
          <p className="demo-note">{t("report.demoNoteView")}</p>
        </div>
      )}

      {explainOpen && (
        <div className="report-card__panel report-card__panel--explain">
          <h4>{t("report.explanation")}</h4>
          <p>{report.simpleSummary}</p>
          <p className="demo-note">{t("report.demoNoteExplain")}</p>
        </div>
      )}
    </article>
  );
}