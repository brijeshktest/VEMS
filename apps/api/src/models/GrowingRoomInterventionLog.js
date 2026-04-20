import mongoose from "mongoose";

const GrowingRoomInterventionLogSchema = new mongoose.Schema(
  {
    cycleId: { type: mongoose.Schema.Types.ObjectId, ref: "GrowingRoomCycle", required: true, index: true },
    growingRoomId: { type: mongoose.Schema.Types.ObjectId, ref: "GrowingRoom", required: true, index: true },
    compostLifecycleBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompostLifecycleBatch",
      default: null
    },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: "GrowingRoomCycleTask", default: null },
    action: { type: String, trim: true, required: true },
    detail: { type: String, trim: true, default: "" },
    performedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    performedByName: { type: String, trim: true, default: "" },
    performedAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

GrowingRoomInterventionLogSchema.index({ growingRoomId: 1, performedAt: -1 });

export default mongoose.model("GrowingRoomInterventionLog", GrowingRoomInterventionLogSchema);
