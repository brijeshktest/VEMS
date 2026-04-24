import mongoose from "mongoose";

/** Options override URI query (avoids flaky local dev when URI sets a very low serverSelectionTimeoutMS). */
const MONGO_CLIENT_OPTIONS = {
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 20000,
  maxPoolSize: 10
};

export async function connectDb() {
  const mongoUrl =
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    "mongodb://127.0.0.1:27017/vendor_expense";
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUrl, MONGO_CLIENT_OPTIONS);
  return mongoose.connection;
}
