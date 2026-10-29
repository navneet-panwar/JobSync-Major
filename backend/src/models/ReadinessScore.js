const mongoose = require("mongoose");

const matchedSkillSchema = new mongoose.Schema(
  {
    jdSkill: { type: String, required: true },
    evidence: { type: String, default: "" },
    strength: { type: String, enum: ["direct", "transferable"], default: "direct" },
  },
  { _id: false }
);

const missingSkillSchema = new mongoose.Schema(
  {
    jdSkill: { type: String, required: true },
    importance: { type: String, enum: ["must", "nice"], default: "must" },
  },
  { _id: false }
);

const breakdownSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    weight: { type: Number, required: true },
    value: { type: Number, required: true },
    contribution: { type: Number, required: true },
  },
  { _id: false }
);

/**
 * ReadinessScore — one computed comparison of (resume version × JD).
 *
 * History is kept (append-only) so a placement cell can see a student's
 * readiness trend for a role, not just their current number. The latest
 * document per (user, jd) is what dashboards surface.
 */
const readinessScoreSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    resumeVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ResumeVersion",
      required: true,
      index: true,
    },
    jdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobDescription",
      required: true,
      index: true,
    },

    // "jd" = scored against a real posting (annotation expressly provided by the
    // request). "resume_baseline" = scored against the implicit target role
    // derived from the resume itself, so Readiness always has something to show
    // before a JD exists. A baseline is never returned by a per-JD query.
    source: {
      type: String,
      enum: ["jd", "resume_baseline"],
      default: "jd",
      index: true,
    },
    // Which corpus role a baseline targeted ("frontend", "backend", …).
    implicitRoleKey: { type: String, default: "" },

    composite: { type: Number, required: true, min: 0, max: 100, index: true },

    skillMatch: {
      percent: { type: Number, default: 0 },
      matched: { type: [matchedSkillSchema], default: [] },
      missing: { type: [missingSkillSchema], default: [] },
      extra: { type: [String], default: [] },
      // true when the AI was unavailable and this is exact-match only.
      degraded: { type: Boolean, default: false },
    },

    projectRelevance: {
      percent: { type: Number, default: 0 },
      rationale: { type: String, default: "" },
    },
    experienceRelevance: {
      percent: { type: Number, default: 0 },
      rationale: { type: String, default: "" },
    },

    atsSubscore: { type: Number, default: 0 },
    atsAnalysisId: { type: mongoose.Schema.Types.ObjectId, ref: "Analysis", default: null },

    breakdown: { type: [breakdownSchema], default: [] },
    weights: { type: Object, default: {} },

    summary: { type: String, default: "" },

    // Cache key — recomputing an unchanged (version, jd, version-updatedAt)
    // triple spends no AI quota. See routes/readiness.js.
    cacheKey: { type: String, index: true },

    model: { type: String, default: "" },
    promptTokens: { type: Number, default: 0 },
    responseTokens: { type: Number, default: 0 },
  },
  { timestamps: true }
);

readinessScoreSchema.index({ userId: 1, jdId: 1, createdAt: -1 });
readinessScoreSchema.index({ userId: 1, source: 1, createdAt: -1 });
readinessScoreSchema.index({ jdId: 1, composite: -1 });

readinessScoreSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("ReadinessScore", readinessScoreSchema);
