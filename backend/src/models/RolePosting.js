const mongoose = require("mongoose");

/**
 * RolePosting — a job/role a placement cell posts to its OWN college.
 *
 * This is distinct from a recruiter's JobDescription (which the cell then passes
 * students into). A RolePosting is the cell saying "this drive/opening is on the
 * table — who's interested?" and collecting opt-ins. The role can be one the
 * college already tracks or a brand-new one; a new role is created
 * automatically when the first student opts in.
 *
 * Students are notified through the normal Notification pipeline and answer
 * interested / not_interested. Only opt-ins land in `interestedRoles` on the
 * student's profile — kept separate from resume-derived roles.
 */
const rolePostingSchema = new mongoose.Schema(
  {
    collegeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "College",
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdByName: { type: String, default: "" },

    title: { type: String, required: true, trim: true, maxlength: 140 },
    company: { type: String, default: "", trim: true, maxlength: 140 },
    location: { type: String, default: "", trim: true, maxlength: 140 },
    description: { type: String, default: "", maxlength: 4000 },

    // Canonical, lowercased role key — the identity the whole feature filters on.
    roleKey: { type: String, required: true, trim: true, index: true },
    roleLabel: { type: String, required: true, trim: true },
    // True when this posting introduced a role key the college had not seen
    // before — created on the fly rather than picked from an existing list.
    roleIsNew: { type: Boolean, default: false },

    // Optionally link to a JobDescription the cell is sourcing for.
    jdId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", default: null },

    // Free-text skills to show on the notification, parsed from the JD when a
    // jdId is supplied.
    skills: { type: [String], default: [] },

    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
      index: true,
    },

    // Which students were notified and how they answered. Per-posting so the
    // cell can see exactly who responded to THIS drive.
    responses: [
      {
        _id: false,
        studentUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        response: { type: String, enum: ["interested", "not_interested"], required: true },
        at: { type: Date, default: Date.now },
      },
    ],

    notifiedCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

rolePostingSchema.index({ collegeId: 1, createdAt: -1 });
rolePostingSchema.index({ collegeId: 1, roleKey: 1 });

rolePostingSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("RolePosting", rolePostingSchema);