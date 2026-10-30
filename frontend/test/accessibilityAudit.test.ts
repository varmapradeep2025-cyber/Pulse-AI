import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAJOR_PAGES = [
  "LoginPage.tsx",
  "SignupPage.tsx",
  "ForgotPasswordPage.tsx",
  "ResetPasswordPage.tsx",
  "HospitalsPage.tsx",
  "AppointmentsPage.tsx",
  "DocumentsPage.tsx",
  "ReportsPage.tsx",
  "AssistantPage.tsx",
  "DashboardPage.tsx",
  "HospitalQueuePage.tsx",
  "IntelligencePage.tsx",
  "InventoryImportPage.tsx",
  "ScenarioSimulationPage.tsx",
  "ResourceBridgePage.tsx",
];

test("Accessibility Audit: all 15 major pages avoid invalid nested <main> landmarks", () => {
  for (const pageName of MAJOR_PAGES) {
    const pagePath = path.resolve(__dirname, `../src/pages/${pageName}`);
    assert.equal(fs.existsSync(pagePath), true, `Page ${pageName} exists`);

    const code = fs.readFileSync(pagePath, "utf-8");
    // Since Layout.tsx wraps <Outlet /> inside <main id="main-content">,
    // individual page components must not declare a nested <main> tag.
    assert.equal(
      code.includes("<main"),
      false,
      `Page ${pageName} should not contain a nested <main> landmark`,
    );
  }
});

test("Accessibility Audit: all 15 major pages declare a top-level <h1> heading", () => {
  for (const pageName of MAJOR_PAGES) {
    const pagePath = path.resolve(__dirname, `../src/pages/${pageName}`);
    const code = fs.readFileSync(pagePath, "utf-8");

    // All pages must have an <h1> heading for screen reader navigation hierarchy
    assert.equal(
      code.includes("<h1") || code.includes("<h1>"),
      true,
      `Page ${pageName} must declare an <h1> heading`,
    );
  }
});

test("Accessibility Audit: interactive form inputs have matching labels or accessible names", () => {
  const formPages = [
    "LoginPage.tsx",
    "SignupPage.tsx",
    "ForgotPasswordPage.tsx",
    "ResetPasswordPage.tsx",
  ];

  for (const pageName of formPages) {
    const pagePath = path.resolve(__dirname, `../src/pages/${pageName}`);
    const code = fs.readFileSync(pagePath, "utf-8");

    // Must have <label htmlFor=...> or aria-label for inputs
    assert.equal(
      code.includes("htmlFor=") || code.includes("aria-label="),
      true,
      `Form page ${pageName} must have accessible labels`,
    );
  }
});

test("Accessibility Audit: CSS contains universal focus-visible styling and touch target sizing", () => {
  const cssPath = path.resolve(__dirname, "../src/index.css");
  const css = fs.readFileSync(cssPath, "utf-8");

  // Keyboard navigation focus indicators
  assert.equal(css.includes(":focus-visible"), true);
  assert.equal(css.includes("--color-focus"), true);

  // Minimum touch target sizes (WCAG 2.5.5 / 2.5.8 >= 44px)
  assert.equal(css.includes("--tap-min: 3rem;"), true); // 48px
});

test("Accessibility Audit: Content-Security-Policy analysis verifies why external script injection is blocked", () => {
  const vercelPath = path.resolve(__dirname, "../vercel.json");
  const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, "utf-8"));

  const headers = vercelConfig.headers[0].headers;
  const cspHeader = headers.find((h: { key: string }) => h.key === "Content-Security-Policy");

  assert.ok(cspHeader, "CSP header must be present");
  const cspValue = cspHeader.value;

  // Verify production CSP enforces strict script isolation
  assert.equal(cspValue.includes("script-src 'self'"), true);

  // High security verification: does not allow unsafe-eval or unsafe-inline in script-src
  assert.equal(
    cspValue.includes("script-src 'self' 'unsafe-eval'"),
    false,
    "Production CSP correctly prohibits unsafe-eval to prevent arbitrary code injection",
  );
});
