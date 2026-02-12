import express from "express";
import {
  addShiftToOption,
  removeShiftFromOption,
  renameShiftInOption,
  getShiftOptions,
} from "../controllers/shiftController.js";

const router = express.Router();
router.get("/", getShiftOptions);
router.post("/:id/shifts", addShiftToOption);
router.delete("/:id/shifts", removeShiftFromOption);
router.put("/:id/shifts", renameShiftInOption);

export default router;