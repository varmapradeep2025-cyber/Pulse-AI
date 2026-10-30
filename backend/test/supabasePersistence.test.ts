import assert from "node:assert/strict";
import test from "node:test";
import {
  AppointmentPersistenceError,
  SupabaseAppointmentRepository,
  InMemoryAppointmentRepository,
} from "../src/repositories/appointmentRepository.js";
import {
  NotificationPersistenceError,
  SupabaseNotificationRepository,
  InMemoryNotificationRepository,
} from "../src/repositories/notificationRepository.js";
import {
  AppointmentError,
  AppointmentService,
  formatDigitalToken,
} from "../src/services/appointmentService.js";
import type { Appointment } from "../src/types/appointments.js";

/**
 * Creates a mock Supabase PostgREST client wired to an underlying in-memory SQL-like state.
 * Simulates real Supabase PostgreSQL behavior across multiple repository re-instantiations.
 */
function createSharedPostgresClient() {
  const tables = {
    appointments: new Map<string, Record<string, unknown>>(),
    appointment_events: [] as Record<string, unknown>[],
    queue_tokens: new Map<string, number>(),
    queue_daily_state: new Map<string, number>(),
    notification_preferences: new Map<string, Record<string, unknown>>(),
    notifications: new Map<string, Record<string, unknown>>(),
    push_subscriptions: new Map<string, Record<string, unknown>>(),
    scheduled_notifications: new Map<string, Record<string, unknown>>(),
    notification_delivery_attempts: [] as Record<string, unknown>[],
  };

  function createMockClient() {
    return {
      from(tableName: string) {
        if (!Object.prototype.hasOwnProperty.call(tables, tableName)) {
          const missingError = { code: "PGRST205", message: `Table ${tableName} not found in schema cache` };
          const errorChain: any = {
            eq: () => errorChain,
            in: () => errorChain,
            order: () => errorChain,
            limit: () => errorChain,
            select: () => errorChain,
            single: () => Promise.resolve({ data: null, error: missingError }),
            maybeSingle: () => Promise.resolve({ data: null, error: missingError }),
            then: (resolve: any) => resolve({ data: null, error: missingError }),
          };
          return {
            select: () => errorChain,
            insert: () => errorChain,
            update: () => errorChain,
            upsert: () => errorChain,
          };
        }

        return {
          select(columns = "*", options?: { count?: string; head?: boolean }) {
            const filters: { field: string; val: unknown }[] = [];
            let inFilter: { field: string; values: unknown[] } | null = null;

            const chain: any = {
              eq(field: string, val: unknown) {
                filters.push({ field, val });
                return chain;
              },
              in(field: string, values: unknown[]) {
                inFilter = { field, values };
                return chain;
              },
              order(_col: string, _opts?: { ascending?: boolean }) {
                return chain;
              },
              limit(_cnt: number) {
                return chain;
              },
              single() {
                return chain.then((res: any) => ({
                  data: res.data && res.data.length > 0 ? res.data[0] : null,
                  error: null,
                }));
              },
              maybeSingle() {
                return chain.then((res: any) => ({
                  data: res.data && res.data.length > 0 ? res.data[0] : null,
                  error: null,
                }));
              },
              then(resolve: any, reject: any) {
                try {
                  const targetTable = (tables as any)[tableName];
                  let rows: Record<string, unknown>[] = [];
                  if (targetTable instanceof Map) {
                    rows = Array.from(targetTable.values());
                  } else if (Array.isArray(targetTable)) {
                    rows = [...targetTable];
                  }

                  for (const f of filters) {
                    rows = rows.filter((r) => r[f.field] === f.val);
                  }
                  if (inFilter) {
                    rows = rows.filter((r) => inFilter!.values.includes(r[inFilter!.field]));
                  }

                  if (options?.head && options?.count === "exact") {
                    return resolve({ count: rows.length, data: null, error: null });
                  }

                  return resolve({ data: rows, count: rows.length, error: null });
                } catch (err) {
                  return reject ? reject(err) : Promise.reject(err);
                }
              },
            };
            return chain;
          },

          insert(recordOrRows: any) {
            const rows = Array.isArray(recordOrRows) ? recordOrRows : [recordOrRows];
            const targetTable = (tables as any)[tableName];
            for (const row of rows) {
              if (targetTable instanceof Map) {
                targetTable.set(row.id, { ...row });
              } else if (Array.isArray(targetTable)) {
                targetTable.push({ ...row });
              }
            }

            return {
              select: () => ({
                single: () => Promise.resolve({ data: rows[0], error: null }),
              }),
              then(resolve: any) {
                return resolve({ data: rows, error: null });
              },
            };
          },

          upsert(record: any) {
            const targetTable = (tables as any)[tableName];
            if (targetTable instanceof Map) {
              const key = tableName === "notification_preferences" ? record.user_id : record.id;
              targetTable.set(key, { ...record });
            }
            return {
              select: () => ({
                single: () => Promise.resolve({ data: record, error: null }),
              }),
              then(resolve: any) {
                return resolve({ data: [record], error: null });
              },
            };
          },

          update(updates: Record<string, unknown>) {
            const filters: { field: string; val: unknown }[] = [];

            const updateChain: any = {
              eq(idCol: string, idVal: unknown) {
                filters.push({ field: idCol, val: idVal });
                return updateChain;
              },
              select() {
                const getRow = () => {
                  const targetTable = (tables as any)[tableName];
                  let matched: any = null;
                  if (targetTable instanceof Map) {
                    for (const [k, v] of targetTable.entries()) {
                      const allMatch = filters.every((f) => v[f.field] === f.val);
                      if (allMatch) {
                        matched = { ...v, ...updates };
                        targetTable.set(k, matched);
                        break;
                      }
                    }
                  }
                  return Promise.resolve({ data: matched, error: null });
                };
                return {
                  single: getRow,
                  maybeSingle: getRow,
                  then: (resolve: any) => getRow().then(resolve),
                };
              },
              then(resolve: any) {
                const targetTable = (tables as any)[tableName];
                let count = 0;
                if (targetTable instanceof Map) {
                  for (const [k, v] of targetTable.entries()) {
                    const allMatch = filters.every((f) => v[f.field] === f.val);
                    if (allMatch) {
                      targetTable.set(k, { ...v, ...updates });
                      count++;
                    }
                  }
                }
                return resolve({ data: null, count, error: null });
              },
            };
            return updateChain;
          },
        };
      },

      rpc(fnName: string, params: Record<string, unknown>) {
        if (fnName === "allocate_queue_token") {
          const key = `${params.p_hospital_id}::${params.p_department_id}::${params.p_queue_date}`;
          const current = tables.queue_tokens.get(key) ?? 0;
          const next = current + 1;
          tables.queue_tokens.set(key, next);
          return Promise.resolve({ data: next, error: null });
        }
        if (fnName === "advance_serving_token") {
          const key = `${params.p_hospital_id}::${params.p_department_id}::${params.p_queue_date}`;
          const token = Number(params.p_token_number);
          tables.queue_daily_state.set(key, token);
          return Promise.resolve({ data: token, error: null });
        }
        return Promise.resolve({ data: null, error: { message: `Function ${fnName} not found` } });
      },
    };
  }

  return { tables, createMockClient };
}

