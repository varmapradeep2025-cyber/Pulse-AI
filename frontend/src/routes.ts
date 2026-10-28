import type { TranslationKey } from "./data/translations";

export const ROUTES = {
  home: "/",
  login: "/login",
  signup: "/signup",
  citizen: "/citizen",
  citizenHospitals: "/citizen/hospitals",
  citizenHospitalDetails: "/citizen/hospitals/:id",
  citizenAppointments: "/citizen/appointments",
  citizenSchemes: "/citizen/schemes",
  citizenSchemeDetails: "/citizen/schemes/:id",
  citizenDocuments: "/citizen/documents",
  citizenReports: "/citizen/reports",
  assistant: "/assistant",
  hospital: "/hospital",
  hospitalQueue: "/hospital/queue",
  hospitalInventoryImport: "/hospital/inventory-import",
  hospitalIntelligence: "/hospital/intelligence",
  hospitalResourceBridge: "/hospital/resource-bridge",
  hospitalScenarios: "/hospital/scenarios",
} as const;

export interface PortalNavItem {
  to: string;
  label: string;
  labelKey?: TranslationKey;
  exact?: boolean;
  extraActivePrefixes?: readonly string[];
}

export const CITIZEN_NAV_ITEMS = [
  {
    to: ROUTES.citizen,
    label: "Healthcare",
    labelKey: "nav.healthcare",
    exact: true,
    extraActivePrefixes: [ROUTES.citizenHospitals],
  },
  {
    to: ROUTES.citizenAppointments,
    label: "Appointments",
  },
  {
    to: ROUTES.citizenSchemes,
    label: "Schemes",
    labelKey: "nav.schemes",
  },
  {
    to: ROUTES.citizenDocuments,
    label: "Documents",
    labelKey: "nav.documents",
  },
  {
    to: ROUTES.citizenReports,
    label: "Reports",
    labelKey: "nav.reports",
  },
  {
    to: ROUTES.assistant,
    label: "Assistant",
    labelKey: "nav.assistant",
  },
] as const satisfies readonly PortalNavItem[];

export const HOSPITAL_NAV_ITEMS = [
  {
    to: ROUTES.hospital,
    label: "Dashboard",
    labelKey: "nav.dashboard",
    exact: true,
  },
  {
    to: ROUTES.hospitalQueue,
    label: "Queue",
  },
  {
    to: ROUTES.hospitalInventoryImport,
    label: "Inventory Import",
  },
  {
    to: ROUTES.hospitalIntelligence,
    label: "Hospital Intelligence",
  },
  {
    to: ROUTES.hospitalScenarios,
    label: "Scenarios",
  },
  {
    to: ROUTES.hospitalResourceBridge,
    label: "Resource Bridge",
  },
] as const satisfies readonly PortalNavItem[];

export const HOME_NAV_ITEMS = [
  {
    to: ROUTES.home,
    label: "Home",
    labelKey: "nav.home",
    exact: true,
  },
  {
    to: ROUTES.citizen,
    label: "Citizen Portal",
  },
  {
    to: ROUTES.hospital,
    label: "Hospital Portal",
  },
] as const satisfies readonly PortalNavItem[];

export const LEGACY_ROUTE_ALIASES = [
  { from: "/dashboard", to: ROUTES.hospital },
  { from: "/intelligence", to: ROUTES.hospitalIntelligence },
  { from: "/resource-bridge", to: ROUTES.hospitalResourceBridge },
  { from: "/hospitals", to: ROUTES.citizen },
  { from: "/schemes", to: ROUTES.citizenSchemes },
  { from: "/documents", to: ROUTES.citizenDocuments },
  { from: "/reports", to: ROUTES.citizenReports },
] as const;

export function citizenHospitalPath(id: string | number): string {
  return `${ROUTES.citizenHospitals}/${id}`;
}

export function citizenSchemePath(id: string | number): string {
  return `${ROUTES.citizenSchemes}/${id}`;
}

export function isNavItemActive(
  item: PortalNavItem,
  pathname: string,
): boolean {
  if (item.exact && pathname === item.to) {
    return true;
  }

  if (!item.exact && (pathname === item.to || pathname.startsWith(`${item.to}/`))) {
    return true;
  }

  return (
    item.extraActivePrefixes?.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ) ?? false
  );
}
