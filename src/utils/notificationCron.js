import cron from "node-cron";
import crypto from "crypto";
import Notification from "../models/Notification.js";
import Journey from "../models/JourneyModel.js";
import {
  sendPickupTemplateBefore10Min,
  sendBufferEndTemplate,
} from "../utils/notificationScheduler.js";
import { sendWhatsAppMessage } from "../utils/whatsappHelper.js";

const POLL_CRON = "* * * * *";

if (!global.__notificationCronStarted) {
  global.__notificationCronStarted = true;

  cron.schedule(POLL_CRON, async () => {
    const runId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const now = new Date();
    const currentHHmm = now.toTimeString().slice(0, 5);

    try {
      const pendingNotifications = await Notification.find({
        "triggers.status": "pending",
      }).select("_id journeyId passengerId phoneNumber name triggers");

      if (!pendingNotifications.length) return;

      const journeyIds = [
        ...new Set(pendingNotifications.map((n) => n.journeyId.toString())),
      ];

      const journeys = await Journey.find({ _id: { $in: journeyIds } })
        .populate("Asset Driver", "isActive phoneNumber Employee_Name")
        .lean();

      const journeyMap = new Map();
      journeys.forEach((j) => journeyMap.set(j._id.toString(), j));

      for (const notif of pendingNotifications) {
        const { _id: notifId, journeyId, phoneNumber, name, triggers } = notif;
        const journey = journeyMap.get(journeyId.toString());

        const triggersToSend = triggers.filter((t) => {
          if (t.status !== "pending") return false;

          const triggerTime = new Date(t.triggerTime);
          const triggerHHmm = triggerTime.toTimeString().slice(0, 5);

          return triggerHHmm === currentHHmm;
        });

        if (triggersToSend.length === 0) continue;

        for (const trigger of triggersToSend) {
          try {
            if (journey?.Asset?.isActive) {
              if (trigger.type === "before10Min") {
                await sendPickupTemplateBefore10Min(phoneNumber, name);
              } else if (trigger.type === "bufferEnd") {
                await sendBufferEndTemplate(phoneNumber, name);
                const driverPhone = journey.Driver?.phoneNumber;
                if (driverPhone) {
                  const msg = `${name} is late for pickup, consider moving the cab.`;
                  await sendWhatsAppMessage(driverPhone, msg);
                }
              }
              await updateTriggerStatus(notifId, trigger.triggerId, "sent");
            } else {
              await updateTriggerStatus(notifId, trigger.triggerId, "cancelled");
            }
          } catch (err) {
            console.error(`Error in trigger ${trigger.triggerId}:`, err);
            await updateTriggerStatus(notifId, trigger.triggerId, "cancelled");
          }
        }

        await cleanupNotificationIfDone(notifId);
      }
    } catch (err) {
      console.error(`[cron:${runId}] Error:`, err);
    }
  });
}

async function updateTriggerStatus(notifId, triggerId, status) {
  await Notification.updateOne(
    { _id: notifId, "triggers.triggerId": triggerId },
    { $set: { "triggers.$.status": status } }
  );
}

async function cleanupNotificationIfDone(notifId) {
  const hasPending = await Notification.exists({
    _id: notifId,
    "triggers.status": { $in: ["pending", "processing"] },
  });
  if (!hasPending) await Notification.deleteOne({ _id: notifId });
}