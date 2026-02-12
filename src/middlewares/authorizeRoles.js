//middlewares/authorizeRoles.js
import { ApiError } from "../utils/ApiError.js";

export const allowRoles = (...allowedRoles) => {
  return (req, res, next) => {
    const user = req.user;
    if (!user) {
      return next(new ApiError(401, "Unauthorized"));
    }
    if (!allowedRoles.includes(user.role)) {
      return next(new ApiError(403, "Forbidden - insufficient permissions"));
    }
    next();
  };
};