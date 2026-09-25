import "dotenv/config";
import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import healthRouter from "./routes/health.js";
import dbTestRouter from "./routes/dbtest.js";
import scenarioRouter from "./routes/scenario.js";
import intelligenceRouter from "./routes/intelligence.js";
const app = express();

app.use(cors());
app.use(express.json());

app.use(healthRouter);
app.use(dbTestRouter);
app.use(scenarioRouter);
app.use(intelligenceRouter);

app.listen(env.PORT, env.HOST, () => {
  console.log(
    `Pulse AI backend listening on http://${env.HOST}:${env.PORT} (${env.NODE_ENV})`,
  );
});