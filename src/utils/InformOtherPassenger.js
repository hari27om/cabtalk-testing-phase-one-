export const sendOtherPassengerSameShiftUpdateMessage = async (
  passengerPhone,
  otherPassengerName
) => {
  const cleanPhone = passengerPhone.replace(/\D/g, "");
  const [otherFirstRaw] = String(otherPassengerName).trim().split(/\s+/);
  const otherFirst = otherFirstRaw || otherPassengerName;

  const url = `https://live-mt-server.wati.io/388428/api/v1/sendTemplateMessage?whatsappNumber=${cleanPhone}`;

  const options = {
    method: "POST",
    headers: {
      "content-type": "application/json-patch+json",
      Authorization:
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjYTVkMDQzNS0yNWI2LTQ3YjEtOTEwMy1kNzQ2ZjExYjJkYjAiLCJ1bmlxdWVfbmFtZSI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwibmFtZWlkIjoiaGFyaS50cmlwYXRoaUBneGluZXR3b3Jrcy5jb20iLCJlbWFpbCI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwiYXV0aF90aW1lIjoiMTAvMzAvMjAyNSAwNTowOTo0MiIsInRlbmFudF9pZCI6IjM4ODQyOCIsImRiX25hbWUiOiJtdC1wcm9kLVRlbmFudHMiLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3JvbGUiOiJBRE1JTklTVFJBVE9SIiwiZXhwIjoyNTM0MDIzMDA4MDAsImlzcyI6IkNsYXJlX0FJIiwiYXVkIjoiQ2xhcmVfQUkifQ.oKJCEd90MtewrKjk7ZfX3dOVjnKrk0GboGk-cYE3Ehg",
    },
    body: JSON.stringify({
      broadcast_name: `unboarded_passenger_updates_${Date.now()}`,
      template_name: "unboarded_passenger_updates",
      parameters: [{ name: "name", value: otherFirst }],
    }),
  };

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return { success: true, to: cleanPhone, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
};