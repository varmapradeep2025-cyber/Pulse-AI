import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "./context/LanguageContext";
import { SimpleModeProvider } from "./context/SimpleModeContext";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
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
import IntelligencePage from "./pages/IntelligencePage";
import NotFoundPage from "./pages/NotFoundPage";

export default function App() {
  return (
    <LanguageProvider>
      <SimpleModeProvider>
        <BrowserRouter>
          <Routes>
  <Route element={<Layout />}>
    {/* Public routes */}
    <Route path="/login" element={<LoginPage />} />
    <Route path="/signup" element={<SignupPage />} />
    <Route path="/" element={<LandingPage />} />
    <Route path="/hospitals" element={<HospitalsPage />} />
    <Route
  path="/hospitals/:id"
  element={<HospitalDetailsPage />}
/>
    <Route path="/schemes" element={<SchemesPage />} />
    <Route path="/schemes/:id" element={<SchemeDetailsPage />} />

    {/* Protected routes */}
    <Route element={<ProtectedRoute />}>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/documents" element={<DocumentsPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/intelligence" element={<IntelligencePage />} />
      <Route path="/assistant" element={<AssistantPage />} />
    </Route>

    {/* 404 */}
    <Route path="*" element={<NotFoundPage />} />
  </Route>
</Routes>
        </BrowserRouter>
      </SimpleModeProvider>
    </LanguageProvider>
  );
}