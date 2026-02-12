// utils/InformPassengerLeave.js
import axios from "axios";

const WATI_BASE = "https://live-mt-server.wati.io";
const WATI_TENANT = "388428";
const WATI_BEARER = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjYTVkMDQzNS0yNWI2LTQ3YjEtOTEwMy1kNzQ2ZjExYjJkYjAiLCJ1bmlxdWVfbmFtZSI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwibmFtZWlkIjoiaGFyaS50cmlwYXRoaUBneGluZXR3b3Jrcy5jb20iLCJlbWFpbCI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwiYXV0aF90aW1lIjoiMTAvMzAvMjAyNSAwNTowOTo0MiIsInRlbmFudF9pZCI6IjM4ODQyOCIsImRiX25hbWUiOiJtdC1wcm9kLVRlbmFudHMiLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3JvbGUiOiJBRE1JTklTVFJBVE9SIiwiZXhwIjoyNTM0MDIzMDA4MDAsImlzcyI6IkNsYXJlX0FJIiwiYXVkIjoiQ2xhcmVfQUkifQ.oKJCEd90MtewrKjk7ZfX3dOVjnKrk0GboGk-cYE3Ehg";


export async function sendPassengerLeaveRecordTemplateBroadcast(phone, templateName, parameters = [], broadcastName) {
  const url = `${WATI_BASE}/${WATI_TENANT}/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(
    phone
  )}`;

  const body = {
    broadcast_name: broadcastName || `broadcast_${templateName}_${Date.now()}`,
    template_name: templateName,
    parameters: parameters,
  };

  try {
    const res = await axios.post(url, body, {
      headers: {
        "content-type": "application/json-patch+json",
        Authorization: `Bearer ${WATI_BEARER}`,
      },
      timeout: 15000,
    });

    return res.data;
  } catch (err) {
    const providerData = err?.response?.data || null;
    const status = err?.response?.status || null;
    const message = err?.message || "Unknown error from axios";

    console.error("watiBroadcast: failed to send template broadcast", {
      to: phone,
      template: templateName,
      broadcastName: body.broadcast_name,
      status,
      message,
      providerData,
    });

    const error = new Error("WATI broadcast failed");
    error.providerData = providerData;
    error.status = status;
    throw error;
  }
}