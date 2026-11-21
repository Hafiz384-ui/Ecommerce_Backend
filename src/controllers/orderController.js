const mongoose = require("mongoose");
const userModel = require("../models/user");
const orderModel = require("../models/order");
const productModel = require("../models/product");
const cartModel = require("../models/cart");



// Session start → Transaction begin
// Step 1: Input validate (koi DB nahi)
// Step 2: Stock pre-check (sabhi items ke liye PEHLE) ← Fail fast!
// Step 3: Order create (session ke saath)
// Step 4: Stock deduct (session ke saath, dobara check)
// Step 5: Cart delete  (session ke saath)
// Step 6: User update  (session ke saath)
// ─────────────────────────────────────────
// commitTransaction() ← Sirf tab jab sab success ho
// ─────────────────────────────────────────
// Koi bhi step fail → abortTransaction() → Sab rollback! 

module.exports.createOrder = async (req, res) => {
  // Start a MongoDB session for atomic transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = req.user;
    // Input validation (items, shippingAddress, totalAmount, discountAmount, paymentMethod)
    const { discountAmount, items, paymentMethod, shippingAddress, totalAmount } =
      req.validatedBody;

    // ─── Step 1: Verify user exists ──────────────────────────────────────────
    const authUser = await userModel.findById(user._id).session(session);
    if (!authUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({ success: false, message: "Unauthorized User" });
    }

    // ─── Step 2: Validate stock for every item BEFORE creating anything ───────
    // Check all items first, fail fast if any item is out of stock.
    for (const item of items) {
      const product = await productModel.findById(item.productId).session(session);
      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productId}`,
        });
      }

      const variant = product.variants.id(item.variantId);
      if (!variant) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: `Variant not found for product: ${product.name}`,
        });
      }

      if (variant.quantity < item.quantity) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${product.name}" (${variant.color || variant.storage || ""}). Available: ${variant.quantity}, Requested: ${item.quantity}`,
        });
      }
    }

    // ─── Step 3: Create the order ─────────────────────────────────────────────
    const [newOrder] = await orderModel.create(
      [{ userId: user._id, items, totalAmount, discountAmount, shippingAddress, paymentMethod }],
      { session }
    );

    if (!newOrder) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Failed to create order" });
    }

    // ─── Step 4: Deduct stock for every ordered item ──────────────────────────
    for (const item of newOrder.items) {
      const product = await productModel.findById(item.productId).session(session);
      if (!product) {
        // Product disappeared between our check and now — abort everything
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: `Product disappeared during order processing: ${item.productId}. Order was not placed.`,
        });
      }

      const variant = product.variants.id(item.variantId);
      if (!variant) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: `Variant disappeared during order processing. Order was not placed.`,
        });
      }

      // Final stock check inside transaction (double safety)
      if (variant.quantity < item.quantity) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Stock changed during order processing for "${product.name}". Please try again.`,
        });
      }

      variant.quantity = variant.quantity - item.quantity;
      await product.save({ session });
    }

    // ─── Step 5: Clear the user's cart ───────────────────────────────────────
    if (authUser.cart) {
      await cartModel.findByIdAndDelete(authUser.cart, { session });
      authUser.cart = null;
    }

    // ─── Step 6: Save order reference on user ────────────────────────────────
    authUser.orders.push(newOrder._id);
    await authUser.save({ session });

    // ─── All steps succeeded — commit the transaction ─────────────────────────
    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      message: "Order placed successfully!",
      order: newOrder,
    });

  } catch (error) {
    // Any unexpected error — rollback everything
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating order (transaction rolled back):", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error. Order was not placed.",
      error: error.message,
    });
  }
};

/**
 * Controller to get all orders
 * */ 

module.exports.getOrders = async (req, res) => {
  try {
    const user = req.user;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit) || 5));
    const status = req.query.status ? String(req.query.status).trim() : "";
    const search = req.query.search ? String(req.query.search).trim() : "";
    const skip = (page - 1) * limit;

    // Build filter query for Order model
    const query = { userId: user._id };

    // Status filter
    if (status && status !== "all") {
      if (status === "active") {
        query.status = { $in: ["Placed", "Processing", "Shipped"] };
      } else if (status === "delivered") {
        query.status = "Delivered";
      } else if (status === "cancelled") {
        query.status = "Cancelled";
      } else {
        query.status = status;
      }
    }

    // Search filter (by order ID or item name)
    if (search) {
      const isObjectId = /^[a-f\d]{24}$/i.test(search);
      if (isObjectId) {
        query.$or = [{ _id: search }, { "items.name": { $regex: search, $options: "i" } }];
      } else {
        query["items.name"] = { $regex: search, $options: "i" };
      }
    }

    const totalOrders = await orderModel.countDocuments(query);

    const orders = await orderModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.ceil(totalOrders / limit) || 1;

    res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      orders: orders || [],
      pagination: {
        totalOrders,
        totalPages,
        currentPage: page,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};


/**
 * Admin: Get ALL orders across all users with filters, search, sort, and pagination.
 *
 * Query Params:
 *   - page        (number, default 1)
 *   - limit       (number, default 10, max 100)
 *   - status      (string) "all" | "Placed" | "Processing" | "Shipped" | "Delivered" | "Cancelled" | "active"
 *   - search      (string) order ObjectId OR customer username/email (partial match)
 *   - sort        (string) "newest" | "oldest" | "amount-high" | "amount-low"
 *   - dateFrom    (string) ISO date string — filter orders created on/after this date
 *   - dateTo      (string) ISO date string — filter orders created on/before this date
 *   - paymentMethod (string) "COD" etc.
 */
module.exports.getAllOrders = async (req, res) => {
  try {
    // ── 1. Parse & sanitize query params ────────────────────────────────────
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10));
    const skip   = (page - 1) * limit;

    const status        = req.query.status        ? String(req.query.status).trim()        : "";
    const search        = req.query.search        ? String(req.query.search).trim()        : "";
    const sort          = req.query.sort          ? String(req.query.sort).trim()          : "newest";
    const paymentMethod = req.query.paymentMethod ? String(req.query.paymentMethod).trim() : "";
    const dateFrom      = req.query.dateFrom      ? String(req.query.dateFrom).trim()      : "";
    const dateTo        = req.query.dateTo        ? String(req.query.dateTo).trim()        : "";

    // ── 2. Build the base match stage (no userId filter — admin sees all) ────
    const matchStage = {};

    // Status filter
    if (status && status !== "all") {
      if (status === "active") {
        matchStage.status = { $in: ["Placed", "Processing", "Shipped"] };
      } else {
        const validStatuses = ["Placed", "Processing", "Shipped", "Delivered", "Cancelled"];
        if (validStatuses.includes(status)) {
          matchStage.status = status;
        }
      }
    }

    // Payment method filter
    if (paymentMethod) {
      matchStage.paymentMethod = paymentMethod;
    }

    // Date range filter (UTC-safe)
    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (!isNaN(from)) matchStage.createdAt.$gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        if (!isNaN(to)) {
          to.setHours(23, 59, 59, 999); // include the full end day
          matchStage.createdAt.$lte = to;
        }
      }
    }

    // Search by Order ObjectId
    const isObjectId = /^[a-f\d]{24}$/i.test(search);
    if (search && isObjectId) {
      matchStage._id = new mongoose.Types.ObjectId(search);
    }

    // ── 3. Sort stage ────────────────────────────────────────────────────────
    const sortMap = {
      newest:      { createdAt: -1 },
      oldest:      { createdAt:  1 },
      "amount-high": { totalAmount: -1 },
      "amount-low":  { totalAmount:  1 },
    };
    const sortStage = sortMap[sort] || { createdAt: -1 };

    // ── 4. Aggregation pipeline ──────────────────────────────────────────────
    // We use aggregation so we can join user info and filter by user name/email
    // in a single efficient round-trip.
    const pipeline = [
      // Stage 1: Filter orders by status / date / id
      { $match: matchStage },

      // Stage 2: Join with users collection to get customer info
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "customer",
          pipeline: [
            { $project: { username: 1, email: 1, _id: 1 } }, // only needed fields
          ],
        },
      },

      // Stage 3: Flatten the customer array into an object
      { $addFields: { customer: { $arrayElemAt: ["$customer", 0] } } },

      // Stage 4: Search by customer username / email (text partial match)
      ...(search && !isObjectId
        ? [
            {
              $match: {
                $or: [
                  { "customer.username": { $regex: search, $options: "i" } },
                  { "customer.email":    { $regex: search, $options: "i" } },
                  { "items.name":        { $regex: search, $options: "i" } },
                ],
              },
            },
          ]
        : []),

      // Stage 5: Run count and paginated data in parallel
      {
        $facet: {
          metadata: [{ $count: "totalOrders" }],
          orders: [
            { $sort: sortStage },
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                status: 1,
                totalAmount: 1,
                discountAmount: 1,
                paymentMethod: 1,
                shippingAddress: 1,
                deliveryDate: 1,
                createdAt: 1,
                updatedAt: 1,
                items: 1,
                // Customer summary (not sensitive)
                "customer._id": 1,
                "customer.username": 1,
                "customer.email": 1,
              },
            },
          ],
        },
      },
    ];

    const [result] = await orderModel.aggregate(pipeline);

    const totalOrders = result?.metadata?.[0]?.totalOrders ?? 0;
    const orders      = result?.orders ?? [];
    const totalPages  = Math.ceil(totalOrders / limit) || 1;

    // ── 5. Summary stats (cheap extra counts using same match) ───────────────
    const [stats] = await orderModel.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalRevenue:   { $sum: "$totalAmount" },
          placedCount:    { $sum: { $cond: [{ $eq: ["$status", "Placed"] },      1, 0] } },
          processingCount:{ $sum: { $cond: [{ $eq: ["$status", "Processing"] },  1, 0] } },
          shippedCount:   { $sum: { $cond: [{ $eq: ["$status", "Shipped"] },     1, 0] } },
          deliveredCount: { $sum: { $cond: [{ $eq: ["$status", "Delivered"] },   1, 0] } },
          cancelledCount: { $sum: { $cond: [{ $eq: ["$status", "Cancelled"] },   1, 0] } },
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      message: "All orders fetched successfully",
      orders,
      pagination: {
        totalOrders,
        totalPages,
        currentPage: page,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      stats: stats
        ? {
            totalRevenue:    stats.totalRevenue    ?? 0,
            placedCount:     stats.placedCount     ?? 0,
            processingCount: stats.processingCount ?? 0,
            shippedCount:    stats.shippedCount    ?? 0,
            deliveredCount:  stats.deliveredCount  ?? 0,
            cancelledCount:  stats.cancelledCount  ?? 0,
          }
        : null,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * Controller for updating order status
*/

module.exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { orderId } = req.params;

    const validStatuses = ["Placed", "Processing", "Shipped", "Delivered"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid order status" });
    }

    const order = await orderModel.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.status = status;
    await order.save();

    // if (status === "Shipped") {
    //   for (const item of order.items) {
    //     const product = await productModel.findById(item.productId);
    //     if (!product) continue;

    //     const variant = product.variants.id(item.variantId);
    //     if (variant) {
    //       variant.quantity = Math.max(0, variant.quantity - item.quantity);
    //     }

    //     await product.save();
    //   }
    // }

    res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};


