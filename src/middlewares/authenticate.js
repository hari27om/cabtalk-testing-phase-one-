// src/middlewares/authenticate.js
import jwt from "jsonwebtoken";
import { asyncHandler } from "./asyncHandler.js";
import User from "../models/userModel.js";
import { ApiError } from "../utils/ApiError.js";

const SECRET =
  "ed26d82b53605212661a6e4b7262bb5ea089608263574f422eb1a77eccb17ed4b6b181e079197289630c338843186cfd2291807d602144b9b08476ce28929d25";

const authenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.header("Authorization") || "";
  const tokenFromHeader = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;

  // prefer cookie but accept header fallback
  const token = req.cookies?.accessToken || tokenFromHeader;

  if (!token) {
    throw new ApiError(401, "Authorization token missing");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, SECRET);
  } catch (err) {
    if (err.name === "TokenExpiredError")
      throw new ApiError(401, "Access token expired");
    throw new ApiError(401, "Invalid access token");
  }

  if (!decoded?._id) throw new ApiError(401, "Invalid token payload");

  const user = await User.findById(decoded._id).select("-password").lean();
  if (!user) throw new ApiError(401, "User not found for token");

  req.user = user;
  next();
});

export default authenticate;
export { authenticate };