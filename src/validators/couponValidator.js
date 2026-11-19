const Joi = require("joi");

const createCouponSchema = Joi.object({
  code: Joi.string().trim().uppercase().min(3).max(20).required().messages({
    "any.required": "Coupon code is required",
    "string.empty": "Coupon code cannot be empty",
    "string.min": "Coupon code must be at least 3 characters",
  }),
  discountValue: Joi.number().min(1).required().messages({
    "any.required": "Discount value is required",
    "number.min": "Discount value must be at least 1",
  }),
});

const applyCouponSchema = Joi.object({
  code: Joi.string().trim().uppercase().required().messages({
    "any.required": "Coupon code is required",
    "string.empty": "Coupon code cannot be empty",
  }),
});

module.exports = {
  createCouponSchema,
  applyCouponSchema,
};
