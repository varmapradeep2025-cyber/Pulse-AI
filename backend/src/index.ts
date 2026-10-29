import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { createCorsOptions } from "./config/cors.js";
import { env } from "./config/env.js";
import { apiRateLimiter } from "./middleware/rateLimiter.js";
import healthRouter from "./routes/health.js";
import scenarioRouter from "./routes/scenario.js";
import intelligenceRouter from "./routes/intelligence.js";
import {
  appointmentRouter,
  staffAppointmentRouter,
} from "./routes/appointments.js";
import inventoryImportRouter from "./routes/inventoryImport.js";
import notificationRouter from "./routes/notifications.js";

const app = express();

app.disable("x-powered-by");
app.use(cors(createCorsOptions(env.FRONTEND_ORIGINS)));
app.use(express.json({ limit: "1mb" }));

// General health check (un-rate-limited for monitoring probes)
app.use(healthRouter);

// Apply rate limiting across all API routes
app.use("/api", apiRateLimiter);

app.use(scenarioRouter);
app.use(intelligenceRouter);
app.use("/api/appointments", appointmentRouter);
app.use("/api/staff/appointments", staffAppointmentRouter);
app.use("/api/staff/inventory", inventoryImportRouter);
app.use("/api/notifications", notificationRouter);

// Safe catch-all error handling middleware — never leak internals or stack traces
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled API error:", err);
  if (res.headersSent) {
    return;
  }
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

app.listen(env.PORT, env.HOST, () => {
  console.log(
    `Pulse AI backend listening on http://${env.HOST}:${env.PORT} (${env.NODE_ENV})`,
  );
});
