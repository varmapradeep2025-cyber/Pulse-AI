import { Router, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import {
  NotificationError,
  notificationService,
} from "../services/notificationService.js";
import { appointmentAuth } from "../middleware/appointmentAuth.js";

const router = Router();

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

function sendNotificationError(res: Response, error: unknown): void {
  if (error instanceof NotificationError) {
    res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.publicMessage,
    });
    return;
  }

  console.error("Notification request error:", error);
  res.status(500).json({
    success: false,
    code: "NOTIFICATION_ERROR",
    message: "The notification service encountered an error.",
  });
}

function isValidCronSecret(
  candidate: unknown,
  expected: string | undefined,
): boolean {
  if (
    typeof candidate !== "string" ||
    !expected ||
    candidate.length === 0 ||
    expected.length === 0
  ) {
    return false;
  }

  const candBuf = Buffer.from(candidate);
  const expBuf = Buffer.from(expected);

  if (candBuf.length !== expBuf.length) {
    return false;
  }

  return timingSafeEqual(candBuf, expBuf);
}

/* POST /api/notifications/process-worker - Trigger background scheduler cycle (Admin/Staff/Cron only)
 * Mounted before router.use(appointmentAuth) so authorized cron jobs can authenticate without user JWTs.
 */
router.post(
  "/process-worker",
  async (req, res, next) => {
    const rawCronSecret =
      req.headers["x-cron-key"] ?? req.headers["x-worker-secret"];
    const cronSecret = Array.isArray(rawCronSecret)
      ? rawCronSecret[0]
      : rawCronSecret;
    const configuredSecret = process.env.CRON_SECRET;

    // 1. Check cron secret first (does not require user JWT)
    if (isValidCronSecret(cronSecret, configuredSecret)) {
      next();
      return;
    }

    // 2. If a cron secret was provided but invalid: reject immediately
    if (typeof cronSecret === "string" && cronSecret.length > 0) {
      res.status(403).json({
        success: false,
        code: "INVALID_CRON_SECRET",
        message: "The provided cron secret is invalid.",
      });
      return;
    }

    // 3. Fall back to user JWT auth (for staff administrator manual triggers)
    await appointmentAuth(req, res, () => {
      if (req.appointmentUser?.isStaff) {
        next();
        return;
      }

      res.status(403).json({
        success: false,
        code: "FORBIDDEN",
        message:
          "Background worker execution is restricted to staff administrators and authorized cron services.",
      });
    });
  },
  async (_req, res) => {
    try {
      const result = await notificationService.processDueJobs();

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      sendNotificationError(res, error);
    }
  },
);

// All citizen notification routes below require authenticated session
router.use(appointmentAuth);

/* GET /api/notifications - List authenticated citizen notifications */
router.get("/", async (req, res) => {
  try {
    const user = req.appointmentUser!;
    const [notifications, unreadCount] = await Promise.all([
      notificationService.listNotificationsAsync(user.id),
      notificationService.getUnreadCountAsync(user.id),
    ]);

    res.status(200).json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error) {
    sendNotificationError(res, error);
  }
});

/* PATCH /api/notifications/:id/read - Mark single notification as read */
router.patch("/:id/read", async (req, res) => {
  try {
    const user = req.appointmentUser!;
    const notification = await notificationService.markAsReadAsync(user.id, req.params.id);

    res.status(200).json({
      success: true,
      notification,
    });
  } catch (error) {
    sendNotificationError(res, error);
  }
});

/* POST /api/notifications/mark-all-read - Mark all notifications as read */
router.post("/mark-all-read", async (req, res) => {
  try {
    const user = req.appointmentUser!;
    const count = await notificationService.markAllAsReadAsync(user.id);

    res.status(200).json({
      success: true,
      markedReadCount: count,
    });
  } catch (error) {
    sendNotificationError(res, error);
  }
});

/* GET /api/notifications/preferences - Retrieve citizen notification preferences */
router.get("/preferences", async (req, res) => {
  try {
    const user = req.appointmentUser!;
    const preferences = await notificationService.getPreferencesAsync(user.id);

    res.status(200).json({
      success: true,
      preferences,
    });
  } catch (error) {
    sendNotificationError(res, error);
  }
});

/* PUT /api/notifications/preferences - Update citizen notification preferences */
router.put("/preferences", async (req, res) => {
  try {
    const user = req.appointmentUser!;
    const preferences = await notificationService.updatePreferencesAsync(
      user.id,
      req.body ?? {},
    );

    res.status(200).json({
      success: true,
      preferences,
    });
  } catch (error) {
    sendNotificationError(res, error);
  }
});

/* POST /api/notifications/push/subscribe - Register device push subscription */
router.post("/push/subscribe", async (req, res) => {
  try {
    const user = req.appointmentUser!;
    const subscription = await notificationService.registerPushSubscriptionAsync(
      user.id,
      req.body ?? {},
    );

    res.status(201).json({
      success: true,
      subscription,
    });
  } catch (error) {
    sendNotificationError(res, error);
  }
});

/* DELETE /api/notifications/push/unsubscribe - Deactivate device push subscription */
router.delete("/push/unsubscribe", async (req, res) => {
  try {
    const user = req.appointmentUser!;
    const { endpoint } = req.body ?? {};
    const success = await notificationService.deactivatePushSubscriptionAsync(
      user.id,
      String(endpoint ?? ""),
    );

    res.status(200).json({
      success,
    });
  } catch (error) {
    sendNotificationError(res, error);
  }
});

export default router;
