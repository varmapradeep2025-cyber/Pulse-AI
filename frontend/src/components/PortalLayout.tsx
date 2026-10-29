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

      <main id="main-content" className="main">
        <Outlet />
      </main>
      <Footer variant={portal} />
    </div>
  );
}
