const express = require("express");
const router = express.Router();
const isLoggedIn = require("../middlewares/isLoggedIn");
const validate = require("../middlewares/validate");
const { checkRole } = require("../middlewares/roleBaseAccess");
const { createCouponSchema, applyCouponSchema } = require("../validators/couponValidator");
const { createCoupon, myCoupons, applyCoupon } = require("../controllers/couponController");

router.post("/createcoupon", isLoggedIn, checkRole(['admin']), validate(createCouponSchema), createCoupon);

router.get("/mycoupons", isLoggedIn, myCoupons);

router.post("/applycoupon", isLoggedIn, validate(applyCouponSchema), checkRole(['customer']), applyCoupon);

module.exports = router;

