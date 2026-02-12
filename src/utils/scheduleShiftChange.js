// utils/scheduleShiftChange.js
import ShiftChange from "../models/ShiftChangeModel.js";
export const scheduleShiftChangeService = async (shiftChangeData) => {
  try {
    const {
      passengerId,
      assetId,
      shift,
      slot,
      vehicleNumber,
      startBuffer,
      endBuffer,
      wfoDays,
      effectiveAt,
      reason,
    } = shiftChangeData;

    const effectiveAtUTC = effectiveAt ? new Date(effectiveAt) : new Date();
    const startBufferUTC = startBuffer ? new Date(startBuffer) : null;
    const endBufferUTC = endBuffer ? new Date(endBuffer) : null;

    const shiftChange = new ShiftChange({
      passengerId,
      assetId,
      slot,
      shift,
      vehicleNumber,
      startBuffer: startBufferUTC,
      endBuffer: endBufferUTC,
      wfoDays,
      effectiveAt: effectiveAtUTC,
      reason,
      status: "scheduled",
    });

    await shiftChange.save();
    return shiftChange;
  } catch (err) {
    throw err;
  }
};