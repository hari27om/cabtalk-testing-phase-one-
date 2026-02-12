import express from "express";
import { sendPickupConfirmation } from "../controllers/pickupNotificationController.js";
import { sendDropConfirmation } from "../controllers/dropConfirmationPassenger.js";
import { startRideUpdatePassengerController } from "../utils/rideStartUpdatePassenger.js";
const router = express.Router();
router.post("/confirm-pickup", sendPickupConfirmation);
router.post("/send-drop-con",sendDropConfirmation)
router.post("/send_update-msg-passenger",startRideUpdatePassengerController)
export default router;