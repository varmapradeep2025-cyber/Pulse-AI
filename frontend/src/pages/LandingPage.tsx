import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { useSimpleMode } from "../context/SimpleModeContext";
import FeatureCard from "../components/FeatureCard";
import Disclaimer from "../components/Disclaimer";
import { ROUTES } from "../routes";
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
      <section className="hero hero--official">
        <div className="container">
          <div className="hero__intro">
            <p className="hero__eyebrow">Pulse AI · Healthcare access platform</p>
            <h1 className="hero__title">{t("home.tagline")}</h1>
            <p className="hero__subtitle">{t("home.support")}</p>
            <p className="home-public-note">
              This public home page is open without sign-in. Choose a portal to
              explore the features relevant to you.
            </p>
          </div>

          <div className="home-portals">
            <article className="portal-entry portal-entry--citizen">
              <p className="portal-entry__eyebrow">Citizen Portal</p>
              <h2>For individuals and families</h2>
              <p>
                Navigate healthcare services and everyday health tasks in one
                place.
              </p>

              <ul className="portal-entry__list">
                <li>Search healthcare facilities and view synthetic availability</li>
                <li>Explore government schemes and document requirements</li>
                <li>Keep medical documents and read simplified reports</li>
                <li>
                  Ask the assistant by text, with optional browser voice support
                </li>
              </ul>

              <p className="portal-entry__note">
                Some personal features require an account.
              </p>

              <div className="portal-entry__actions">
                <Link
                  to={ROUTES.citizen}
                  className="btn btn--primary btn--large"
                >
                  Explore Citizen Portal
                </Link>
              </div>
            </article>

            <article className="portal-entry portal-entry--hospital">
              <p className="portal-entry__eyebrow">Hospital Portal</p>
              <h2>For hospital and operations teams</h2>
              <p>
                Review demand, scenario and resource information in one
                operations workspace.
              </p>

              <ul className="portal-entry__list">
                <li>Run supply-chain disruption scenarios</li>
                <li>Review forecast risk and recommended actions</li>
                <li>Compare resource-bridge availability records</li>
              </ul>

              <p className="portal-entry__note">
                Hospital operations and resource management suite.
              </p>

              <div className="portal-entry__actions">
                <Link
                  to={ROUTES.hospital}
                  className="btn btn--secondary btn--large"
                >
                  Open Hospital Portal
                </Link>
              </div>
            </article>
          </div>

          {simpleMode && (
            <p className="demo-note">
              Simple Mode is ON — larger text and buttons.
            </p>
          )}
        </div>
      </section>

      <section className="container home-connection">
        <div>
          <p className="home-connection__eyebrow">Connected by design</p>
          <h2>One integrated platform, two connected views</h2>
        </div>
        <div className="home-connection__copy">
          <p>
            Citizen tools help people find services and understand next steps.
            Hospital tools help teams explore demand and resource scenarios.
          </p>
          <p>
            Connected views for citizen access and hospital operations, designed
            for clarity and responsiveness.
          </p>
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
