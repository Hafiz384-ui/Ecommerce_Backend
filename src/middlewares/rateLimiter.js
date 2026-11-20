const rateLimit = require("express-rate-limit");

/**
 * General API Limiter:
 * Protects server from DDoS and aggressive scraping.
 * 15 minutes window, max 300 requests per IP.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again after 15 minutes.",
  },
});

/**
 * Strict Auth Limiter:
 * Protects login, registration and admin creation from brute force attacks.
 * 15 minutes window, max 10 attempts per IP.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again after 15 minutes.",
  },
});

module.exports = {
  apiLimiter,
  authLimiter,
};
