import { Router } from "express";
import { supabase } from "../utils/supabase.js";

const router = Router();

router.get("/db-test", async (_req, res) => {
  try {
    const [
      hospitalsResult,
      inventoryResult,
      demandResult,
      ordersResult,
      scenariosResult,
    ] = await Promise.all([
      supabase
        .from("hospitals")
        .select("id, name")
        .limit(5),

      supabase
        .from("inventory")
        .select("id, hospital_id, medicine_id, current_stock, safety_stock, daily_consumption")
        .limit(5),

      supabase
        .from("demand_history")
        .select("id, hospital_id, medicine_id, demand_date, demand")
        .limit(5),

      supabase
        .from("orders")
        .select("id, hospital_id, supplier_id, medicine_id, quantity, status")
        .limit(5),

      supabase
        .from("scenarios")
        .select("id, name, disruption_type, duration_days")
        .limit(5),
    ]);

    const errors = [
      hospitalsResult.error,
      inventoryResult.error,
      demandResult.error,
      ordersResult.error,
      scenariosResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      return res.status(500).json({
        success: false,
        errors,
      });
    }

    return res.status(200).json({
      success: true,

      counts: {
        hospitals: hospitalsResult.data?.length ?? 0,
        inventory: inventoryResult.data?.length ?? 0,
        demand_history: demandResult.data?.length ?? 0,
        orders: ordersResult.data?.length ?? 0,
        scenarios: scenariosResult.data?.length ?? 0,
      },

      data: {
        hospitals: hospitalsResult.data,
        inventory: inventoryResult.data,
        demand_history: demandResult.data,
        orders: ordersResult.data,
        scenarios: scenariosResult.data,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;