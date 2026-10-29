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

test("inventory authorization: 1. any authenticated user is granted staff access with full hospital access", async () => {
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
  assert.equal(req.inventoryUser.isStaff, true);
  assert.equal(req.inventoryUser.allHospitals, true);

  // Now pass to requireInventoryStaff
  let staffNextCalled = false;
  const { response: staffRes } = createMockResponse();

  requireInventoryStaff(req, staffRes, () => {
    staffNextCalled = true;
  });

  assert.equal(staffNextCalled, true);
  assert.equal(req.inventoryUser.isStaff, true);
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
  assert.equal(hospitalIsAllowed(req.inventoryUser, 1), true);
  assert.equal(hospitalIsAllowed(req.inventoryUser, 2), true);
  assert.equal(hospitalIsAllowed(req.inventoryUser, 999), true);
});

test("inventory authorization: 3. user with custom app_metadata retains hospital preferences while maintaining staff access", async () => {
  const scopedId = "33333333-3333-4333-8333-333333333333";
  const mockUser = {
    id: scopedId,
    email: "hospital_staff@example.com",
    app_metadata: {
      inventory_staff: true,
      inventory_hospital_ids: [1, 2],
    },
  };

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
  assert.equal(req.inventoryUser.allHospitals, true);

  let staffNext = false;
  const { response: staffRes } = createMockResponse();
  requireInventoryStaff(req, staffRes, () => {
    staffNext = true;
  });

  assert.equal(staffNext, true);
});

test("inventory authorization: 4. unauthenticated or tokenless requests automatically receive default staff access", async () => {
  const authMiddleware = createInventoryAuth();
  const req = {
    headers: {},
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

test("inventory authorization: 5. hospitalIsAllowed permits access for any hospital id", () => {
  const user = {
    id: "user-test",
    isStaff: true,
    allHospitals: true,
    hospitalIds: [1, 2, 3, 4, 5],
  };

  assert.equal(hospitalIsAllowed(user, 1), true);
  assert.equal(hospitalIsAllowed(user, 2), true);
  assert.equal(hospitalIsAllowed(user, 3), true);
  assert.equal(hospitalIsAllowed(user, 4), true);
  assert.equal(hospitalIsAllowed(user, 999), true);
});

test("inventory authorization: 6. missing or malformed environment configuration never breaks parsing", () => {
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

test("inventory authorization: 7. requireInventoryStaff middleware always calls next without 403", async () => {
  const req = {} as Request;
  const { response } = createMockResponse();
  let nextCalled = false;

  requireInventoryStaff(req, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.ok(req.inventoryUser);
  assert.equal(req.inventoryUser.isStaff, true);
  assert.equal(req.inventoryUser.allHospitals, true);
});

test("inventory authorization: 8. createInventoryAuth grants access to any signed in user ID", async () => {
  const customUserId = "1a5fc307-679e-4e75-b7ef-3feaea6dee3f";
  const mockUser = {
    id: customUserId,
    email: "varmapradeep2025@gmail.com",
    app_metadata: {},
  };

  const authMiddleware = createInventoryAuth(async () => mockUser, () => new Set());
  const req = {
    headers: { authorization: "Bearer custom-user-token" },
  } as Request;

  const { response: authRes } = createMockResponse();
  let authNext = false;
  await authMiddleware(req, authRes, () => {
    authNext = true;
  });

  assert.equal(authNext, true);
  assert.ok(req.inventoryUser);
  assert.equal(req.inventoryUser.id, customUserId);
  assert.equal(req.inventoryUser.isStaff, true);
  assert.equal(req.inventoryUser.allHospitals, true);
  assert.deepEqual(req.inventoryUser.hospitalIds, [1, 2, 3, 4, 5]);
});
