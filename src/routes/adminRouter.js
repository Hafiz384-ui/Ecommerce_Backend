const express = require("express");
const router  = express.Router();

const isLoggedIn = require("../middlewares/isLoggedIn");
const { checkRole } = require("../middlewares/roleBaseAccess");
const { getAnalyticsSummary } = require("../controllers/adminController");

/**
 * GET /admin/analytics/summary
 * Admin-only: Returns full dashboard analytics in a single optimised request.
 *
 * Middleware chain:
 *   isLoggedIn   – verifies JWT and attaches req.user
 *   checkRole    – ensures only 'admin' role can access
 */
router.get(
  "/analytics/summary",
  isLoggedIn,
  checkRole(["admin"]),
  getAnalyticsSummary
);

module.exports = router;
