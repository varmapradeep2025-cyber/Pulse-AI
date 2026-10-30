import { Router } from "express";
import { analyticsAuth } from "../middleware/analyticsAuth.js";
import { sensitiveActionRateLimiter } from "../middleware/rateLimiter.js";
import { buildIntelligenceSummary } from "../services/intelligenceService.js";
import {
  analyticsScope,
  loadOperationalDataset,
} from "../services/operationalData.js";
import { env } from "../config/env.js";

const router = Router();

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

/*
 * GET /api/intelligence/summary
 *
 * Hospital-intelligence pipeline:
 *   inventory → demand history → ML forecast → risk → recommendation → action
 *
 * Imported inventory reports are preferred, then legacy inventory/demand
 * tables, then a deterministic synthetic dataset.
 *
 * analyticsAuth is applied per-route so it does NOT intercept requests
 * destined for other routers (e.g. /api/appointments).
 */
router.get(
  "/api/intelligence/summary",
  sensitiveActionRateLimiter,
  analyticsAuth,
  async (req, res) => {
    try {
      const user = req.analyticsUser!;
      const summary = await buildIntelligenceSummary(
        analyticsScope(user.allHospitals, user.hospitalIds),
      );

      res.status(200).json({
        success: true,
        summary,
      });
    } catch (error) {
      console.error("Intelligence summary error:", error);

      res.status(503).json({
        success: false,
        code: "INTELLIGENCE_UNAVAILABLE",
        message: "Intelligence summary is temporarily unavailable.",
      });
    }
  },
);

router.get(
  "/api/intelligence/forecast-comparison",
  sensitiveActionRateLimiter,
  analyticsAuth,
  async (req, res) => {
    const user = req.analyticsUser!;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      const dataset = await loadOperationalDataset(
        analyticsScope(user.allHospitals, user.hospitalIds),
      );
      if (dataset.demandRows.length === 0) {
        res.status(422).json({
          success: false,
          code: "FORECAST_DATA_UNAVAILABLE",
          message: "There is no demand history to evaluate.",
        });
        return;
      }

      const response = await fetch(
        `${env.ML_SERVICE_URL}/api/forecast/compare`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: dataset.demandRows.map((row) => ({
              hospitalId: row.hospital_id,
              medicineId: row.medicine_id,
              date: row.date,
              demand: row.demand,
            })),
          }),
          signal: controller.signal,
        },
      );
      const result = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        res.status(response.status === 422 ? 422 : 503).json({
          success: false,
          code: "FORECAST_COMPARISON_FAILED",
          message:
            typeof result.detail === "string"
              ? result.detail
              : "The forecasting comparison could not be completed.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        provenance: dataset.provenance,
        comparison: result,
      });
    } catch (error) {
      console.error("Forecast comparison error:", error);
      res.status(503).json({
        success: false,
        code: "FORECAST_COMPARISON_UNAVAILABLE",
        message:
          "The Python ML comparison service is unavailable. Start ml-service and retry.",
      });
    } finally {
      clearTimeout(timeout);
    }
  },
);

export default router;
