import { Router } from "express";
import { analyticsAuth } from "../middleware/analyticsAuth.js";
import { buildIntelligenceSummary } from "../services/intelligenceService.js";
import { analyticsScope } from "../services/operationalData.js";

const router = Router();

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.use(analyticsAuth);

/*
 * GET /api/intelligence/summary
 *
 * Hospital-intelligence pipeline:
 *   inventory → demand history → ML forecast → risk → recommendation → action
 *
 * Imported inventory reports are preferred, then legacy inventory/demand
 * tables, then a deterministic synthetic dataset.
 */
router.get("/api/intelligence/summary", async (req, res) => {
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
});

export default router;
