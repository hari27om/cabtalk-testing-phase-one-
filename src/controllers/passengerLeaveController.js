// src/controllers/passengerLeaveController.js
import PassengerLeave from "../models/PassengerLeave.js";
import Journey from "../models/JourneyModel.js";
import Asset from "../models/assetModel.js";
import Passenger from "../models/Passenger.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { cancelPendingNotificationsForPassenger } from "../utils/notificationService.js";
import mongoose from "mongoose";
import { sendWhatsAppMessage } from "../utils/whatsappHelper.js";
import { sendDriverLeaveRecordTemplateBroadcast  } from "../utils/InformDriverLeave.js";
import { sendPassengerLeaveRecordTemplateBroadcast } from "../utils/InformPassengerLeave.js";

function startOfDay(d) {
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export const createPassengerLeave = asyncHandler(async (req, res) => {
  const { passengerId, assetId, shift, startDate, endDate, reason } = req.body;

  if (!passengerId || !assetId || !shift || !startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message:
        "passengerId, assetId, shift, startDate and endDate are required.",
    });
  }

  if (
    !mongoose.Types.ObjectId.isValid(String(passengerId)) ||
    !mongoose.Types.ObjectId.isValid(String(assetId))
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid passengerId or assetId." });
  }

  const s = startOfDay(new Date(startDate));
  const e = startOfDay(new Date(endDate));
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) {
    return res.status(400).json({
      success: false,
      message: "Invalid startDate/endDate or startDate > endDate.",
    });
  }

  const passenger = await Passenger.findById(passengerId).lean();
  if (!passenger) {
    return res
      .status(404)
      .json({ success: false, message: "Passenger not found." });
  }

  const asset = await Asset.findOne({
    _id: assetId,
    "passengers.shift": shift,
    "passengers.passengers.passenger": passengerId,
  }).lean();

  if (!asset) {
    return res.status(400).json({
      success: false,
      message: "Passenger is not assigned to this asset and shift.",
    });
  }

  const overlapping = await PassengerLeave.findOne({
    passengerId,
    assetId,
    shift,
    $or: [
      { startDate: { $lte: e, $gte: s } },
      { endDate: { $lte: e, $gte: s } },
      { startDate: { $lte: s }, endDate: { $gte: e } },
    ],
  }).lean();

  if (overlapping) {
    return res.status(409).json({
      success: false,
      message:
        "Overlapping leave already exists for this passenger/asset/shift.",
    });
  }

  const doc = await PassengerLeave.create({
    passengerId,
    assetId,
    shift,
    startDate: s,
    endDate: e,
    reason: reason || null,
  });

  try {
    const journeys = await Journey.find({
      Asset: assetId,
      Journey_shift: shift,
    }).lean();
    for (const j of journeys) {
      const jRaw = j.originalStart
        ? new Date(j.originalStart)
        : j.createdAt
        ? new Date(j.createdAt)
        : null;
      if (!jRaw) continue;
      const jDate = startOfDay(jRaw);
      if (jDate.getTime() >= s.getTime() && jDate.getTime() <= e.getTime()) {
        await cancelPendingNotificationsForPassenger(passengerId, j._id);
      }
    }
  } catch (err) {
    console.error("createPassengerLeave: failed to cancel notifications", err);
  }

  const created = await PassengerLeave.findById(doc._id)
    .populate(
      "passengerId",
      "Employee_Name Employee_PhoneNumber Employee_ShiftTiming"
    )
    .populate({
      path: "assetId",
      select: "shortId driver",
      populate: {
        path: "driver",
        model: "Driver",
        select: "vehicleNumber name phoneNumber",
      },
    })
    .lean();

  try {
    function formatLeaveDate(d) {
      if (!d) return "";
      const dt = new Date(d);
      return dt.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }

    function normalizePhoneForWati(raw) {
      if (!raw) return null;
      const digits = String(raw).replace(/\D/g, "");
      if (digits.length >= 11) return digits;
      if (digits.length === 10) return "91" + digits;
      return digits;
    }

    const driver = created?.assetId?.driver;
    const passengerPop = created?.passengerId;
    const startStr = formatLeaveDate(created.startDate);
    const endStr = formatLeaveDate(created.endDate);
    const singleDayNote = startStr === endStr ? " (single day)" : "";

    const driverMessage = `Hello ${driver?.name || "Driver"},\n\n` +
      `${passengerPop?.Employee_Name || "Employee"} (Phone: ${passengerPop?.Employee_PhoneNumber || "N/A"}) ` +
      `has applied for leave from ${startStr} to ${endStr}${singleDayNote}.\n` +
      `Pickup/Drop is not required during this period.`;

    const driverPhoneNorm = normalizePhoneForWati(driver?.phoneNumber);

    if (driverPhoneNorm) {
      try {
        const driverParams = [
          { name: "name", value: driver?.name || "" }, 
          { name: "employeeonleave_name", value: passengerPop?.Employee_Name || "" },
          { name: "employeeonleave_phonenumber", value: passengerPop?.Employee_PhoneNumber || "" },
          { name: "leave_start_date", value: startStr || "" },
          { name: "leave_end_date", value: endStr || "" },
        ];

        await sendDriverLeaveRecordTemplateBroadcast(
          driverPhoneNorm,
          "inform_driver_leave_record",
          driverParams,
          `inform_driver_leave_record_${Date.now()}`
        );
      } catch (drvErr) {
        console.error("createPassengerLeave: driver broadcast failed", {
          driverId: driver?._id,
          driverName: driver?.name,
          driverPhoneRaw: driver?.phoneNumber,
          driverPhoneNormalized: driverPhoneNorm,
          leavePeriod: `${startStr} - ${endStr}`,
          broadcastError: drvErr?.providerData || drvErr?.message || drvErr,
        });

        sendWhatsAppMessage(driverPhoneNorm, driverMessage);
      }
    } else {
      console.warn("createPassengerLeave: driver phoneNumber missing/invalid, skipping WhatsApp template send to driver.");
    }
    const passengerPhoneNorm = normalizePhoneForWati(passengerPop?.Employee_PhoneNumber);

    if (passengerPhoneNorm) {
      try {
        const params = [
          { name: "name", value: passengerPop?.Employee_Name },
          { name: "leave_start_date", value: startStr },
          { name: "leave_end_date", value: endStr },
        ];
        const bcRes = await sendPassengerLeaveRecordTemplateBroadcast(
          passengerPhoneNorm,
          "inform_passenger_leave_record",
          params,
          `inform_passenger_leave_record_${Date.now()}`
        );
      } catch (bcErr) {
        console.error("createPassengerLeave: passenger broadcast failed", {
          passengerId: passengerPop?._id,
          passengerName: passengerPop?.Employee_Name,
          passengerPhoneRaw: passengerPop?.Employee_PhoneNumber,
          passengerPhoneNormalized: passengerPhoneNorm,
          leavePeriod: `${startStr} - ${endStr}`,
          broadcastError: bcErr?.providerData || bcErr?.message || bcErr,
        });
      }
    } else {
      console.warn("createPassengerLeave: passenger phone missing, skipping broadcast send to passenger.");
    }
  } catch (err) {
    console.error("createPassengerLeave: error while preparing/sending message", err);
  }
  return res.status(201).json({ success: true, data: created });
});

