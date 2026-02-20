import express from "express";
import http from "http";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";

import authRoutes from "./routes/authRoutes.js";
import driverRoutes from "./routes/driverRoutes.js";
import passengerRoutes from "./routes/passengerRoutes.js";
import assetRoutes from "./routes/assetRoutes.js";
import journeyRoutes from "./routes/journeyRoutes.js";
import endJourneyRoutes from "./routes/endJourneyRoutes.js";
import sosRoutes from "./routes/sosRoutes.js";
import passengerListRoutes from "./routes/passengerListRoutes.js";
import taxiRoutes from "./routes/taxiRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import passengerLeaveRoutes from "./routes/passengerLeaveRoutes.js";
import shiftRoutes from "./routes/shiftRoutes.js";
import shiftChangeRoutes from "./routes/shiftChangeRoutes.js";
import dns from "node:dns/promises";
dns.setServers(["1.1.1.1"]);

const app = express();
const server = http.createServer(app);

app.set("trust proxy", true);

const ALLOWED_ORIGINS = [
  "https://cabtalk.gxinetworks.in",
  "http://localhost:5173",
];
const ALLOWED_ORIGINS_SET = new Set(ALLOWED_ORIGINS);

// ✅ CORS origin checker for Express
const corsOriginChecker = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (ALLOWED_ORIGINS_SET.has(origin)) return callback(null, true);
  return callback(new Error(`Not allowed by CORS: ${origin}`));
};

// ✅ CORS options for Express
const corsOptions = {
  origin: corsOriginChecker,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
};

const ioCorsOptions = {
  origin: ALLOWED_ORIGINS,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
};
const io = new Server(server, { cors: ioCorsOptions });
app.set("io", io);

app.use(cors(corsOptions));
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());

app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/sos", sosRoutes);
app.use("/api/v1/", passengerRoutes);
app.use("/api/v1/drivers", driverRoutes);
app.use("/api/v1/assets", assetRoutes);
app.use("/api/v1", journeyRoutes);
app.use("/api/v1", endJourneyRoutes);
app.use("/api/v1/pass", passengerListRoutes);
app.use("/api/v1/taxi", taxiRoutes);
app.use("/api/v1", notificationRoutes);
app.use("/api/v1/leaves", passengerLeaveRoutes);
app.use("/api/v1/shiftOptions", shiftRoutes);
app.use("/api/v1", shiftChangeRoutes);

io.on("connection", (socket) => {
  socket.on("disconnect", () => { });
});

app.use((err, req, res, next) => {
  console.error("Global error handler:", err);

  const status = err?.statusCode || err?.status || 500;
  const message = err?.message || "Internal Server Error";
  const errors = err?.errors || [];

  res.status(status).json({
    success: false,
    message,
    errors,
    data: err?.data || null,
  });
});

const MONGO_URI =
  "mongodb+srv://vivekverma:vivekvermagxi@cab-talk.gus9m.mongodb.net/cabDB";
  // "mongodb+srv://hariomtri27:12341234@cdb.3a41aii.mongodb.net/CDB";

await mongoose
  .connect(MONGO_URI)
  .then(async (connection) => {
    console.log(`MongoDB connected on host: ${connection.connection.host}`);
    try {
      await import("./utils/notificationCron.js");
    } catch (err) {
      console.error("Failed to load notification cron:", err);
    }
    server.listen(5002, "0.0.0.0", () => {
      console.log(`🚀 Server is running on port: 5002`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  });