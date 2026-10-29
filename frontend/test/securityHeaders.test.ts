import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vercelConfigPath = path.resolve(__dirname, "../vercel.json");

test("ArgosX Security Headers: vercel.json exists and is valid JSON", () => {
  assert.ok(fs.existsSync(vercelConfigPath), "frontend/vercel.json must exist");
  const raw = fs.readFileSync(vercelConfigPath, "utf8");
  const parsed = JSON.parse(raw);
  assert.ok(parsed, "vercel.json must be valid JSON");
});

test("ArgosX Security Headers: all 5 required security headers are configured", () => {
  const config = JSON.parse(fs.readFileSync(vercelConfigPath, "utf8"));
  assert.ok(Array.isArray(config.headers), "headers array must be configured");

  const catchAllRoute = config.headers.find(
    (entry: { source: string }) => entry.source === "/(.*)" || entry.source === "/:path*",
  );
  assert.ok(catchAllRoute, "catch-all header rule must be present");

  const headerMap = new Map<string, string>();
  for (const h of catchAllRoute.headers) {
    headerMap.set(h.key.toLowerCase(), h.value);
  }

  // 1. X-Frame-Options
  assert.equal(
    headerMap.get("x-frame-options"),
    "DENY",
    "X-Frame-Options must be DENY",
  );

  // 2. X-Content-Type-Options
  assert.equal(
    headerMap.get("x-content-type-options"),
    "nosniff",
    "X-Content-Type-Options must be nosniff",
  );

  // 3. Referrer-Policy
  assert.equal(
    headerMap.get("referrer-policy"),
    "strict-origin-when-cross-origin",
    "Referrer-Policy must be strict-origin-when-cross-origin",
  );

  // 4. Permissions-Policy
  const permissionsPolicy = headerMap.get("permissions-policy") ?? "";
  assert.ok(
    permissionsPolicy.includes("geolocation=()"),
    "Permissions-Policy must restrict geolocation",
  );
  assert.ok(
    permissionsPolicy.includes("camera=()"),
    "Permissions-Policy must restrict camera",
  );
  assert.ok(
    permissionsPolicy.includes("microphone=(self)"),
    "Permissions-Policy must allow microphone on self for voice assistant",
  );

  // 5. Content-Security-Policy
  const csp = headerMap.get("content-security-policy") ?? "";
  assert.ok(csp.includes("default-src 'self'"), "CSP must include default-src 'self'");
  assert.ok(csp.includes("script-src 'self'"), "CSP must restrict scripts to self");
  assert.ok(csp.includes("style-src 'self' 'unsafe-inline'"), "CSP must permit safe inline styles for React");
  assert.ok(csp.includes("object-src 'none'"), "CSP must block plugin objects");
  assert.ok(csp.includes("frame-ancestors 'none'"), "CSP must prevent embedding (clickjacking defense)");
  assert.ok(csp.includes("base-uri 'self'"), "CSP must restrict base-uri to self");
  assert.ok(csp.includes("https://*.supabase.co"), "CSP connect-src must allow Supabase API");
  assert.ok(csp.includes("wss://*.supabase.co"), "CSP connect-src must allow Supabase Realtime");
  assert.ok(csp.includes("https://*.onrender.com"), "CSP connect-src must allow Render backend API");
});

test("ArgosX Security Headers: SPA rewrites are preserved", () => {
  const config = JSON.parse(fs.readFileSync(vercelConfigPath, "utf8"));
  assert.ok(Array.isArray(config.rewrites), "rewrites array must be present");

  const spaRewrite = config.rewrites.find(
    (entry: { source: string; destination: string }) =>
      entry.source === "/(.*)" && entry.destination === "/index.html",
  );
  assert.ok(spaRewrite, "SPA catch-all rewrite to /index.html must be preserved");
});
