// controllers/shiftChangeController.js
import ShiftChange from "../models/ShiftChangeModel.js";
import Passenger from "../models/Passenger.js";
import Asset from "../models/assetModel.js";
import { scheduleShiftChangeService } from "../utils/scheduleShiftChange.js";
import { updatePassengerShiftChange } from "../utils/updatePassengerShiftChange.js";
import processShiftChanges from "../utils/processShiftChanges.js"; // default import

const localISODate = (input, timeZone = "Asia/Kolkata") => {
  try {
    const d = input ? new Date(input) : new Date();
    const dateStr = d.toLocaleDateString("en-CA", { timeZone });
    return dateStr;
  } catch (e) {
    return new Date().toLocaleDateString("en-CA", { timeZone });
  }
};

const formatTimeIST = (input, timeZone = "Asia/Kolkata") => {
  try {
    const d = new Date(input);
    const timeStr = d.toLocaleTimeString("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return timeStr;
  } catch (e) {
    return "";
  }
};

const formatDateDDMMYYYY = (input, timeZone = "Asia/Kolkata") => {
  try {
    const d = new Date(input);
    const formatted = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone,
    }).format(d);
    return formatted;
  } catch (e) {
    return "";
  }
};

export const createShiftChange = async (req, res) => {
  try {
    const {
      passengerId,
      assetId,
      effectiveAt,
      slot,
      shift,
      vehicleNumber,
      startBuffer,
      endBuffer,
      wfoDays,
      reason,
    } = req.body;

    const passenger = await Passenger.findById(passengerId);
    if (!passenger) {
      return res.status(404).json({ message: "Passenger not found" });
    }

    const asset = await Asset.findById(assetId);
    if (!asset) {
      return res.status(404).json({ message: "Asset not found" });
    }

    const shiftUpdate = await scheduleShiftChangeService({
      passengerId,
      assetId,
      effectiveAt,
      slot,
      shift,
      vehicleNumber,
      startBuffer,
      endBuffer,
      wfoDays,
      reason,
    });

    const normalizedEffectiveAt = shiftUpdate?.effectiveAt ?? effectiveAt;
    const effectiveDateStr = localISODate(
      normalizedEffectiveAt,
      "Asia/Kolkata"
    );
    const todayStr = localISODate(new Date(), "Asia/Kolkata");
    const effectiveAtIsTodayOrPast = effectiveDateStr <= todayStr;

    if (effectiveAtIsTodayOrPast) {
      try {
        await processShiftChanges();
      } catch (procErr) {}
    }

    try {
      const broadcastName = `passenger_shift_change_${Date.now()}`;
      const bufferStartIST = formatTimeIST(
        shiftUpdate?.startBuffer ?? startBuffer,
        "Asia/Kolkata"
      );
      const bufferEndIST = formatTimeIST(
        shiftUpdate?.endBuffer ?? endBuffer,
        "Asia/Kolkata"
      );
      const effectiveDateIST = formatDateDDMMYYYY(
        normalizedEffectiveAt,
        "Asia/Kolkata"
      );

      const templateParameters = [
        { name: "name", value: passenger.Employee_Name },
        { name: "shift_timing", value: shift },
        { name: "effective_date", value: effectiveDateIST },
        { name: "bufferStart_time", value: bufferStartIST },
        { name: "bufferEnd_time", value: bufferEndIST },
      ];

      await updatePassengerShiftChange(
        passenger.Employee_PhoneNumber,
        "passenger_shift_change_update_passenger",
        broadcastName,
        templateParameters
      );
    } catch (notifyErr) {}

    res.status(201).json({
      message: "Shift change scheduled successfully",
      shiftUpdate,
    });
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
};