const mongoose = require("mongoose");

/**
 * RoadmapItem — one missing skill turned into an actionable milestone.
 *
 * Generated from a ReadinessScore's `missing` list. The point of the roadmap is
 * that it is TRACKABLE: a student marks progress, and that progress feeds back
 * into the readiness loop (scope gap L6 — "no actionable link from diagnosis to
 * improvement").
 */
const roadmapItemSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Null only for `resume_baseline` items — a plan built before any posting
    // existed, from the gaps between the resume and its implied target role.
    jdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobDescription",
      default: null,
      index: true,
    },

    // "jd" = built for a real posting. "resume_baseline" = built from the
    // resume's own gaps; hidden from every per-role query.
    source: {
      type: String,
      enum: ["jd", "resume_baseline"],
      default: "jd",
      index: true,
    },

    // Canonical skill name (services/normalizeSkills.js).
    skill: { type: String, required: true, trim: true },
    skillLabel: { type: String, trim: true, default: "" },
    importance: { type: String, enum: ["must", "nice"], default: "must" },

    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: "", maxlength: 600 },

    // Only allow-listed, genuinely-free resources are ever stored here — see
    // the host filter in services/roadmapGen.js. A hallucinated URL is worse
    // than no URL, so a rejected link simply becomes a label with no href.
    resource: {
      label: { type: String, default: "", maxlength: 160 },
      url: { type: String, default: "", maxlength: 500 },
    },

    // The concrete "you are done when…" statement.
    milestone: { type: String, default: "", maxlength: 300 },

    status: {
      type: String,
      enum: ["not_started", "in_progress", "done"],
      default: "not_started",
      index: true,
    },

    order: { type: Number, default: 0 },

    completedAt: { type: Date, default: null },
    // Set when generated — lets a regenerated roadmap show what changed.
    generatedAt: { type: Date, default: null },
    model: { type: String, default: "" },
  },
  { timestamps: true }
);

// The roadmap view is always "my items for this role, in order".
roadmapItemSchema.index({ userId: 1, jdId: 1, order: 1 });
// Placement-cell/badge counts by skill.
roadmapItemSchema.index({ userId: 1, status: 1 });
// Baseline items are looked up as "my no-JD plan".
roadmapItemSchema.index({ userId: 1, source: 1, order: 1 });

roadmapItemSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("RoadmapItem", roadmapItemSchema);
