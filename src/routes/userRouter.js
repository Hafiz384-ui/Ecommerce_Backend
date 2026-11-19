const express = require("express");
const router = express.Router();
const isLoggedIn = require("../middlewares/isLoggedIn");
const validate = require("../middlewares/validate");
const {
  registerUserSchema,
  loginUserSchema,
  createAdminSchema,
} = require("../validators/userValidator");
const { createAdmin, registerUser, loginUser, logoutUser, fetchMe } = require("../controllers/userController");

// register admin
router.post("/createadmin", validate(createAdminSchema), createAdmin);

// User Registration Route
router.post("/register", validate(registerUserSchema), registerUser);

// User Login Route
router.post("/login", validate(loginUserSchema), loginUser);

// User Logout Route
router.post("/logout", logoutUser);

router.get("/mydata", isLoggedIn, fetchMe);

module.exports = router;


