const mongoose = require("mongoose");

/**
 * RecruiterPass — THE gatekeeping record.
 *
 * One document means: "this college's placement cell has approved this student
 * to be seen by recruiters for this job description."
 *
 * This is the novel edge of the product (scope gap L7). A recruiter's candidate
 * feed is an INNER JOIN against this collection, so a student who was never
 * passed cannot appear in it — no matter how high their readiness score is, and
 * no matter what the client sends. The gate is structural, not a UI filter.
 */
const recruiterPassSchema = new mongoose.Schema(
  {
    jdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JobDescription",
      required: true,
      index: true,
    },
    studentUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Denormalised so recruiter queries can be filtered by college without a
    // join, and so the college tag is always renderable.
    collegeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "College",
      required: true,
      index: true,
    },
    passedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    note: { type: String, default: "", maxlength: 400 },

    // A recruiter's own decision, kept separate from the placement cell's
    // authority: rejecting hides the candidate from THIS JD's feed only.
    recruiterDecision: {
      type: String,
      enum: ["none", "shortlisted", "rejected"],
      default: "none",
    },
    decisionAt: { type: Date, default: null },
    decisionBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// One pass per (student, JD) — passing twice must not create two records that
// would double-count the candidate in a feed. `unique: true` also creates the
// index, so no separate index() call is needed here.
recruiterPassSchema.index({ jdId: 1, studentUserId: 1 }, { unique: true });

recruiterPassSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("RecruiterPass", recruiterPassSchema);
