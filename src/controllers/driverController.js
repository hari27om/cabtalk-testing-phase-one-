import Driver from "../models/driverModel.js";
import Asset from "../models/assetModel.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";

export const addDriver = asyncHandler(async (req, res) => {
  const { name, phoneNumber, vehicleNumber, licenseImage } = req.body;
  if (!name || !phoneNumber || !vehicleNumber || !licenseImage) {
    return res.status(400).json({
      success: false,
      message:
        "All fields (name, phoneNumber, vehicleNumber, licenseImage) are required.",
    });
  }
  try {
    let driver = await Driver.findOne({ phoneNumber });
    if (driver) {
      driver.name = name;
      driver.vehicleNumber = vehicleNumber;
      driver.licenseImage = licenseImage;
      await driver.save();
      const io = req.app.get("io");
      io.emit("driverUpdated", driver);
      return res.status(200).json({
        success: true,
        message: "Driver details updated successfully.",
        driver,
      });
    }
    driver = await Driver.create({
      name,
      phoneNumber,
      vehicleNumber,
      licenseImage,
    });
    const io = req.app.get("io");
    io.emit("newDriver", driver);
    return res.status(201).json({
      success: true,
      message: "Driver added successfully.",
      driver,
    });
  } catch (error) {
    console.error("Error in adding/updating driver:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while processing the request.",
    });
  }
});

export const getAllDrivers = asyncHandler(async (req, res) => {
  const drivers = await Driver.find();
  if (drivers.length === 0) {
    return res.status(200).json({
      success: true,
      message: "No drivers found.",
      drivers: [],
    });
  }
  return res.status(200).json({
    success: true,
    message: "Drivers retrieved successfully.",
    drivers,
  });
});

export const updateDriver = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, phoneNumber, vehicleNumber } = req.body;
  if (!name || !phoneNumber || !vehicleNumber) {
    return res.status(400).json({
      success: false,
      message: "Fields name, phoneNumber, and vehicleNumber are required.",
    });
  }
  try {
    const driver = await Driver.findById(id);
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found.",
      });
    }
    driver.name = name;
    driver.phoneNumber = phoneNumber;
    driver.vehicleNumber = vehicleNumber;
    await driver.save();
    const io = req.app.get("io");
    io.emit("driverUpdated", driver);
    return res.status(200).json({
      success: true,
      message: "Driver updated successfully.",
      driver,
    });
  } catch (error) {
    console.error("Error updating driver:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while updating the driver.",
    });
  }
});

export const deleteDriver = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "Driver ID is required.",
    });
  }

  try {
    const associatedAssets = await Asset.find({ driver: id });

    if (associatedAssets.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete driver. Driver has associated assets. Please delete or reassign the assets first.",
        associatedAssets: associatedAssets.map((asset) => asset._id),
      });
    }

    const driver = await Driver.findByIdAndDelete(id);

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found.",
      });
    }

    const io = req.app.get("io");
    io.emit("driverDeleted", driver);

    return res.status(200).json({
      success: true,
      message: "Driver deleted successfully.",
      driver,
    });
  } catch (error) {
    console.error("Error deleting driver:", error.message);
    return res.status(500).json({
      success: false,
      message: "An error occurred while deleting the driver.",
    });
  }
});
