import axios from "axios";
import mongoose from "mongoose";
import SOS from "../models/sosModel.js";
import Driver from "../models/driverModel.js";
import Passenger from "../models/Passenger.js";
import Asset from "../models/assetModel.js";
import Journey from "../models/JourneyModel.js";
import EndJourney from "../models/endJourneyModel.js";
import { sosUpdatePassengers } from "../utils/sosUpdatePassengers.js";
import { sosUpdateDriver } from "../utils/sosUpdateDriver.js";
import { sosReimbursement } from "../utils/sosReimbursement.js";

export const createSOS = async (req, res) => {
  const { user_type, phone_no, sos_type } = req.body;
  if (!user_type || !phone_no || !sos_type) {
    return res.status(400).json({
      success: false,
      message: "user_type, phone_no, and sos_type are required.",
    });
  }
  const lowerType = user_type.toLowerCase();
  let brokenAssetId = null;
  let journey = null;
  const userDetails = { name: "", vehicle_no: "" };

  try {
    if (lowerType === "driver") {
      const driver = await Driver.findOne({ phoneNumber: phone_no });
      if (!driver) {
        return res
          .status(404)
          .json({ success: false, message: "Driver not found" });
      }
      userDetails.name = driver.name;
      userDetails.vehicle_no = driver.vehicleNumber;

      journey = await Journey.findOne({
        Driver: driver._id,
        SOS_Status: false,
      });
      if (!journey) {
        journey = await Journey.findOne({ Driver: driver._id }).sort({
          createdAt: -1,
        });
      }
      if (!journey) {
        console.log("[createSOS] no prior journey found for driver");
      } else {
        brokenAssetId = journey.Asset;
        journey.SOS_Status = true;
        await journey.save();
      }
    } else if (lowerType === "passenger") {
      const passenger = await Passenger.findOne({
        Employee_PhoneNumber: phone_no,
      });
      if (!passenger) {
        return res
          .status(404)
          .json({ success: false, message: "Passenger not found" });
      }
      userDetails.name = passenger.Employee_Name;
      if (passenger.asset) {
        brokenAssetId = passenger.asset;
      } else {
        const assetDoc = await Asset.findOne({
          "passengers.passengers.passenger": passenger._id,
          isActive: true,
        }).populate("driver", "vehicleNumber");
        if (assetDoc) {
          brokenAssetId = assetDoc._id;
          userDetails.vehicle_no = assetDoc.driver?.vehicleNumber || "";
        }
      }

      if (brokenAssetId) {
        journey = await Journey.findOne({
          Asset: brokenAssetId,
          SOS_Status: false,
        });
        if (journey) {
          journey.SOS_Status = true;
          await journey.save();
        }
      }
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user_type" });
    }

    if (!brokenAssetId) {
      const pending = await SOS.findOne({ phone_no, status: "pending" });
      if (pending) {
        brokenAssetId = pending.asset;
      }
    }

    if (!brokenAssetId) {
      return res.status(400).json({
        success: false,
        message:
          "No active journey or prior SOS found; cannot determine asset.",
      });
    }
    if (!journey) {
      journey = await Journey.findOne({ Asset: brokenAssetId })
        .sort({ createdAt: -1 })
        .lean();
      if (journey) {
        console.log(
          "[createSOS] loaded journey for shift in fallback:",
          journey._id
        );
      }
    }
    if (!journey || !journey.Journey_shift) {
      console.error("[createSOS] failed to determine journey_shift");
      return res.status(500).json({
        success: false,
        message: "Internal error: could not determine journey shift.",
      });
    }

    const existingUserSOS = await SOS.findOne({
      phone_no,
      sos_type,
      status: "pending",
    });
    if (existingUserSOS) {
      return res.status(200).json({
        success: true,
        message: `You have already raised a "${sos_type}" SOS.`,
        sos: existingUserSOS,
      });
    }

    const existingAssetSOS = await SOS.findOne({
      asset: brokenAssetId,
      sos_type,
      status: "pending",
    });
    if (
      existingAssetSOS &&
      existingAssetSOS.user_type.toLowerCase() !== lowerType
    ) {
      return res.status(200).json({
        success: true,
        message: `An SOS of type "${sos_type}" is already pending on this vehicle.`,
        sos: existingAssetSOS,
      });
    }

    const sos = new SOS({
      user_type,
      phone_no,
      sos_type,
      asset: brokenAssetId,
      sos_shift: journey.Journey_shift,
      userDetails,
    });
    await sos.save();
    req.app.get("io").emit("newSOS", sos);

    return res.status(201).json({
      success: true,
      message: "SOS created successfully",
      sos,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getSOS = async (req, res) => {
  try {
    let { date } = req.query;
    if (!date) {
      date = new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      });
    }
    const start = new Date(`${date}T00:00:00.000+05:30`);
    const end = new Date(`${date}T23:59:59.999+05:30`);

    const sosList = await SOS.find({ createdAt: { $gte: start, $lt: end } })
      .sort({ createdAt: -1 })
      .populate({
        path: "asset",
        populate: [
          { path: "driver", select: "name vehicleNumber" },
          {
            path: "passengers.passengers.passenger",
            model: "Passenger",
            select:
              "Employee_ID Employee_Name Employee_PhoneNumber Employee_ShiftTiming",
          },
        ],
      })
      .populate({
        path: "newAsset",
        populate: { path: "driver", select: "name vehicleNumber" },
      })
      .lean();
    return res.status(200).json({ success: true, sos: sosList });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Error fetching SOS data" });
  }
};

export const getSOSByID = async (req, res) => {
  try {
    const sos = await SOS.findById(req.params.id)
      .populate({
        path: "asset",
        populate: [
          { path: "driver", select: "name vehicleNumber" },
          {
            path: "passengers.passengers.passenger",
            model: "Passenger",
            select:
              "Employee_ID Employee_Name Employee_PhoneNumber Employee_ShiftTiming",
          },
        ],
      })
      .populate({
        path: "newAsset",
        populate: { path: "driver", select: "name vehicleNumber" },
      });
    if (!sos) {
      return res.status(404).json({ success: false, message: "SOS not found" });
    }
    return res.status(200).json({ success: true, sos });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const resolveSOS = async (req, res) => {
  try {
    const { id } = req.params;
    const sos = await SOS.findById(id);
    if (!sos) {
      return res.status(404).json({ success: false, message: "SOS not found" });
    }
    sos.status = "resolved";
    sos.sosSolution = "Overridden & resolved by Admin";
    await sos.save();

    const io = req.app.get("io");
    io.emit("sosResolved", sos);

    return res.status(200).json({
      success: true,
      message: "SOS resolved",
      sos,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

export const transferPassengersForSos = async (req, res) => {
  const session = await mongoose.startSession();
  let passengerNotification, driverNotification;

  try {
    await session.startTransaction();
    const { id } = req.params;
    const { newAssetId } = req.body;
    if (!newAssetId) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "newAssetId is required" });
    }
    const sos = await SOS.findById(id).session(session);
    if (!sos) {
      await session.abortTransaction();
    }
    if (sos.status !== "pending") {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "SOS already resolved" });
    }

    const brokenAssetId = sos.asset.toString();
    if (brokenAssetId === newAssetId) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "newAssetId must differ from the broken asset",
      });
    }

    const [brokenAsset, newAsset] = await Promise.all([
      Asset.findById(brokenAssetId)
           .populate("driver", "name phoneNumber")
           .session(session),
      Asset.findById(newAssetId)
           .populate("driver", "name phoneNumber vehicleNumber")
           .session(session),
    ]);
    if (!brokenAsset || !newAsset) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Asset lookup failed" });
    }
    if (!brokenAsset.isActive || newAsset.isActive) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: !brokenAsset.isActive
          ? "Broken asset is not active"
          : "New asset is already active",
      });
    }
    const oldJourney = await Journey.findOne({ Asset: brokenAssetId }).session(session);
    let roster = [];
    let activeBlock = null;
    if (oldJourney && oldJourney.Journey_shift) {
      const shiftName = oldJourney.Journey_shift;
      if (Array.isArray(brokenAsset.passengers)) {
        activeBlock = brokenAsset.passengers.find(blk => blk.shift === shiftName);
        if (activeBlock && Array.isArray(activeBlock.passengers)) {
          roster = activeBlock.passengers.map(ps => ps.passenger.toString());
        }
      }
    }
    await Promise.all([
      Asset.findByIdAndUpdate(
        newAssetId,
        { passengers: activeBlock ? [activeBlock] : [], isActive: true },
        { session }
      ),
      Asset.findByIdAndUpdate(
        brokenAssetId,
        { isActive: false },
        { session }
      ),
    ]);
    await updateRideStatus(newAsset.driver.phoneNumber, true);
    await updateRideStatus(brokenAsset.driver.phoneNumber, false);
    if (roster.length) {
      await Passenger.updateMany(
        { _id: { $in: roster } },
        { asset: newAssetId },
        { session }
      );
    }

    let endedJourneyDoc = null;
    if (oldJourney) {
      const endedJourney = new EndJourney({
        JourneyId: oldJourney._id,
        Driver: oldJourney.Driver,
        Asset: oldJourney.Asset,
        Journey_Type: oldJourney.Journey_Type,
        Occupancy: oldJourney.Occupancy,
        hadSOS: oldJourney.SOS_Status,
        startedAt: oldJourney.createdAt,
        boardedPassengers: oldJourney.boardedPassengers.map(evt => ({
          passenger: evt.passenger,
          boardedAt: evt.boardedAt,
        })),
        processedWebhookEvents: oldJourney.processedWebhookEvents,
      });
      endedJourneyDoc = await endedJourney.save({ session });
      await Journey.findByIdAndDelete(oldJourney._id).session(session);
      req.app.get("io")?.emit("journeyEnded", endedJourneyDoc);
    }
    const newJourney = new Journey({
      Driver: newAsset.driver._id,
      Asset: newAssetId,
      Journey_Type: oldJourney?.Journey_Type,
      Journey_shift: oldJourney?.Journey_shift,
      Occupancy: oldJourney?.Occupancy,
      SOS_Status: false,
      boardedPassengers: oldJourney?.boardedPassengers,
      processedWebhookEvents: oldJourney?.processedWebhookEvents,
      originalStart: oldJourney?.createdAt,
      previousJourney: endedJourneyDoc?._id || null,
      triggeredBySOS: sos._id,
    });
    await newJourney.save({ session });
    req.app.get("io")?.emit("newJourney", newJourney);
    sos.status = "resolved";
    sos.sosSolution = "Asset Assigned";
    sos.newAsset = newAssetId;
    await sos.save({ session });
    passengerNotification = await sosUpdatePassengers(sos._id, newAssetId, roster);
    driverNotification = await sosUpdateDriver(sos._id, newAssetId);
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  } finally {
    session.endSession();
  }
  const populatedNewAsset = await Asset.findById(req.body.newAssetId)
    .populate("driver", "name vehicleNumber");
  return res.status(200).json({
    success: true,
    newAsset: populatedNewAsset,
    notifications: {
      passengers: passengerNotification,
      driver: driverNotification,
    },
  });
};