export const deletePassengerLeave = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid leave id." });
  }
  const doc = await PassengerLeave.findByIdAndDelete(id);
  if (!doc)
    return res
      .status(404)
      .json({ success: false, message: "Leave not found." });
  return res.status(200).json({ success: true, message: "Leave deleted." });
});

export const listLeavesForAssetOnDate = asyncHandler(async (req, res) => {
  const { assetId, shift, date } = req.query;
  if (!assetId || !shift || !date) {
    return res.status(400).json({
      success: false,
      message: "assetId, shift and date are required.",
    });
  }
  if (!mongoose.Types.ObjectId.isValid(String(assetId))) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid assetId." });
  }

  const target = startOfDay(new Date(date));
  if (isNaN(target.getTime())) {
    return res.status(400).json({ success: false, message: "Invalid date." });
  }

  const leaves = await PassengerLeave.find({
    assetId,
    shift,
    startDate: { $lte: target },
    endDate: { $gte: target },
  })
    .populate(
      "passengerId",
      "Employee_Name Employee_PhoneNumber Employee_ShiftTiming"
    )
    .populate({
      path: "assetId",
      select: "shortId driver",
      populate: {
        path: "driver",
        model: "Driver",
        select: "vehicleNumber name phoneNumber",
      },
    })
    .lean();

  return res.status(200).json({ success: true, data: leaves });
});

