import mongoose from "mongoose";
import Asset from "../models/assetModel.js";
import Passenger from "../models/Passenger.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";

export const insertPassenger = asyncHandler(async (req, res) => {
  const {
    Employee_ID, Employee_Name, Employee_PhoneNumber, Employee_ShiftTiming, Employee_Address, Service } = req.body;
  if ( !Employee_ID || !Employee_Name || !Employee_PhoneNumber || !Employee_ShiftTiming || !Employee_Address || !Service ) {
    return res.status(400).json({
      success: false, message: "Employee_ID, Employee_Name, Employee_PhoneNumber, Employee_ShiftTiming, Employee_Address and Service are required.",
    });
  }
  const newPassenger = new Passenger({
    Employee_ID: Employee_ID.toString().trim(),
    Employee_Name: Employee_Name.toString().trim(),
    Employee_PhoneNumber: Employee_PhoneNumber.toString().trim(),
    Employee_ShiftTiming: Employee_ShiftTiming
      ? Employee_ShiftTiming.toString().trim()
      : "",
    Employee_Address: Employee_Address
      ? Employee_Address.toString().trim()
      : "",
    Service: Service ? Service.toString().trim() : "",
  });
  await newPassenger.save();
  const io = req.app.get("io");
  io.emit("newPassenger", newPassenger);
  res.status(201).json({ success: true, data: newPassenger });
});

export const getPassengers = asyncHandler(async (req, res) => {
  const { search } = req.query;
  let query = {};
  if (search) {
    const regex = new RegExp(search, "i");
    query = {
      $or: [
        { Employee_Name: { $regex: regex } },
        { Employee_ID: { $regex: regex } },
      ],
    };
  }
  const passengers = await Passenger.find(query).sort({ _id: 1 });
  res.status(200).json(passengers);
});

export const updatePassenger = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { Employee_ID, Employee_Name, Employee_PhoneNumber, Employee_ShiftTiming, Employee_Address, Service, asset, } = req.body;
  if ( !Employee_ID || !Employee_Name || !Employee_PhoneNumber || !Employee_ShiftTiming || !Employee_Address || !Service ) {
    return res.status(400).json({
      success: false,
      message: "Employee_ID, Employee_Name, Employee_PhoneNumber, Employee_ShiftTiming, Employee_Address, and Service are required.",
   });
  }
  const updatedPassenger = await Passenger.findByIdAndUpdate(
    id,
    {
      Employee_ID: Employee_ID.toString().trim(),
      Employee_Name: Employee_Name.toString().trim(),
      Employee_PhoneNumber: Employee_PhoneNumber.toString().trim(),
      Employee_ShiftTiming: Employee_ShiftTiming.toString().trim(),
      Employee_Address: Employee_Address.toString().trim(),
      Service: Service.toString().trim(),
      asset: asset || null,
    },
    { new: true, runValidators: true }
  );
  if (!updatedPassenger) {
    return res.status(404).json({
      success: false,
      message: "Passenger not found.",
    });
  }
  const io = req.app.get("io");
  io.emit("updatedPassenger", updatedPassenger);
  res.status(200).json({ success: true, data: updatedPassenger });
});

export const deletePassenger = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ 
      success: false, 
      message: "Valid Passenger ID is required." 
    });
  }
  try {
    const passenger = await Passenger.findById(id);
    if (!passenger) {
      return res.status(404).json({ 
        success: false, 
        message: "Passenger not found." 
      });
    }
    if (passenger.asset) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete passenger. Passenger is assigned to an asset. Please remove passenger from asset first.",
        assetId: passenger.asset
      });
    }
    const assetWithPassenger = await Asset.findOne({
      "passengers.passengers.passenger": id
    });
    if (assetWithPassenger) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete passenger. Passenger is assigned to an asset's shift. Please remove passenger from asset first.",
        assetId: assetWithPassenger._id
      });
    }
    const deletedPassenger = await Passenger.findByIdAndDelete(id);
    if (!deletedPassenger) {
      return res.status(404).json({ 
        success: false, 
        message: "Passenger not found." 
      });
    }
    const io = req.app.get("io");
    io.emit("passengerDeleted", deletedPassenger);

    res.status(200).json({ 
      success: true, 
      message: "Passenger deleted successfully." 
    });
  } catch (error) {
    console.error("Error deleting passenger:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while deleting the passenger.",
    });
  }
});