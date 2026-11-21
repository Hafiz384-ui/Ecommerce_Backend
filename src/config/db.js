const mongoose = require("mongoose");

let isConnected = false;

const connectDB = async () => {
  // If already connected, reuse the active connection
  if (mongoose.connection.readyState === 1) {
    return;
  }

  // If in connecting state, wait
  if (mongoose.connection.readyState === 2) {
    return;
  }

  if (!process.env.MONGO_URL) {
    throw new Error("MONGO_URL environment variable is missing!");
  }

  try {
    const conn = await mongoose.connect(process.env.MONGO_URL, {
      bufferCommands: false, // Fail fast if connection isn't ready instead of hanging
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
    throw error;
  }
};

module.exports = connectDB;
