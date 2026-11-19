const Joi = require("joi");

// ─── Reusable: MongoDB ObjectId string ───────────────────────────────────────
const objectId = Joi.string()
  .pattern(/^[a-f\d]{24}$/i)
  .message("Must be a valid MongoDB ObjectId");

// ─── Schema for a single order item ──────────────────────────────────────────
const orderItemSchema = Joi.object({
  productId: objectId.required().messages({
    "any.required": "productId is required for each item",
    "string.empty": "productId cannot be empty",
  }),
  variantId: objectId.required().messages({
    "any.required": "variantId is required for each item",
    "string.empty": "variantId cannot be empty",
  }),
  quantity: Joi.number().integer().min(1).required().messages({
    "any.required": "quantity is required for each item",
    "number.min": "quantity must be at least 1",
    "number.integer": "quantity must be a whole number",
  }),
  name: Joi.string().optional(),
  image: Joi.string().optional(),
  color: Joi.string().optional(),
  price: Joi.number().min(0).optional(),
});

// ─── Schema for shipping address ─────────────────────────────────────────────
const shippingAddressSchema = Joi.object({
  fullName: Joi.string().min(2).required().messages({
    "any.required": "Full name is required in shipping address",
    "string.min": "Full name must be at least 2 characters",
  }),
  address: Joi.string().min(1).required().messages({
    "any.required": "Address is required",
    "string.min": "Address cannot be empty",
  }),
  city: Joi.string().min(1).required().messages({
    "any.required": "City is required in shipping address",
  }),
  state: Joi.string().min(1).required().messages({
    "any.required": "State is required in shipping address",
  }),
  zip: Joi.string().min(1).required().messages({
    "any.required": "Zip code is required in shipping address",
  }),
  country: Joi.string().optional().default("Pakistan"),
  phone: Joi.string()
    .pattern(/^[0-9+ -]{7,20}$/)
    .required()
    .messages({
      "any.required": "Phone number is required in shipping address",
      "string.pattern.base": "Please provide a valid phone number",
    }),
  isDefault: Joi.boolean().optional(),
}).unknown(true); // allow extra fields like _id, createdAt, updatedAt, __v

// ─── Main: Create Order schema ────────────────────────────────────────────────
const createOrderSchema = Joi.object({
  items: Joi.array().items(orderItemSchema).min(1).required().messages({
    "any.required": "Order items are required",
    "array.min": "Order must have at least one item",
    "array.base": "Items must be an array",
  }),
  shippingAddress: shippingAddressSchema.required().messages({
    "any.required": "Shipping address is required",
  }),
  totalAmount: Joi.number().min(0).required().messages({
    "any.required": "Total amount is required",
    "number.min": "Total amount cannot be negative",
  }),
  discountAmount: Joi.number().min(0).default(0).messages({
    "number.min": "Discount amount cannot be negative",
  }),
  paymentMethod: Joi.string().valid("COD").default("COD").messages({
    "any.only": "Payment method must be COD",
  }),
});

// ─── Reusable validation middleware factory ───────────────────────────────────
/**
 * Returns an Express middleware that validates req.body against the given schema.
 * On failure → 400 with the first error message.
 * On success → calls next() with validated (cleaned) data on req.validatedBody.
 */
const validate = (schema) => (req, res, next) => {
  console.log('validate addres', req.body)
  const { error, value } = schema.validate(req.body, {
    abortEarly: true,     // stop at first error (keeps messages clean)
    stripUnknown: false,  // keep extra fields (addresses may have _id etc.)
  });

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
    });
  }

  req.validatedBody = value; // cleaned & defaulted data available in controller
  next();
};

module.exports = {
  createOrderSchema,
};

