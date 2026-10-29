const mongoose = require("mongoose");
const { customAlphabet } = require("nanoid");

// College codes: unambiguous uppercase alphabet, 4 random chars after the
// college prefix (e.g. "GNIOT-7F2K"). Not guessable from initials alone.
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I/L/0/1/O — hard to misread
const randomSuffix = customAlphabet(alphabet, 4);

const collegeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120, unique: true },
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      uppercase: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Generate a fresh unique code for this college. Used at creation and rotation.
collegeSchema.statics.generateCode = function (name) {
  const prefix = (name || "COLLEGE")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 5) || "COLLEGE";
  return `${prefix}-${randomSuffix()}`;
};

collegeSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("College", collegeSchema);
