import mongoose from "mongoose";

export async function connectDb() {
  const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017/vendor_expense";
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUrl);
  return mongoose.connection;
}
