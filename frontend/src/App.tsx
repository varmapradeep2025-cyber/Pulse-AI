import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "./context/LanguageContext";
import { SimpleModeProvider } from "./context/SimpleModeContext";
import Layout from "./components/Layout";
import PortalLayout from "./components/PortalLayout";
import LegacyRedirect from "./components/LegacyRedirect";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import LandingPage from "./pages/LandingPage";
import DashboardPage from "./pages/DashboardPage";
import HospitalsPage from "./pages/HospitalsPage";
import HospitalDetailsPage from "./pages/HospitalDetailsPage";
import SchemesPage from "./pages/SchemesPage";
import SchemeDetailsPage from "./pages/SchemeDetailsPage";
import ProtectedRoute from "./components/ProtectedRoute";
import DocumentsPage from "./pages/DocumentsPage";
import ReportsPage from "./pages/ReportsPage";
import AssistantPage from "./pages/AssistantPage";
import AppointmentsPage from "./pages/AppointmentsPage";
import HospitalQueuePage from "./pages/HospitalQueuePage";
import InventoryImportPage from "./pages/InventoryImportPage";
import IntelligencePage from "./pages/IntelligencePage";
import ResourceBridgePage from "./pages/ResourceBridgePage";
import ScenarioSimulationPage from "./pages/ScenarioSimulationPage";
import NotFoundPage from "./pages/NotFoundPage";
import {
  ROUTES,
  citizenHospitalPath,
  citizenSchemePath,
} from "./routes";

export default function App() {
  return (
    <LanguageProvider>
      <SimpleModeProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path={ROUTES.home} element={<LandingPage />} />
              <Route path={ROUTES.login} element={<LoginPage />} />
              <Route path={ROUTES.signup} element={<SignupPage />} />
              <Route
                path={ROUTES.forgotPassword}
                element={<ForgotPasswordPage />}
              />
              <Route
                path={ROUTES.resetPassword}
                element={<ResetPasswordPage />}
              />
            </Route>

            <Route element={<PortalLayout portal="citizen" />}>
              <Route path={ROUTES.citizen} element={<HospitalsPage />} />
              <Route
                path={ROUTES.citizenHospitalDetails}
                element={<HospitalDetailsPage />}
              />
              <Route path={ROUTES.citizenSchemes} element={<SchemesPage />} />
              <Route
                path={ROUTES.citizenSchemeDetails}
                element={<SchemeDetailsPage />}
              />

              <Route element={<ProtectedRoute />}>
                <Route
                  path={ROUTES.citizenAppointments}
                  element={<AppointmentsPage />}
                />
                <Route
                  path={ROUTES.citizenDocuments}
                  element={<DocumentsPage />}
                />
                <Route
                  path={ROUTES.citizenReports}
                  element={<ReportsPage />}
                />
                <Route path={ROUTES.assistant} element={<AssistantPage />} />
              </Route>

              <Route path="/citizen/*" element={<NotFoundPage />} />
            </Route>

            <Route element={<PortalLayout portal="hospital" />}>
              <Route element={<ProtectedRoute />}>
                <Route path={ROUTES.hospital} element={<DashboardPage />} />
                <Route
                  path={ROUTES.hospitalQueue}
                  element={<HospitalQueuePage />}
                />
                <Route
                  path={ROUTES.hospitalInventoryImport}
                  element={<InventoryImportPage />}
                />
                <Route
                  path={ROUTES.hospitalIntelligence}
                  element={<IntelligencePage />}
                />
                <Route
                  path={ROUTES.hospitalResourceBridge}
                  element={<ResourceBridgePage />}
                />
                <Route
                  path={ROUTES.hospitalScenarios}
                  element={<ScenarioSimulationPage />}
                />
              </Route>

              <Route path="/hospital/*" element={<NotFoundPage />} />
            </Route>

            <Route
              path="/dashboard"
              element={<LegacyRedirect to={ROUTES.hospital} />}
            />
            <Route
              path="/intelligence"
              element={<LegacyRedirect to={ROUTES.hospitalIntelligence} />}
            />
            <Route
              path="/resource-bridge"
              element={<LegacyRedirect to={ROUTES.hospitalResourceBridge} />}
            />
            <Route
              path="/hospitals"
              element={<LegacyRedirect to={ROUTES.citizen} />}
            />
            <Route
              path="/hospitals/:id"
              element={
                <LegacyRedirect
                  to={(params) => citizenHospitalPath(params.id ?? "")}
                />
              }
            />
            <Route
              path="/schemes"
              element={<LegacyRedirect to={ROUTES.citizenSchemes} />}
            />
            <Route
              path="/schemes/:id"
              element={
                <LegacyRedirect
                  to={(params) => citizenSchemePath(params.id ?? "")}
                />
              }
            />
            <Route
              path="/documents"
              element={<LegacyRedirect to={ROUTES.citizenDocuments} />}
            />
            <Route
              path="/reports"
              element={<LegacyRedirect to={ROUTES.citizenReports} />}
            />

            <Route element={<Layout />}>
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SimpleModeProvider>
    </LanguageProvider>
  );
}
