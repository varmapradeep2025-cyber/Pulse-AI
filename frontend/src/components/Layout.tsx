import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { useLanguage } from "../context/LanguageContext";

export default function Layout() {
  const { t } = useLanguage();

  return (
    <div className="layout">
      <a className="skip-link" href="#main-content">
        {t("layout.skip")}
      </a>
      <Navbar variant="home" />
      <main id="main-content" className="main">
        <Outlet />
      </main>
      <Footer variant="home" />
    </div>
  );
}