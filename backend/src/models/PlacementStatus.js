const mongoose = require("mongoose");

const auditEntrySchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    byName: { type: String, default: "" },
    from: { type: String, default: null },
    to: { type: String, default: null },
    note: { type: String, default: "", maxlength: 400 },
    at: { type: Date, default: Date.now },
    // What kind of change this entry records — status, training tag, or a
    // gatekeeping pass. One log so a student's history reads as one story.
    kind: {
      type: String,
      enum: ["status", "training_tag", "pass_to_recruiter", "pass_withdrawn", "recruiter_decision"],
      default: "status",
    },
    meta: { type: Object, default: {} },
  },
  { _id: false }
);

/**
 * PlacementStatus — a student's standing in their college's placement process.
 *
 * `collegeId` is denormalised here (it also lives on User) specifically so
 * every placement-cell query can be scoped with a single indexed field, without
 * joining to User first. That is what makes THE invariant cheap to enforce.
 *
 * `auditLog` is append-only. Scope §5.3 requires "who changed which status or
 * tag, and when" — overwriting history would make that unanswerable.
 */
const placementStatusSchema = new mongoose.Schema(
  {
    studentUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    collegeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "College",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: [
        "not_reviewed",
        "referred",
        "shortlisted",
        "hired",
        "needs_improvement",
        "critical",
      ],
      default: "not_reviewed",
      index: true,
    },

    trainingTags: { type: [String], default: [] },

    auditLog: { type: [auditEntrySchema], default: [] },
  },
  { timestamps: true }
);

// The cohort table's primary access pattern: everyone in my college, by status.
placementStatusSchema.index({ collegeId: 1, status: 1, updatedAt: -1 });

placementStatusSchema.methods.appendAudit = function (entry) {
  this.auditLog.push({ ...entry, at: new Date() });
};

placementStatusSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("PlacementStatus", placementStatusSchema);
