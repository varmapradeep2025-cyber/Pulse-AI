import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "mock-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "mock-service-role-key";

const {
  createInventoryAuth,
  requireInventoryStaff,
  getAllowedInventoryStaffIds,
} = await import("../src/middleware/inventoryAuth.js");

const {
  hasInventoryHospitalScope,
  hospitalIsAllowed,
  parseHospitalIds,
  parseInventoryStaffIds,
  resolveInventoryUser,
} = await import("../src/services/inventoryAccess.js");

function createMockResponse() {
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

test("inventory authorization: 1. authenticated but unauthorized user is rejected with 403", async () => {
  const mockUser = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "regular@example.com",
    app_metadata: { provider: "email" },
  };

  const authMiddleware = createInventoryAuth(async () => mockUser, () => new Set());
  const req = {
    headers: { authorization: "Bearer valid-token" },
  } as Request;

  const { response: authRes } = createMockResponse();
  let nextCalled = false;

  await authMiddleware(req, authRes, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.ok(req.inventoryUser);
  assert.equal(req.inventoryUser.isStaff, false);

  // Now pass to requireInventoryStaff
  let staffNextCalled = false;
  const { response: staffRes, state: staffState } = createMockResponse();

  requireInventoryStaff(req, staffRes, () => {
    staffNextCalled = true;
  });

  assert.equal(staffNextCalled, false);
  assert.equal(staffState.statusCode, 403);
  assert.deepEqual(staffState.body, {
    success: false,
    code: "INVENTORY_STAFF_ACCESS_REQUIRED",
    message:
      "Inventory staff access is not configured for this account. Ask an administrator to assign the inventory staff role.",
    details: {
      userId: "11111111-1111-4111-8111-111111111111",
      reason:
        "User ID is not present in INVENTORY_STAFF_USER_IDS and lacks app_metadata.inventory_staff role.",
    },
  });
});

test("inventory authorization: 2. user authorized through INVENTORY_STAFF_USER_IDS gets full hospital access", async () => {
  const staffId = "22222222-2222-4222-8222-222222222222";
  const mockUser = {
    id: staffId,
    email: "admin@example.com",
    app_metadata: { provider: "email" },
  };

  const allowedIds = new Set([staffId]);
  const authMiddleware = createInventoryAuth(async () => mockUser, () => allowedIds);

  const req = {
    headers: { authorization: "Bearer valid-staff-token" },
  } as Request;

  const { response: authRes } = createMockResponse();
  let authNext = false;
  await authMiddleware(req, authRes, () => {
    authNext = true;
  });

  assert.equal(authNext, true);
  assert.ok(req.inventoryUser);
  assert.equal(req.inventoryUser.isStaff, true);
  assert.equal(req.inventoryUser.allHospitals, true);

  // Verify requireInventoryStaff allows request through
  let staffNext = false;
  const { response: staffRes } = createMockResponse();
  requireInventoryStaff(req, staffRes, () => {
    staffNext = true;
  });

  assert.equal(staffNext, true);
  // Full hospital access permits any hospital id
  assert.equal(hospitalIsAllowed(req.inventoryUser, 1), true);
  assert.equal(hospitalIsAllowed(req.inventoryUser, 2), true);
  assert.equal(hospitalIsAllowed(req.inventoryUser, 999), true);
});

test("inventory authorization: 3. user authorized through trusted app_metadata is scoped to assigned hospitals", async () => {
  const scopedId = "33333333-3333-4333-8333-333333333333";
  const mockUser = {
    id: scopedId,
    email: "hospital_staff@example.com",
    app_metadata: {
      inventory_staff: true,
      inventory_hospital_ids: [1, 2],
    },
  };

  // Not in environment allowed IDs
  const authMiddleware = createInventoryAuth(async () => mockUser, () => new Set());
  const req = {
    headers: { authorization: "Bearer valid-scoped-token" },
  } as Request;

  const { response: authRes } = createMockResponse();
  let authNext = false;
  await authMiddleware(req, authRes, () => {
    authNext = true;
  });

  assert.equal(authNext, true);
  assert.ok(req.inventoryUser);
  assert.equal(req.inventoryUser.isStaff, true);
  assert.equal(req.inventoryUser.allHospitals, false);
  assert.deepEqual(req.inventoryUser.hospitalIds, [1, 2]);

  let staffNext = false;
  const { response: staffRes } = createMockResponse();
  requireInventoryStaff(req, staffRes, () => {
    staffNext = true;
  });

  assert.equal(staffNext, true);
});

test("inventory authorization: 4. user with no valid hospital assignment is rejected with 403", async () => {
  const staffIdNoHospitals = "44444444-4444-4444-8444-444444444444";
  const mockUser = {
    id: staffIdNoHospitals,
    email: "unscoped_staff@example.com",
    app_metadata: {
      inventory_staff: true,
      inventory_hospital_ids: ["invalid", -10], // no valid positive integer IDs
    },
  };

  const authMiddleware = createInventoryAuth(async () => mockUser, () => new Set());
  const req = {
    headers: { authorization: "Bearer valid-token" },
  } as Request;

  const { response: authRes } = createMockResponse();
  await authMiddleware(req, authRes, () => {});

  assert.ok(req.inventoryUser);
  assert.equal(req.inventoryUser.isStaff, true);
  assert.equal(req.inventoryUser.allHospitals, false);
  assert.equal(hasInventoryHospitalScope(req.inventoryUser), false);

  const { response: staffRes, state: staffState } = createMockResponse();
  let staffNext = false;
  requireInventoryStaff(req, staffRes, () => {
    staffNext = true;
  });

  assert.equal(staffNext, false);
  assert.equal(staffState.statusCode, 403);
  assert.deepEqual(staffState.body, {
    success: false,
    code: "INVENTORY_HOSPITAL_SCOPE_REQUIRED",
    message:
      "Inventory hospital access is not configured for this account. Ask an administrator to assign one or more hospital IDs.",
    details: {
      userId: staffIdNoHospitals,
      reason:
        "User has staff role but lacks app_metadata.inventory_hospital_ids assignment.",
    },
  });
});

test("inventory authorization: 5. scoped user cannot access unauthorized hospital", () => {
  const scopedUser = resolveInventoryUser(
    {
      sub: "user-scoped",
      app_metadata: {
        inventory_staff: true,
        inventory_hospital_ids: [1, 2],
      },
    },
    new Set(),
  );

  assert.ok(scopedUser);
  assert.equal(hospitalIsAllowed(scopedUser, 1), true);
  assert.equal(hospitalIsAllowed(scopedUser, 2), true);
  assert.equal(hospitalIsAllowed(scopedUser, 3), false);
  assert.equal(hospitalIsAllowed(scopedUser, 4), false);
});

test("inventory authorization: 6. missing or malformed environment configuration never grants access", () => {
  // Empty, whitespace, or delimiters only
  assert.deepEqual([...parseInventoryStaffIds("")], []);
  assert.deepEqual([...parseInventoryStaffIds("   \t \n  ")], []);
  assert.deepEqual([...parseInventoryStaffIds(",,;; \n,")], []);
  assert.deepEqual([...parseInventoryStaffIds(undefined)], []);

  // Multi-delimiter parsing
  const parsed = parseInventoryStaffIds("uuid-1, uuid-2; uuid-3\n uuid-4");
  assert.equal(parsed.size, 4);
  assert.equal(parsed.has("uuid-1"), true);
  assert.equal(parsed.has("uuid-2"), true);
  assert.equal(parsed.has("uuid-3"), true);
  assert.equal(parsed.has("uuid-4"), true);

  // An empty configuration never matches any real UUID
  const emptyAllowed = parseInventoryStaffIds("");
  assert.equal(emptyAllowed.has(""), false);
  assert.equal(emptyAllowed.has("900a1826-333e-4fc0-921a-04a57a76f4c6"), false);
});

test("inventory authorization: 7. rechecking access reflects updated authorization state without process restart", async () => {
  const dynamicUserId = "dynamic-user-123";
  let activeAllowedIds = new Set<string>();

  const mockUser = {
    id: dynamicUserId,
    email: "dynamic@example.com",
    app_metadata: {},
  };

  const authMiddleware = createInventoryAuth(
    async () => mockUser,
    () => activeAllowedIds,
  );

  // Step 1: User attempts access before being granted
  const req1 = { headers: { authorization: "Bearer token-1" } } as Request;
  const { response: res1 } = createMockResponse();
  await authMiddleware(req1, res1, () => {});

  const { response: staffRes1, state: staffState1 } = createMockResponse();
  let next1 = false;
  requireInventoryStaff(req1, staffRes1, () => {
    next1 = true;
  });

  assert.equal(next1, false);
  assert.equal(staffState1.statusCode, 403);
  assert.equal((staffState1.body as any)?.code, "INVENTORY_STAFF_ACCESS_REQUIRED");

  // Step 2: Administrator adds user to allowed list (simulating configuration update)
  activeAllowedIds = new Set([dynamicUserId]);

  // Step 3: User clicks "Check access again" -> next request immediately succeeds
  const req2 = { headers: { authorization: "Bearer token-2" } } as Request;
  const { response: res2 } = createMockResponse();
  let authNext2 = false;
  await authMiddleware(req2, res2, () => {
    authNext2 = true;
  });

  assert.equal(authNext2, true);
  const { response: staffRes2 } = createMockResponse();
  let staffNext2 = false;
  requireInventoryStaff(req2, staffRes2, () => {
    staffNext2 = true;
  });

  assert.equal(staffNext2, true);
  assert.equal(req2.inventoryUser?.isStaff, true);
});

test("inventory authorization: 8. untrusted user_metadata is strictly ignored", () => {
  const attackerClaims = {
    sub: "attacker-user-id",
    user_metadata: {
      inventory_staff: true,
      inventory_role: "inventory_admin",
      inventory_hospital_ids: [1, 2, 3],
      inventory_all_hospitals: true,
    },
    app_metadata: {
      provider: "email",
    },
  };

  const resolved = resolveInventoryUser(attackerClaims, new Set());
  assert.ok(resolved);
  assert.equal(resolved.isStaff, false);
  assert.equal(resolved.allHospitals, false);
  assert.deepEqual(resolved.hospitalIds, []);
});
