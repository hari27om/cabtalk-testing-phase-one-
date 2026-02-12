// utils/rideStartUpdatePassenger.js
import Asset from "../models/assetModel.js";
import Driver from "../models/driverModel.js";
import axios from "axios";
import { isScheduledToday } from "./weekoffPassengerHelper.js";
import PassengerLeave from "../models/PassengerLeave.js"; // <-- added

export const startRideUpdatePassengerController = async (req, res) => {
  try {
    const { vehicleNumber, Journey_shift } = req.body;

    if (!vehicleNumber || !Journey_shift) {
      return res.status(400).json({ success: false, message: "vehicleNumber and Journey_shift are required." });
    }
    const driver = await Driver.findOne({ vehicleNumber });
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found for this vehicle number." });
    }

    const asset = await Asset.findOne({ driver: driver._id }).populate({
      path: "passengers.passengers.passenger",
      model: "Passenger",
      select: "Employee_Name Employee_PhoneNumber wfoDays",
    });

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: "No asset assigned to this driver.",
      });
    }

    const shiftGroup = asset.passengers.find(
      (group) => group.shift === Journey_shift
    );

    if (!shiftGroup || shiftGroup.passengers.length === 0) {
      return res.status(200).json({
        success: true,
        message: `No passengers found for shift "${Journey_shift}".`,
      });
    }
    let notifiedCount = 0;
    let skippedCount = 0;

    const journeyDateRaw = new Date();
    const journeyDate = new Date(
      journeyDateRaw.getFullYear(),
      journeyDateRaw.getMonth(),
      journeyDateRaw.getDate()
    );

    for (const entry of shiftGroup.passengers) {
      const passenger = entry.passenger;
      if (!passenger || !passenger.Employee_PhoneNumber) {
        skippedCount++;
        continue;
      }
      const effectiveWfoDays = Array.isArray(entry.wfoDays) && entry.wfoDays.length ? entry.wfoDays : passenger.wfoDays;
      if (!isScheduledToday(effectiveWfoDays)) {
        skippedCount++;
        continue;
      }

      const passengerId = passenger._id ? passenger._id : passenger;
      const onLeave = await PassengerLeave.findOne({
        passengerId: passengerId,
        assetId: asset._id,
        shift: Journey_shift,
        startDate: { $lte: journeyDate },
        endDate: { $gte: journeyDate },
      }).select("_id").lean();

      if (onLeave) {
        skippedCount++;
        continue;
      }

      const phone = passenger.Employee_PhoneNumber.replace(/\D/g, "");
      const rawName = passenger.Employee_Name || "Passenger";
      const [firstRaw] = String(rawName).trim().split(/\s+/);
      const firstName = firstRaw || rawName;

      try {
        await axios.post(
          `https://live-mt-server.wati.io/388428/api/v1/sendTemplateMessage?whatsappNumber=${phone}`,
          {
            broadcast_name: `ride_started_update_passenger_${Date.now()}`,
            template_name: "ride_started_update_passengers",
            parameters: [{ name: "name", value: firstName }],
          },
          {
            headers: {
              "content-type": "application/json-patch+json",
              Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjYTVkMDQzNS0yNWI2LTQ3YjEtOTEwMy1kNzQ2ZjExYjJkYjAiLCJ1bmlxdWVfbmFtZSI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwibmFtZWlkIjoiaGFyaS50cmlwYXRoaUBneGluZXR3b3Jrcy5jb20iLCJlbWFpbCI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwiYXV0aF90aW1lIjoiMTAvMzAvMjAyNSAwNTowOTo0MiIsInRlbmFudF9pZCI6IjM4ODQyOCIsImRiX25hbWUiOiJtdC1wcm9kLVRlbmFudHMiLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3JvbGUiOiJBRE1JTklTVFJBVE9SIiwiZXhwIjoyNTM0MDIzMDA4MDAsImlzcyI6IkNsYXJlX0FJIiwiYXVkIjoiQ2xhcmVfQUkifQ.oKJCEd90MtewrKjk7ZfX3dOVjnKrk0GboGk-cYE3Ehg`,
            },
          }
        );
        notifiedCount++;
      } catch (err) {
        console.error(err?.response?.data || err.message);
        skippedCount++;
      }
    }
    return res.status(200).json({
      success: true,
      message: `Passengers for shift "${Journey_shift}" checked. Only scheduled passengers notified.`,
      notifiedCount,
      skippedCount,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error.",
      error: error.message,
    });
  }
};