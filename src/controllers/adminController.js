const mongoose = require("mongoose");
const userModel    = require("../models/user");
const orderModel   = require("../models/order");
const productModel = require("../models/product");
const couponModel  = require("../models/coupon-code");

// ─── Constants ────────────────────────────────────────────────────────────────
const LOW_STOCK_THRESHOLD = 5; // variants with quantity ≤ this are "low-stock"
const TOP_PRODUCTS_LIMIT  = 5; // how many top-selling / top-rated products to return

/**
 * GET /admin/analytics/summary
 *
 * Returns a one-shot admin dashboard summary in a single response:
 *   • User stats         – total, new this month, role breakdown
 *   • Order stats        – total, revenue, avg order value, per-status counts
 *   • Revenue trend      – last 6 months monthly breakdown
 *   • Top-selling        – products ranked by units sold (from order items)
 *   • Top-rated          – products by ratings + review count
 *   • Low-stock          – variants whose quantity ≤ LOW_STOCK_THRESHOLD
 *   • Category breakdown – order revenue & count per product category
 *   • Coupon stats       – total, active, expired
 *
 * All aggregations run in PARALLEL (Promise.allSettled) so one slow collection
 * never blocks the others.  Results are sanitised before the response so a
 * single pipeline failure returns null for that block instead of a 500.
 */
