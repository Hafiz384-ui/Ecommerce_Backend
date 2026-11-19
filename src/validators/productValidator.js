const Joi = require("joi");

const objectId = Joi.string()
  .pattern(/^[a-f\d]{24}$/i)
  .message("Must be a valid MongoDB ObjectId");

const addToCartSchema = Joi.object({
  productId: objectId.required().messages({
    "any.required": "productId is required",
    "string.empty": "productId cannot be empty",
  }),
  variantId: objectId.required().messages({
    "any.required": "variantId is required",
    "string.empty": "variantId cannot be empty",
  }),
  quantity: Joi.number().integer().min(1).required().messages({
    "any.required": "quantity is required",
    "number.min": "quantity must be at least 1",
  }),
  variantMaxQuantity: Joi.number().integer().min(1).optional(),
}).unknown(true);

const productReviewSchema = Joi.object({
  productId: objectId.required().messages({
    "any.required": "productId is required",
    "string.empty": "productId cannot be empty",
  }),
  rating: Joi.number().min(1).max(5).required().messages({
    "any.required": "Rating is required",
    "number.min": "Rating must be at least 1",
    "number.max": "Rating cannot exceed 5",
  }),
  comment: Joi.string().trim().min(3).required().messages({
    "any.required": "Comment is required",
    "string.empty": "Comment cannot be empty",
    "string.min": "Comment must be at least 3 characters",
  }),
});

module.exports = {
  addToCartSchema,
  productReviewSchema,
};
