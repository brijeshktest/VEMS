import express from "express";
import Vendor from "../models/Vendor.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireFields } from "../utils/validators.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const vendors = await Vendor.find().sort({ name: 1 });
  return res.json(vendors);
});

router.get("/:id", requireAuth, async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) {
    return res.status(404).json({ error: "Vendor not found" });
  }
  return res.json(vendor);
});

router.post("/", requireAuth, requireRole(["admin", "accountant"]), async (req, res) => {
  const missing = requireFields(req.body, ["name"]);
  if (missing.length) {
    return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
  }
  const vendor = await Vendor.create({
    name: req.body.name,
    address: req.body.address,
    contactPerson: req.body.contactPerson,
    contactNumber: req.body.contactNumber,
    email: req.body.email,
    materialsSupplied: req.body.materialsSupplied || [],
    status: req.body.status || "Active"
  });
  return res.status(201).json(vendor);
});

router.put("/:id", requireAuth, requireRole(["admin", "accountant"]), async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) {
    return res.status(404).json({ error: "Vendor not found" });
  }
  vendor.name = req.body.name ?? vendor.name;
  vendor.address = req.body.address ?? vendor.address;
  vendor.contactPerson = req.body.contactPerson ?? vendor.contactPerson;
  vendor.contactNumber = req.body.contactNumber ?? vendor.contactNumber;
  vendor.email = req.body.email ?? vendor.email;
  vendor.materialsSupplied = req.body.materialsSupplied ?? vendor.materialsSupplied;
  vendor.status = req.body.status ?? vendor.status;
  await vendor.save();
  return res.json(vendor);
});

router.delete("/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) {
    return res.status(404).json({ error: "Vendor not found" });
  }
  await vendor.deleteOne();
  return res.json({ ok: true });
});

export default router;
