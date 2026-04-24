import mongoose from "mongoose";

const PermissionSchema = new mongoose.Schema(
  {
    create: { type: Boolean, default: false },
    edit: { type: Boolean, default: false },
    view: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    bulkUpload: { type: Boolean, default: false },
    bulkDelete: { type: Boolean, default: false }
  },
  { _id: false }
);

const RoleSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    permissions: { type: Map, of: PermissionSchema, default: {} }
  },
  { timestamps: true }
);

RoleSchema.index({ companyId: 1, name: 1 }, { unique: true });

export default mongoose.model("Role", RoleSchema);
