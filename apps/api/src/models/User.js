import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "accountant", "viewer"], default: "viewer" },
    roleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Role" }]
  },
  { timestamps: true }
);

export default mongoose.model("User", UserSchema);
