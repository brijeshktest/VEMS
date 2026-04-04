import mongoose from "mongoose";

const AttachmentSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true, trim: true },
    storedName: { type: String, required: true, trim: true },
    mimeType: { type: String, default: "application/octet-stream" },
    size: { type: Number, default: 0 }
  },
  { _id: true }
);

export default AttachmentSchema;
