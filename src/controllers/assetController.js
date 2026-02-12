import mongoose from "mongoose";
import Asset from "../models/assetModel.js";
import Driver from "../models/driverModel.js";
import Passenger from "../models/Passenger.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import axios from "axios";

const updateDriverWatiStatus = async (phoneNumber, activeDriver = true) => {
  const url = `https://live-mt-server.wati.io/388428/api/v1/updateContactAttributes/${phoneNumber}`;
  const payload = {
    customParams: [
      {
        name: "active_Driver",
        value: activeDriver ? "true" : "false",
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
    console.error("Error updating WATI driver attribute:", error.message);
  }
};
export const getAvailableAssets = async (req, res) => {
  try {
    const assets = await Asset.find({
      isActive: false,
      $expr: {
        $eq: [
          {
            $reduce: {
              input: "$passengers",
              initialValue: 0,
              in: { $add: ["$$value", { $size: "$$this.passengers" }] },
            },
          },
          0,
        ],
      },
    })
      .select("shortId name capacity driver")
      .populate("driver", "name vehicleNumber")
      .lean();
    return res.status(200).json({ success: true, assets });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
export const addAsset = asyncHandler(async (req, res) => {
  const { driverId, capacity, isActive } = req.body;
  if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) {
    return res.status(400).json({ success: false, message: "Valid Driver ID is required." });
  }
  if (typeof capacity !== "number" || capacity <= 0) {
    return res.status(400).json({ success: false, message: "Capacity must be a positive number." });
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    return res.status(400).json({ success: false, message: "isActive must be a boolean." });
  }
  const driver = await Driver.findById(driverId);
  if (!driver) {
    return res.status(404).json({ success: false, message: "Driver not found." });
  }
  let asset = await Asset.findOne({ driver: driverId });
  if (asset) {
    const totalPax = asset.passengers.reduce(
      (sum, s) => sum + s.passengers.length,
      0
    );
    if (totalPax > capacity) {
      return res.status(400).json({
        success: false,
        message:"New capacity cannot be less than the number of assigned passengers.",
      });
    }
    asset.capacity = capacity;
    if (isActive !== undefined) asset.isActive = isActive;
    await asset.save();
    req.app.get("io").emit("assetUpdated", asset);
    await updateDriverWatiStatus(driver.phoneNumber, true);
    return res.status(200).json({
      success: true,
      message: "Asset exists—capacity updated.",
      asset,
    });
  }
  asset = await Asset.create({
    driver: driver._id,
    capacity,
    passengers: [],
    isActive: !!isActive,
  });

  req.app.get("io").emit("newAsset", asset);
  await updateDriverWatiStatus(driver.phoneNumber, true);

  return res.status(201).json({
    success: true,
    message: "Asset added successfully.",
    asset,
  });
});
export const getAllAssets = asyncHandler(async (req, res) => {
  try {
    const { day } = req.query;
    const assets = await Asset.find()
      .populate("driver", "name vehicleNumber")
      .populate(
        "passengers.passengers.passenger",
        "Employee_ID Employee_Name Employee_PhoneNumber Employee_Address"
      )
      .lean();
    if (!day) {
      return res.status(200).json({
        success: true,
        message: "Assets retrieved successfully.",
        assets,
      });
    }
    const validDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    if (!validDays.includes(day)) {
      return res.status(400).json({
        success: false,
        message: "Invalid day. Use Mon–Sun.",
      });
    }
    const filtered = assets.map((asset) => ({
      ...asset,
      passengers: asset.passengers.map((shiftGroup) => ({
        shift: shiftGroup.shift,
        passengers: shiftGroup.passengers.filter((p) =>
          p.wfoDays.includes(day)
        ),
      })),
    }));

    res.status(200).json({
      success: true,
      message: `Assets filtered by ${day}`,
      assets: filtered,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving assets.",
      error: error.message,
    });
  }
});
export const updateAsset = asyncHandler(async (req, res) => {
  const { capacity, isActive } = req.body;
  const { id: assetId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(assetId)) {
    return res.status(400).json({ success: false, message: "Invalid asset ID." });
  }
  const asset = await Asset.findById(assetId);
  if (!asset) {
    return res.status(404).json({ success: false, message: "Asset not found." });
  }
  if (capacity !== undefined) {
    if (typeof capacity !== "number" || capacity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Capacity must be a positive number.",
      });
    }
    const totalPax = asset.passengers.reduce(
      (sum, s) => sum + s.passengers.length,
      0
    );
    if (totalPax > capacity) {
      return res.status(400).json({
        success: false,
        message: "New capacity cannot be less than current passenger count.",
      });
    }
    asset.capacity = capacity;
  }
  if (isActive !== undefined) {
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ success: false, message: "isActive must be a boolean." });
    }
    asset.isActive = isActive;
  }
  await asset.save();
  req.app.get("io").emit("assetUpdated", asset);
  return res.status(200).json({
    success: true,
    message: "Asset updated successfully.",
    asset,
  });
});
export const deleteAsset = asyncHandler(async (req, res) => {
  const { id: assetId } = req.params;
  if (!assetId || !mongoose.Types.ObjectId.isValid(assetId)) {
    return res.status(400).json({
      success: false,
      message: "Valid Asset ID is required in URL parameters.",
    });
  }
  const asset = await Asset.findById(assetId);
  if (!asset) {
    return res.status(404).json({
      success: false,
      message: "Asset not found.",
    });
  }
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    await Passenger.updateMany(
      { asset: assetId },
      { $set: { asset: null } },
      { session }
    );
    await asset.deleteOne({ session });
    await session.commitTransaction();
    session.endSession();
    const driver = await Driver.findById(asset.driver);
    if (driver) {
      await updateDriverWatiStatus(driver.phoneNumber, false);
    }
    const io = req.app.get("io");
    io.emit("assetDeleted", assetId);

    return res.status(200).json({
      success: true,
      message: "Asset deleted successfully.",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({
      success: false,
      message: "Error deleting asset.",
      error: error.message,
    });
  }
});

function normalizeDayString(d) {
  if (d == null) return null;
  if (typeof d !== "string") d = String(d);
  d = d.trim().toLowerCase().replace(/\.$/, "");
  const map = {
    mon: "Mon",
    monday: "Mon",
    tue: "Tue",
    tuesday: "Tue",
    wed: "Wed",
    wednesday: "Wed",
    thu: "Thu",
    thursday: "Thu",
    fri: "Fri",
    friday: "Fri",
    sat: "Sat",
    saturday: "Sat",
    sun: "Sun",
    sunday: "Sun",
  };
  const key = d.slice(0, 3);
  return map[key] || null;
}

export const addMultiplePassengersToAsset = asyncHandler(async (req, res) => {
  try {
    const { passengers, shift } = req.body;
    const { id: assetId } = req.params;
    if (
      !mongoose.Types.ObjectId.isValid(assetId) ||
      !Array.isArray(passengers) ||
      passengers.length === 0 ||
      typeof shift !== "string" ||
      !shift.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "assetId, non-empty passengers array, and shift are required.",
      });
    }
    const normalizedPassengers = [];
    for (const p of passengers) {
      if (!p.id || !mongoose.Types.ObjectId.isValid(p.id)) {
        return res.status(400).json({
          success: false,
          message: "Each passenger must include a valid id.",
        });
      }
      
      const bs = new Date(p.bufferStart);
      const be = new Date(p.bufferEnd);
      if (isNaN(bs.getTime()) || isNaN(be.getTime())) {
        return res.status(400).json({
          success: false,
          message:
            "Each passenger must include valid bufferStart and bufferEnd.",
        });
      }

      if (!p.wfoDays || (Array.isArray(p.wfoDays) && p.wfoDays.length === 0)) {
        return res.status(400).json({
          success: false,
          message: "Each passenger must include wfoDays (array of days).",
        });
      }
      const rawDays = Array.isArray(p.wfoDays) ? p.wfoDays : [p.wfoDays];
      const normDays = rawDays
        .map((d) => normalizeDayString(d))
        .filter(Boolean);
      const validDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      if (
        normDays.length === 0 ||
        normDays.some((d) => !validDays.includes(d))
      ) {
        return res.status(400).json({
          success: false,
          message: "wfoDays must contain valid days (Mon..Sun).",
        });
      }

      normalizedPassengers.push({
        id: p.id,
        requiresTransport: p.requiresTransport ?? true,
        bufferStart: bs,
        bufferEnd: be,
        wfoDays: normDays,
      });
    }

    const [asset, passengerDocs] = await Promise.all([
      Asset.findById(assetId),
      Passenger.find({ _id: { $in: normalizedPassengers.map((p) => p.id) } }),
    ]);
    if (!asset) {
      return res
        .status(404)
        .json({ success: false, message: "Asset not found." });
    }
    const already = passengerDocs.filter((p) => p.asset);
    if (already.length) {
      return res.status(400).json({
        success: false,
        message: `Some passengers are already assigned to an Asset.`,
        already: already.map((a) => a._id),
      });
    }

    const existingShift = asset.passengers.find((g) => g.shift === shift);
    const shiftCount = existingShift ? existingShift.passengers.length : 0;
    if (shiftCount + normalizedPassengers.length > asset.capacity) {
      return res
        .status(400)
        .json({ success: false, message: `Shift capacity exceeded.` });
    }

    const newSubs = normalizedPassengers.map((p) => ({
      passenger: p.id,
      requiresTransport: p.requiresTransport,
      bufferStart: p.bufferStart,
      bufferEnd: p.bufferEnd,
      wfoDays: p.wfoDays,
    }));

    const idx = asset.passengers.findIndex((g) => g.shift === shift);
    if (idx >= 0) asset.passengers[idx].passengers.push(...newSubs);
    else asset.passengers.push({ shift, passengers: newSubs });

    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      await asset.save({ session });
      await Passenger.updateMany(
        { _id: { $in: normalizedPassengers.map((p) => p.id) } },
        { $set: { asset: asset._id } },
        { session }
      );
      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
    const updated = await Asset.findById(assetId)
      .populate("driver", "name vehicleNumber")
      .populate(
        "passengers.passengers.passenger",
        "Employee_ID Employee_Name Employee_PhoneNumber Employee_Address"
      )
      .lean();

    req.app.get("io").emit("assetUpdated", updated);
    return res.status(200).json({
      success: true,
      message: "Passengers added successfully.",
      asset: updated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error while adding passengers.",
      error: error.message,
    });
  }
});

