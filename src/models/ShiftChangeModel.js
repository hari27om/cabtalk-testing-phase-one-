import mongoose, { Schema } from "mongoose";
import { customAlphabet } from "nanoid";
 
const nanoid = customAlphabet("1234567890abcdef", 8); // short 8-char id
 
const shiftChangeSchema = new Schema(
  {
    shortId: { type: String, unique: true, default: null },
 
    passengerId: { type: mongoose.Schema.Types.ObjectId, ref: "Passenger", required: true },
    assetId: { type: mongoose.Schema.Types.ObjectId, ref: "Asset", required: true },
 
    effectiveAt: { type: Date, required: true, index: true },
 
    slot: { type: String, required: true },
    shift: { type: String, required: true },
    vehicleNumber: { type: String, required: true },
 
    startBuffer: { type: Date, required: true },
    endBuffer: { type: Date, required: true },
    wfoDays: {
      type: [String],
      enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      default: [],
    },
 
    reason: { type: String },
 
    status: {
      type: String,
      enum: ["scheduled", "processing", "applied", "cancelled", "failed"],
      default: "scheduled",
      index: true,
    },
 
    processedAt: { type: Date, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true }
);
 
shiftChangeSchema.pre("save", function (next) {
  if (!this.shortId) {
    this.shortId = nanoid();
  }
  next();
});
 
const ShiftChange = mongoose.model("ShiftChange", shiftChangeSchema);
export default ShiftChange;