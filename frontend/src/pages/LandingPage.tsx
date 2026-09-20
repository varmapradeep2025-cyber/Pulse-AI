import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useSimpleMode } from "../context/SimpleModeContext";
import FeatureCard from "../components/FeatureCard";
import Disclaimer from "../components/Disclaimer";
import type { TranslationKey } from "../data/translations";

const FEATURES: Array<{
  icon: string;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  highlight?: boolean;
}> = [
  {
    icon: "🏥",
    titleKey: "home.feature.healthcare.title",
    descriptionKey: "home.feature.healthcare.desc",
  },
  {
    icon: "🏛️",
    titleKey: "home.feature.schemes.title",
    descriptionKey: "home.feature.schemes.desc",
  },
  {
    icon: "📁",
    titleKey: "home.feature.documents.title",
    descriptionKey: "home.feature.documents.desc",
  },
  {
    icon: "🗣️",
    titleKey: "home.feature.voice.title",
    descriptionKey: "home.feature.voice.desc",
  },
  {
    icon: "🔍",
    titleKey: "home.feature.lowLiteracy.title",
    descriptionKey: "home.feature.lowLiteracy.desc",
    highlight: true,
  },
];

export default function LandingPage() {
  const { t } = useLanguage();
  const { simpleMode } = useSimpleMode();

  return (
    <>
      <section className="hero">
        <div className="container">
          <p className="hero__eyebrow">🏥 Pulse AI</p>
          <h1 className="hero__title">{t("home.tagline")}</h1>
          <p className="hero__subtitle">{t("home.support")}</p>

          <div className="hero__actions">
            <Link to="/dashboard" className="btn btn--primary btn--large">
              {t("home.getStarted")}
            </Link>
            <Link to="/assistant" className="btn btn--secondary btn--large">
              {t("home.talkToAssistant")}
            </Link>
          </div>

          <div className="hero__voice">
            <Link to="/assistant" className="hero__voice-inner">
              <span className="hero__voice-mic" aria-hidden="true">
                🎙️
              </span>
              <span>
                <strong>{t("home.speakVoice")}</strong>
                <small>{t("home.speakHint")}</small>
              </span>
            </Link>
          </div>

          {simpleMode && (
            <p className="demo-note">Demo: Simple Mode is ON — larger text and buttons.</p>
          )}
        </div>
      </section>

      <section className="features container">
        <h2 className="features__heading">{t("home.featuresHeading")}</h2>
        <div className="features__grid">
          {FEATURES.map((feature) => (
            <FeatureCard
              key={feature.titleKey}
              icon={feature.icon}
              title={t(feature.titleKey)}
              description={t(feature.descriptionKey)}
              highlight={feature.highlight}
            />
          ))}
        </div>
      </section>

      <section className="container">
        <Disclaimer />
      </section>
    </>
  );
}