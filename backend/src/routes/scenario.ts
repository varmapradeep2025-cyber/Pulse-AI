import { Router } from "express";
import {
  ScenarioError,
  simulateScenario,
} from "../services/scenarioService.js";

const router = Router();

router.post("/api/scenarios/simulate", async (req, res) => {
  try {
    const { scenarioId } = req.body ?? {};

    const results = await simulateScenario(scenarioId);

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
});

export default router;