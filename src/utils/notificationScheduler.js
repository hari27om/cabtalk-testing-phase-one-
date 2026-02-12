// utils/notificationScheduler.js
const WATI_URL = "https://live-mt-server.wati.io/388428/api/v1/sendTemplateMessages";
const WATI_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjYTVkMDQzNS0yNWI2LTQ3YjEtOTEwMy1kNzQ2ZjExYjJkYjAiLCJ1bmlxdWVfbmFtZSI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwibmFtZWlkIjoiaGFyaS50cmlwYXRoaUBneGluZXR3b3Jrcy5jb20iLCJlbWFpbCI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwiYXV0aF90aW1lIjoiMTAvMzAvMjAyNSAwNTowOTo0MiIsInRlbmFudF9pZCI6IjM4ODQyOCIsImRiX25hbWUiOiJtdC1wcm9kLVRlbmFudHMiLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3JvbGUiOiJBRE1JTklTVFJBVE9SIiwiZXhwIjoyNTM0MDIzMDA4MDAsImlzcyI6IkNsYXJlX0FJIiwiYXVkIjoiQ2xhcmVfQUkifQ.oKJCEd90MtewrKjk7ZfX3dOVjnKrk0GboGk-cYE3Ehg"

function buildFirstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || name || "";
}

async function postTemplate(payload) {
  if (!WATI_TOKEN) {
    throw new Error('WATI_TOKEN is not configured');
  }

  try {
    const res = await fetch(WATI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json-patch+json",
        Authorization: `Bearer ${WATI_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    
    if (res.status === 401) {
      throw new Error(`WATI API Authentication Failed: Token may be expired or invalid`);
    }
    
    if (!res.ok) {
      throw new Error(`WATI API ${res.status}: ${text}`);
    }
    return JSON.parse(text || "{}");
  } catch (error) {
    console.error('WATI API Request Failed:', {
      error: error.message,
      payload: payload
    });
    throw error;
  }
}

export async function sendPickupTemplateBefore10Min(phoneNumber, name) {
  const firstName = buildFirstName(name);
  const payload = {
    template_name: "pick_up_passenger_notification_before_10_minutes__",
    broadcast_name: `pick_up_passenger_notification_before_10_minutes__${Date.now()}`,
    receivers: [
      {
        whatsappNumber: phoneNumber,
        customParams: [{ name: "name", value: firstName }],
      },
    ],
  };
  return postTemplate(payload);
}

export async function sendBufferEndTemplate(phoneNumber, name) {
  const firstName = buildFirstName(name);
  const payload = {
    template_name: "",
    broadcast_name: `error_${Date.now()}`,
    receivers: [
      {
        whatsappNumber: (phoneNumber || "").replace(/\D/g, ""),
        customParams: [{ name: "name", value: firstName }],
      },
    ],
  };
  return postTemplate(payload);
}