import crypto from "crypto";
import Journey from "../models/JourneyModel.js";
import Notification from "../models/Notification.js";
import PassengerLeave from "../models/PassengerLeave.js";

export async function storeJourneyNotifications(journeyId, passengers) {

  try {
    const journey = await Journey.findById(journeyId).lean();
    if (!journey) {
      console.warn(`❌ Journey not found: ${journeyId}`);
      return;
    }

    const now = new Date();
    const journeyDateRaw = journey.originalStart
      ? new Date(journey.originalStart)
      : new Date(journey.createdAt || now);
    const journeyDate = new Date(
      journeyDateRaw.getFullYear(),
      journeyDateRaw.getMonth(),
      journeyDateRaw.getDate()
    );

    const leaves = await PassengerLeave.find({
      assetId: journey.Asset,
      shift: journey.Journey_shift,
      startDate: { $lte: journeyDate },
      endDate: { $gte: journeyDate },
    })
      .select("passengerId")
      .lean();

    const leaveSet = new Set(leaves.map((l) => String(l.passengerId)));
    const bulkOps = [];

    let skippedNoPassenger = 0;
    let skippedOnLeave = 0;
    let passengersWithTriggers = 0;
    let totalTriggers = 0;

    const adjustDateToToday = (dateString) => {
      const originalDate = new Date(dateString);
      const today = new Date();
      return new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        originalDate.getHours(),
        originalDate.getMinutes(),
        originalDate.getSeconds()
      );
    };

    for (const p of passengers) {
      if (!p?.passenger) {
        skippedNoPassenger++;
        continue;
      }

      const passenger = p.passenger._id ? p.passenger : p.passenger;
      const pid = String(passenger._id || passenger);
      if (!pid) {
        skippedNoPassenger++;
        continue;
      }

      if (leaveSet.has(pid)) {
        skippedOnLeave++;
        continue;
      }

      const triggers = [];
      const data = {
        journeyId,
        passengerId: passenger._id || passenger,
        phoneNumber: passenger.Employee_PhoneNumber,
        name: passenger.Employee_Name,
      };
      if (p.bufferStart) {
        const bufferStart = adjustDateToToday(p.bufferStart);
        if (bufferStart > now) {
          const triggerTime = new Date(bufferStart.getTime() - 10 * 60 * 1000);
          if (triggerTime > now) {
            triggers.push({
              triggerId: crypto.randomUUID(),
              type: "before10Min",
              triggerTime,
              status: "pending",
            });
          }
        }
      }

      // Buffer End Trigger
      if (p.bufferEnd) {
        const bufferEnd = adjustDateToToday(p.bufferEnd);
        if (bufferEnd > now) {
          triggers.push({
            triggerId: crypto.randomUUID(),
            type: "bufferEnd",
            triggerTime: bufferEnd,
            status: "pending",
          });
        }
      }

      if (!triggers.length) {
        continue;
      }

      passengersWithTriggers++;
      totalTriggers += triggers.length;

      bulkOps.push({
        updateOne: {
          filter: { journeyId: data.journeyId, passengerId: data.passengerId },
          update: {
            $setOnInsert: {
              journeyId: data.journeyId,
              passengerId: data.passengerId,
              phoneNumber: data.phoneNumber,
              name: data.name,
            },
            $addToSet: { triggers: { $each: triggers } },
          },
          upsert: true,
        },
      });
    }

    if (bulkOps.length > 0) {
      try {
        const result = await Notification.bulkWrite(bulkOps, { ordered: false });
      } catch (err) {
        console.error("❌ Notification bulkWrite error:", {
          message: err.message,
          code: err.code,
          bulkOpsCount: bulkOps.length,
        });
        if (err.writeErrors && err.writeErrors.length > 0) {
          console.error("📝 Sample write errors:", err.writeErrors.slice(0, 3));
        }
      }
    }

  } catch (error) {
    console.error("💥 Critical error in storeJourneyNotifications:", {
      message: error.message,
      journeyId,
      passengerCount: passengers?.length,
    });
  }
}

export async function cancelPendingNotificationsForPassenger(passengerId, journeyId) {
  try {
    const result = await Notification.updateMany(
      { passengerId, journeyId, "triggers.status": { $in: ["pending", "processing"] } },
      { $set: { "triggers.$[].status": "cancelled" } }
    );
    return result;
  } catch (error) {
    console.error("❌ Error cancelling notifications:", {
      message: error.message,
      passengerId,
      journeyId,
    });
    throw error;
  }
}

export async function cancelBufferEndNotificationsForPassenger(passengerId, journeyId) {
  try {
    const res = await Notification.updateMany(
      { passengerId, journeyId },
      { $set: { "triggers.$[t].status": "cancelled" } },
      {
        arrayFilters: [
          { "t.type": "bufferEnd", "t.status": { $in: ["pending", "processing"] } }
        ]
      }
    );
    return res;
  } catch (error) {
    console.error("❌ cancelBufferEndNotificationsForPassenger error:", {
      message: error.message,
      passengerId,
      journeyId,
    });
    throw error;
  }
}