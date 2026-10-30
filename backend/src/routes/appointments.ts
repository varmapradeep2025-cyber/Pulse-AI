import { Router, type Response } from "express";
import {
  AppointmentError,
  appointmentService,
} from "../services/appointmentService.js";
import {
  appointmentAuth,
  requireAppointmentStaff,
} from "../middleware/appointmentAuth.js";
import { assistantToolsService } from "../services/assistantToolsService.js";

const router = Router();
const staffRouter = Router();

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
staffRouter.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

function sendAppointmentError(
  res: Response,
  error: unknown,
): void {
  if (error instanceof AppointmentError) {
    res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.publicMessage,
    });
    return;
  }

  console.error("Appointment request failed:", error);
  res.status(500).json({
    success: false,
    code: "APPOINTMENT_ERROR",
    message:
      "The appointment service could not complete this request.",
  });
}

router.use(appointmentAuth);

router.get("/catalog", (_req, res) => {
  try {
    res.status(200).json({
      success: true,
      catalog: appointmentService.getCatalog(),
    });
  } catch (error) {
    sendAppointmentError(res, error);
  }
});

router.get("/availability", (req, res) => {
  try {
    const availability = appointmentService.getAvailability({
      hospitalId: req.query.hospitalId,
      departmentId: req.query.departmentId,
      doctorId: req.query.doctorId,
    });

    res.status(200).json({
      success: true,
      availability,
    });
  } catch (error) {
    sendAppointmentError(res, error);
  }
});

router.get("/", async (req, res) => {
  try {
    const appointments = await appointmentService.listAppointmentsAsync(
      req.appointmentUser!,
    );

    res.status(200).json({
      success: true,
      appointments,
    });
  } catch (error) {
    sendAppointmentError(res, error);
  }
});

router.post("/", async (req, res) => {
  try {
    const appointment = await appointmentService.createAppointmentAsync(
      req.appointmentUser!,
      req.body ?? {},
    );

    res.status(201).json({
      success: true,
      appointment,
    });
  } catch (error) {
    sendAppointmentError(res, error);
  }
});

router.get("/:id", async (req, res) => {
  try {
    const appointment = await appointmentService.getAppointmentAsync(
      req.appointmentUser!,
      req.params.id,
    );

    res.status(200).json({
      success: true,
      appointment,
    });
  } catch (error) {
    sendAppointmentError(res, error);
  }
});

router.get("/:id/queue-snapshot", async (req, res) => {
  try {
    const snapshot = await appointmentService.getQueueSnapshotAsync(
      req.appointmentUser!,
      req.params.id,
    );

    res.status(200).json({
      success: true,
      snapshot,
    });
  } catch (error) {
    sendAppointmentError(res, error);
  }
});

router.patch("/:id/reschedule", async (req, res) => {
  try {
    const appointment =
      await appointmentService.rescheduleAppointmentAsync(
        req.appointmentUser!,
        req.params.id,
        req.body ?? {},
      );

    res.status(200).json({
      success: true,
      appointment,
    });
  } catch (error) {
    sendAppointmentError(res, error);
  }
});

router.post("/:id/cancel", async (req, res) => {
  try {
    const appointment = await appointmentService.cancelAppointmentAsync(
      req.appointmentUser!,
      req.params.id,
    );

    res.status(200).json({
      success: true,
      appointment,
    });
  } catch (error) {
    sendAppointmentError(res, error);
  }
});

router.post("/:id/check-in", async (req, res) => {
  try {
    const appointment = await appointmentService.checkInAsync(
      req.appointmentUser!,
      req.params.id,
    );

    res.status(200).json({
      success: true,
      appointment,
    });
  } catch (error) {
    sendAppointmentError(res, error);
  }
});

staffRouter.use(appointmentAuth, requireAppointmentStaff);

staffRouter.get("/queue", async (req, res) => {
  try {
    const queue = await appointmentService.getQueueAsync(
      {
        hospitalId: req.query.hospitalId,
        departmentId: req.query.departmentId,
      },
      req.appointmentUser,
    );

    res.status(200).json({
      success: true,
      queue,
    });
  } catch (error) {
    sendAppointmentError(res, error);
  }
});

staffRouter.post("/walk-ins", async (req, res) => {
  try {
    const appointment = await appointmentService.createWalkInAsync(
      req.body ?? {},
      req.appointmentUser,
    );

    res.status(201).json({
      success: true,
      appointment,
    });
  } catch (error) {
    sendAppointmentError(res, error);
  }
});

staffRouter.patch("/:id/status", async (req, res) => {
  try {
    const appointment =
      await appointmentService.transitionAppointmentAsync(
        req.params.id,
        req.body ?? {},
        req.appointmentUser,
      );

    res.status(200).json({
      success: true,
      appointment,
    });
  } catch (error) {
    sendAppointmentError(res, error);
  }
});


router.post("/assistant-query", async (req, res) => {
  try {
    const user = req.appointmentUser!;
    const { query, hospitalId, departmentId } = req.body ?? {};

    if (typeof query !== "string" || query.trim().length === 0) {
      res.status(400).json({
        success: false,
        code: "INVALID_QUERY",
        message: "A non-empty query string is required.",
      });
      return;
    }

    if (user.isStaff && typeof hospitalId === "string" && typeof departmentId === "string") {
      const response = await assistantToolsService.handleDoctorQuery(
        user,
        hospitalId,
        departmentId,
        query,
      );
      res.status(200).json({ success: true, ...response });
      return;
    }

    const response = await assistantToolsService.handleCitizenQuery(user, query);
    res.status(200).json({ success: true, ...response });
  } catch (error) {
    sendAppointmentError(res, error);
  }
});

export { router as appointmentRouter };
export { staffRouter as staffAppointmentRouter };
