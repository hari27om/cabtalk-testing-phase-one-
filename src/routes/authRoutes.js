import express from "express";
import {
  registerUser,
  loginUser,
  logoutUser,
  changeCurrentPassword,
  getCurrentUser,
  createUserByAdmin,
  getAdminAndVendorUsers,
  deleteUserByAdmin,
} from "../controllers/authController.js";
import authenticate from "../middlewares/authenticate.js";
import { allowRoles } from "../middlewares/authorizeRoles.js";
import {
  forgotPassword,
  resetPassword,
} from "../controllers/authController.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);

router.post("/logout", authenticate, logoutUser);
router.get("/current-user", authenticate, getCurrentUser);
router.post("/change-password", authenticate, changeCurrentPassword);

router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

router.post(
  "/admin/create-user",
  authenticate,
  allowRoles("SUPER_ADMIN"),
  createUserByAdmin
);

router.get(
  "/admin/users",
  authenticate,
  allowRoles("SUPER_ADMIN"),
  getAdminAndVendorUsers
);

router.delete(
  "/admin/users/:id",
  authenticate,
  allowRoles("SUPER_ADMIN"),
  deleteUserByAdmin
);

export default router;
