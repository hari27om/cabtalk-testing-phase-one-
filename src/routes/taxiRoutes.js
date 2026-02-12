import express from "express";
import { createTaxi, getAllTaxis, notifyTaxiDriver, notifyTaxiPassenger } from "../controllers/taxiController.js";
const router = express.Router();
router.post("/:id/assign-taxi", createTaxi);
router.get("/taxi", getAllTaxis);

router.post("/notify-taxi-driver/:sosId", notifyTaxiDriver);
router.post("/notify-taxi-passenger/:sosId", notifyTaxiPassenger);
export default router;