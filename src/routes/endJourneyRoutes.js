import express from "express";
import {
  endJourney,
  getEndedJourneys,
} from "../controllers/endJourneyController.js";
const endJourneyRoutes = express.Router();
endJourneyRoutes.use(express.json());
endJourneyRoutes.post("/endJourneys", endJourney);
endJourneyRoutes.get("/endJourneys", getEndedJourneys);
export default endJourneyRoutes;