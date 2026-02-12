import mongoose from "mongoose";
import { getNextSequence } from "./counterModel.js";
const sosSchema = new mongoose.Schema(
  {
    shortId:     { type: String, unique: true },
    user_type:   { type: String, enum: ["driver", "passenger"], required: true },
    phone_no:    { type: String, required: true },
    sos_type:    { type: String, required: true },
    sos_shift:    { type: String, required: true },
    status:      { type: String, enum: ["pending", "resolved"], default: "pending" },
    asset:       { type: mongoose.Schema.Types.ObjectId, ref: "Asset", required: true },
    newAsset:    { type: mongoose.Schema.Types.ObjectId, ref: "Asset" },
    sosSolution: { type: String, default: "" },
    userDetails: {
      name:       { type: String, default: "" },
      vehicle_no: { type: String, default: "" }
    }
  },
  { timestamps: true }
);
sosSchema.pre("save", async function (next) {
  if (!this.shortId) {
    const seq = await getNextSequence("SOS");
    this.shortId = `SOS-${String(seq).padStart(3, "0")}`;
  }
  next();
});
export default mongoose.model("SOS", sosSchema);