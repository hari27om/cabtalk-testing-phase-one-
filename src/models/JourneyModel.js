import mongoose from "mongoose";
import { getNextSequence } from "./counterModel.js";
const boardingEventSchema = new mongoose.Schema({
    passenger: { type: mongoose.Schema.Types.ObjectId, ref: "Passenger", required: true },
    boardedAt: { type: Date, default: Date.now }
  }, { _id: false });

const journeySchema = new mongoose.Schema({
    shortId:               { type: String, unique: true },
    Driver:                { type: mongoose.Schema.Types.ObjectId, ref: "Driver", required: true, index: true },
    Asset:                 { type: mongoose.Schema.Types.ObjectId, ref: "Asset", required: true, index: true },
    Journey_Type:          { type: String, required: true },
    Journey_shift:         { type: String, required: true },
    Occupancy:             { type: Number, required: true },
    SOS_Status:            { type: Boolean, default: false },
    boardedPassengers:     { type: [boardingEventSchema], default: [] },
    processedWebhookEvents:{ type: [String], default: [] },
    originalStart:   { type: Date, default: null },
    previousJourney: { type: mongoose.Schema.Types.ObjectId, ref: "EndJourney", default: null },
    triggeredBySOS:  { type: mongoose.Schema.Types.ObjectId, ref: "SOS", default: null },
  }, { timestamps: true }
);
journeySchema.pre("save", async function (next) {
  if (!this.shortId) {
    const seq = await getNextSequence("Journey");
    this.shortId = `JRN-${String(seq).padStart(3, "0")}`;
  }
  next();
});
export default mongoose.model("Journey", journeySchema);