import mongoose from "mongoose";

const GrowingRoomCycleTaskSchema = new mongoose.Schema(
  {
    cycleId: { type: mongoose.Schema.Types.ObjectId, ref: "GrowingRoomCycle", required: true, index: true },
    growingRoomId: { type: mongoose.Schema.Types.ObjectId, ref: "GrowingRoom", required: true, index: true },
    compostLifecycleBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CompostLifecycleBatch",
      default: null
    },
    stageKey: { type: String, trim: true, required: true },
    taskKey: { type: String, trim: true, required: true },
    title: { type: String, trim: true, required: true },
    /** 1-based day index from cycle start */
    scheduledDay: { type: Number, required: true },
    dueDate: { type: Date, required: true, index: true },
    recurrenceKind: { type: String, enum: ["once", "daily"], default: "once" },
    assignedRoleHint: { type: String, trim: true, default: "" },
    isOptional: { type: Boolean, default: false },
    isCritical: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "skipped"],
      default: "pending",
      index: true
    },
    assignedUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    notes: { type: String, trim: true, default: "" },
    /** For harvest / yield tasks */
    yieldKg: { type: Number, default: null },
    skipReason: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

GrowingRoomCycleTaskSchema.index({ cycleId: 1, scheduledDay: 1 });
GrowingRoomCycleTaskSchema.index({ growingRoomId: 1, status: 1, dueDate: 1 });

export default mongoose.model("GrowingRoomCycleTask", GrowingRoomCycleTaskSchema);
