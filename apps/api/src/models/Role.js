import mongoose from "mongoose";

const PermissionSchema = new mongoose.Schema(
  {
    create: { type: Boolean, default: false },
    edit: { type: Boolean, default: false },
    view: { type: Boolean, default: false },
    delete: { type: Boolean, default: false }
  },
  { _id: false }
);

const RoleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    permissions: { type: Map, of: PermissionSchema, default: {} }
  },
  { timestamps: true }
);

export default mongoose.model("Role", RoleSchema);