module.exports.getAnalyticsSummary = async (req, res) => {
  try {
    const now       = new Date();
    // Start-of-current month (UTC)
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    // Start of 6-month window
    const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

    // ── Run all aggregations in parallel ────────────────────────────────────
    const [
      userStatsResult,
      orderStatsResult,
      revenueTrendResult,
      topSellingResult,
      topRatedResult,
      lowStockResult,
      categoryBreakdownResult,
      couponStatsResult,
    ] = await Promise.allSettled([

      // ── 1. USER STATS ──────────────────────────────────────────────────────
      userModel.aggregate([
        {
          $facet: {
            total:    [{ $count: "count" }],
            newThisMonth: [
              { $match: { createdAt: { $gte: monthStart } } },
              { $count: "count" },
            ],
            byRole: [
              { $group: { _id: "$role", count: { $sum: 1 } } },
            ],
          },
        },
      ]),

      // ── 2. ORDER STATS (global) ────────────────────────────────────────────
      orderModel.aggregate([
        {
          $facet: {
            overall: [
              {
                $group: {
                  _id:            null,
                  totalOrders:    { $sum: 1 },
                  totalRevenue:   { $sum: "$totalAmount" },
                  totalDiscount:  { $sum: "$discountAmount" },
                  avgOrderValue:  { $avg: "$totalAmount" },
                },
              },
            ],
            newThisMonth: [
              { $match: { createdAt: { $gte: monthStart } } },
              { $count: "count" },
            ],
            byStatus: [
              { $group: { _id: "$status", count: { $sum: 1 } } },
            ],
          },
        },
      ]),

      // ── 3. REVENUE TREND — last 6 months ─────────────────────────────────
      orderModel.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo }, status: { $ne: "Cancelled" } } },
        {
          $group: {
            _id: {
              year:  { $year:  "$createdAt" },
              month: { $month: "$createdAt" },
            },
            revenue: { $sum: "$totalAmount" },
            orders:  { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
        {
          $project: {
            _id:     0,
            year:    "$_id.year",
            month:   "$_id.month",
            revenue: 1,
            orders:  1,
          },
        },
      ]),

      // ── 4. TOP-SELLING PRODUCTS (by units sold from orders) ───────────────
      orderModel.aggregate([
        { $match: { status: { $ne: "Cancelled" } } },
        { $unwind: "$items" },
        {
          $group: {
            _id:        "$items.productId",
            unitsSold:  { $sum: "$items.quantity" },
            revenue:    { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
            name:       { $first: "$items.name" },
            image:      { $first: "$items.image" },
          },
        },
        { $sort: { unitsSold: -1 } },
        { $limit: TOP_PRODUCTS_LIMIT },
        {
          $project: {
            _id:       1,
            name:      1,
            image:     1,
            unitsSold: 1,
            revenue:   1,
          },
        },
      ]),

      // ── 5. TOP-RATED PRODUCTS ─────────────────────────────────────────────
      productModel.aggregate([
        { $match: { numOfReviews: { $gt: 0 } } },
        { $sort: { ratings: -1, numOfReviews: -1 } },
        { $limit: TOP_PRODUCTS_LIMIT },
        {
          $project: {
            _id:          1,
            name:         1,
            brand:        1,
            category:     1,
            baseprice:    1,
            ratings:      1,
            numOfReviews: 1,
            image:        { $arrayElemAt: ["$images", 0] },
          },
        },
      ]),

      // ── 6. LOW-STOCK PRODUCTS ─────────────────────────────────────────────
      productModel.aggregate([
        { $unwind: "$variants" },
        { $match: { "variants.quantity": { $lte: LOW_STOCK_THRESHOLD } } },
        { $sort: { "variants.quantity": 1 } },           // most critical first
        { $limit: 20 },                                  // cap at 20 entries
        {
          $project: {
            _id:      1,
            name:     1,
            category: 1,
            brand:    1,
            image:    { $arrayElemAt: ["$images", 0] },
            variant: {
              variantId: "$variants._id",
              color:     "$variants.color",
              storage:   "$variants.storage",
              quantity:  "$variants.quantity",
            },
          },
        },
      ]),

      // ── 7. CATEGORY BREAKDOWN (revenue + orders per category) ────────────
      orderModel.aggregate([
        { $match: { status: { $ne: "Cancelled" } } },
        { $unwind: "$items" },
        // Join each order-item to its product to get the category
        {
          $lookup: {
            from:         "products",
            localField:   "items.productId",
            foreignField: "_id",
            as:           "product",
            pipeline: [{ $project: { category: 1 } }],
          },
        },
        { $addFields: { product: { $arrayElemAt: ["$product", 0] } } },
        {
          $group: {
            _id:       "$product.category",
            revenue:   { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
            unitsSold: { $sum: "$items.quantity" },
            orders:    { $sum: 1 },
          },
        },
        { $sort: { revenue: -1 } },
        {
          $project: {
            _id:       0,
            category:  "$_id",
            revenue:   1,
            unitsSold: 1,
            orders:    1,
          },
        },
      ]),

      // ── 8. COUPON STATS ───────────────────────────────────────────────────
      couponModel.aggregate([
        {
          $facet: {
            total:   [{ $count: "count" }],
            active:  [{ $match: { isActive: true,  expiryDate: { $gte: now } } }, { $count: "count" }],
            expired: [{ $match: { $or: [{ isActive: false }, { expiryDate: { $lt: now } }] } }, { $count: "count" }],
          },
        },
      ]),
    ]);

    // ── Helper: safely unwrap Promise.allSettled results ────────────────────
    const safe = (result, fallback = null) =>
      result.status === "fulfilled" ? result.value : fallback;

    // ── 1. Shape: User Stats ─────────────────────────────────────────────────
    const userRaw  = safe(userStatsResult, [{}])[0] ?? {};
    const roleMap  = {};
    (userRaw.byRole ?? []).forEach(({ _id, count }) => { roleMap[_id ?? "unknown"] = count; });
    const userStats = {
      total:        userRaw.total?.[0]?.count        ?? 0,
      newThisMonth: userRaw.newThisMonth?.[0]?.count ?? 0,
      customers:    roleMap.customer ?? 0,
      admins:       roleMap.admin    ?? 0,
    };

    // ── 2. Shape: Order Stats ────────────────────────────────────────────────
    const orderRaw    = safe(orderStatsResult, [{}])[0] ?? {};
    const overall     = orderRaw.overall?.[0] ?? {};
    const statusMap   = {};
    (orderRaw.byStatus ?? []).forEach(({ _id, count }) => { statusMap[_id ?? "unknown"] = count; });
    const orderStats = {
      total:          overall.totalOrders   ?? 0,
      newThisMonth:   orderRaw.newThisMonth?.[0]?.count ?? 0,
      totalRevenue:   Math.round((overall.totalRevenue  ?? 0) * 100) / 100,
      totalDiscount:  Math.round((overall.totalDiscount ?? 0) * 100) / 100,
      avgOrderValue:  Math.round((overall.avgOrderValue ?? 0) * 100) / 100,
      byStatus: {
        placed:     statusMap.Placed     ?? 0,
        processing: statusMap.Processing ?? 0,
        shipped:    statusMap.Shipped    ?? 0,
        delivered:  statusMap.Delivered  ?? 0,
        cancelled:  statusMap.Cancelled  ?? 0,
      },
    };

    // ── 3. Shape: Revenue Trend ──────────────────────────────────────────────
    const revenueTrend = safe(revenueTrendResult, []);

    // ── 4–7. Already shaped by aggregation ──────────────────────────────────
    const topSelling       = safe(topSellingResult,       []);
    const topRated         = safe(topRatedResult,         []);
    const lowStock         = safe(lowStockResult,         []);
    const categoryBreakdown = safe(categoryBreakdownResult, []);

    // ── 8. Shape: Coupon Stats ───────────────────────────────────────────────
    const couponRaw  = safe(couponStatsResult, [{}])[0] ?? {};
    const couponStats = {
      total:   couponRaw.total?.[0]?.count   ?? 0,
      active:  couponRaw.active?.[0]?.count  ?? 0,
      expired: couponRaw.expired?.[0]?.count ?? 0,
    };

    // ── Response ─────────────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      message: "Analytics summary fetched successfully",
      generatedAt: now.toISOString(),
      data: {
        users:             userStats,
        orders:            orderStats,
        revenueTrend,       // array of { year, month, revenue, orders }
        topSelling,         // top N products by units sold
        topRated,           // top N products by rating
        lowStock,           // variants with quantity ≤ LOW_STOCK_THRESHOLD
        categoryBreakdown,  // per-category revenue + units
        coupons:            couponStats,
      },
    });

  } catch (error) {
    console.error("Admin analytics summary error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch analytics summary",
      error: error.message,
    });
  }
};
