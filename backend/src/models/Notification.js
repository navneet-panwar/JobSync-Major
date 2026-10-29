const mongoose = require("mongoose");

/**
 * Notification — the single inbox every module writes to.
 *
 * Two addressing modes (scope §6.1):
 *   · toUserId                       — one person (student, recruiter)
 *   · toCollegeId + toRole           — an institution channel, e.g. a recruiter
 *                                      messaging "the placement cell of GNIOT"
 *                                      without knowing who staffs it.
 */
const notificationSchema = new mongoose.Schema(
  {
    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    toCollegeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "College",
      default: null,
      index: true,
    },
    toRole: {
      type: String,
      enum: ["student", "recruiter", "placement_cell", "admin", null],
      default: null,
    },

    type: {
      type: String,
      enum: [
        "status_change",
        "training_assigned",
        "meeting_invite",
        "meeting_confirmed",
        "meeting_cancelled",
        "message",
        "jd_decision",
        "candidate_passed",
        "milestone_complete",
        "system",
      ],
      required: true,
      index: true,
    },

    title: { type: String, required: true, maxlength: 160 },
    body: { type: String, default: "", maxlength: 1000 },

    // Free-form context so a notification can link back to what it is about.
    meta: { type: Object, default: {} },

    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },

    // Email delivery state — a notification is written even when the email
    // fails, so the in-app product never depends on a quota.
    emailSent: { type: Boolean, default: false },
    emailError: { type: String, default: "" },

    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    fromName: { type: String, default: "" },
  },
  { timestamps: true }
);

// Inbox query: one recipient, newest first, unread count.
notificationSchema.index({ toUserId: 1, createdAt: -1 });
notificationSchema.index({ toCollegeId: 1, toRole: 1, createdAt: -1 });
notificationSchema.index({ toUserId: 1, read: 1 });

notificationSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("Notification", notificationSchema);
