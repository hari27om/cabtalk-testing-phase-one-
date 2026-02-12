import Passenger from '../models/Passenger.js';
import { sendDropConfirmationMessage } from '../utils/dropConfirmationMsg.js';

export const sendDropConfirmation = async (req, res) => {
  try {
    const { passengerPhoneNumber } = req.body;

    if (!passengerPhoneNumber) {
      return res.status(400).json({
        success: false,
        message: "passenger PhoneNumber is required",
      });
    }

    const cleanedPhone = passengerPhoneNumber.replace(/\D/g, '');

    const passenger = await Passenger.findOne({
      Employee_PhoneNumber: { $regex: new RegExp(cleanedPhone + '$') },
    });

    if (!passenger) {
      return res.status(404).json({ 
        success: false,
        message: "Passenger not found",
      });
    }

    const result = await sendDropConfirmationMessage(
      passenger.Employee_PhoneNumber,
      passenger.Employee_Name
    );

    if (!result.success) {
      return res.status(502).json({
        success: false,
        message: "Failed to send drop confirmation",
        error: result.error,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Drop confirmation sent successfully",
      data: result.data,
    });
  } catch (err) {
    console.error("Drop confirmation error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};
