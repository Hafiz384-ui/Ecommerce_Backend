const Joi = require("joi");

const registerUserSchema = Joi.object({
  username: Joi.string().trim().min(3).max(30).required().messages({
    "any.required": "Username is required",
    "string.empty": "Username cannot be empty",
    "string.min": "Username must be at least 3 characters",
    "string.max": "Username cannot exceed 30 characters",
  }),
  email: Joi.string().trim().email().required().messages({
    "any.required": "Email is required",
    "string.empty": "Email cannot be empty",
    "string.email": "Please provide a valid email address",
  }),
  password: Joi.string().min(6).required().messages({
    "any.required": "Password is required",
    "string.empty": "Password cannot be empty",
    "string.min": "Password must be at least 6 characters",
  }),
});

const loginUserSchema = Joi.object({
  email: Joi.string().trim().email().required().messages({
    "any.required": "Email is required",
    "string.empty": "Email cannot be empty",
    "string.email": "Please provide a valid email address",
  }),
  password: Joi.string().required().messages({
    "any.required": "Password is required",
    "string.empty": "Password cannot be empty",
  }),
});

const createAdminSchema = Joi.object({
  username: Joi.string().trim().min(3).max(30).required().messages({
    "any.required": "Username is required",
  }),
  email: Joi.string().trim().email().required().messages({
    "any.required": "Email is required",
    "string.email": "Please provide a valid email address",
  }),
  password: Joi.string().min(6).required().messages({
    "any.required": "Password is required",
    "string.min": "Password must be at least 6 characters",
  }),
  role: Joi.string().valid("admin").required().messages({
    "any.required": "Role is required",
    "any.only": "Role must be 'admin'",
  }),
});

module.exports = {
  registerUserSchema,
  loginUserSchema,
  createAdminSchema,
};
