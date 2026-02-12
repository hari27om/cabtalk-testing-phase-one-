import mongoose from "mongoose";
import { getNextSequence } from "./counterModel.js";
const passengerSubSchema = new mongoose.Schema(
  {
    passenger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Passenger",
      required: true,
    },
    requiresTransport: {
      type: Boolean,
      default: true,
    },
    bufferStart: {
      type: Date,
      required: true,
      index: true,
    },
    bufferEnd: {
      type: Date,
      required: true,
      index: true,
    },
    wfoDays: {
      type: [String],
      enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      default: [],
    },
  },
  { _id: false }
);
const shiftPassengerSchema = new mongoose.Schema(
  {
    shift: {
      type: String,
      required: true,
    },
    passengers: {
      type: [passengerSubSchema],
      default: [],
    },
  },
  { _id: false }
);
const assetSchema = new mongoose.Schema(
  {
    shortId: {
      type: String,
      unique: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
    },
    capacity: {
      type: Number,
      required: true,
    },
    passengers: {
      type: [shiftPassengerSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    handlesMultipleShifts: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);
assetSchema.pre("save", async function (next) {
  if (!this.shortId) {
    const seq = await getNextSequence("Asset");
    this.shortId = `AST-${String(seq).padStart(3, "0")}`;
  }
  next();
});
export default mongoose.model("Asset", assetSchema);