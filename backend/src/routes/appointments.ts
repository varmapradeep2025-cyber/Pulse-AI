import { Router, type Response } from "express";
import {
  AppointmentError,
  appointmentService,
} from "../services/appointmentService.js";
import {
  appointmentAuth,
  requireAppointmentStaff,
} from "../middleware/appointmentAuth.js";

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

router.get("/", (req, res) => {
  try {
    const appointments = appointmentService.listAppointments(
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

router.post("/", (req, res) => {
  try {
    const appointment = appointmentService.createAppointment(
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

router.get("/:id", (req, res) => {
  try {
    const appointment = appointmentService.getAppointment(
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

router.get("/:id/queue-snapshot", (req, res) => {
  try {
    const snapshot = appointmentService.getQueueSnapshot(
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

router.patch("/:id/reschedule", (req, res) => {
  try {
    const appointment =
      appointmentService.rescheduleAppointment(
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

router.post("/:id/cancel", (req, res) => {
  try {
    const appointment = appointmentService.cancelAppointment(
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

router.post("/:id/check-in", (req, res) => {
  try {
    const appointment = appointmentService.checkIn(
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

staffRouter.get("/queue", (req, res) => {
  try {
    const queue = appointmentService.getQueue(
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

staffRouter.post("/walk-ins", (req, res) => {
  try {
    const appointment = appointmentService.createWalkIn(
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

staffRouter.patch("/:id/status", (req, res) => {
  try {
    const appointment =
      appointmentService.transitionAppointment(
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

export { router as appointmentRouter };
export { staffRouter as staffAppointmentRouter };
