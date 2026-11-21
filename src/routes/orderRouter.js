const express = require("express");
const router = express.Router();
const isLoggedIn = require("../middlewares/isLoggedIn");
const validate = require("../middlewares/validate");
const { createOrder, getOrders, getAllOrders, updateOrderStatus } = require("../controllers/orderController");
const { checkRole } = require("../middlewares/roleBaseAccess");
const { createOrderSchema } = require("../validators/orderValidator");

router.post("/createorder", isLoggedIn, validate(createOrderSchema), checkRole(['customer']), createOrder);

router.get("/getorder", isLoggedIn, getOrders);
router.get("/get-allorder", isLoggedIn, checkRole(['admin']), getAllOrders);

router.put("/updatestatus/:orderId", isLoggedIn, checkRole(['admin']), updateOrderStatus);

module.exports = router;