test("Requirement 1: Creating and retrieving an appointment via Supabase repository", async () => {
  const shared = createSharedPostgresClient();
  const repo = new SupabaseAppointmentRepository(shared.createMockClient() as any);

  const sampleAppointment: Appointment = {
    id: "apt-uuid-1",
    reference: "APT-20261030-ABC001",
    userId: "user-patient-1",
    patientName: "Aarav Sharma",
    hospitalId: "H001",
    hospitalName: "District Hospital Central",
    departmentId: "general-medicine",
    departmentName: "General Medicine OPD",
    doctorId: "H001-GM-01",
    doctorName: "Dr. Rajesh Sharma",
    slotId: "SLOT-01",
    scheduledAt: "2026-10-30T09:00:00.000Z",
    status: "confirmed",
    source: "online",
    createdAt: "2026-10-30T07:00:00.000Z",
    updatedAt: "2026-10-30T07:00:00.000Z",
    checkedInAt: null,
    consultationStartedAt: null,
    completedAt: null,
    cancelledAt: null,
    missedAt: null,
    queueDate: "2026-10-30",
    tokenNumber: 1,
    digitalToken: "T-001",
    calledAt: null,
  };

  const created = await repo.createAppointment(sampleAppointment);
  assert.equal(created.id, "apt-uuid-1");
  assert.equal(created.patientName, "Aarav Sharma");

  // Retrieve by ID with correct user ownership
  const retrieved = await repo.getAppointmentById("apt-uuid-1", {
    id: "user-patient-1",
    isStaff: false,
  });
  assert.ok(retrieved !== null);
  assert.equal(retrieved!.id, "apt-uuid-1");
  assert.equal(retrieved!.reference, "APT-20261030-ABC001");
  assert.equal(retrieved!.status, "confirmed");
});

