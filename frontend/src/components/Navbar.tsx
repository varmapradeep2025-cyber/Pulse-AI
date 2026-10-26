import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useSimpleMode } from "../context/SimpleModeContext";
import LanguageSelector from "./LanguageSelector";
import SimpleModeToggle from "./SimpleModeToggle";
import {
  CITIZEN_NAV_ITEMS,
  HOSPITAL_NAV_ITEMS,
  HOME_NAV_ITEMS,
  ROUTES,
  isNavItemActive,
  type PortalNavItem,
} from "../routes";

export type NavbarVariant = "home" | "citizen" | "hospital";

const NAV_ITEMS: Record<NavbarVariant, readonly PortalNavItem[]> = {
  home: HOME_NAV_ITEMS,
  citizen: CITIZEN_NAV_ITEMS,
  hospital: HOSPITAL_NAV_ITEMS,
};

const PORTAL_SWITCH: Record<
  NavbarVariant,
  { to: string; label: string } | null
> = {
  home: null,
  citizen: { to: ROUTES.hospital, label: "Hospital Portal" },
  hospital: { to: ROUTES.citizen, label: "Citizen Portal" },
};

export default function Navbar({
  variant = "home",
}: {
  variant?: NavbarVariant;
}) {
  const { t } = useLanguage();
  const { simpleMode } = useSimpleMode();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = NAV_ITEMS[variant];
  const portalSwitch = PORTAL_SWITCH[variant];
  const navigationLabel =
    variant === "home" ? "Main navigation" : `${variant} portal navigation`;

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className={`navbar navbar--${variant}`}>
      <div className="navbar__inner container">
        <Link
          to={ROUTES.home}
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
            {variant === "hospital" && (
              <span
                className="navbar__demo-badge"
                title="Most hospital pages are demo views. The staff Queue requires authorization."
              >
                Demo access
              </span>
            )}
          </span>
        </Link>

        <nav className="navbar__nav" aria-label={navigationLabel}>
          <ul className="navbar__links">
            {items.map((item) => {
              const active = isNavItemActive(item, pathname);

              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    className={`navbar__link${
                      active ? " navbar__link--active" : ""
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="navbar__tools">
          {portalSwitch && (
            <Link
              to={portalSwitch.to}
              className="navbar__portal-switch"
              aria-label={`Switch to ${portalSwitch.label}`}
            >
              {portalSwitch.label}
            </Link>
          )}
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
            {items.map((item) => {
              const active = isNavItemActive(item, pathname);

              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={`navbar__mobile-link${
                      active ? " navbar__mobile-link--active" : ""
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
            {portalSwitch && (
              <li>
                <Link
                  to={portalSwitch.to}
                  onClick={() => setMenuOpen(false)}
                  className="navbar__mobile-switch"
                >
                  Switch to {portalSwitch.label}
                </Link>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}
