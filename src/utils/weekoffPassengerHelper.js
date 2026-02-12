// utils/weekoffPassengerHelper.js
const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const normalizeDays = (days) => {
  if (!Array.isArray(days)) return [];
  return days
    .map((d) => String(d || "").trim().slice(0, 3).toLowerCase())
    .filter(Boolean);
};

export const getToday = () => WEEK_DAYS[new Date().getDay()].slice(0, 3).toLowerCase();

export const isScheduledToday = (wfoDays) => {
  if (!wfoDays || !Array.isArray(wfoDays) || wfoDays.length === 0) {
    return true;
  }
  const today = getToday();
  const normalized = normalizeDays(wfoDays);
  const result = normalized.includes(today);
  return result;
};