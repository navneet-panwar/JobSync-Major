const mongoose = require("mongoose");

const linkSchema = new mongoose.Schema(
  { label: String, url: String },
  { _id: false }
);

const requiredSkillSchema = new mongoose.Schema(
  {
    // Normalised canonical name (see services/normalizeSkills.js).
    name: { type: String, required: true, trim: true },
    // Display form for the UI.
    label: { type: String, trim: true },
    importance: { type: String, enum: ["must", "nice"], default: "must" },
  },
  { _id: false }
);

const jobDescriptionSchema = new mongoose.Schema(
  {
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // A recruiter's JD is stamped with their college scope when it is created
    // for a college. Student-uploaded exploratory JDs keep this null — they are
    // private to the student and never enter a gatekeeping pool.
    collegeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "College",
      default: null,
      index: true,
    },

    title: { type: String, required: true, trim: true, maxlength: 140 },
    company: { type: String, trim: true, maxlength: 140, default: "" },
    location: { type: String, trim: true, maxlength: 140, default: "" },

    experienceLevel: {
      type: String,
      enum: ["internship", "entry", "mid", "senior", "lead", "unspecified"],
      default: "unspecified",
    },

    // The source text. Kept so an analysis can be re-run and so a recruiter can
    // see exactly what the model parsed. JDs are small (a few KB), unlike
    // resumes where only the current + previous version keep raw text.
    rawText: { type: String, required: true },

    parsed: {
      requiredSkills: { type: [requiredSkillSchema], default: [] },
      responsibilities: { type: [String], default: [] },
      keywords: { type: [String], default: [] },
      // Free-text extras the model can supply; shown on the JD detail view.
      senioritySignals: { type: [String], default: [] },
      summary: { type: String, default: "" },
    },

    status: {
      type: String,
      enum: ["draft", "active", "closed"],
      default: "active",
      index: true,
    },

    // sha256 of the normalised rawText — lets the parser skip a second Gemini
    // call when the identical text was already parsed (free-tier discipline).
    contentHash: { type: String, index: true },

    // AI accounting, same as Analysis.
    model: { type: String, default: "" },
    promptTokens: { type: Number, default: 0 },
    responseTokens: { type: Number, default: 0 },

    parseError: { type: String, default: "" },
  },
  { timestamps: true }
);

// The list view is always "my JDs, newest first".
jobDescriptionSchema.index({ ownerUserId: 1, createdAt: -1 });
// Recruiter feeds filter by status within an owning scope.
jobDescriptionSchema.index({ ownerUserId: 1, status: 1, createdAt: -1 });

jobDescriptionSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("JobDescription", jobDescriptionSchema);
