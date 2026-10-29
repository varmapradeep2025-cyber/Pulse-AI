import "dotenv/config";
import express from "express";
import cors from "cors";
import { createCorsOptions } from "./config/cors.js";
import { env } from "./config/env.js";
import healthRouter from "./routes/health.js";
import scenarioRouter from "./routes/scenario.js";
import intelligenceRouter from "./routes/intelligence.js";
import {
  appointmentRouter,
  staffAppointmentRouter,
} from "./routes/appointments.js";
import inventoryImportRouter from "./routes/inventoryImport.js";
const app = express();

app.disable("x-powered-by");
app.use(cors(createCorsOptions(env.FRONTEND_ORIGINS)));
app.use(express.json({ limit: "1mb" }));

app.use(healthRouter);
app.use(scenarioRouter);
app.use(intelligenceRouter);
app.use("/api/appointments", appointmentRouter);
app.use("/api/staff/appointments", staffAppointmentRouter);
app.use("/api/staff/inventory", inventoryImportRouter);

app.listen(env.PORT, env.HOST, () => {
  console.log(
    `Pulse AI backend listening on http://${env.HOST}:${env.PORT} (${env.NODE_ENV})`,
  );
});