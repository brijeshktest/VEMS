import express from "express";
import ChangeLog from "../models/ChangeLog.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  const entityType = String(req.query.entityType || "").trim();
  const entityId = String(req.query.entityId || "").trim();
  const limitRaw = Number(req.query.limit || 100);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 100;

  const filter = {};
  if (entityType) {
    filter.entityType = entityType;
  }
  if (entityId) {
    filter.entityId = entityId;
  }

  const logs = await ChangeLog.find(filter).sort({ createdAt: -1 }).limit(limit);
  return res.json(logs);
});

export default router;
