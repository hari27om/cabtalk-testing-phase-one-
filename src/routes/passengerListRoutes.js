import express from "express";
import { sendPassengerList } from "../controllers/passengerListController.js";

const router = express.Router();
router.post("/send", sendPassengerList);

export default router;