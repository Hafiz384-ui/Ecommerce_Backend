const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
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

// Allowed origins — localhost dev + production frontend (safe fallback if not set)
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.FRONTEND_URL, // set in Vercel dashboard env vars
].filter(Boolean); // removes undefined if FRONTEND_URL not set

// Middlewares
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server / Postman requests (no origin header)
      if (!origin || allowedOrigins.includes(origin)) {
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

// Apply global rate limiting to all incoming API requests
app.use(apiLimiter);

app.get('/', (req, res)=>{
  res.send('server is running in the production.')
})

// Routes
app.use("/user", userRouter);
app.use("/product", productRouter);
app.use("/address", addressRouter);
app.use("/order", orderRouter);
app.use("/coupon", couponCodeRouter);
app.use("/admin", adminRouter);
// Database Connection
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch((err) => console.error("MongoDB Connection Error:", err));

// Start Server
// Vercel serverless mein app.listen() ki zaroorat nahi — VERCEL=1 auto set hota hai
// Locally (dev/staging/production docker) har case mein listen karega
if (process.env.VERCEL !== "1") {
  app.listen(port, () => console.log(`Server running on port ${port}`));
}

module.exports = app;
