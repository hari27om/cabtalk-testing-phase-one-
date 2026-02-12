import mongoose from "mongoose";
const TaxiSchema = new mongoose.Schema(
  {
    taxiDriverName: { type: String, required: true },
    taxiDriverNumber: { type: String, required: true },
    taxiVehicleNumber: { type: String, required: true },
  },
  { timestamps: true }
);
export default mongoose.model("Taxi", TaxiSchema);