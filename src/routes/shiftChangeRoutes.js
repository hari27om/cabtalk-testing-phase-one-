import express from "express";
import {
   createShiftChange,
//   getShiftChanges,
//   getShiftChangeById,
//   cancelShiftChange,
 
} from "../controllers/shiftChangeController.js";
 
const router = express.Router();
 
router.post("/shiftChange", createShiftChange);         // schedule a new shift change
// router.get("/", getShiftChanges);              // list all shift changes
// router.get("/:id", getShiftChangeById);        // get specific shift change
// router.put("/:id/cancel", cancelShiftChange);  // cancel shift change
 
export default router;