// controllers/journeyController.js
import Journey from "../models/JourneyModel.js";
import Asset from "../models/assetModel.js";
import Driver from "../models/driverModel.js";
import Passenger from "../models/Passenger.js";
import PassengerLeave from "../models/PassengerLeave.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { sendWhatsAppMessage } from "../utils/whatsappHelper.js";
import { sendPickupConfirmationMessage } from "../utils/PickUpPassengerSendTem.js";
import { sendOtherPassengerSameShiftUpdateMessage } from "../utils/InformOtherPassenger.js";
import { sendDropConfirmationMessage } from "../utils/dropConfirmationMsg.js";
import { startRideUpdatePassengerController } from "../utils/rideStartUpdatePassenger.js";
import { cancelBufferEndTrigger } from "../utils/notificationService.js";
import { storeJourneyNotifications } from "../utils/notificationService.js";
import { isScheduledToday } from "../utils/weekoffPassengerHelper.js";

// Helper function to get journey date
const getNormalizedJourneyDate = (journey) => {
  const dateRaw = journey.originalStart ? new Date(journey.originalStart) : new Date();
  return new Date(dateRaw.getFullYear(), dateRaw.getMonth(), dateRaw.getDate());
};

// Helper function to get passenger leaves as a Set
const getPassengerLeavesSet = async (assetId, shift, journeyDate) => {
  const leaves = await PassengerLeave.find({
    assetId,
    shift,
    startDate: { $lte: journeyDate },
    endDate: { $gte: journeyDate },
  }).select('passengerId').lean();

  return new Set(leaves.map(l => String(l.passengerId)));
};

export const createJourney = asyncHandler(async (req, res) => {
  const { Journey_Type, vehicleNumber, Journey_shift } = req.body;

  if (!Journey_Type || !vehicleNumber || !Journey_shift) {
    return res.status(400).json({
      message: "Journey_Type, vehicleNumber and Journey_shift are required.",
    });
  }

  const driver = await Driver.findOne({ vehicleNumber });
  if (!driver) {
    return res.status(404).json({ message: "No driver found with this vehicle number." });
  }

  const existingJourney = await Journey.findOne({ Driver: driver._id });
  if (existingJourney) {
    await sendWhatsAppMessage(
      driver.phoneNumber,
      "Please end this current ride before starting a new one."
    );
    return res.status(400).json({
      message: "Active journey exists. Please end the current ride before starting a new one.",
    });
  }

  const asset = await Asset.findOne({ driver: driver._id }).populate({
    path: "passengers.passengers.passenger",
    model: "Passenger",
    select: "Employee_ID Employee_Name Employee_PhoneNumber wfoDays",
  });

  if (!asset) {
    return res.status(404).json({ message: "No assigned vehicle found for this driver." });
  }

  const newJourney = await Journey.create({
    Driver: driver._id,
    Asset: asset._id,
    Journey_Type,
    Journey_shift,
    Occupancy: 0,
    SOS_Status: false,
  });

  asset.isActive = true;
  await asset.save();

  // Handle pickup journey notifications
  if (Journey_Type.toLowerCase() === "pickup") {
    const journeyDate = getNormalizedJourneyDate(newJourney);

    // Get scheduled passengers for this shift
    const passengersForShift = [];
    for (const shift of asset.passengers) {
      if (shift.shift !== Journey_shift) continue;

      for (const sp of shift.passengers) {
        const passenger = sp.passenger;
        if (!passenger) continue;

        const effectiveWfoDays = Array.isArray(sp.wfoDays) && sp.wfoDays.length
          ? sp.wfoDays
          : passenger.wfoDays;

        if (isScheduledToday(effectiveWfoDays)) {
          passengersForShift.push(sp);
        }
      }
    }

    // Filter out passengers on leave
    const leaveSet = await getPassengerLeavesSet(asset._id, Journey_shift, journeyDate);
    const filteredPassengersForShift = passengersForShift.filter((ps) => {
      const passengerId = ps.passenger?._id ? String(ps.passenger._id) : String(ps.passenger);
      return passengerId && !leaveSet.has(passengerId);
    });

    // Store notifications and start ride updates (fire and forget)
    try {
      await storeJourneyNotifications(newJourney._id, filteredPassengersForShift);
    } catch (err) {
      console.error("Failed to store journey notifications:", err);
    }

    try {
      await startRideUpdatePassengerController(
        { body: { vehicleNumber, Journey_shift } },
        { status: () => ({ json: () => { } }) }
      );
    } catch (err) {
      // Silently continue
    }
  }

  // Emit socket event
  const io = req.app.get("io");
  if (io) {
    io.emit("newJourney", newJourney);
  }

  return res.status(201).json({
    message: "Journey created successfully.",
    newJourney,
    updatedAsset: asset,
  });
});

