const mongoose = require("mongoose");

/**
 * StudentRoleProfile — what roles a student is connected to, from two
 * DELIBERATELY SEPARATE sources.
 *
 *   resumeRoles      — roles inferred from the student's own resume text
 *                      (parsed by AI; see services/roleExtract.js). This is a
 *                      claim the resume makes, not a preference.
 *   interestedRoles  — roles the student explicitly tapped "Interested" on when
 *                      their placement cell posted a job/role to the college.
 *                      This is a stated preference.
 *
 * These are kept apart on purpose: a placement cell looking at "who fits
 * Backend Engineer" wants the resume evidence, and looking at "who wants the
 * Infosys drive" wants the opt-ins. Merging them would make one silently
 * contaminate the other, so the API always returns them as two distinct lists.
 *
 * `collegeId` is denormalised for the same reason as PlacementStatus — every
 * placement-cell query must be scopable with one indexed field.
 */
const roleEntrySchema = new mongoose.Schema(
  {
    // Canonical, lowercased role key (e.g. "backend engineer"). New roles are
    // created automatically — the key is the identity.
    key: { type: String, required: true, trim: true },
    // Display label as it should read in the UI.
    label: { type: String, required: true, trim: true },
    // 0-100 confidence for resume-derived roles; null for interested roles.
    confidence: { type: Number, default: null },
    // Short evidence string (which part of the resume implies the role).
    evidence: { type: String, default: "" },
    // Where this came from. Kept per-entry so a role can exist in both lists
    // without one overwriting the other.
    source: {
      type: String,
      enum: ["resume", "interest"],
      required: true,
    },
    // For interest entries: which posting produced the opt-in, and the answer.
    postingId: { type: mongoose.Schema.Types.ObjectId, ref: "RolePosting", default: null },
    response: {
      type: String,
      enum: ["interested", "not_interested", null],
      default: null,
    },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const studentRoleProfileSchema = new mongoose.Schema(
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

    // Roles inferred from the resume. Replaced wholesale on each re-parse.
    resumeRoles: { type: [roleEntrySchema], default: [] },
    // Roles the student opted into. Append/update per posting response.
    interestedRoles: { type: [roleEntrySchema], default: [] },

    // When the resume roles were last inferred, so the cell can tell a stale
    // profile from a current one.
    resumeRolesUpdatedAt: { type: Date, default: null },
    resumeRolesModel: { type: String, default: "" },
  },
  { timestamps: true }
);

// The role-filter view: everyone in my college, by role key.
studentRoleProfileSchema.index({ collegeId: 1, "resumeRoles.key": 1 });
studentRoleProfileSchema.index({ collegeId: 1, "interestedRoles.key": 1 });

studentRoleProfileSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("StudentRoleProfile", studentRoleProfileSchema);