import mongoose from "mongoose";
import AttachmentSchema from "./Attachment.js";

const VendorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    contactPerson: { type: String, trim: true },
    contactNumber: { type: String, trim: true },
    email: { type: String, trim: true },
    pan: { type: String, trim: true, default: "" },
    aadhaar: { type: String, trim: true, default: "" },
    gstin: { type: String, trim: true, default: "" },
    vendorType: { type: String, trim: true, default: "" },
    materialsSupplied: [{ type: mongoose.Schema.Types.ObjectId, ref: "Material" }],
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    attachments: { type: [AttachmentSchema], default: [] }
  },
  { timestamps: true }
);

export default mongoose.model("Vendor", VendorSchema);
