import { Router } from "express";
import { analyticsAuth } from "../middleware/analyticsAuth.js";
import { sensitiveActionRateLimiter } from "../middleware/rateLimiter.js";
import {
  ScenarioError,
  simulateScenario,
} from "../services/scenarioService.js";
import { analyticsScope } from "../services/operationalData.js";

const router = Router();

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// analyticsAuth is applied per-route so it does NOT intercept requests
// destined for other routers (e.g. /api/appointments).
router.post(
  "/api/scenarios/simulate",
  sensitiveActionRateLimiter,
  analyticsAuth,
  async (req, res) => {
    try {
      const { scenarioId } = req.body ?? {};
      const user = req.analyticsUser!;

      const results = await simulateScenario(
        scenarioId,
        undefined,
        {
          scope: analyticsScope(user.allHospitals, user.hospitalIds),
        },
      );

      res.status(200).json({
        success: true,
        results,
      });
    } catch (error) {
      console.error("Scenario simulation error:", error);

      const status = error instanceof ScenarioError ? error.status : 500;
      const message =
        error instanceof ScenarioError
          ? error.publicMessage
          : "Scenario simulation failed";

      res.status(status).json({
        success: false,
        message,
      });
    }
  },
);

export default router;
