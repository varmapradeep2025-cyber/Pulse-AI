import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";

test("background worker authentication & timing-safe secret validation", async () => {
  const originalCronSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "super-secret-cron-key-12345";
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

  const { default: notificationRouter } = await import(
    "../src/routes/notifications.js"
  );

  const app = express();
  app.use(express.json());
  app.use("/api/notifications", notificationRouter);

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}/api/notifications`;

  try {
    // 1. Worker request with VALID cron secret (no JWT required)
    const validCronRes = await fetch(`${baseUrl}/process-worker`, {
      method: "POST",
      headers: {
        "x-cron-key": "super-secret-cron-key-12345",
      },
    });
    assert.equal(validCronRes.status, 200);
    const validJson = await validCronRes.json();
    assert.equal(validJson.success, true);

    // 2. Worker request with INVALID cron secret (should reject with 403)
    const invalidCronRes = await fetch(`${baseUrl}/process-worker`, {
      method: "POST",
      headers: {
        "x-cron-key": "wrong-secret-key",
      },
    });
    assert.equal(invalidCronRes.status, 403);
    const invalidJson = await invalidCronRes.json();
    assert.equal(invalidJson.code, "INVALID_CRON_SECRET");

    // 3. Worker request with wrong length secret (timing safe check doesn't throw)
    const wrongLenRes = await fetch(`${baseUrl}/process-worker`, {
      method: "POST",
      headers: {
        "x-cron-key": "short",
      },
    });
    assert.equal(wrongLenRes.status, 403);

    // 4. Worker request with MISSING cron secret and NO Bearer token (rejects with 401)
    const missingBothRes = await fetch(`${baseUrl}/process-worker`, {
      method: "POST",
    });
    assert.equal(missingBothRes.status, 401);
    const missingJson = await missingBothRes.json();
    assert.equal(missingJson.code, "AUTH_REQUIRED");

    // 5. Ordinary notifications endpoint without JWT is rejected with 401
    const ordinaryNoAuthRes = await fetch(baseUrl);
    assert.equal(ordinaryNoAuthRes.status, 401);
  } finally {
    process.env.CRON_SECRET = originalCronSecret;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
