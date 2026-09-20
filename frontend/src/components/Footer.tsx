import { Link } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="footer">
      <div className="container footer__inner">
        <p className="footer__brand">🏥 Pulse AI</p>
        <nav aria-label="Footer navigation">
          <ul className="footer__links">
            <li>
              <Link to="/">{t("footer.home")}</Link>
            </li>
            <li>
              <Link to="/dashboard">{t("footer.dashboard")}</Link>
            </li>
            <li>
              <Link to="/assistant">{t("footer.assistant")}</Link>
            </li>
          </ul>
        </nav>
        <p className="footer__note">{t("footer.note")}</p>
      </div>
    </footer>
  );
}