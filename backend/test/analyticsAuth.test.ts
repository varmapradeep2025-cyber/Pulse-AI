import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { createAnalyticsAuth } from "../src/middleware/analyticsAuth.js";

function createResponse() {
  const state: {
    statusCode: number;
    body: unknown;
  } = {
    statusCode: 200,
    body: undefined,
  };

  const response = {
    status(code: number) {
      state.statusCode = code;
      return response;
    },
    json(body: unknown) {
      state.body = body;
      return response;
    },
  };

  return {
    response: response as unknown as Response,
    state,
  };
}

test("rejects analytics requests without a bearer token", async () => {
  let verifierCalled = false;
  let nextCalled = false;

  const auth = createAnalyticsAuth(async () => {
    verifierCalled = true;
    return "user-1";
  });

  const { response, state } = createResponse();

  await auth(
    { headers: {} } as Request,
    response,
    (() => {
      nextCalled = true;
    }) as never,
  );

  assert.equal(verifierCalled, false);
  assert.equal(nextCalled, false);
  assert.equal(state.statusCode, 401);
  assert.deepEqual(state.body, {
    success: false,
    code: "AUTH_REQUIRED",
    message: "Sign in to use hospital analytics.",
  });
});

test("rejects an invalid or expired session", async () => {
  let nextCalled = false;
  const auth = createAnalyticsAuth(async () => null);
  const { response, state } = createResponse();

  await auth(
    { headers: { authorization: "Bearer expired-token" } } as Request,
    response,
    (() => {
      nextCalled = true;
    }) as never,
  );

  assert.equal(nextCalled, false);
  assert.equal(state.statusCode, 401);
  assert.deepEqual(state.body, {
    success: false,
    code: "INVALID_SESSION",
    message: "Your session is invalid or has expired. Sign in again.",
  });
});

test("passes valid sessions through with the bearer token", async () => {
  let receivedToken = "";
  let nextCalled = false;
  const auth = createAnalyticsAuth(async (token) => {
    receivedToken = token;
    return "user-1";
  });
  const { response, state } = createResponse();

  await auth(
    { headers: { authorization: "Bearer valid-token" } } as Request,
    response,
    (() => {
      nextCalled = true;
    }) as never,
  );

  assert.equal(receivedToken, "valid-token");
  assert.equal(nextCalled, true);
  assert.equal(state.statusCode, 200);
});

test("surfaces authentication outages as a safe 503", async (t) => {
  t.mock.method(console, "error", () => {});

  let nextCalled = false;
  const auth = createAnalyticsAuth(async () => {
    throw new Error("auth service unavailable");
  });
  const { response, state } = createResponse();

  await auth(
    { headers: { authorization: "Bearer valid-token" } } as Request,
    response,
    (() => {
      nextCalled = true;
    }) as never,
  );

  assert.equal(nextCalled, false);
  assert.equal(state.statusCode, 503);
  assert.deepEqual(state.body, {
    success: false,
    code: "AUTH_UNAVAILABLE",
    message: "Authentication is temporarily unavailable. Try again shortly.",
  });
});
