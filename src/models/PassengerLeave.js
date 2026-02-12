// src/models/PassengerLeave.js
import mongoose from "mongoose";

const passengerLeaveSchema = new mongoose.Schema(
  {
    passengerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Passenger",
      required: true,
      index: true,
    },
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Asset",
      required: true,
      index: true,
    },
    shift: {
      type: String,
      required: true,
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    reason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

passengerLeaveSchema.index({ assetId: 1, shift: 1, startDate: 1, endDate: 1 });
passengerLeaveSchema.index({ passengerId: 1, startDate: 1, endDate: 1 });

passengerLeaveSchema.statics.isOnLeave = async function (
  passengerId,
  assetId,
  shift,
  date
) {
  const d = new Date(date);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return await this.exists({
    passengerId,
    assetId,
    shift,
    startDate: { $lte: target },
    endDate: { $gte: target },
  });
};

const PassengerLeave = mongoose.model("PassengerLeave", passengerLeaveSchema);
export default PassengerLeave;