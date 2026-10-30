import test from "node:test";
import assert from "node:assert/strict";
import { sampleSchemes } from "../src/data/schemes";

test("schemes copy: does not contain run-together word 'quadpods'", () => {
  const json = JSON.stringify(sampleSchemes);
  assert.equal(
    /quadpods/i.test(json),
    false,
    "Expected 'quadpods' to be written as 'quad pods' with a space",
  );
  assert.ok(
    /quad pods/i.test(json),
    "Expected 'quad pods' to be present in schemes data",
  );
});

test("schemes copy: does not contain spelling typo 'dependant' or 'Dependant'", () => {
  const json = JSON.stringify(sampleSchemes);
  assert.equal(
    /dependant/i.test(json),
    false,
    "Expected 'dependant' / 'Dependant' typos to be corrected to 'dependent' / 'Dependent'",
  );
  assert.ok(
    /dependent/i.test(json),
    "Expected 'dependent' to be present in schemes data",
  );
});