export const removePassengerFromAsset = asyncHandler(async (req, res) => {
  const { passengerId } = req.body;
  const { id: assetId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(assetId)) {
    return res.status(400).json({
      success: false,
      message: "Valid Asset ID is required in URL parameters.",
    });
  }
  if (!mongoose.Types.ObjectId.isValid(passengerId)) {
    return res.status(400).json({
      success: false,
      message: "Valid Passenger ID is required in request body.",
    });
  }
  const [asset, passenger] = await Promise.all([
    Asset.findById(assetId),
    Passenger.findById(passengerId),
  ]);
  if (!asset) {
    return res
      .status(404)
      .json({ success: false, message: "Asset not found." });
  }
  if (!passenger) {
    return res
      .status(404)
      .json({ success: false, message: "Passenger not found." });
  }
  const isAssigned = asset.passengers.some((shiftGroup) =>
    shiftGroup.passengers.some((p) => p.passenger.equals(passengerId))
  );
  if (!isAssigned) {
    return res.status(400).json({
      success: false,
      message: "Passenger is not assigned to this asset.",
    });
  }
  for (const shiftGroup of asset.passengers) {
    shiftGroup.passengers = shiftGroup.passengers.filter(
      (p) => !p.passenger.equals(passengerId)
    );
  }

  asset.passengers = asset.passengers.filter(
    (shiftGroup) => shiftGroup.passengers.length > 0
  );
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    await asset.save({ session });
    if (passenger.asset && passenger.asset.equals(assetId)) {
      passenger.asset = null;
      await passenger.save({ session });
    }
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    return res.status(500).json({
      success: false,
      message: "Error removing passenger from asset.",
    });
  } finally {
    session.endSession();
  }
  const io = req.app.get("io");
  io.emit("assetUpdated", asset);

  return res.status(200).json({
    success: true,
    message: "Passenger removed from asset successfully.",
    asset,
  });
});