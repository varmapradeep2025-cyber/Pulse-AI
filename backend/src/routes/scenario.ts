import { Router } from "express";
import { simulateScenario } from "../services/scenarioService.js";

const router = Router();

router.post("/api/scenarios/simulate", async (req, res) => {
  try {
    const { scenarioId } = req.body;

   const results = await simulateScenario(scenarioId);
    res.status(200).json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("Scenario simulation error:", error);

    res.status(500).json({
      success: false,
      message: "Scenario simulation failed",
    });
  }
});

export default router;