import mongoose from "mongoose";

const StageSchema = new mongoose.Schema(
  {
    stageType: { type: String, enum: ["bunker", "tunnel"], required: true },
    stageNumber: { type: Number, required: true, min: 1 },
    startedAt: { type: Date, required: true },
    movedAt: { type: Date, required: true },
    movedByUserId: { type: String, default: "" },
    movedByName: { type: String, default: "" },
    notes: { type: String, default: "", trim: true }
  },
  { _id: false }
);

const TunnelBatchSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    batchCode: { type: String, required: true, trim: true },
    compostType: { type: String, default: "Mushroom compost", trim: true },
    status: {
      type: String,
      enum: ["active", "shifted_to_growing_room"],
      default: "active"
    },
    currentStageType: {
      type: String,
      enum: ["bunker", "tunnel", "growing_room"],
      required: true,
      default: "bunker"
    },
    currentStageNumber: { type: Number, required: true, default: 1, min: 1 },
    stageStartedAt: { type: Date, required: true, default: Date.now },
    shiftedToGrowingRoomAt: { type: Date },
    stageHistory: { type: [StageSchema], default: [] },
    notes: { type: String, default: "", trim: true }
  },
  { timestamps: true }
);

TunnelBatchSchema.index({ companyId: 1, batchCode: 1 }, { unique: true });

export default mongoose.model("TunnelBatch", TunnelBatchSchema);
