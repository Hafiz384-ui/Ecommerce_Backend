const Joi = require("joi");

const createAddressSchema = Joi.object({
  fullName: Joi.string().trim().min(2).required().messages({
    "any.required": "Full name is required",
    "string.empty": "Full name cannot be empty",
    "string.min": "Full name must be at least 2 characters",
  }),
  address: Joi.string().trim().min(3).required().messages({
    "any.required": "Address is required",
    "string.empty": "Address cannot be empty",
    "string.min": "Address must be at least 3 characters",
  }),
  city: Joi.string().trim().min(2).required().messages({
    "any.required": "City is required",
    "string.empty": "City cannot be empty",
  }),
  state: Joi.string().trim().min(2).required().messages({
    "any.required": "State is required",
    "string.empty": "State cannot be empty",
  }),
  zip: Joi.string().trim().min(3).required().messages({
    "any.required": "Zip code is required",
    "string.empty": "Zip code cannot be empty",
  }),
  country: Joi.string().trim().default("Pakistan").optional(),
  phone: Joi.string()
    .trim()
    .pattern(/^[0-9+ -]{7,20}$/)
    .required()
    .messages({
      "any.required": "Phone number is required",
      "string.empty": "Phone number cannot be empty",
      "string.pattern.base": "Please provide a valid phone number",
    }),
  isDefault: Joi.boolean().optional(),
});

module.exports = {
  createAddressSchema,
};
