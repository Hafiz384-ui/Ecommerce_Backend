const userModel = require("../models/user");
const bcrypt = require("bcrypt");
const generateToken = require("../utils/generateToken");

module.exports.createAdmin = async function (req, res) {
  try {
    const { username, email, password, role } = req.validatedBody || req.body;

    let admin = await userModel.find({ role: "admin" });
    console.log("Creating admin user", admin.length);
    if (admin.length > 0) {
      return res
        .status(403)
        .send("You don't have permission to create a new owner.");
    }
    const salt = await bcrypt.genSalt(10);
    const hashpassword = await bcrypt.hash(password, salt);
    let createOwner = await userModel.create({
      username,
      role,
      email,
      password: hashpassword,
    });
    res.status(201).json({
      message: "Admin user created successfully",
      user: createOwner,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
}

module.exports.registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.validatedBody || req.body;

    let existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User with this email already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, salt);
    let newUser = await userModel.create({
      username,
      email,
      password: hashPassword,
    });

    const userObj = newUser.toObject();
    delete userObj.password;

    res.status(201).json({
      message: "User registered successfully",
      user: userObj,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
}

module.exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.validatedBody || req.body;

    let user = await userModel.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }
    bcrypt.compare(password, user.password, (err, result) => {
      let token = generateToken(user);
      if (result) {
        res.cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "strict",
          maxAge:  7 * 24 * 60 * 60 * 1000
        });

        const userObj = user.toObject();
        delete userObj.password;

        res.status(200).json({ message: "Login successful", token, user: userObj });
      } else {
        res.status(400).json({ message: "Invalid email or password" });
      }
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
}

module.exports.logoutUser =  (req, res)=>{
    res.clearCookie("token");
    res.status(200).json({message: "Logout successful"});
}

module.exports.fetchMe = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: "Unauthorized User" });
    }

    const user = await userModel.findById(req.user._id).select("-password").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};