export const getJourneys = asyncHandler(async (req, res) => {
  const journeys = await Journey.find()
    .populate({ path: "Driver", model: "Driver" })
    .populate({
      path: "Asset",
      model: "Asset",
      populate: {
        path: "passengers.passengers.passenger",
        model: "Passenger",
      },
    })
    .populate({
      path: "boardedPassengers.passenger",
      model: "Passenger",
    })
    .populate({
      path: "previousJourney",
      model: "EndJourney",
    })
    .populate({
      path: "triggeredBySOS",
      model: "SOS",
    });

  return res.status(200).json(journeys);
});

export const handleWatiWebhook = asyncHandler(async (req, res) => {
  res.sendStatus(200);

  try {
    // Early validation same as original
    if (req.body.text != null) return;

    const { id: eventId, type, waId, listReply } = req.body;
    if (type !== "interactive" || !listReply?.title || !/\d{12}$/.test(listReply.title)) return;

    const passengerPhone = listReply.title.match(/(\d{12})$/)[0];

    const driver = await Driver.findOne({ phoneNumber: waId });
    if (!driver) return;

    const journey = await Journey.findOne({ Driver: driver._id })
      .populate({
        path: "Asset",
        select: "passengers capacity",
        populate: {
          path: "passengers.passengers.passenger",
          model: "Passenger",
          select: "Employee_Name Employee_PhoneNumber wfoDays",
        },
      })
      .populate("boardedPassengers.passenger", "Employee_Name Employee_PhoneNumber");

    if (!journey) return;

    // Check for duplicate event processing
    journey.processedWebhookEvents = journey.processedWebhookEvents || [];
    if (journey.processedWebhookEvents.includes(eventId)) return;

    const passenger = await Passenger.findOne({ Employee_PhoneNumber: passengerPhone });
    if (!passenger) {
      await sendWhatsAppMessage(waId, "🚫 Passenger not found. Please verify and retry.");
      return;
    }

    // Check if passenger is assigned to this vehicle
    const thisShift = journey.Asset.passengers.find(shift =>
      shift.passengers.some((s) => {
        const passengerId = s.passenger?._id ? String(s.passenger._id) : String(s.passenger);
        return passengerId === String(passenger._id);
      })
    );

    if (!thisShift) {
      await sendWhatsAppMessage(waId, "🚫 Passenger not assigned to this vehicle today.");
      return;
    }

    // Check if passenger is on leave
    const journeyDate = getNormalizedJourneyDate(journey);
    const passengerOnLeave = await PassengerLeave.findOne({
      passengerId: passenger._id,
      assetId: journey.Asset._id,
      shift: journey.Journey_shift,
      startDate: { $lte: journeyDate },
      endDate: { $gte: journeyDate },
    });

    if (passengerOnLeave) {
      await sendWhatsAppMessage(waId, "🚫 Passenger is on leave for this shift/day.");
      return;
    }

    // Check capacity
    if (journey.Occupancy + 1 > journey.Asset.capacity) {
      await sendWhatsAppMessage(waId, "⚠️ Cannot board. Vehicle at full capacity.");
      return;
    }

    // Check if already boarded
    const cleanedPhone = passengerPhone.replace(/\D/g, '');
    const alreadyBoarded = journey.boardedPassengers.some((bp) => {
      const bpPhone = (bp.passenger.Employee_PhoneNumber || "").replace(/\D/g, "");
      return bpPhone === cleanedPhone;
    });

    if (alreadyBoarded) {
      await sendWhatsAppMessage(waId, "✅ Passenger already boarded.");
      return;
    }

    // Update journey with new passenger
    journey.Occupancy += 1;
    journey.boardedPassengers.push({
      passenger: passenger._id,
      boardedAt: new Date(),
    });
    journey.processedWebhookEvents.push(eventId);
    await journey.save();

    try {
      await cancelBufferEndTrigger(passenger._id, journey._id);
    } catch (err) {
      console.error("Failed to cancel bufferEnd trigger:", err);
    }

    // Emit socket event
    if (req.app.get("io")) {
      req.app.get("io").emit("journeyUpdated", journey);
    }

    // Send confirmation to driver
    try {
      await sendWhatsAppMessage(waId, "✅ Passenger confirmed. Thank you!");
    } catch (err) {
      console.error("[handleWatiWebhook] Failed sending confirmation to driver:", err);
    }

    // Handle passenger notifications based on journey type
    const journeyType = journey.Journey_Type.toLowerCase();

    // Find boarding entry for this passenger
    const boardingEntry = thisShift.passengers.find((s) => {
      const passengerId = s.passenger?._id ? String(s.passenger._id) : String(s.passenger);
      return passengerId === String(passenger._id);
    });

    const boardingEffectiveWfoDays = boardingEntry &&
      Array.isArray(boardingEntry.wfoDays) &&
      boardingEntry.wfoDays.length
      ? boardingEntry.wfoDays
      : passenger.wfoDays;

    const leaves = await PassengerLeave.find({
      assetId: journey.Asset._id,
      shift: journey.Journey_shift,
      startDate: { $lte: journeyDate },
      endDate: { $gte: journeyDate },
    }).select('passengerId').lean();

    const leaveSet = new Set(leaves.map(l => String(l.passengerId)));

    // Send pickup confirmation and notify other passengers
    if (journeyType === "pickup") {
      if (isScheduledToday(boardingEffectiveWfoDays)) {
        try {
          await sendPickupConfirmationMessage(passenger.Employee_PhoneNumber, passenger.Employee_Name);
        } catch (err) {
          // Continue silently as in original
        }
      }

      // Notify other passengers in the same shift
      const boardedSet = new Set(
        journey.boardedPassengers.map(bp => (bp.passenger.Employee_PhoneNumber || "").replace(/\D/g, ""))
      );
      boardedSet.add(cleanedPhone);

      for (const shiftPassenger of thisShift.passengers) {
        const pEntry = shiftPassenger;
        const pDoc = pEntry.passenger;
        if (!pDoc?.Employee_PhoneNumber) continue;

        const effectiveWfoDays = Array.isArray(pEntry.wfoDays) && pEntry.wfoDays.length
          ? pEntry.wfoDays
          : pDoc.wfoDays;

        if (!isScheduledToday(effectiveWfoDays)) continue;

        const passengerIdStr = String(pDoc._id ? pDoc._id : pDoc);
        if (leaveSet.has(passengerIdStr)) continue;

        const phoneClean = (pDoc.Employee_PhoneNumber || "").replace(/\D/g, "");
        if (!phoneClean || boardedSet.has(phoneClean)) continue;

        try {
          await sendOtherPassengerSameShiftUpdateMessage(pDoc.Employee_PhoneNumber, pDoc.Employee_Name);
        } catch (err) {
          console.error("Failed to notify other passenger", pDoc.Employee_PhoneNumber, err);
        }
      }
    }

    // Send drop confirmation
    if (journeyType === "drop") {
      if (isScheduledToday(boardingEffectiveWfoDays)) {
        try {
          await sendDropConfirmationMessage(passenger.Employee_PhoneNumber, passenger.Employee_Name);
        } catch (err) {
          console.error("[handleWatiWebhook] Failed to send drop confirmation:", err);
        }
      }
    }
  } catch (err) {
    console.error("handleWatiWebhook error:", err);
  }
});