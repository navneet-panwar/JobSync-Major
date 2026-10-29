const mongoose = require("mongoose");

/**
 * IntegrityFlag — a college-scoped signal for the placement cell to review.
 *
 * Used for duplicate-resume detection: the SAME resume text uploaded under two
 * different accounts in one college. Deliberately non-punitive and informational
 * (scope §12.1, §8.1): it appears next to the student's profile with an
 * explanation, and never changes a status, score, or visibility on its own.
 *
 * Scoped by collegeId so the signal is only ever visible to the institution it
 * concerns — never cross-college.
 */
const integrityFlagSchema = new mongoose.Schema(
  {
    collegeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "College",
      required: true,
      index: true,
    },
    studentUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: ["duplicate_resume", "interview_integrity"],
      required: true,
      index: true,
    },
    summary: { type: String, required: true, maxlength: 400 },
    detail: { type: String, default: "", maxlength: 1000 },

    // Who else is involved — for a duplicate, the other account.
    relatedUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    relatedResumeId: { type: mongoose.Schema.Types.ObjectId, ref: "Resume", default: null },

    // A human at the placement cell acknowledges it; nothing resolves itself.
    acknowledged: { type: Boolean, default: false },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    acknowledgedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

integrityFlagSchema.index({ collegeId: 1, createdAt: -1 });
integrityFlagSchema.index({ studentUserId: 1, kind: 1 });

integrityFlagSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("IntegrityFlag", integrityFlagSchema);
