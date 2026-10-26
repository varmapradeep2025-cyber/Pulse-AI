import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { useLanguage } from "../context/LanguageContext";

export default function PortalLayout({
  portal,
}: {
  portal: "citizen" | "hospital";
}) {
  const { t } = useLanguage();

  return (
    <div className={`layout layout--${portal}`}>
      <a className="skip-link" href="#main-content">
        {t("layout.skip")}
      </a>
      <Navbar variant={portal} />
      {portal === "hospital" && (
        <div className="portal-access-note">
          <div className="container">
            <strong>Demo access:</strong> appointment and queue data are demo
            views and require configured staff accounts. Inventory imports are
            stored separately as synthetic or real data; upload real operational
            reports only when authorized.
          </div>
        </div>
      )}
      <main id="main-content" className="main">
        <Outlet />
      </main>
      <Footer variant={portal} />
    </div>
  );
}
