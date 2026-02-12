// utils/updatePassengerShiftChange.js
const WATI_BASE_URL = "https://live-mt-server.wati.io/388428/api/v1";
 
export async function updatePassengerShiftChange(whatsappNumber, templateName, broadcastName, parameters) {
  const url = `${WATI_BASE_URL}/sendTemplateMessage?whatsappNumber=${whatsappNumber}`;
 
  const options = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjYTVkMDQzNS0yNWI2LTQ3YjEtOTEwMy1kNzQ2ZjExYjJkYjAiLCJ1bmlxdWVfbmFtZSI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwibmFtZWlkIjoiaGFyaS50cmlwYXRoaUBneGluZXR3b3Jrcy5jb20iLCJlbWFpbCI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwiYXV0aF90aW1lIjoiMTAvMzAvMjAyNSAwNTowOTo0MiIsInRlbmFudF9pZCI6IjM4ODQyOCIsImRiX25hbWUiOiJtdC1wcm9kLVRlbmFudHMiLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3JvbGUiOiJBRE1JTklTVFJBVE9SIiwiZXhwIjoyNTM0MDIzMDA4MDAsImlzcyI6IkNsYXJlX0FJIiwiYXVkIjoiQ2xhcmVfQUkifQ.oKJCEd90MtewrKjk7ZfX3dOVjnKrk0GboGk-cYE3Ehg`,
    },
    body: JSON.stringify({
      template_name: templateName,
      broadcast_name: broadcastName,
      parameters,
    }),
  };
 
  try {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`WATI API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("❌ Failed to send WhatsApp message:", err);
    throw err;
  }
}