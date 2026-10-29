import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import multer from "multer";
import { InventoryError } from "../services/inventoryErrors.js";
import { InventoryImportService } from "../services/inventoryImportService.js";
import { inventoryStore } from "../services/inventoryStore.js";
import {
  inventoryAuth,
  requireInventoryStaff,
} from "../middleware/inventoryAuth.js";

const router = Router();
const inventoryImportService = new InventoryImportService(inventoryStore);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 1,
    fields: 4,
  },
});

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.use(inventoryAuth);
router.use(requireInventoryStaff);

function sendInventoryError(res: Response, error: unknown): void {
  if (error instanceof InventoryError) {
    res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.publicMessage,
      details: error.details,
    });
    return;
  }

  console.error("Inventory request failed:", error);
  res.status(500).json({
    success: false,
    code: "INVENTORY_ERROR",
    message: "The inventory service could not complete this request.",
  });
}

router.get("/template", async (req, res) => {
  try {
    const workbook = await inventoryImportService.template(
      false,
      req.inventoryUser!,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="pulse-inventory-template.xlsx"',
    );
    res.status(200).send(workbook);
  } catch (error) {
    sendInventoryError(res, error);
  }
});

router.get("/template/sample", async (req, res) => {
  try {
    const workbook = await inventoryImportService.template(
      true,
      req.inventoryUser!,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="pulse-inventory-sample.xlsx"',
    );
    res.status(200).send(workbook);
  } catch (error) {
    sendInventoryError(res, error);
  }
});

router.get("/summary", async (req, res) => {
  try {
    const summary = await inventoryImportService.summary(req.inventoryUser!);
    res.status(200).json({ success: true, summary });
  } catch (error) {
    sendInventoryError(res, error);
  }
});

router.post("/preview", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        code: "FILE_REQUIRED",
        message: "Choose an .xlsx inventory workbook to upload.",
      });
      return;
    }

    const datasetKind =
      typeof req.body?.datasetKind === "string" ? req.body.datasetKind : "";
    const correctionMode =
      typeof req.body?.correctionMode === "string"
        ? req.body.correctionMode
        : "";

    const preview = await inventoryImportService.preview({
      user: req.inventoryUser!,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      buffer: req.file.buffer,
      datasetKind,
      correctionMode,
    });

    res.status(200).json({ success: true, preview });
  } catch (error) {
    sendInventoryError(res, error);
  }
});

router.post("/imports/:batchId/confirm", async (req, res) => {
  try {
    const result = await inventoryImportService.confirm(
      req.inventoryUser!,
      req.params.batchId,
    );

    res.status(200).json({ success: true, import: result });
  } catch (error) {
    sendInventoryError(res, error);
  }
});

router.use((
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === "LIMIT_FILE_SIZE";

    res.status(tooLarge ? 413 : 400).json({
      success: false,
      code: tooLarge ? "FILE_TOO_LARGE" : "INVALID_UPLOAD",
      message: tooLarge
        ? "Workbooks must be 5 MB or smaller."
        : "The workbook upload could not be read.",
    });
    return;
  }

  if (error) {
    sendInventoryError(res, error);
    return;
  }

  next();
});

export default router;
