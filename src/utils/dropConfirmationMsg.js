export const sendDropConfirmationMessage = async (phoneNumber, name) => {
  try {
    const cleanedPhone = phoneNumber.replace(/\D/g, "");

    const [firstNameRaw] = name.trim().split(/\s+/);
    const firstName = firstNameRaw || name;

    const url = `https://live-mt-server.wati.io/388428/api/v1/sendTemplateMessage?whatsappNumber=${cleanedPhone}`;

    const options = {
      method: "POST",
      headers: {
        "content-type": "application/json-patch+json",
        Authorization:
          "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjYTVkMDQzNS0yNWI2LTQ3YjEtOTEwMy1kNzQ2ZjExYjJkYjAiLCJ1bmlxdWVfbmFtZSI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwibmFtZWlkIjoiaGFyaS50cmlwYXRoaUBneGluZXR3b3Jrcy5jb20iLCJlbWFpbCI6ImhhcmkudHJpcGF0aGlAZ3hpbmV0d29ya3MuY29tIiwiYXV0aF90aW1lIjoiMTAvMzAvMjAyNSAwNTowOTo0MiIsInRlbmFudF9pZCI6IjM4ODQyOCIsImRiX25hbWUiOiJtdC1wcm9kLVRlbmFudHMiLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL3JvbGUiOiJBRE1JTklTVFJBVE9SIiwiZXhwIjoyNTM0MDIzMDA4MDAsImlzcyI6IkNsYXJlX0FJIiwiYXVkIjoiQ2xhcmVfQUkifQ.oKJCEd90MtewrKjk7ZfX3dOVjnKrk0GboGk-cYE3Ehg",
      },
      body: JSON.stringify({
        broadcast_name: `drop_confirmation_passenger_final_${Date.now()}`,
        template_name: "drop_confirmation_passenger_final",
        parameters: [
          {
            name: "name",
            value: firstName,
          },
        ],
      }),
    };

    const response = await fetch(url, options);
    const result = await response.json();

    if (response.ok) {
      return { success: true, data: result };
    } else {
      return { success: false, error: result };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};