const updateRideStatus = async (phoneNumber, isActive) => {
  const url = `https://live-mt-server.wati.io/388428/api/v1/updateContactAttributes/${phoneNumber}`;
  const payload = {
    customParams: [
      {
        name: "isactive",
        value: isActive ? "true" : "false",
      },
    ],
  };
  try {
    await axios.post(url, payload, {
      headers: {
        "content-type": "application/json-patch+json",
        Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjYTVkMDQzNS0yNWI2LTQ3YjEtOTEwMy1kNzQ2ZjExYjJkYjAiLCJ1bmlxdWVfbmFtZSI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwibmFtZWlkIjoiaGFyaS50cmlwYXRoaUBneGluZXR3b3Jrcy5jb20iLCJlbWFpbCI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwiYXV0aF90aW1lIjoiMTAvMzAvMjAyNSAwNTowOTo0MiIsInRlbmFudF9pZCI6IjM4ODQyOCIsImRiX25hbWUiOiJtdC1wcm9kLVRlbmFudHMiLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3JvbGUiOiJBRE1JTklTVFJBVE9SIiwiZXhwIjoyNTM0MDIzMDA4MDAsImlzcyI6IkNsYXJlX0FJIiwiYXVkIjoiQ2xhcmVfQUkifQ.oKJCEd90MtewrKjk7ZfX3dOVjnKrk0GboGk-cYE3Ehg`,
      },
    });
  } catch (error) {
    console.error("[ERROR] WATI update failed:", error.message);
  }
};

export const sosReimbursementHandler = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { id } = req.params;
    const result = await sosReimbursement(id);
    if (!result.success) {
      await session.abortTransaction();
      return res.status(500).json({ success: false, ...result });
    }
    const sos = await SOS.findById(id).session(session);
    if (!sos) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, error: "SOS not found" });
    }
    const journey = await Journey.findOne({ Asset: sos.asset }).session(
      session
    );
    if (journey) {
      const endedJourney = new EndJourney({
        JourneyId: journey._id,
        Driver: journey.Driver,
        Asset: journey.Asset,
        Journey_Type: journey.Journey_Type,
        Occupancy: journey.Occupancy,
        hadSOS: journey.SOS_Status,
        startedAt: journey.createdAt,
        boardedPassengers: journey.boardedPassengers.map((evt) => ({
          passenger: evt.passenger,
          boardedAt: evt.boardedAt,
        })),
        processedWebhookEvents: journey.processedWebhookEvents,
      });
      await endedJourney.save({ session });
      await Journey.findByIdAndDelete(journey._id, { session });
      const asset = await Asset.findById(journey.Asset).session(session);
      if (asset) {
        asset.isActive = false;
        await asset.save({ session });
      } else {
        console.log("[WARN] Asset not found for Journey:", journey.Asset);
      }
      const io = req.app.get("io");
      io?.emit("journeyEnded", endedJourney);
    } else {
      console.log("[INFO] No active journey found for SOS asset");
    }
    await SOS.findByIdAndUpdate(
      id,
      { status: "resolved", sosSolution: "Reimbursement" },
      { session }
    );
    await session.commitTransaction();
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    await session.abortTransaction();
    console.error("[ERROR] sosReimbursementHandler:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  } finally {
    session.endSession();
  }
};