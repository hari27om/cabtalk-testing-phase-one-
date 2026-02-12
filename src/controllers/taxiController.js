import Taxi from "../models/TaxiModel.js";
import { sosUpdateTaxiDriver } from "../utils/sosUpdateTaxiDriver.js";
import { sosUpdateTaxiPassenger } from "../utils/sosUpdateTaxiPassanger.js";
import SOS from "../models/sosModel.js";

export const createTaxi = async (req, res) => {
  try {
    const { taxiDriverName, taxiDriverNumber, taxiVehicleNumber } = req.body;
    if (!taxiDriverName || !taxiDriverNumber || !taxiVehicleNumber) {
      return res
        .status(400)
        .json({ success: false, error: "Missing required fields" });
    }

    const newTaxi = new Taxi({
      taxiDriverName: taxiDriverName.toString().trim(),
      taxiDriverNumber: taxiDriverNumber.toString().trim(),
      taxiVehicleNumber: taxiVehicleNumber.toString().trim(),
    });

    await newTaxi.save();

    return res.status(201).json({ success: true, data: newTaxi });
  } catch (err) {
    console.error("createTaxi Error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

export const getAllTaxis = async (req, res) => {
  try {
    const taxis = await Taxi.find({});
    return res.status(200).json({ success: true, data: taxis });
  } catch (err) {
    console.error("getAllTaxis Error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};
export const notifyTaxiDriver = async (req, res) => {
  try {
    const { sosId } = req.params;
    const result = await sosUpdateTaxiDriver(sosId);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    return res.status(200).json({ success: true, data: result.data });
  } catch (err) {
    console.error("notifyTaxiDriver Error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};

export const notifyTaxiPassenger = async (req, res) => {
  try {
    const result = await sosUpdateTaxiPassenger(req.params.sosId);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
   const updatedSos = await SOS.findById(req.params.sosId).lean();
    return res.status(200).json({
      success: true,
      notifications: result,
      sos: updatedSos   
    });
  } catch (err) {
    console.error("notifyTaxiPassenger Error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
};