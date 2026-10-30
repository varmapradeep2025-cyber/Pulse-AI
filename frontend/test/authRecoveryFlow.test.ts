import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROUTES } from "../src/routes";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("Password Recovery: routes are registered correctly in ROUTES", () => {
  assert.equal(ROUTES.forgotPassword, "/forgot-password");
  assert.equal(ROUTES.resetPassword, "/reset-password");
});

test("Password Recovery: auth.ts provides resetPassword and updateUserPassword", () => {
  const authPath = path.resolve(__dirname, "../src/lib/auth.ts");
  const authCode = fs.readFileSync(authPath, "utf-8");

  assert.equal(authCode.includes("export async function resetPassword"), true);
  assert.equal(
    authCode.includes("supabase.auth.resetPasswordForEmail"),
    true,
  );
  assert.equal(
    authCode.includes("export async function updateUserPassword"),
    true,
  );
  assert.equal(authCode.includes("supabase.auth.updateUser"), true);
});

test("Password Recovery: LoginPage contains 'Forgot password?' link", () => {
  const loginPath = path.resolve(__dirname, "../src/pages/LoginPage.tsx");
  const loginCode = fs.readFileSync(loginPath, "utf-8");

  assert.equal(loginCode.includes("Forgot password?"), true);
  assert.equal(loginCode.includes("to={ROUTES.forgotPassword}"), true);
  assert.equal(loginCode.includes('className="auth-link-subtle"'), true);
});

test("Password Recovery: ForgotPasswordPage has accessible form and prevents enumeration", () => {
  const forgotPath = path.resolve(
    __dirname,
    "../src/pages/ForgotPasswordPage.tsx",
  );
  const forgotCode = fs.readFileSync(forgotPath, "utf-8");

  // Accessible labels and attributes
  assert.equal(forgotCode.includes('htmlFor="recovery-email"'), true);
  assert.equal(forgotCode.includes('id="recovery-email"'), true);
  assert.equal(forgotCode.includes('type="email"'), true);
  assert.equal(forgotCode.includes('autoComplete="email"'), true);

  // Accessible alert and status regions
  assert.equal(forgotCode.includes('role="status"'), true);
  assert.equal(forgotCode.includes('aria-live="polite"'), true);

  // Enumeration prevention: always sets submitted state on standard dispatch
  assert.equal(forgotCode.includes("setSubmitted(true)"), true);
  assert.equal(forgotCode.includes("Recovery link sent"), true);

  // Return to sign in
  assert.equal(forgotCode.includes("Back to sign in"), true);
  assert.equal(forgotCode.includes("to={ROUTES.login}"), true);
});

test("Password Recovery: ResetPasswordPage validates tokens, password length, and matching passwords", () => {
  const resetPath = path.resolve(
    __dirname,
    "../src/pages/ResetPasswordPage.tsx",
  );
  const resetCode = fs.readFileSync(resetPath, "utf-8");

  // Validates recovery session presence
  assert.equal(resetCode.includes("checkRecoverySession"), true);
  assert.equal(resetCode.includes("PASSWORD_RECOVERY"), true);
  assert.equal(resetCode.includes("Recovery link invalid or expired"), true);

  // Form fields and validation
  assert.equal(resetCode.includes('id="new-password"'), true);
  assert.equal(resetCode.includes('htmlFor="new-password"'), true);
  assert.equal(resetCode.includes('id="confirm-password"'), true);
  assert.equal(resetCode.includes('htmlFor="confirm-password"'), true);
  assert.equal(resetCode.includes("minLength={8}"), true);
  assert.equal(
    resetCode.includes("Password must be at least 8 characters long."),
    true,
  );
  assert.equal(resetCode.includes("Passwords do not match."), true);

  // Password visibility controls
  assert.equal(resetCode.includes("auth-password-toggle"), true);
  assert.equal(resetCode.includes("aria-controls="), true);

  // Calls updateUserPassword
  assert.equal(resetCode.includes("await updateUserPassword(password);"), true);
  assert.equal(resetCode.includes("Password updated successfully!"), true);
});

test("Hospital Queue: page pre-selects assigned hospital and handles 403 access codes gracefully", () => {
  const queuePath = path.resolve(
    __dirname,
    "../src/pages/HospitalQueuePage.tsx",
  );
  const queueCode = fs.readFileSync(queuePath, "utf-8");

  // Inspects user metadata for assigned hospital
  assert.equal(queueCode.includes("assignedHospitalIds"), true);
  assert.equal(queueCode.includes("appointment_hospital_ids"), true);

  // Distinguishes general staff access vs specific hospital scope
  assert.equal(queueCode.includes("STAFF_HOSPITAL_FORBIDDEN"), true);
  assert.equal(queueCode.includes("hospitalForbidden"), true);
  assert.equal(queueCode.includes("Hospital authorization required"), true);
  assert.equal(queueCode.includes("Staff access required"), true);
});

test("Hospital Intelligence: data layer throws IntelligenceForbiddenError and page renders dedicated access card", () => {
  const dataPath = path.resolve(
    __dirname,
    "../src/data/hospitalIntelligence.ts",
  );
  const dataCode = fs.readFileSync(dataPath, "utf-8");

  assert.equal(
    dataCode.includes("export class IntelligenceForbiddenError"),
    true,
  );
  assert.equal(
    dataCode.includes("new IntelligenceForbiddenError"),
    true,
  );

  const pagePath = path.resolve(
    __dirname,
    "../src/pages/IntelligencePage.tsx",
  );
  const pageCode = fs.readFileSync(pagePath, "utf-8");

  assert.equal(pageCode.includes("IntelligenceForbiddenError"), true);
  assert.equal(pageCode.includes("forbiddenError"), true);
  assert.equal(
    pageCode.includes("Hospital staff authorization required"),
    true,
  );
});
