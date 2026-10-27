import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";

const unauthorizedBody = {
  success: false,
  code: "AUTH_REQUIRED",
  message: "Sign in to use hospital analytics.",
};

test("analytics endpoints reject unauthenticated requests", async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

  const [{ default: scenarioRouter }, { default: intelligenceRouter }] =
    await Promise.all([
      import("../src/routes/scenario.js"),
      import("../src/routes/intelligence.js"),
    ]);

  const app = express();

  app.use(express.json());
  app.use(scenarioRouter);
  app.use(intelligenceRouter);

  const server = app.listen(0, "127.0.0.1");

  await once(server, "listening");

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const scenarioResponse = await fetch(
      `${baseUrl}/api/scenarios/simulate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scenarioId: 3 }),
      },
    );

    assert.equal(scenarioResponse.status, 401);
    assert.deepEqual(await scenarioResponse.json(), unauthorizedBody);

    const intelligenceResponse = await fetch(
      `${baseUrl}/api/intelligence/summary`,
    );

    assert.equal(intelligenceResponse.status, 401);
    assert.deepEqual(await intelligenceResponse.json(), unauthorizedBody);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});
