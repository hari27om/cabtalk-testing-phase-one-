import axios from "axios";

const WATI_BASE = "https://live-mt-server.wati.io/388428/api/v1";
const TOKEN = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjYTVkMDQzNS0yNWI2LTQ3YjEtOTEwMy1kNzQ2ZjExYjJkYjAiLCJ1bmlxdWVfbmFtZSI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwibmFtZWlkIjoiaGFyaS50cmlwYXRoaUBneGluZXR3b3Jrcy5jb20iLCJlbWFpbCI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwiYXV0aF90aW1lIjoiMTAvMzAvMjAyNSAwNTowOTo0MiIsInRlbmFudF9pZCI6IjM4ODQyOCIsImRiX25hbWUiOiJtdC1wcm9kLVRlbmFudHMiLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3JvbGUiOiJBRE1JTklTVFJBVE9SIiwiZXhwIjoyNTM0MDIzMDA4MDAsImlzcyI6IkNsYXJlX0FJIiwiYXVkIjoiQ2xhcmVfQUkifQ.oKJCEd90MtewrKjk7ZfX3dOVjnKrk0GboGk-cYE3Ehg";

export async function sendPickupConfirmationMessage(phoneNumber, passengerName) {
  if (!phoneNumber || !passengerName) {
    throw new Error("phoneNumber and passengerName are required");
  }

  const cleanPhone = phoneNumber.replace(/\D/g, ""); 
  if (!/^91\d{10}$/.test(cleanPhone)) {
    throw new Error("Invalid Indian phone number format");
  }

  const [firstRaw] = String(passengerName).trim().split(/\s+/);
  const firstName = firstRaw || passengerName;

  const url = `${WATI_BASE}/sendTemplateMessage?whatsappNumber=${cleanPhone}`;
  const payload = {
    template_name: "picked_up_passenger_update",
    broadcast_name: `picked_up_passenger_update_${Date.now()}`,
    parameters: [
      {
        name: "name",
        value: firstName,
      },
    ],
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: TOKEN,
        "Content-Type": "application/json-patch+json",
      },
      timeout: 10000,
    });

    return {
      success: true,
      to: cleanPhone,
      data: response.data,
    };
  } catch (err) {
    return {
      success: false,
      error: err.response?.data || err.message,
    };
  }
}