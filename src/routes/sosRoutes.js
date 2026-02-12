import express from "express";
import {
  createSOS,
  getSOS,
  resolveSOS,
  getSOSByID,
  transferPassengersForSos,
  sosReimbursementHandler,
} from "../controllers/sosController.js";
const router = express.Router();
router.post("/", createSOS);
router.get("/", getSOS);
router.get("/:id", getSOSByID);
router.post("/:id/transfer", transferPassengersForSos);
router.put("/:id/resolve", resolveSOS);
router.post("/:id/reimburse", sosReimbursementHandler);
export default router;