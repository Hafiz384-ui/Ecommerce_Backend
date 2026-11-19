const jwt = require("jsonwebtoken");
const userModel = require("../models/user");

module.exports = async function isLoggedIn(req, res, next) {
  try {
    const token = req.cookies?.token || req.headers?.cookie?.split(" ")[1]
    if (!token) {
      return res.status(401).json({ message: "unauthorized" });
    }
    const decode = jwt.verify(token, process.env.JWT_SECRET);
    if (!decode) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const user = await userModel.findOne({
      _id: decode.userId,
      email: decode.email,
    });
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token invalid or expired" });
    }
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
