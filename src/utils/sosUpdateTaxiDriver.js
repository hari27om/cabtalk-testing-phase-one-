import mongoose from "mongoose";
import axios from "axios";
import SOS from "../models/sosModel.js";
import Asset from "../models/assetModel.js";
import Passenger from "../models/Passenger.js";
import Taxi from "../models/TaxiModel.js";
import Journey from "../models/JourneyModel.js";
import EndJourney from "../models/endJourneyModel.js";

const WATI_BASE = "https://live-mt-server.wati.io/388428/api/v1";
const TOKEN = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjYTVkMDQzNS0yNWI2LTQ3YjEtOTEwMy1kNzQ2ZjExYjJkYjAiLCJ1bmlxdWVfbmFtZSI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwibmFtZWlkIjoiaGFyaS50cmlwYXRoaUBneGluZXR3b3Jrcy5jb20iLCJlbWFpbCI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwiYXV0aF90aW1lIjoiMTAvMzAvMjAyNSAwNTowOTo0MiIsInRlbmFudF9pZCI6IjM4ODQyOCIsImRiX25hbWUiOiJtdC1wcm9kLVRlbmFudHMiLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3JvbGUiOiJBRE1JTklTVFJBVE9SIiwiZXhwIjoyNTM0MDIzMDA4MDAsImlzcyI6IkNsYXJlX0FJIiwiYXVkIjoiQ2xhcmVfQUkifQ.oKJCEd90MtewrKjk7ZfX3dOVjnKrk0GboGk-cYE3Ehg";

export async function sosUpdateTaxiDriver(sosId) {
  const sos = await SOS.findById(sosId);
  if (!sos) {
    return { success: false, error: "SOS not found" };
  }
  if (!sos.asset) {
    return { success: false, error: "No broken asset" };
  }
  const brokenAsset = await Asset.findById(sos.asset).lean();
  if (!brokenAsset) {
    return { success: false, error: "Broken asset not found" };
  }

  const rosterIds = Array.isArray(brokenAsset.passengers)
    ? brokenAsset.passengers
        .filter(block => block.shift === sos.sos_shift)
        .flatMap(block => block.passengers.map(ps => ps.passenger))
    : [];
  const passengers = await Passenger.find({ _id: { $in: rosterIds } })
    .select("Employee_Name Employee_PhoneNumber Employee_Address")
    .lean();
  let passengerList = passengers.length
    ? passengers
        .map(
          p => `${p.Employee_Name}, ${p.Employee_PhoneNumber}, ${p.Employee_Address}`
        )
        .join(" | ")
    : "No passengers listed";
  passengerList = passengerList
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // 4. Get latest taxi (newAsset)
  const latestTaxi = await Taxi.findOne({}).sort({ createdAt: -1 }).lean();
  if (!latestTaxi) {
    return { success: false, error: "No taxi record found" };
  }

  const rawPhone = latestTaxi.taxiDriverNumber;
  const phone = rawPhone.replace(/\D/g, "");
  if (!/^91\d{10}$/.test(phone)) {
    return { success: false, error: "Invalid phone number" };
  }

  const url = `${WATI_BASE}/sendTemplateMessage?whatsappNumber=${phone}`;
  const payload = {
    template_name: "car_break_down_update_new_rider_final",
    broadcast_name: `car_break_down_update_new_rider_final_${new Date()
      .toISOString()
      .replace(/[:.-]/g, "")}`,
    parameters: [
      { name: "new_driver_name", value: latestTaxi.taxiDriverName },
      { name: "passenger_list", value: passengerList },
    ],
  };

  let responseData;
  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: TOKEN,
        "Content-Type": "application/json-patch+json",
      },
    });
    responseData = response.data;
  } catch (err) {
    return { success: false, error: err.response?.data || err.message };
  }
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const journey = await Journey.findOne({ Asset: brokenAsset._id }).session(session);
    if (journey) {
      const alreadyEnded = await EndJourney.findOne({
        JourneyId: journey._id,
      }).session(session);
      if (!alreadyEnded) {
        const endedJourney = new EndJourney({
          JourneyId: journey._id,
          Driver: journey.Driver,
          Asset: journey.Asset,
          Journey_Type: journey.Journey_Type,
          Occupancy: journey.Occupancy,
          hadSOS: journey.SOS_Status,
          startedAt: journey.createdAt,
          boardedPassengers: journey.boardedPassengers.map(evt => ({
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
        }
        const io = global.io || null;
        io?.emit("journeyEnded", endedJourney);
      }
    } else {
      console.warn("[WARN] No active journey found for broken asset, skipping endJourney.");
    }
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
  } finally {
    session.endSession();
  }
  return { success: true, to: phone, data: responseData };
}