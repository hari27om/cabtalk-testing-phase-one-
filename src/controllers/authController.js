// controllers/authController.js
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User, ROLES } from "../models/userModel.js";
import crypto from "crypto";
import { sendEmail } from "../utils/email.js";
import mongoose from "mongoose";

const PROD_ALLOWED_ORIGINS = new Set(["https://cabtalk.gxinetworks.in"]);

const IS_PRODUCTION = true; // <-- set to true when you deploy to production
const COOKIE_DOMAIN = ".gxinetworks.in"; // only used if IS_PRODUCTION === true

const getCookieOptions = (req) => {
  // Deterministic cookie options:
  // - in production: secure=true, sameSite='none', optionally set domain
  // - in development: secure=false, sameSite='lax'
  const secure = IS_PRODUCTION;
  const sameSite = IS_PRODUCTION ? "none" : "lax";

  const opts = {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    // maxAge will be attached by caller (we set it explicitly below)
  };

  if (IS_PRODUCTION && COOKIE_DOMAIN) {
    opts.domain = COOKIE_DOMAIN;
  }

  return opts;
};

const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const ACCESS_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const generateAccessToken = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(500, "Failed to generate token: user not found.");

  const accessToken = user.generateAccessToken();
  return accessToken;
};

const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, password } = req.body;

  if ([fullName, email, password].some((f) => !f || String(f).trim() === "")) {
    throw new ApiError(400, "Full name, email, and password are required");
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (!isValidEmail(normalizedEmail)) {
    throw new ApiError(400, "Please provide a valid email address");
  }

  const existedUser = await User.findOne({ email: normalizedEmail });
  if (existedUser) {
    throw new ApiError(409, "Email is already registered. Please login or use another email.");
  }

  const user = await User.create({
    fullName,
    email: normalizedEmail,
    password,
    role: "EMPLOYEE",
  });

  const createdUser = await User.findById(user._id).select(
    "-password"
  );

  return res
    .status(201)
    .json(new ApiResponse(201, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email) throw new ApiError(400, "Email is required");
  if (!password) throw new ApiError(400, "Password is required");

  const normalizedEmail = email.toLowerCase().trim();
  if (!isValidEmail(normalizedEmail)) {
    throw new ApiError(400, "Please provide a valid email address");
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) throw new ApiError(404, "No account found with this email");

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) throw new ApiError(401, "Incorrect email or password");

  const accessToken = await generateAccessToken(user._id);

  const loggedInUser = await User.findById(user._id).select(
    "-password"
  );

  const userObj = {
    id: loggedInUser._id,
    fullName: loggedInUser.fullName,
    email: loggedInUser.email,
    role: loggedInUser.role,
  };

  const opts = { ...getCookieOptions(req), maxAge: ACCESS_TOKEN_MAX_AGE_MS };

  return res
    .status(200)
    .cookie("accessToken", accessToken, opts)
    .json(new ApiResponse(200, { user: userObj, accessToken }, "User logged in successfully"));
});

const logoutUser = asyncHandler(async (req, res) => {
  const cookieOpts = getCookieOptions(req);
  return res
    .status(200)
    .clearCookie("accessToken", { ...cookieOpts })
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    throw new ApiError(400, "Old password and new password are required");
  }

  const user = await User.findById(req.user._id);
  if (!user) throw new ApiError(404, "User not found");

  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);
  if (!isPasswordCorrect) throw new ApiError(400, "Old password is incorrect");

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User fetched successfully"));
});

const createUserByAdmin = asyncHandler(async (req, res) => {
  const { fullName, email, password, role } = req.body;

  if ([fullName, email, password].some((f) => !f || String(f).trim() === "")) {
    throw new ApiError(400, "Full name, email, and password are required");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existedUser = await User.findOne({ email: normalizedEmail });
  if (existedUser) {
    throw new ApiError(
      409,
      "Email is already registered. Please use another email."
    );
  }

  const requestedRole =
    typeof role === "string" ? role.toUpperCase().trim() : null;
  const finalRole =
    requestedRole && ROLES.includes(requestedRole) ? requestedRole : "EMPLOYEE";

  const user = await User.create({
    fullName,
    email: normalizedEmail,
    password,
    role: finalRole,
  });

  const createdUser = await User.findById(user._id).select(
    "-password"
  );

  return res
    .status(201)
    .json(new ApiResponse(201, createdUser, "User created successfully"));
});

export const getAdminAndVendorUsers = asyncHandler(async (req, res) => {
  // only SUPER_ADMIN reaches here due to allowRoles middleware on route
  const users = await User.find({
    role: { $in: ["ADMIN_EMPLOYEE", "VENDOR"] },
  }).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, users, "Admin & Vendor users fetched"));
});

export const deleteUserByAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid user id");
  }

  const user = await User.findById(id);
  if (!user) throw new ApiError(404, "User not found");

  if (!["ADMIN_EMPLOYEE", "VENDOR"].includes(user.role)) {
    throw new ApiError(403, "Not allowed to delete this user");
  }

  await User.findByIdAndDelete(id);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "User deleted successfully"));
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, "Email is required");

  const normalizedEmail = String(email).toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) throw new ApiError(404, "No account found with this email");

  // create token (raw) and save hashed version in DB
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // const frontendBase = "http://localhost:5173";
  const frontendBase = "https://cabtalk.gxinetworks.in";
  const resetUrl = `${frontendBase}/reset-password/${resetToken}`;

  const message = `
    <h3>CabTalk — Password Reset</h3>
    <p>We received a request to reset your password. Click the link below to reset it. This link will expire in 10 minutes.</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>If you didn't request this, please ignore this email.</p>
  `;

  try {
    await sendEmail({
      to: user.email,
      subject: "CabTalk — Password reset",
      html: message,
      text: `Reset your password: ${resetUrl}`,
    });

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Password reset email sent"));
  } catch (err) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save({ validateBeforeSave: false });
    throw new ApiError(
      500,
      "Failed to send password reset email. Please try again later."
    );
  }
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!token) throw new ApiError(400, "Reset token is required");
  if (!password || String(password).trim() === "") {
    throw new ApiError(400, "New password is required");
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() },
  });

  if (!user) throw new ApiError(400, "Reset token is invalid or has expired");

  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password reset successful"));
});

export {
  registerUser,
  loginUser,
  logoutUser,
  changeCurrentPassword,
  getCurrentUser,
  createUserByAdmin,
  forgotPassword,
  resetPassword,
};