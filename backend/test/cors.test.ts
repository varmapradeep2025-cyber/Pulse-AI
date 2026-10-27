import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FRONTEND_ORIGINS,
  isFrontendOriginAllowed,
  parseFrontendOrigins,
} from "../src/config/cors.js";

test("frontend origins default to the local Vite server", () => {
  assert.deepEqual(parseFrontendOrigins(undefined), [
    ...DEFAULT_FRONTEND_ORIGINS,
  ]);
  assert.deepEqual(parseFrontendOrigins(""), [...DEFAULT_FRONTEND_ORIGINS]);
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
