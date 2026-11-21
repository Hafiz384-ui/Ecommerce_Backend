const express = require("express");
const router = express.Router();
const uploads = require("../config/multer-config");
const isLoggedIn = require("../middlewares/isLoggedIn.js");
const validate = require("../middlewares/validate.js");
const { checkRole } = require("../middlewares/roleBaseAccess.js");
const { addToCartSchema, productReviewSchema } = require("../validators/productValidator.js");
const { createProduct, fetchProduct, getproductById, getproductByCategory, addProductToWishlist, getWishlistItems, addProductToCart, getCartItems, deleteCartItems, orderSummery, productReview } = require("../controllers/productController.js");

// Create a new product
router.post("/createproduct", isLoggedIn , checkRole(['admin']), uploads.array("images", 3), createProduct);

// Get all products with their variants
router.get("/fetchproducts", fetchProduct);

// Get product in product details page by ID
router.get("/getproduct/:id", getproductById);

// get products by category
router.get("/getproductsbycategory/:category", getproductByCategory);

router.post("/addtowishlist/:productid", isLoggedIn, checkRole(['customer']),  addProductToWishlist);

// get wishlist items for logged in user
router.get("/getwishlist", isLoggedIn, getWishlistItems);
 
// add to cart route
router.post("/addtocart", isLoggedIn, checkRole(['customer']), validate(addToCartSchema), addProductToCart);

router.get("/cartitems", isLoggedIn, getCartItems);

router.delete("/deletecartitems/:id", isLoggedIn, deleteCartItems);

// router.post("/summary", isLoggedIn, orderSummery);

router.post("/review", isLoggedIn, validate(productReviewSchema), productReview);

module.exports = router;

