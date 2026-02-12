// src/models/userModel.js
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";

const { Schema } = mongoose;

const ROLES = ["SUPER_ADMIN", "ADMIN_EMPLOYEE", "VENDOR", "EMPLOYEE"];

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    role: {
      type: String,
      enum: ROLES,
      default: "EMPLOYEE",
    },

    resetPasswordToken: {
      type: String,
      default: undefined,
    },
    resetPasswordExpires: {
      type: Date,
      default: undefined,
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      fullName: this.fullName,
      role: this.role,
    },
    "ed26d82b53605212661a6e4b7262bb5ea089608263574f422eb1a77eccb17ed4b6b181e079197289630c338843186cfd2291807d602144b9b08476ce28929d25",
    { expiresIn: "7d" }
  );
};

userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(20).toString("hex");

  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  const minutes = 11;
  this.resetPasswordExpires = Date.now() + minutes * 60 * 1000;

  return resetToken;
};

const User = mongoose.model("User", userSchema);
export default User;
export { User, ROLES };