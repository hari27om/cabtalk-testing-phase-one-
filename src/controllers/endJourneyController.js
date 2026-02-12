import mongoose from "mongoose";
import Journey from "../models/JourneyModel.js";
import EndJourney from "../models/endJourneyModel.js";
import Asset from "../models/assetModel.js";
import Driver from "../models/driverModel.js";

export const endJourney = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { vehicleNumber } = req.body;
    if (!vehicleNumber) {
      await session.abortTransaction();
      return res.status(400).json({ message: "vehicleNumber is required." });
    }
    const driver = await Driver.findOne({ vehicleNumber }).session(session);
    if (!driver) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Driver not found." });
    }
    const journey = await Journey.findOne({ Driver: driver._id }).session(session);
    if (!journey) {
      await session.abortTransaction();
      return res.status(404).json({ message: "No active journey found." });
    }
    const alreadyEnded = await EndJourney.findOne({ JourneyId: journey._id }).session(session);
    if (alreadyEnded) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Journey has already been ended." });
    }
    const endedJourney = new EndJourney({
      JourneyId: journey._id,
      Driver: journey.Driver,
      Asset: journey.Asset,
      Journey_Type: journey.Journey_Type,
      Occupancy: journey.Occupancy,
      hadSOS: journey.SOS_Status,
      startedAt: journey.createdAt,
      originalStart: journey.originalStart,
      previousJourney: journey.previousJourney,
      triggeredBySOS: journey.triggeredBySOS,
      boardedPassengers: journey.boardedPassengers.map((evt) => ({
        passenger: evt.passenger,
        boardedAt: evt.boardedAt,
      })),
      processedWebhookEvents: journey.processedWebhookEvents,
    });
    const endedJourneyDoc = await endedJourney.save({ session });
    await Journey.findByIdAndDelete(journey._id).session(session);
    const asset = await Asset.findById(journey.Asset).session(session);
    if (!asset) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Associated asset not found." });
    }
    asset.isActive = false;
    await asset.save({ session });
    await session.commitTransaction();
    const io = req.app.get("io");
    io?.emit("journeyEnded", endedJourneyDoc);
    return res.status(200).json({
      message: "Journey ended successfully.",
      endedJourney: endedJourneyDoc,
    });
  } catch (error) {
    await session.abortTransaction();
    return res.status(500).json({ message: "Server error", error: error.message });
  } finally {
    session.endSession();
  }
};

export const getEndedJourneys = async (req, res) => {
  try {
    let { date } = req.query;
    if (!date) {
      date = new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      });
    }
    const startOfDay = new Date(`${date}T00:00:00.000+05:30`);
    const endOfDay = new Date(`${date}T23:59:59.999+05:30`);
    const endedJourneys = await EndJourney.find({
      endedAt: { $gte: startOfDay, $lt: endOfDay }
    })
      .populate({ path: "Driver", select: "-__v" })
      .populate({ path: "Asset", select: "-__v" })
      .populate({ path: "triggeredBySOS", select: "-__v" })
      .populate({
        path: "JourneyId",
        populate: [
          { path: "Driver", select: "-__v" },
          { path: "Asset", select: "-__v" },
          {
            path: "boardedPassengers.passenger",
            select: "-__v",
            model: "Passenger",
          },
        ],
      })
      .populate({
        path: "boardedPassengers.passenger",
        model: "Passenger",
        select: "-__v",
      })
      .populate({
        path: "previousJourney",
        select: "-__v",
        model: "EndJourney",
      })
      .sort({ endedAt: -1 });

    return res.status(200).json({
      message: "Ended journeys retrieved successfully.",
      data: endedJourneys,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};