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
    const userOrders = await userModel
      .findOne({ _id: user._id })
      .populate("orders")
      .lean();

    if (!userOrders) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      orders: userOrders.orders,
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


