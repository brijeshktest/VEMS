import mongoose from "mongoose";

export function withCompany(req, query = {}) {
  if (!req.companyId) {
    throw new Error("withCompany: missing req.companyId");
  }
  return { ...query, companyId: req.companyId };
}

export function companyObjectId(req) {
  if (!req.companyId) return null;
  return req.companyId instanceof mongoose.Types.ObjectId
    ? req.companyId
    : new mongoose.Types.ObjectId(String(req.companyId));
}
