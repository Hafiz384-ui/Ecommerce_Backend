const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");
const productRouter = require("./routes/productRouter");
const userRouter = require("./routes/userRouter");
const addressRouter = require("./routes/addressRouter");
const couponCodeRouter = require("./routes/couponCodeRouter");
const orderRouter = require("./routes/orderRouter");
const adminRouter = require("./routes/adminRouter");
const { apiLimiter } = require("./middlewares/rateLimiter");

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Allowed origins — localhost dev + production frontend
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.FRONTEND_URL,
  process.env.CLIENT_URI, // also support CLIENT_URI if set in env
].filter(Boolean);

// Middlewares
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, curl, serverless warmup)
      if (!origin) return callback(null, true);

      // Check if origin matches allowed list or vercel preview domains
      const isAllowed =
        allowedOrigins.includes(origin) ||
        origin.endsWith(".vercel.app"); // allows any preview or production vercel deployment

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Database connection middleware for Serverless (guarantees DB is ready before request executes)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Database connection failed. Please verify MONGO_URL and IP Whitelist.",
      error: error.message,
    });
  }
});

// Apply global rate limiting to all incoming API requests
app.use(apiLimiter);

app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Server is running smoothly.",
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint for testing DB and env in production
app.get("/health", async (req, res) => {
  try {
    await connectDB();
    res.status(200).json({
      status: "healthy",
      database: "connected",
      environment: process.env.NODE_ENV || "development",
      hasMongoUrl: Boolean(process.env.MONGO_URL),
      hasJwtSecret: Boolean(process.env.JWT_SECRET),
      hasCloudinary: Boolean(process.env.CLOUDINARY_NAME),
    });
  } catch (err) {
    res.status(500).json({
      status: "unhealthy",
      database: "disconnected",
      error: err.message,
    });
  }
});

// Routes
app.use("/user", userRouter);
app.use("/product", productRouter);
app.use("/address", addressRouter);
app.use("/order", orderRouter);
app.use("/coupon", couponCodeRouter);
app.use("/admin", adminRouter);

// Global Error Handler
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// Start Server locally
if (process.env.VERCEL !== "1") {
  app.listen(port, () => console.log(`Server running on port ${port}`));
}

module.exports = app;
