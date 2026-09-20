import { sampleReports } from "../data/reports";
import { useLanguage } from "../context/LanguageContext";
import ReportCard from "../components/ReportCard";

export default function ReportsPage() {
  const { t } = useLanguage();
  const heading = t("action.reports");

  return (
    <div className="container page">
      <header className="page__header">
        <h1>{heading}</h1>
        <p>{t("report.subtitle")}</p>
      </header>

      <div className="card-grid">
        {sampleReports.map((report) => (
          <ReportCard key={report.id} report={report} />
        ))}
      </div>
    </div>
  );
}