export const listAllLeaves = asyncHandler(async (req, res) => {
  const { q, assetId, shift, from, to } = req.query;
  let { page = 1, limit = DEFAULT_LIMIT } = req.query;

  page = Math.max(1, parseInt(page, 10) || 1);
  limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(limit, 10) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  const aggregateMatch = [];

  if (assetId && mongoose.Types.ObjectId.isValid(String(assetId))) {
    aggregateMatch.push({ "assetId": mongoose.Types.ObjectId(String(assetId)) });
  }
  if (shift) aggregateMatch.push({ "shift": shift });

  if (from) {
    const fromD = startOfDay(new Date(from));
    if (isNaN(fromD.getTime())) return res.status(400).json({ success: false, message: "Invalid 'from' date." });
    aggregateMatch.push({ "endDate": { $gte: fromD } });
  }
  if (to) {
    const toD = startOfDay(new Date(to));
    if (isNaN(toD.getTime())) return res.status(400).json({ success: false, message: "Invalid 'to' date." });
    aggregateMatch.push({ "startDate": { $lte: toD } });
  }

  // Build pipeline
  const pipeline = [];

  // initial match from filters (asset/shift/from/to)
  if (aggregateMatch.length) pipeline.push({ $match: { $and: aggregateMatch } });

  // lookup passenger
  pipeline.push({
    $lookup: {
      from: "passengers",
      localField: "passengerId",
      foreignField: "_id",
      as: "passenger",
    },
  });
  pipeline.push({ $unwind: { path: "$passenger", preserveNullAndEmptyArrays: true } });

  // lookup asset
  pipeline.push({
    $lookup: {
      from: "assets",
      localField: "assetId",
      foreignField: "_id",
      as: "asset",
    },
  });
  pipeline.push({ $unwind: { path: "$asset", preserveNullAndEmptyArrays: true } });

  // lookup driver inside asset.driver
  pipeline.push({
    $lookup: {
      from: "drivers",
      localField: "asset.driver",
      foreignField: "_id",
      as: "assetDriver",
    },
  });
  pipeline.push({ $unwind: { path: "$assetDriver", preserveNullAndEmptyArrays: true } });

  // textual search q (optional) - search passenger name, phone, asset shortId, driver vehicleNumber, reason
  if (q && typeof q === "string" && q.trim()) {
    const qq = q.trim();
    const re = new RegExp(escapeRegExp(qq), "i");
    pipeline.push({
      $match: {
        $or: [
          { "passenger.Employee_Name": { $regex: re } },
          { "passenger.Employee_PhoneNumber": { $regex: re } },
          { "asset.shortId": { $regex: re } },
          { "assetDriver.vehicleNumber": { $regex: re } },
          { "reason": { $regex: re } },
        ],
      },
    });
  }

  // projection to shape results
  pipeline.push({
    $project: {
      passenger: { _id: "$passenger._id", Employee_Name: "$passenger.Employee_Name", Employee_PhoneNumber: "$passenger.Employee_PhoneNumber" },
      asset: { _id: "$asset._id", shortId: "$asset.shortId", driver: "$assetDriver" },
      shift: 1,
      startDate: 1,
      endDate: 1,
      reason: 1,
      createdAt: 1,
    },
  });

  // sort + facet for total + paginated results
  pipeline.push({
    $sort: { startDate: -1 }
  });

  pipeline.push({
    $facet: {
      metadata: [{ $count: "total" }],
      data: [{ $skip: skip }, { $limit: limit }],
    },
  });

  const agg = await PassengerLeave.aggregate(pipeline).allowDiskUse(true);
  const metadata = agg[0]?.metadata?.[0] || { total: 0 };
  const data = agg[0]?.data || [];

  return res.status(200).json({ success: true, data, meta: { total: metadata.total || 0, page, limit } });
});

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const listLeavesByMonth = asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const result = [];

  // iterate months 0..11
  for (let m = 0; m < 12; m += 1) {
    const monthStart = new Date(year, m, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, m + 1, 0, 23, 59, 59, 999);

    const leaves = await PassengerLeave.find({
      startDate: { $lte: monthEnd },
      endDate: { $gte: monthStart },
    })
      .sort({ startDate: -1 })
      .populate("passengerId", "Employee_Name Employee_PhoneNumber")
      .populate({
        path: "assetId",
        select: "shortId driver",
        populate: { path: "driver", model: "Driver", select: "vehicleNumber name phoneNumber" },
      })
      .lean();

    const normalized = leaves.map((l) => ({
      _id: l._id,
      passenger: l.passengerId ? {
        _id: l.passengerId._id,
        name: l.passengerId.Employee_Name,
        phone: l.passengerId.Employee_PhoneNumber,
      } : null,
      asset: l.assetId ? {
        _id: l.assetId._id,
        shortId: l.assetId.shortId,
        vehicleNumber: l.assetId.driver ? l.assetId.driver.vehicleNumber : null,
        driverName: l.assetId.driver ? l.assetId.driver.name : null,
      } : null,
      shift: l.shift,
      startDate: l.startDate,
      endDate: l.endDate,
      reason: l.reason || null,
      createdAt: l.createdAt,
    }));

    result.push({
      monthIndex: m + 1,
      monthKey: `${year}-${String(m + 1).padStart(2, "0")}`, // e.g. "2025-01"
      monthLabel: `${monthNames[m]} ${year}`,
      leaves: normalized,
    });
  }

  return res.status(200).json({ success: true, year, data: result });
});