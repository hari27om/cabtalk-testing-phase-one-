// src/models/ShiftModel.js
import mongoose from "mongoose";
const ShiftOptionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      maxlength: 25,
    },
    shifts: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr),
        message: "shifts must be an array of strings",
      },
    },
  },
  { timestamps: true }
);

export default mongoose.model("ShiftOption", ShiftOptionSchema);