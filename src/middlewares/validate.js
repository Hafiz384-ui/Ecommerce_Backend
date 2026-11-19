/**
 * Reusable Validation Middleware Factory for Joi Schemas
 */
const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: true, // Return the first error immediately
    stripUnknown: false,
  });

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
    });
  }

  req.validatedBody = value;
  next();
};

module.exports = validate;
