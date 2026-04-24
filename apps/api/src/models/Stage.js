import mongoose from "mongoose";

const ActivitySchema = new mongoose.Schema(
  {
    watering: { type: Boolean, default: false },
    ruffling: { type: Boolean, default: false },
    thumping: { type: Boolean, default: false },
    ventilation: { type: Boolean, default: false }
  },
  { _id: false }
);

const StageSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name: { type: String, required: true, trim: true },
    sequenceOrder: { type: Number, required: true },
    intervalDays: { type: Number, required: true },
    humidity: { type: Number, default: 0 },
    temperature: { type: Number, default: 0 },
    co2Level: { type: Number, default: 0 },
    notes: { type: String, trim: true },
    activities: { type: ActivitySchema, default: {} }
  },
  { timestamps: true }
);

StageSchema.index({ companyId: 1, name: 1 }, { unique: true });

export default mongoose.model("Stage", StageSchema);