test("Requirement 2: Restart persistence — appointment created in repo instance 1 is retrieved by newly instantiated repo instance 2", async () => {
  const shared = createSharedPostgresClient();

  // Instance 1 creates the appointment
  const repoInstance1 = new SupabaseAppointmentRepository(shared.createMockClient() as any);
  await repoInstance1.createAppointment({
    id: "apt-restart-test",
    reference: "APT-20261030-RESTART",
    userId: "user-survivor-1",
    patientName: "Neha Gupta",
    hospitalId: "H001",
    hospitalName: "District Hospital Central",
    departmentId: "pediatrics",
    departmentName: "Pediatrics OPD",
    doctorId: "H001-PED-01",
    doctorName: "Dr. Priya Patel",
    slotId: "SLOT-02",
    scheduledAt: "2026-10-30T10:00:00.000Z",
    status: "confirmed",
    source: "online",
    createdAt: "2026-10-30T07:00:00.000Z",
    updatedAt: "2026-10-30T07:00:00.000Z",
    checkedInAt: null,
    consultationStartedAt: null,
    completedAt: null,
    cancelledAt: null,
    missedAt: null,
    queueDate: "2026-10-30",
    tokenNumber: 5,
    digitalToken: "T-005",
    calledAt: null,
  });

  // Simulate complete backend container restart by creating a completely new repo instance
  const repoInstance2 = new SupabaseAppointmentRepository(shared.createMockClient() as any);
  const fromInstance2 = await repoInstance2.getAppointmentById("apt-restart-test", {
    id: "user-survivor-1",
    isStaff: false,
  });

  assert.ok(fromInstance2 !== null, "Appointment must survive container restart");
  assert.equal(fromInstance2!.id, "apt-restart-test");
  assert.equal(fromInstance2!.patientName, "Neha Gupta");
  assert.equal(fromInstance2!.tokenNumber, 5);
});

test("Requirement 3: Notification persistence — preferences and notifications survive repository reinitialization", async () => {
  const shared = createSharedPostgresClient();

  // Repo instance 1 saves preferences and a notification
  const notifRepo1 = new SupabaseNotificationRepository(shared.createMockClient() as any);
  await notifRepo1.savePreferencesAsync({
    userId: "user-persist-1",
    emailEnabled: true,
    pushEnabled: true,
    smsEnabled: false,
    inAppEnabled: true,
    reminderIntervals: [1440, 60],
    notifyApproachingTurn: true,
    notifyDelay: true,
    notifyAppointmentChanges: true,
    phoneNumber: "+919876543210",
    createdAt: "2026-10-30T07:00:00.000Z",
    updatedAt: "2026-10-30T07:00:00.000Z",
  });

  await notifRepo1.createNotification({
    userId: "user-persist-1",
    appointmentId: "apt-123",
    type: "appointment_confirmed",
    title: "Confirmed",
    message: "Your appointment is confirmed.",
    link: "/citizen/appointments",
  });

  // Re-instantiate notification repository (restart)
  const notifRepo2 = new SupabaseNotificationRepository(shared.createMockClient() as any);
  const prefs = await notifRepo2.getPreferencesAsync("user-persist-1");
  assert.ok(prefs !== null);
  assert.equal(prefs!.userId, "user-persist-1");
  assert.equal(prefs!.pushEnabled, true);
  assert.deepEqual(prefs!.reminderIntervals, [1440, 60]);

  const notifs = await notifRepo2.getNotificationsByUser("user-persist-1");
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].title, "Confirmed");
});

