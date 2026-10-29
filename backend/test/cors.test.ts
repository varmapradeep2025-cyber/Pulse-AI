import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FRONTEND_ORIGINS,
  createCorsOptions,
  isFrontendOriginAllowed,
  parseFrontendOrigins,
} from "../src/config/cors.js";

test("frontend origins default to the local Vite server", () => {
  assert.deepEqual(parseFrontendOrigins(undefined), [
    ...DEFAULT_FRONTEND_ORIGINS,
  ]);
  assert.deepEqual(parseFrontendOrigins(""), [...DEFAULT_FRONTEND_ORIGINS]);
});

test("default origins include both localhost and 127.0.0.1 loopback", () => {
  assert.ok(
    DEFAULT_FRONTEND_ORIGINS.includes("http://localhost:5173"),
    "must include http://localhost:5173",
  );
  assert.ok(
    DEFAULT_FRONTEND_ORIGINS.includes("http://127.0.0.1:5173"),
    "must include http://127.0.0.1:5173 for IPv4 loopback browsers",
  );
});

test("frontend origins are trimmed, deduplicated, and configurable", () => {
  assert.deepEqual(
    parseFrontendOrigins(
      " https://pulse.example, http://localhost:5173 ,https://pulse.example ",
    ),
    ["https://pulse.example", "http://localhost:5173"],
  );
});

test("wildcard CORS origins are rejected", () => {
  assert.throws(() => parseFrontendOrigins("*"), /wildcards are not allowed/);
  assert.throws(
    () => parseFrontendOrigins("https://pulse.example,*"),
    /wildcards are not allowed/,
  );
});

test("only configured browser origins are allowed", () => {
  const allowed = ["https://pulse.example"];

  assert.equal(isFrontendOriginAllowed(undefined, allowed), true);
  assert.equal(isFrontendOriginAllowed("https://pulse.example", allowed), true);
  assert.equal(isFrontendOriginAllowed("https://evil.example", allowed), false);
});

test("CORS allowed methods include PATCH, PUT, and DELETE", () => {
  const options = createCorsOptions(["http://localhost:5173"]);
  const methods = options.methods as string[];
  assert.ok(methods.includes("PATCH"), "PATCH must be in allowed methods");
  assert.ok(methods.includes("PUT"), "PUT must be in allowed methods");
  assert.ok(methods.includes("DELETE"), "DELETE must be in allowed methods");
  assert.ok(methods.includes("GET"), "GET must be in allowed methods");
  assert.ok(methods.includes("POST"), "POST must be in allowed methods");
  assert.ok(methods.includes("OPTIONS"), "OPTIONS must be in allowed methods");
});
