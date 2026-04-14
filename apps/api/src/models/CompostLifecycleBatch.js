import mongoose from "mongoose";

const ResourceAllocationSchema = new mongoose.Schema(
  {
    growingRoomId: { type: mongoose.Schema.Types.ObjectId, ref: "GrowingRoom", required: true },
    /** Lifecycle stage this allocation applies to. */
    stageKey: { type: String, trim: true },
    startDate: { type: Date },
    endDate: { type: Date },
    assignedAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const RawMaterialLineSchema = new mongoose.Schema(
  {
    materialId: { type: mongoose.Schema.Types.ObjectId, ref: "Material", required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
    quantity: { type: Number, required: true },
    /** Stage when this line was recorded (same as stage movement). */
    stageKey: { type: String, trim: true },
    note: { type: String, trim: true, default: "" },
    recordedAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const StageMovementSchema = new mongoose.Schema(
  {
    movedAt: { type: Date, default: Date.now },
    fromStage: { type: String, trim: true, required: true },
    toStage: { type: String, trim: true, required: true },
    resourcesUsed: [
      {
        name: { type: String, trim: true },
        resourceType: { type: String, trim: true }
      }
    ],
    rawMaterialsUsed: [
      {
        materialName: { type: String, trim: true },
        vendorName: { type: String, trim: true },
        quantity: { type: Number, required: true }
      }
    ]
  },
  { _id: true }
);

const CompostLifecycleBatchSchema = new mongoose.Schema(
  {
    batchName: { type: String, required: true, unique: true, trim: true },
    startDate: { type: Date, required: true },
    quantity: { type: Number },
    notes: { type: String, trim: true, default: "" },
    /** Workflow position (advances only via create + advance-stage). */
    operationalStageKey: { type: String, trim: true, default: "wetting" },
    /** When set to a valid lifecycle key, overrides timeline-based status for display only. */
    manualStatus: { type: String, trim: true },
    resourceAllocations: [ResourceAllocationSchema],
    rawMaterialLines: [RawMaterialLineSchema],
    stageMovements: [StageMovementSchema]
  },
  { timestamps: true }
);

export default mongoose.model("CompostLifecycleBatch", CompostLifecycleBatchSchema);
