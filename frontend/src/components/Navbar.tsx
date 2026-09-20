import { Link, NavLink } from "react-router-dom";
import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useSimpleMode } from "../context/SimpleModeContext";
import LanguageSelector from "./LanguageSelector";
import SimpleModeToggle from "./SimpleModeToggle";
import type { TranslationKey } from "../data/translations";

interface NavItem {
  to: string;
  labelKey: TranslationKey;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", labelKey: "nav.home", end: true },
  { to: "/dashboard", labelKey: "nav.dashboard" },
  { to: "/hospitals", labelKey: "nav.healthcare" },
  { to: "/schemes", labelKey: "nav.schemes" },
  { to: "/documents", labelKey: "nav.documents" },
  { to: "/reports", labelKey: "nav.reports" },
  { to: "/assistant", labelKey: "nav.assistant" },
];

export default function Navbar() {
  const { t } = useLanguage();
  const { simpleMode } = useSimpleMode();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="navbar">
      <div className="navbar__inner container">
        <Link
          to="/"
          className="navbar__brand"
          aria-label={`Pulse AI ${t("nav.home")}`}
        >
          <span className="navbar__logo" aria-hidden="true">
            🏥
          </span>
          <span className="navbar__brand-text">
            Pulse&nbsp;AI
            {simpleMode && (
              <span className="navbar__badge">{t("simpleMode.badge")}</span>
            )}
          </span>
        </Link>

        <nav className="navbar__nav" aria-label="Main navigation">
          <ul className="navbar__links">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `navbar__link${isActive ? " navbar__link--active" : ""}`
                  }
                >
                  {t(item.labelKey)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="navbar__tools">
          <SimpleModeToggle />
          <LanguageSelector compact />
          <button
            type="button"
            className="navbar__toggle"
            aria-label={t(menuOpen ? "navbar.closeMenu" : "navbar.openMenu")}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">{menuOpen ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="navbar__mobile" aria-label="Mobile navigation">
          <ul className="navbar__mobile-links">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={() => setMenuOpen(false)}
                  className={() => `navbar__mobile-link`}
                >
                  {t(item.labelKey)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}