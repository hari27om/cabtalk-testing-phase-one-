import ShiftOption from "../models/ShiftModel.js";

export const addShiftToOption = async (req, res) => {
  try {
    const { id } = req.params;
    const { shift } = req.body;
    if (!shift) return res.status(400).json({ success: false, message: "shift required" });

    const updated = await ShiftOption.findByIdAndUpdate(
      id,
      { $addToSet: { shifts: shift } },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ success: false, message: "ShiftOption not found" });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const removeShiftFromOption = async (req, res) => {
  try {
    const { id } = req.params;
    const { shift } = req.body;
    if (!shift) return res.status(400).json({ success: false, message: "shift required" });

    const updated = await ShiftOption.findByIdAndUpdate(
      id,
      { $pull: { shifts: shift } },
      { new: true }
    );

    if (!updated) return res.status(404).json({ success: false, message: "ShiftOption not found" });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const renameShiftInOption = async (req, res) => {
  try {
    const { id } = req.params;
    const { oldShift, newShift } = req.body;
    if (!oldShift || !newShift) return res.status(400).json({ success: false, message: "oldShift and newShift required" });

    const exists = await ShiftOption.findOne({ _id: id, shifts: newShift });
    if (exists) return res.status(400).json({ success: false, message: "newShift already exists" });

    const updated = await ShiftOption.findOneAndUpdate(
      { _id: id, shifts: oldShift },
      { $set: { "shifts.$": newShift } },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ success: false, message: "ShiftOption or oldShift not found" });
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getShiftOptions = async (req, res) => {
  try {
    const shiftOptions = await ShiftOption.find();
    return res.status(200).json({ success: true, data: shiftOptions });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};