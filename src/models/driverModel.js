import mongoose from "mongoose";
const driverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phoneNumber: { type: String, unique: true, index: true },
    vehicleNumber: { type: String, unique: true, index: true },
    licenseImage: { type: String, required: true },
    registeredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
export default mongoose.model("Driver", driverSchema);