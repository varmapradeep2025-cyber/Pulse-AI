import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { ROUTES } from "../routes";

export type FooterVariant = "home" | "citizen" | "hospital";

const FOOTER_LINKS: Record<
  FooterVariant,
  ReadonlyArray<{ to: string; label: string }>
> = {
  home: [
    { to: ROUTES.home, label: "Home" },
    { to: ROUTES.citizen, label: "Citizen Portal" },
    { to: ROUTES.hospital, label: "Hospital Portal" },
    { to: ROUTES.login, label: "Sign in" },
  ],
  citizen: [
    { to: ROUTES.home, label: "Home" },
    { to: ROUTES.citizen, label: "Healthcare" },
    { to: ROUTES.citizenSchemes, label: "Schemes" },
    { to: ROUTES.assistant, label: "Assistant" },
  ],
  hospital: [
    { to: ROUTES.home, label: "Home" },
    { to: ROUTES.hospital, label: "Dashboard" },
    { to: ROUTES.hospitalIntelligence, label: "Hospital Intelligence" },
    { to: ROUTES.hospitalResourceBridge, label: "Resource Bridge" },
  ],
};

export default function Footer({
  variant = "home",
}: {
  variant?: FooterVariant;
}) {
  const { t } = useLanguage();
  const links = FOOTER_LINKS[variant];

  return (
    <footer className={`footer footer--${variant}`}>
      <div className="container footer__inner">
        <Link to={ROUTES.home} className="footer__brand">
          🏥 Pulse AI
        </Link>

        <p className="footer__identity">
          An independent healthcare-access platform. Not an official
          government or hospital service.
        </p>

        <nav
          aria-label={
            variant === "home"
              ? "Footer navigation"
              : `${variant} portal footer navigation`
          }
        >
          <ul className="footer__links">
            {links.map((link) => (
              <li key={link.to}>
                <Link to={link.to}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className="footer__note">{t("footer.note")}</p>
      </div>
    </footer>
  );
}
