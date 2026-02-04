import mongoose from "mongoose";

const MaterialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, trim: true },
    unit: { type: String, trim: true },
    description: { type: String, trim: true },
    vendorIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Vendor" }]
  },
  { timestamps: true }
);

export default mongoose.model("Material", MaterialSchema);
