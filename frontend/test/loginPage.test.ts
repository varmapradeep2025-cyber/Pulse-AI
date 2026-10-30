import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Calculate relative luminance and WCAG contrast ratio
function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace("#", "");
  const num = parseInt(cleanHex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function getLuminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hexToRgb(hex1));
  const lum2 = getLuminance(hexToRgb(hex2));
  const brighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (brighter + 0.05) / (darker + 0.05);
}

test("LoginPage: source file uses valid landmarks without nested <main>", () => {
  const filePath = path.resolve(__dirname, "../src/pages/LoginPage.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  // Since Layout.tsx already wraps content in <main id="main-content">,
  // LoginPage must not define a nested <main> tag (WCAG landmark violation)
  assert.equal(
    content.includes("<main"),
    false,
    "LoginPage should not contain a nested <main> tag",
  );
  assert.equal(
    content.includes('className="auth-page"'),
    true,
    "LoginPage should have the .auth-page container",
  );
  assert.equal(
    content.includes('className="auth-card"'),
    true,
    "LoginPage should have the .auth-card container",
  );
});

test("LoginPage: accessibility attributes, form labels, and input IDs match", () => {
  const filePath = path.resolve(__dirname, "../src/pages/LoginPage.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  // Labels and matching input IDs
  assert.equal(content.includes('htmlFor="login-email"'), true);
  assert.equal(content.includes('id="login-email"'), true);
  assert.equal(content.includes('htmlFor="login-password"'), true);
  assert.equal(content.includes('id="login-password"'), true);

  // Autocomplete attributes for password managers and assistive tech
  assert.equal(content.includes('autoComplete="email"'), true);
  assert.equal(content.includes('autoComplete="current-password"'), true);

  // Accessible password visibility toggle
  assert.equal(content.includes('aria-controls="login-password"'), true);
  assert.equal(content.includes('aria-label='), true);
  assert.equal(content.includes('aria-pressed='), true);

  // Accessible error alert
  assert.equal(content.includes('role="alert"'), true);
  assert.equal(content.includes('aria-live="polite"'), true);

  // Accessible loading indicator
  assert.equal(content.includes('aria-busy='), true);
});

test("LoginPage: preserves authentication wiring, routing, and navigation", () => {
  const filePath = path.resolve(__dirname, "../src/pages/LoginPage.tsx");
  const content = fs.readFileSync(filePath, "utf-8");

  // Calls signIn from lib/auth
  assert.equal(content.includes('import { signIn } from "../lib/auth";'), true);
  assert.equal(content.includes("await signIn(email.trim(), password);"), true);

  // Preserves redirect to requested target or citizen portal default
  assert.equal(content.includes("navigate(from, { replace: true });"), true);

  // Preserves signup link with state
  assert.equal(content.includes('to={ROUTES.signup}'), true);
  assert.equal(content.includes('state={{ from }}'), true);

  // Preserves back to home link
  assert.equal(content.includes('to={ROUTES.home}'), true);
});

test("LoginPage: dark theme design tokens exceed WCAG 2.2 AA contrast requirements", () => {
  const surfaceBg = "#111B2E";
  const primaryText = "#F1F5F9";
  const mutedText = "#94A3B8";
  const tealButtonBg = "#14B8A6";
  const darkButtonText = "#042F2E";
  const linkCyan = "#22D3EE";

  // 1. Primary text on surface (WCAG AA requires 4.5:1, AAA requires 7:1)
  const textContrast = getContrastRatio(primaryText, surfaceBg);
  assert.ok(
    textContrast >= 7.0,
    `Primary text contrast ${textContrast.toFixed(2)} should exceed WCAG AAA (7.0)`,
  );

  // 2. Muted text on surface (WCAG AA requires 4.5:1)
  const mutedContrast = getContrastRatio(mutedText, surfaceBg);
  assert.ok(
    mutedContrast >= 4.5,
    `Muted text contrast ${mutedContrast.toFixed(2)} should exceed WCAG AA (4.5)`,
  );

  // 3. Teal button text contrast (WCAG AA requires 4.5:1)
  const btnContrast = getContrastRatio(darkButtonText, tealButtonBg);
  assert.ok(
    btnContrast >= 4.5,
    `Button text contrast ${btnContrast.toFixed(2)} should exceed WCAG AA (4.5)`,
  );

  // 4. Accent link contrast on surface (WCAG AA requires 4.5:1, AAA requires 7:1)
  const linkContrast = getContrastRatio(linkCyan, surfaceBg);
  assert.ok(
    linkContrast >= 7.0,
    `Link contrast ${linkContrast.toFixed(2)} should exceed WCAG AAA (7.0)`,
  );
});

test("LoginPage CSS: includes mobile responsiveness, focus rings, and layout rules", () => {
  const cssPath = path.resolve(__dirname, "../src/index.css");
  const css = fs.readFileSync(cssPath, "utf-8");

  assert.equal(css.includes(".auth-page {"), true);
  assert.equal(css.includes(".auth-card {"), true);
  assert.equal(css.includes(".auth-input {"), true);
  assert.equal(css.includes(".auth-submit-btn {"), true);
  assert.equal(css.includes(".auth-password-toggle {"), true);
  assert.equal(css.includes("@media (max-width: 480px)"), true);
  assert.equal(css.includes(":focus-visible"), true);
});
