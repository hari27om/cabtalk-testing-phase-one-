import Asset from "../models/assetModel.js";
import Journey from "../models/JourneyModel.js";
import PassengerLeave from "../models/PassengerLeave.js";
import { sendPickupConfirmationMessage } from "../utils/PickUpPassengerSendTem.js";
import { sendOtherPassengerSameShiftUpdateMessage } from "../utils/InformOtherPassenger.js";
import { storeJourneyNotifications } from "../utils/notificationService.js";
import { isScheduledToday } from "../utils/weekoffPassengerHelper.js";

export const sendPickupConfirmation = async (req, res) => {
  try {
    const { pickedPassengerPhoneNumber } = req.body;
    if (!pickedPassengerPhoneNumber) {
      return res.status(400).json({
        success: false,
        message: "pickedPassengerPhoneNumber is required.",
      });
    }

    const cleanedPhone = pickedPassengerPhoneNumber.replace(/\D/g, "");
    if (!/^91\d{10}$/.test(cleanedPhone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Indian phone number format.",
      });
    }

    const asset = await Asset.findOne({
      "passengers.passengers.passenger": { $exists: true },
    }).populate({
      path: "passengers.passengers.passenger",
      select: "Employee_PhoneNumber Employee_Name wfoDays",
    });
    if (!asset) {
      return res.status(404).json({ success: false, message: "Asset not found." });
    }

    let pickedPassenger = null;
    let currentShiftPassengers = [];
    let shiftBlock = null;
    let foundShiftName = null;

    for (const shift of asset.passengers) {
      const match = shift.passengers.find(
        (sp) => sp.passenger?.Employee_PhoneNumber?.replace(/\D/g, "") === cleanedPhone
      );
      if (match) {
        pickedPassenger = match.passenger;
        currentShiftPassengers = shift.passengers.map((sp) => sp.passenger);
        shiftBlock = shift.passengers;
        foundShiftName = shift.shift;
        break;
      }
    }
    if (!pickedPassenger) {
      return res.status(404).json({
        success: false,
        message: "Picked passenger not found in asset.",
      });
    }

    if (!isScheduledToday(pickedPassenger.wfoDays)) {
      return res.status(200).json({
        success: false,
        message: `Passenger ${pickedPassenger.Employee_Name} is not scheduled today.`,
      });
    }

    const journey = await Journey.findOne({ Asset: asset._id })
      .sort({ createdAt: -1 })
      .populate("boardedPassengers.passenger", "Employee_PhoneNumber Employee_Name");
    if (!journey) {
      return res.status(404).json({ success: false, message: "No journey found for asset." });
    }

    const alreadyBoarded = journey.boardedPassengers.some(
      (bp) =>
        (bp.passenger.Employee_PhoneNumber || "").replace(/\D/g, "") === cleanedPhone
    );
    if (alreadyBoarded) {
      return res.status(400).json({ success: false, message: "Passenger already boarded." });
    }

    journey.boardedPassengers.push({
      passenger: pickedPassenger._id,
      boardedAt: new Date(),
    });
    await journey.save();

    try {
      if (shiftBlock) {
        await storeJourneyNotifications(journey._id, shiftBlock);
      }
    } catch (err) {
      console.error("storeJourneyNotifications error:", err);
    }

    const confirmation = await sendPickupConfirmationMessage(
      pickedPassenger.Employee_PhoneNumber,
      pickedPassenger.Employee_Name
    );

    const boardedSet = new Set(
      journey.boardedPassengers.map((bp) =>
        (bp.passenger.Employee_PhoneNumber || "").replace(/\D/g, "")
      )
    );
    boardedSet.add(cleanedPhone);

    const journeyDateRaw = journey.originalStart ? new Date(journey.originalStart) : new Date();
    const journeyDate = new Date(journeyDateRaw.getFullYear(), journeyDateRaw.getMonth(), journeyDateRaw.getDate());

    let leaveSet2 = new Set();
    if (foundShiftName) {
      const leaves2 = await PassengerLeave.find({
        assetId: asset._id,
        shift: foundShiftName,
        startDate: { $lte: journeyDate },
        endDate: { $gte: journeyDate },
      })
        .select("passengerId")
        .lean();
      leaveSet2 = new Set(leaves2.map((l) => String(l.passengerId)));
    }

    const notifiedPassengers = [];
    for (const p of currentShiftPassengers) {
      if (!p?.Employee_PhoneNumber) continue;

      const pid = String(p._id ? p._id : p);
      if (leaveSet2.has(pid)) {
        continue;
      }

      const phoneClean = p.Employee_PhoneNumber.replace(/\D/g, "");
      if (boardedSet.has(phoneClean)) continue;

      if (!isScheduledToday(p.wfoDays)) {
        continue;
      }
      try {
        const notify = await sendOtherPassengerSameShiftUpdateMessage(
          p.Employee_PhoneNumber,
          p.Employee_Name
        );
        notifiedPassengers.push({
          name: p.Employee_Name,
          phone: p.Employee_PhoneNumber,
          success: notify.success,
          error: notify.error || null,
        });
      } catch (err) {
        console.error("Failed to notify passenger:", p.Employee_PhoneNumber, err);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Confirmation sent to picked passenger; unboarded scheduled shift-mates updated.",
      pickedPassenger: {
        name: pickedPassenger.Employee_Name,
        phone: pickedPassenger.Employee_PhoneNumber,
        confirmation,
      },
      notifiedPassengers,
      boardedCount: journey.boardedPassengers.length,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};