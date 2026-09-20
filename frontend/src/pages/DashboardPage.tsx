import { useLanguage } from "../context/LanguageContext";
import LanguageSelector from "../components/LanguageSelector";
import ActionCard from "../components/ActionCard";
import VoiceAssistantCard from "../components/VoiceAssistantCard";

export default function DashboardPage() {
  const { t } = useLanguage();

  return (
    <div className="container dashboard">
      <div className="dashboard__header">
        <h1 className="dashboard__heading">{t("dashboard.heading")}</h1>
        <div className="dashboard__tools">
          <LanguageSelector id="dashboard-language" />
        </div>
      </div>

      <VoiceAssistantCard />

      <h2 className="dashboard__section-title">{t("dashboard.quickActions")}</h2>
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
    </div>
  );
}