const express = require("express");
const router = express.Router();
const isLoggedIn = require("../middlewares/isLoggedIn");
const validate = require("../middlewares/validate");
const { createAddressSchema } = require("../validators/addressValidator");
const { getAddresses, createAddress, deleteAddress } = require("../controllers/addressController");

router.post("/createaddress", isLoggedIn, validate(createAddressSchema), createAddress);

router.get("/getaddresses", isLoggedIn, getAddresses);

router.get("/deleteaddress/:id", isLoggedIn, deleteAddress);

module.exports = router;

