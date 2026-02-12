import mongoose from "mongoose";

const triggerSubSchema = new mongoose.Schema(
  {
    triggerId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["before10Min", "bufferEnd"],
      required: true,
    },
    triggerTime: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "processing", "cancelled", "sent"],
      default: "pending",
      index: true,
    },
  },
  { _id: false }
);

const notificationSchema = new mongoose.Schema(
  {
    journeyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Journey",
      required: true,
      index: true,
    },
    passengerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Passenger",
      required: true,
      index: true,
    },
    phoneNumber: { type: String, required: true },
    name: { type: String, required: true },
    triggers: { type: [triggerSubSchema], default: [] },
  },
  { timestamps: true }
);
export default mongoose.model("Notification", notificationSchema);