const couponCodeModel = require("../models/coupon-code")
const userModel = require("../models/user")

module.exports.createCoupon = async (req, res) => {
  try {
    const { code, discountValue } = req.validatedBody || req.body;

    const newCoupon = await couponCodeModel.create({
      code: code.toUpperCase(),
      discountValue,
      expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      isActive: true,
    });

    // push the coupon to all users who is not having this coupon
    const updateResult = await userModel.updateMany(
      { "coupons.coupon": { $ne: newCoupon._id } },
      { $push: { coupons: { coupon: newCoupon._id, isUsed: false } } }
    );

    // for (let user of users) {
    //   const alreadyAssigned = user.coupons.some(
    //     (c) => c.coupon.toString() === newCoupon._id.toString()
    //   );
    //   if (!alreadyAssigned) {
    //     user.coupons.push({
    //       coupon: newCoupon._id,
    //       isUsed: false,
    //     });
    //     await user.save(); 
    //   }
    // }

    res.json({
      message: `Coupon '${newCoupon.code}' created and assigned to ${updateResult.modifiedCount} users.`,
      coupon: newCoupon
    });

  } catch (error) {
    res.status(500).json({ message: "Error creating coupon", error: error.message });
  }
}

module.exports.myCoupons = async (req, res) => {
  try {
    const user = await userModel
      .findById(req.user._id)
      .populate("coupons.coupon")
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const now = new Date();

    // Map each assigned coupon to a rich, explicit status contract (like Amazon / Shopify)
    const formattedCoupons = (user.coupons || [])
      .filter((item) => item.coupon) // guard against deleted coupon docs
      .map((item) => {
        const couponDoc = item.coupon;
        const isExpired = couponDoc.expiryDate ? new Date(couponDoc.expiryDate) < now : false;
        const isUsed = Boolean(item.isUsed);
        const isSystemActive = Boolean(couponDoc.isActive);

        // Explicit status calculation
        let status = "ACTIVE";
        let statusLabel = "Available";

        if (isUsed) {
          status = "USED";
          statusLabel = "Redeemed";
        } else if (isExpired) {
          status = "EXPIRED";
          statusLabel = "Expired";
        } else if (!isSystemActive) {
          status = "DISABLED";
          statusLabel = "Inactive";
        }

        return {
          _id: couponDoc._id,
          code: couponDoc.code,
          discountValue: couponDoc.discountValue,
          expiryDate: couponDoc.expiryDate,
          isActive: isSystemActive && !isExpired && !isUsed,
          isUsed,
          isExpired,
          status, // 'ACTIVE' | 'USED' | 'EXPIRED' | 'DISABLED'
          statusLabel, // 'Available' | 'Redeemed' | 'Expired' | 'Inactive'
          assignedAt: item._id ? item._id.getTimestamp?.() : undefined,
        };
      });

    // Sort: Active coupons first, then by earliest expiry, followed by used/expired
    formattedCoupons.sort((a, b) => {
      const order = { ACTIVE: 1, DISABLED: 2, EXPIRED: 3, USED: 4 };
      if (order[a.status] !== order[b.status]) {
        return order[a.status] - order[b.status];
      }
      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
    });

    res.status(200).json({
      success: true,
      coupon: formattedCoupons,
      total: formattedCoupons.length,
      activeCount: formattedCoupons.filter((c) => c.status === "ACTIVE").length,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

module.exports.applyCoupon = async (req, res) => {
  try {
    const userId = req.user._id;
    const { code } = req.validatedBody || req.body;
    const normalizedCode = code.toUpperCase();

    // 1. Find coupon
    const coupon = await couponCodeModel.findOne({ code: normalizedCode });
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Invalid coupon code" });
    }

    if (!coupon.isActive) {
      return res.status(400).json({ success: false, message: "Coupon is not active" });
    }

    // 2. Expiry check
    if (new Date() > new Date(coupon.expiryDate)) {
      coupon.isActive = false;
      await coupon.save();
      return res.status(400).json({ success: false, message: "Coupon has expired" });
    }

    // 3. ATOMIC Check-and-Update (Eliminates Race Conditions)
    // Only updates if coupon is assigned to user AND isUsed is strictly false
    const updatedUser = await userModel.findOneAndUpdate(
      {
        _id: userId,
        coupons: {
          $elemMatch: {
            coupon: coupon._id,
            isUsed: false,
          },
        },
      },
      {
        $set: { "coupons.$.isUsed": true },
      },
      { new: true }
    );

    // If no document matched, find out the exact reason for user-friendly feedback
    if (!updatedUser) {
      const user = await userModel.findById(userId, "coupons").lean();
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

       const assignedCoupon = user.coupons?.find(
        (c) => c.coupon.toString() === coupon._id.toString()
      );

      if (!assignedCoupon) {
        return res.status(403).json({ success: false, message: "This coupon is not assigned to you" });
      }

      if (assignedCoupon.isUsed) {
        return res.status(400).json({ success: false, message: "Coupon already used" });
      }

      return res.status(400).json({ success: false, message: "Unable to apply coupon. Please try again." });
    }

    return res.status(200).json({
      success: true,
      message: "Coupon applied successfully",
      discount: coupon.discountValue,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error applying coupon", error: error.message });
  }
};