import { Router } from "express";
import { analyticsAuth } from "../middleware/analyticsAuth.js";
import { buildIntelligenceSummary } from "../services/intelligenceService.js";

const router = Router();

/*
 * GET /api/intelligence/summary
 *
 * Hospital-intelligence pipeline:
 *   inventory → demand history → ML forecast → risk → recommendation → action
 *
 * Uses Supabase data when available; falls back to a deterministic synthetic
 * dataset when the database is empty so the demo never needs manual setup.
 */
router.get("/api/intelligence/summary", analyticsAuth, async (_req, res) => {
  res.set("Cache-Control", "no-store");

  try {
    const summary = await buildIntelligenceSummary();

    res.status(200).json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error("Intelligence summary error:", error);

    res.status(500).json({
      success: false,
      message: "Intelligence summary failed",
    });
  }
});

export default router;
