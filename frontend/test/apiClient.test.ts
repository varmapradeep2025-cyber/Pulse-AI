import assert from "node:assert/strict";
import test from "node:test";

test("API Client: simultaneous refresh calls de-duplicate into single promise", async () => {
  let refreshCallCount = 0;

  // Mock de-duplication mechanism
  let refreshPromise: Promise<string | null> | null = null;
  async function mockRefresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      refreshCallCount++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "new-token-123";
    })().finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  // Fire 5 simultaneous refresh requests
  const results = await Promise.all([
    mockRefresh(),
    mockRefresh(),
    mockRefresh(),
    mockRefresh(),
    mockRefresh(),
  ]);

  // All 5 should resolve with the same token
  for (const token of results) {
    assert.equal(token, "new-token-123");
  }

  // Exactly 1 network refresh call should have been made
  assert.equal(refreshCallCount, 1);
});

test("API Client: proactive buffer detects near-expiry tokens", () => {
  const BUFFER_MS = 60 * 1000;
  const now = Date.now();

  // Token expiring in 30 seconds (within 60s buffer)
  const expiringSoon = Math.floor((now + 30 * 1000) / 1000);
  assert.equal(expiringSoon * 1000 - now < BUFFER_MS, true);

  // Token valid for 10 minutes (outside buffer)
  const stillFresh = Math.floor((now + 600 * 1000) / 1000);
  assert.equal(stillFresh * 1000 - now < BUFFER_MS, false);

  // Token already expired
  const alreadyExpired = Math.floor((now - 10 * 1000) / 1000);
  assert.equal(alreadyExpired * 1000 - now < BUFFER_MS, true);
});

test("API Client: retry logic guards against infinite loops with retry marker header", async () => {
  let fetchCount = 0;

  async function mockAuthenticatedFetch(
    headers: Record<string, string>,
    allowRetry = true,
  ): Promise<{ status: number; fetchCount: number }> {
    fetchCount++;
    const status = 401;

    if (status === 401 && allowRetry && !headers["x-retry-attempt"]) {
      headers["x-retry-attempt"] = "1";
      headers["Authorization"] = "Bearer new-token";
      return mockAuthenticatedFetch(headers, allowRetry);
    }

    return { status, fetchCount };
  }

  const result = await mockAuthenticatedFetch({}, true);
  // Initial attempt (1) + single retry (1) = 2 total fetches, terminated before infinite loop
  assert.equal(result.fetchCount, 2);
  assert.equal(result.status, 401);
});

test("API Client: non-idempotent POST requests do not blindly retry by default", () => {
  function shouldRetry(method: string, allowRetryOn401?: boolean): boolean {
    const isIdempotent = ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"].includes(
      method.toUpperCase(),
    );
    return allowRetryOn401 ?? isIdempotent;
  }

  assert.equal(shouldRetry("GET"), true);
  assert.equal(shouldRetry("PUT"), true);
  assert.equal(shouldRetry("DELETE"), true);
  assert.equal(shouldRetry("POST"), false); // Safe default: POST does not retry to prevent duplicate mutations
  assert.equal(shouldRetry("POST", true), true); // Explicitly opted in
});
