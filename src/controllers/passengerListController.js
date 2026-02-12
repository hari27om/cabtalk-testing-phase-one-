import axios from "axios";
import Driver from "../models/driverModel.js";
import Asset from "../models/assetModel.js";
import Journey from "../models/JourneyModel.js";
import Passenger from "../models/Passenger.js";
import { sendWhatsAppMessage } from "../utils/whatsappHelper.js";

const MAX_TITLE_LEN = 24;
const SEP = "📞";
const formatTitle = (name = "", phoneNumber = "") => {
  let title = `${name}${SEP}${phoneNumber}`;
  if (title.length <= MAX_TITLE_LEN) return title;
  const overflow = title.length - MAX_TITLE_LEN;
  const allowedNameLen = Math.max(0, name.length - overflow);
  return `${name.slice(0, allowedNameLen)}${SEP}${phoneNumber}`;
};

const toIdString = (v) => {
  if (!v && v !== 0) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v._id) return String(v._id);
  return String(v);
};

const getBoardedPassengersSet = (journey = {}) => {
  const arr = journey.boardedPassengers || [];
  return new Set(
    arr.map((bp) => {
      if (!bp) return "";
      if (typeof bp === "object" && bp.passenger) return toIdString(bp.passenger);
      return toIdString(bp);
    })
  );
};

export const sendPassengerList = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: "Phone number is required." });
    }

    const driver = await Driver.findOne({ phoneNumber })
      .select("_id vehicleNumber")
      .lean();
    if (!driver) {
      return res.status(404).json({ success: false, message: "Driver not found." });
    }

    const [asset, journey] = await Promise.all([
      Asset.findOne({ driver: driver._id })
        .select("passengers")
        .populate({
          path: "passengers.passengers.passenger",
          model: "Passenger",
          select: "Employee_Name Employee_PhoneNumber Employee_Address",
        })
        .lean(),
      Journey.findOne({ Driver: driver._id })
        .select("Journey_shift boardedPassengers")
        .lean(),
    ]);

    if (!asset) {
      return res.status(404).json({ success: false, message: "No asset assigned to this driver." });
    }
    if (!journey) {
      return res.status(500).json({ success: false, message: "Journey record missing." });
    }

    const shiftBlock = (asset.passengers || []).find((b) => b.shift === journey.Journey_shift);
    if (!shiftBlock || !Array.isArray(shiftBlock.passengers) || shiftBlock.passengers.length === 0) {
      await sendWhatsAppMessage(phoneNumber, "No passengers assigned.");
      return res.json({ success: true, message: "No passengers assigned." });
    }

    const boardedSet = getBoardedPassengersSet(journey);
    const passengerEntries = shiftBlock.passengers || [];

    const missingIds = [];
    const passengerMap = new Map();

    for (const ps of passengerEntries) {
      if (!ps || !ps.passenger) continue;
      const p = ps.passenger;
      const id = toIdString(p);
      if (typeof p === "object" && p.Employee_Name) {
        passengerMap.set(id, p);
      } else {
        missingIds.push(id);
      }
    }
    if (missingIds.length > 0) {
      const missingPassengers = await Passenger.find({ _id: { $in: missingIds } })
        .select("Employee_Name Employee_PhoneNumber Employee_Address")
        .lean();
      for (const mp of missingPassengers) {
        passengerMap.set(String(mp._id), mp);
      }
    }
    const rows = [];
    for (const ps of passengerEntries) {
      if (!ps || !ps.passenger) continue;
      const pId = toIdString(ps.passenger);
      if (!pId) continue;
      if (boardedSet.has(pId)) continue; 

      const passengerObj = passengerMap.get(pId);
      if (!passengerObj) continue;

      const title = formatTitle(passengerObj.Employee_Name || "Unknown", passengerObj.Employee_PhoneNumber || "");
      const description = (`📍 ${passengerObj.Employee_Address || "Address not available"}`).slice(0, 70);
      rows.push({ title, description });
    }

    if (rows.length === 0) {
      await sendWhatsAppMessage(phoneNumber, "No available passengers to display.");
      return res.json({ success: true, message: "No available passengers to display." });
    }

    const watiPayload = {
      header: "Ride Details",
      body: `Passenger list (${driver.vehicleNumber || "Unknown Vehicle"}):`,
      footer: "CabTalk",
      buttonText: "Menu",
      sections: [{ title: "Passenger Details", rows }],
    };
    const WATI_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjYTVkMDQzNS0yNWI2LTQ3YjEtOTEwMy1kNzQ2ZjExYjJkYjAiLCJ1bmlxdWVfbmFtZSI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwibmFtZWlkIjoiaGFyaS50cmlwYXRoaUBneGluZXR3b3Jrcy5jb20iLCJlbWFpbCI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwiYXV0aF90aW1lIjoiMTAvMzAvMjAyNSAwNTowOTo0MiIsInRlbmFudF9pZCI6IjM4ODQyOCIsImRiX25hbWUiOiJtdC1wcm9kLVRlbmFudHMiLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3JvbGUiOiJBRE1JTklTVFJBVE9SIiwiZXhwIjoyNTM0MDIzMDA4MDAsImlzcyI6IkNsYXJlX0FJIiwiYXVkIjoiQ2xhcmVfQUkifQ.oKJCEd90MtewrKjk7ZfX3dOVjnKrk0GboGk-cYE3Ehg";
    const WATI_BASE = "https://live-mt-server.wati.io/388428";

    if (!WATI_API_KEY) {
      console.error("[sendPassengerList] Missing WATI_API_KEY env var");
      return res.status(500).json({ success: false, message: "Server misconfiguration: WATI key missing." });
    }

    const response = await axios.post(
      `${WATI_BASE}/api/v1/sendInteractiveListMessage?whatsappNumber=${encodeURIComponent(phoneNumber)}`,
      watiPayload,
      {
        headers: {
          Authorization: `Bearer ${WATI_API_KEY}`,
          "Content-Type": "application/json-patch+json",
        },
        timeout: 15000,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Passenger list sent successfully via WhatsApp.",
      data: response.data,
    });
  } catch (error) {
    console.error(`[sendPassengerList] Error: ${error?.message || error}`);
    return res.status(500).json({
      success: false,
      message: "Internal error",
      error: error?.message || String(error),
    });
  }
};