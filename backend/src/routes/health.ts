import { Router } from "express";
import { env } from "../config/env.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "pulse-ai-backend",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

export default router;