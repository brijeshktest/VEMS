import mongoose from "mongoose";

const ChangeLogSchema = new mongoose.Schema(
  {
    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: String, required: true, trim: true, index: true },
    action: { type: String, enum: ["create", "update", "delete"], required: true },
    changedByUserId: { type: String, default: "" },
    changedByName: { type: String, default: "" },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

export default mongoose.model("ChangeLog", ChangeLogSchema);
