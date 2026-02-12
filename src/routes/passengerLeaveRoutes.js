// src/routes/passengerLeaveRoutes.js
import express from "express";
import {
  listAllLeaves,
  createPassengerLeave,
  deletePassengerLeave,
  listLeavesForAssetOnDate,
  listLeavesByMonth,
} from "../controllers/passengerLeaveController.js";
import  authenticate  from "../middlewares/authenticate.js";
import { allowRoles } from "../middlewares/authorizeRoles.js";

const router = express.Router();

router.get(
  "/all",
  authenticate,
  allowRoles("SUPER_ADMIN", "ADMIN_EMPLOYEE", "VENDOR"),
  listAllLeaves
);
router.get(
  "/asset",
  authenticate,
  allowRoles("SUPER_ADMIN", "ADMIN_EMPLOYEE", "VENDOR"),
  listLeavesForAssetOnDate
);
router.get(
  "/monthly",
  authenticate,
  allowRoles("SUPER_ADMIN", "ADMIN_EMPLOYEE", "VENDOR"),
  listLeavesByMonth
);

router.post(
  "/",
  authenticate,
  allowRoles("SUPER_ADMIN", "ADMIN_EMPLOYEE"),
  createPassengerLeave
);
router.delete(
  "/:id",
  authenticate,
  allowRoles("SUPER_ADMIN", "ADMIN_EMPLOYEE"),
  deletePassengerLeave
);

export default router;