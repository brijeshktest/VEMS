import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    /** super_admin: platform operator (no plant). Others: scoped to companyId. */
    role: {
      type: String,
      enum: ["super_admin", "admin", "accountant", "viewer"],
      default: "viewer"
    },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null, index: true },
    roleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Role" }]
  },
  { timestamps: true }
);

export default mongoose.model("User", UserSchema);