test("Requirement 4: Concurrency — atomic queue-token allocations prevent duplicate tokens", async () => {
  const shared = createSharedPostgresClient();
  const repo = new SupabaseAppointmentRepository(shared.createMockClient() as any);

  // Run 20 concurrent token allocation requests for the same hospital, department, and date
  const allocations = await Promise.all(
    Array.from({ length: 20 }, () =>
      repo.allocateQueueToken("H001", "general-medicine", "2026-10-30")
    )
  );

  assert.equal(allocations.length, 20);
  const uniqueTokens = new Set(allocations);
  assert.equal(
    uniqueTokens.size,
    20,
    "All concurrent token allocations must be strictly unique without collisions"
  );
  assert.equal(Math.min(...allocations), 1);
  assert.equal(Math.max(...allocations), 20);
});

test("Requirement 5: User Isolation — ordinary citizen cannot access another patient's appointment", async () => {
  const shared = createSharedPostgresClient();
  const repo = new SupabaseAppointmentRepository(shared.createMockClient() as any);

  await repo.createAppointment({
    id: "apt-private-1",
    reference: "APT-20261030-PRIV",
    userId: "patient-alice",
    patientName: "Alice",
    hospitalId: "H001",
    hospitalName: "District Hospital Central",
    departmentId: "general-medicine",
    departmentName: "General Medicine",
    doctorId: "H001-GM-01",
    doctorName: "Dr. Sharma",
    slotId: "SLOT-P1",
    scheduledAt: "2026-10-30T10:00:00.000Z",
    status: "confirmed",
    source: "online",
    createdAt: "2026-10-30T07:00:00.000Z",
    updatedAt: "2026-10-30T07:00:00.000Z",
    checkedInAt: null,
    consultationStartedAt: null,
    completedAt: null,
    cancelledAt: null,
    missedAt: null,
    queueDate: "2026-10-30",
    tokenNumber: 1,
    digitalToken: "T-001",
    calledAt: null,
  });

  // Patient Bob attempts to read Alice's appointment: repository throws 403 APPOINTMENT_FORBIDDEN
  await assert.rejects(
    async () => {
      await repo.getAppointmentById("apt-private-1", {
        id: "patient-bob",
        isStaff: false,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof AppointmentPersistenceError);
      assert.equal(err.status, 403);
      assert.equal(err.code, "APPOINTMENT_FORBIDDEN");
      return true;
    }
  );

  // Alice reading her own appointment succeeds
  const authorizedRead = await repo.getAppointmentById("apt-private-1", {
    id: "patient-alice",
    isStaff: false,
  });
  assert.ok(authorizedRead !== null);
  assert.equal(authorizedRead!.id, "apt-private-1");
});

test("Requirement 6: Staff Isolation — staff assigned to Hospital A cannot view or manage Hospital B queue", async () => {
  const service = new AppointmentService({
    now: () => new Date("2026-10-30T09:00:00.000Z"),
  });

  const staffHospitalAOnly = {
    id: "staff-h001",
    appMetadata: {
      role: "appointment_staff",
      appointment_hospital_ids: ["H001"],
    },
    staffUserIds: [],
  };

  // Staff assigned only to H001 attempts to view H002 queue -> must be rejected with 403
  await assert.rejects(
    async () => {
      await service.getQueueAsync(
        { hospitalId: "H002", departmentId: "general-medicine" },
        staffHospitalAOnly,
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof AppointmentError);
      assert.equal(err.status, 403);
      assert.equal(err.code, "STAFF_HOSPITAL_FORBIDDEN");
      return true;
    }
  );

  // Staff assigned only to H001 attempts to create a walk-in at H002 -> must be rejected with 403
  await assert.rejects(
    async () => {
      await service.createWalkInAsync(
        {
          hospitalId: "H002",
          departmentId: "general-medicine",
          patientName: "Walk-in Patient",
        },
        staffHospitalAOnly,
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof AppointmentError);
      assert.equal(err.status, 403);
      assert.equal(err.code, "STAFF_HOSPITAL_FORBIDDEN");
      return true;
    }
  );
});

test("Requirement 7: Notification Privacy — citizen cannot access another user's notifications", async () => {
  const shared = createSharedPostgresClient();
  const notifRepo = new SupabaseNotificationRepository(shared.createMockClient() as any);

  // Create notifications for User A
  await notifRepo.createNotification({
    userId: "citizen-user-A",
    type: "queue_called",
    title: "Calling Token T-001",
    message: "Please enter Room 101",
  });

  // Query notifications for User B -> must be empty
  const userBNotifications = await notifRepo.getNotificationsByUser("citizen-user-B");
  assert.equal(userBNotifications.length, 0);

  const userBUnreadCount = await notifRepo.getUnreadCountByUser("citizen-user-B");
  assert.equal(userBUnreadCount, 0);

  // User B attempting to mark User A's notification as read -> must return null
  const userANotifs = await notifRepo.getNotificationsByUser("citizen-user-A");
  assert.equal(userANotifs.length, 1);
  const marked = await notifRepo.markNotificationAsRead(
    "citizen-user-B",
    userANotifs[0].id,
    new Date().toISOString(),
  );
  assert.equal(marked, undefined, "User B cannot mark User A notification as read");
});

test("Requirement 8: Database failure handling — missing schema throws 503 without falling back to memory Maps", async () => {
  const schemaError = { code: "PGRST205", message: "Could not find table 'public.appointments' in schema cache" };

  const missingSchemaBuilder: any = {
    eq: () => missingSchemaBuilder,
    in: () => missingSchemaBuilder,
    order: () => missingSchemaBuilder,
    limit: () => missingSchemaBuilder,
    single: () => Promise.resolve({ data: null, error: schemaError }),
    maybeSingle: () => Promise.resolve({ data: null, error: schemaError }),
    select: () => missingSchemaBuilder,
    then: (resolve: any) => resolve({ data: null, error: schemaError }),
  };

  const missingSchemaClient = {
    from() {
      return {
        select: () => missingSchemaBuilder,
        insert: () => missingSchemaBuilder,
        update: () => missingSchemaBuilder,
        upsert: () => missingSchemaBuilder,
      };
    },
    rpc: () => Promise.resolve({ data: null, error: { code: "PGRST202", message: "Function not found" } }),
  };

  const apptRepo = new SupabaseAppointmentRepository(missingSchemaClient as any);
  const notifRepo = new SupabaseNotificationRepository(missingSchemaClient as any);

  // Appointment repo must throw 503 APPOINTMENT_SCHEMA_NOT_READY
  await assert.rejects(
    async () => {
      await apptRepo.getAppointmentsByUser("any-user");
    },
    (err: unknown) => {
      assert.ok(err instanceof AppointmentPersistenceError);
      assert.equal(err.status, 503);
      assert.equal(err.code, "APPOINTMENT_SCHEMA_NOT_READY");
      return true;
    }
  );

  // Notification repo must throw 503 NOTIFICATION_SCHEMA_NOT_READY
  await assert.rejects(
    async () => {
      await notifRepo.getNotificationsByUser("any-user");
    },
    (err: unknown) => {
      assert.ok(err instanceof NotificationPersistenceError);
      assert.equal(err.status, 503);
      assert.equal(err.code, "NOTIFICATION_SCHEMA_NOT_READY");
      return true;
    }
  );
});

test("Requirement 9: Verification that production repository instances do not rely on in-memory Maps", () => {
  const shared = createSharedPostgresClient();
  const apptRepo = new SupabaseAppointmentRepository(shared.createMockClient() as any);
  const notifRepo = new SupabaseNotificationRepository(shared.createMockClient() as any);

  assert.equal(apptRepo.mode, "supabase", "Production appointment repository mode must be 'supabase'");
  assert.equal(notifRepo.mode, "supabase", "Production notification repository mode must be 'supabase'");

  const testApptRepo = new InMemoryAppointmentRepository();
  const testNotifRepo = new InMemoryNotificationRepository();

  assert.equal(testApptRepo.mode, "memory", "Isolated test appointment repository mode is 'memory'");
  assert.equal(testNotifRepo.mode, "memory", "Isolated test notification repository mode is 'memory'");
});
