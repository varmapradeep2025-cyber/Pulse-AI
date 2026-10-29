import { Router, type Response } from "express";
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

// All notification routes require authenticated session
router.use(appointmentAuth);

/* GET /api/notifications - List authenticated citizen notifications */
router.get("/", (req, res) => {
  try {
    const user = req.appointmentUser!;
    const notifications = notificationService.listNotifications(user.id);
    const unreadCount = notificationService.getUnreadCount(user.id);

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
router.patch("/:id/read", (req, res) => {
  try {
    const user = req.appointmentUser!;
    const notification = notificationService.markAsRead(user.id, req.params.id);

    res.status(200).json({
      success: true,
      notification,
    });
  } catch (error) {
    sendNotificationError(res, error);
  }
});

/* POST /api/notifications/mark-all-read - Mark all notifications as read */
router.post("/mark-all-read", (req, res) => {
  try {
    const user = req.appointmentUser!;
    const count = notificationService.markAllAsRead(user.id);

    res.status(200).json({
      success: true,
      markedReadCount: count,
    });
  } catch (error) {
    sendNotificationError(res, error);
  }
});

/* GET /api/notifications/preferences - Retrieve citizen notification preferences */
router.get("/preferences", (req, res) => {
  try {
    const user = req.appointmentUser!;
    const preferences = notificationService.getPreferences(user.id);

    res.status(200).json({
      success: true,
      preferences,
    });
  } catch (error) {
    sendNotificationError(res, error);
  }
});

/* PUT /api/notifications/preferences - Update citizen notification preferences */
router.put("/preferences", (req, res) => {
  try {
    const user = req.appointmentUser!;
    const preferences = notificationService.updatePreferences(
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
router.post("/push/subscribe", (req, res) => {
  try {
    const user = req.appointmentUser!;
    const subscription = notificationService.registerPushSubscription(
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
router.delete("/push/unsubscribe", (req, res) => {
  try {
    const user = req.appointmentUser!;
    const { endpoint } = req.body ?? {};
    const success = notificationService.deactivatePushSubscription(
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

/* POST /api/notifications/process-worker - Trigger background scheduler cycle (Admin/Staff/Cron only) */
router.post(
  "/process-worker",
  (req, res, next) => {
    const cronSecret = req.headers["x-cron-key"] ?? req.headers["x-worker-secret"];
    const isCronService = Boolean(
      process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET,
    );
    const isAdminStaff = Boolean(req.appointmentUser?.isStaff);

    if (!isCronService && !isAdminStaff) {
      res.status(403).json({
        success: false,
        code: "FORBIDDEN",
        message:
          "Background worker execution is restricted to staff administrators and authorized cron services.",
      });
      return;
    }

    next();
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

export default router;
