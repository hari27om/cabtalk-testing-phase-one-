import axios from "axios";
import SOS from "../models/sosModel.js";
import Asset from "../models/assetModel.js";
import Passenger from "../models/Passenger.js";

const WATI_BASE = "https://live-mt-server.wati.io/388428/api/v1";
const TOKEN = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjYTVkMDQzNS0yNWI2LTQ3YjEtOTEwMy1kNzQ2ZjExYjJkYjAiLCJ1bmlxdWVfbmFtZSI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwibmFtZWlkIjoiaGFyaS50cmlwYXRoaUBneGluZXR3b3Jrcy5jb20iLCJlbWFpbCI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwiYXV0aF90aW1lIjoiMTAvMzAvMjAyNSAwNTowOTo0MiIsInRlbmFudF9pZCI6IjM4ODQyOCIsImRiX25hbWUiOiJtdC1wcm9kLVRlbmFudHMiLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3JvbGUiOiJBRE1JTklTVFJBVE9SIiwiZXhwIjoyNTM0MDIzMDA4MDAsImlzcyI6IkNsYXJlX0FJIiwiYXVkIjoiQ2xhcmVfQUkifQ.oKJCEd90MtewrKjk7ZfX3dOVjnKrk0GboGk-cYE3Ehg";

export async function sosUpdateDriver(sosId, newAssetId) {
  const sos = await SOS.findById(sosId);
  if (!sos) {
    return { success: false, error: "SOS not found" };
  }
  if (!newAssetId) {
    return { success: false, error: "No newAssetId provided" };
  }
  const [brokenAsset, newAsset] = await Promise.all([
    Asset.findById(sos.asset).lean(),
    Asset.findById(newAssetId).populate("driver", "name phoneNumber vehicleNumber").lean(),
  ]);

  if (!brokenAsset || !newAsset?.driver) {
    return { success: false, error: "Asset lookup failed" };
  }

  const rosterIds = Array.isArray(brokenAsset.passengers)
    ? brokenAsset.passengers
        .filter((block) => block.shift === sos.sos_shift)
        .flatMap((block) => block.passengers.map((ps) => ps.passenger))
    : [];

  const passengers = await Passenger.find({ _id: { $in: rosterIds } })
    .select("Employee_Name Employee_PhoneNumber Employee_Address")
    .lean();

  let passengerList = passengers.length
    ? passengers
        .map(
          (p) => `${p.Employee_Name}, ${p.Employee_PhoneNumber}, ${p.Employee_Address}`
        )
        .join(" | ")
    : "No passengers listed";

  passengerList = passengerList.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();

  const rawPhone = newAsset.driver.phoneNumber;
  const phone = rawPhone.replace(/\D/g, "");
  if (!/^91\d{10}$/.test(phone)) {
    return { success: false, error: "Invalid driver phone number" };
  }

  const url = `${WATI_BASE}/sendTemplateMessage?whatsappNumber=${phone}`;
  const payload = {
    template_name: "car_break_down_update_new_rider_final",
    broadcast_name: `car_break_down_update_new_rider_final_${Date.now()}`,
    parameters: [
      { name: "new_driver_name", value: newAsset.driver.name },
      { name: "passenger_list", value: passengerList },
    ],
  };

  try {
    const resp = await axios.post(url, payload, {
      headers: {
        Authorization: TOKEN,
        "Content-Type": "application/json-patch+json",
      },
      timeout: 10000,
    });
    return { success: true, to: phone, data: resp.data };
  } catch (err) {
    return { success: false, error: err.response?.data || err.message };
  }
}