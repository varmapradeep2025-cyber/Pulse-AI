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

test("inventory security: 1. unauthenticated requests without a bearer token are rejected with 401 AUTH_REQUIRED", async () => {
  const authMiddleware = createInventoryAuth(async () => null, () => new Set());
  const req = {
    headers: {},
  } as Request;

  const { response, state } = createMockResponse();
  let nextCalled = false;

  await authMiddleware(req, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(state.statusCode, 401);
  assert.deepEqual(state.body, {
    success: false,
    code: "AUTH_REQUIRED",
    message: "Sign in to use hospital inventory.",
  });
});

test("inventory security: 2. empty or non-bearer authorization headers are rejected with 401", async () => {
  const authMiddleware = createInventoryAuth(async () => null, () => new Set());
  const req = {
    headers: { authorization: "Basic dXNlcjpwYXNz" },
  } as Request;

  const { response, state } = createMockResponse();
  let nextCalled = false;

  await authMiddleware(req, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(state.statusCode, 401);
  assert.equal((state.body as { code: string }).code, "AUTH_REQUIRED");
});

test("inventory security: 3. invalid or expired tokens are rejected with 401 INVALID_SESSION", async () => {
  const authMiddleware = createInventoryAuth(async () => null, () => new Set());
  const req = {
    headers: { authorization: "Bearer expired-or-invalid-token" },
  } as Request;

  const { response, state } = createMockResponse();
  let nextCalled = false;

  await authMiddleware(req, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(state.statusCode, 401);
  assert.deepEqual(state.body, {
    success: false,
    code: "INVALID_SESSION",
    message: "Your session is invalid or has expired. Sign in again.",
  });
});

test("inventory security: 4. authenticated non-staff users are rejected by requireInventoryStaff with 403", async () => {
  const citizenId = "citizen-1111-2222-3333-444455556666";
  const mockUser = {
    id: citizenId,
    email: "citizen@example.com",
    app_metadata: {},
    user_metadata: {},
  };

  const authMiddleware = createInventoryAuth(async () => mockUser, () => new Set());
  const req = {
    headers: { authorization: "Bearer valid-citizen-token" },
  } as Request;

  const { response: authRes } = createMockResponse();
  let authNext = false;
  await authMiddleware(req, authRes, () => {
    authNext = true;
  });

  assert.equal(authNext, true);
  assert.ok(req.inventoryUser);
  assert.equal(req.inventoryUser.isStaff, false);

  // Now pass to requireInventoryStaff: must be rejected with 403
  const { response: staffRes, state: staffState } = createMockResponse();
  let staffNext = false;
  requireInventoryStaff(req, staffRes, () => {
    staffNext = true;
  });

  assert.equal(staffNext, false);
  assert.equal(staffState.statusCode, 403);
  assert.deepEqual(staffState.body, {
    success: false,
    code: "STAFF_ACCESS_REQUIRED",
    message: "Staff inventory access is not configured for this account. Ask an administrator to assign an inventory staff role.",
  });
});

test("inventory security: 5. user authorized through INVENTORY_STAFF_USER_IDS gets staff access", async () => {
  const staffId = "staff-user-9999-8888-7777-666655554444";
  const mockUser = {
    id: staffId,
    email: "ops-lead@pulse.ai",
    app_metadata: {},
    user_metadata: {},
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

  const { response: staffRes } = createMockResponse();
  let staffNext = false;
  requireInventoryStaff(req, staffRes, () => {
    staffNext = true;
  });
  assert.equal(staffNext, true);
});

test("inventory security: 6. hospital isolation: Hospital 1 staff cannot access Hospital 2 records", async () => {
  const hospital1StaffId = "hospital1-staff-id";
  const mockUser = {
    id: hospital1StaffId,
    email: "hospital1_nurse@example.com",
    app_metadata: {
      role: "inventory_staff",
      inventory_hospital_ids: [1],
    },
    user_metadata: {},
  };

  const authMiddleware = createInventoryAuth(async () => mockUser, () => new Set());
  const req = {
    headers: { authorization: "Bearer valid-hospital1-token" },
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
  assert.deepEqual(req.inventoryUser.hospitalIds, [1]);

  // Tenant isolation checks
  assert.equal(hospitalIsAllowed(req.inventoryUser, 1), true);
  assert.equal(hospitalIsAllowed(req.inventoryUser, 2), false);
  assert.equal(hospitalIsAllowed(req.inventoryUser, 3), false);
  assert.equal(hospitalIsAllowed(req.inventoryUser, 4), false);
  assert.equal(hospitalIsAllowed(req.inventoryUser, 5), false);
});

test("inventory security: 7. privilege escalation: user attempting to put role in user_metadata is rejected", async () => {
  const attackerId = "attacker-user-id";
  const maliciousUser = {
    id: attackerId,
    email: "attacker@example.com",
    app_metadata: { provider: "email" },
    // Attacker attempted to set self-service role in user_metadata (which clients can update directly)
    user_metadata: {
      role: "inventory_admin",
      inventory_staff: true,
      inventory_all_hospitals: true,
    },
  };

  const authMiddleware = createInventoryAuth(async () => maliciousUser, () => new Set());
  const req = {
    headers: { authorization: "Bearer attacker-token" },
  } as Request;

  const { response: authRes } = createMockResponse();
  await authMiddleware(req, authRes, () => {});

  assert.ok(req.inventoryUser);
  // Privileged claims must ONLY be read from server-controlled app_metadata, never user_metadata
  assert.equal(req.inventoryUser.isStaff, false);
  assert.equal(req.inventoryUser.allHospitals, false);

  const { response: staffRes, state: staffState } = createMockResponse();
  let staffNext = false;
  requireInventoryStaff(req, staffRes, () => {
    staffNext = true;
  });

  assert.equal(staffNext, false);
  assert.equal(staffState.statusCode, 403);
});

test("inventory security: 8. administrator with admin role has global access across all hospitals", async () => {
  const adminId = "admin-user-id";
  const adminUser = {
    id: adminId,
    email: "admin@pulse.ai",
    app_metadata: {
      role: "admin",
    },
    user_metadata: {},
  };

  const authMiddleware = createInventoryAuth(async () => adminUser, () => new Set());
  const req = {
    headers: { authorization: "Bearer admin-token" },
  } as Request;

  const { response: authRes } = createMockResponse();
  await authMiddleware(req, authRes, () => {});

  assert.ok(req.inventoryUser);
  assert.equal(req.inventoryUser.isStaff, true);
  assert.equal(req.inventoryUser.allHospitals, true);

  assert.equal(hospitalIsAllowed(req.inventoryUser, 1), true);
  assert.equal(hospitalIsAllowed(req.inventoryUser, 2), true);
  assert.equal(hospitalIsAllowed(req.inventoryUser, 3), true);
});

test("inventory security: 9. missing or malformed environment configuration never breaks parsing", () => {
  assert.deepEqual([...parseInventoryStaffIds("")], []);
  assert.deepEqual([...parseInventoryStaffIds("   \t \n  ")], []);
  assert.deepEqual([...parseInventoryStaffIds(",,;; \n,")], []);
  assert.deepEqual([...parseInventoryStaffIds(undefined)], []);

  const parsed = parseInventoryStaffIds("uuid-1, uuid-2; uuid-3\n uuid-4");
  assert.equal(parsed.size, 4);
  assert.equal(parsed.has("uuid-1"), true);
  assert.equal(parsed.has("uuid-2"), true);
  assert.equal(parsed.has("uuid-3"), true);
  assert.equal(parsed.has("uuid-4"), true);
});

test("inventory security: 10. authentication outages surface as safe 503 AUTH_UNAVAILABLE", async (t) => {
  t.mock.method(console, "error", () => {});

  const authMiddleware = createInventoryAuth(async () => {
    throw new Error("Supabase auth connection timeout");
  }, () => new Set());

  const req = {
    headers: { authorization: "Bearer valid-token" },
  } as Request;

  const { response, state } = createMockResponse();
  let nextCalled = false;

  await authMiddleware(req, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(state.statusCode, 503);
  assert.deepEqual(state.body, {
    success: false,
    code: "AUTH_UNAVAILABLE",
    message: "Authentication is temporarily unavailable. Try again shortly.",
  });
});
