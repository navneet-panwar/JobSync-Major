const mongoose = require("mongoose");

const slotSchema = new mongoose.Schema(
  { start: { type: Date, required: true }, end: { type: Date, required: true } },
  { _id: false }
);

/**
 * Meeting — an in-app slot picker with a generated .ics file.
 *
 * Deliberately NOT a calendar integration: no OAuth consent screen, no paid
 * API, no token refresh to keep alive (scope §9, §15). The organiser proposes
 * 2–3 slots, the participant confirms one, and the confirmation email carries a
 * standard .ics attachment that every mail client understands.
 */
const meetingSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    createdByName: { type: String, default: "" },
    createdByRole: {
      type: String,
      enum: ["recruiter", "placement_cell", "admin"],
      default: "recruiter",
    },

    // Everyone invited. The student is the confirming party in the common case.
    participantUserIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      required: true,
      index: true,
    },

    collegeId: { type: mongoose.Schema.Types.ObjectId, ref: "College", default: null, index: true },
    jdId: { type: mongoose.Schema.Types.ObjectId, ref: "JobDescription", default: null },
    studentUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    title: { type: String, default: "Interview", maxlength: 160 },
    agenda: { type: String, default: "", maxlength: 1000 },
    location: { type: String, default: "Online", maxlength: 200 },

    proposedSlots: { type: [slotSchema], default: [], validate: (v) => v.length <= 5 },
    confirmedSlot: { type: slotSchema, default: null },

    status: {
      type: String,
      enum: ["proposed", "confirmed", "declined", "cancelled"],
      default: "proposed",
      index: true,
    },

    // Stable UID so a mail client updates the same event instead of creating
    // duplicates when a meeting is rescheduled.
    icsUid: { type: String, required: true },

    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    confirmedAt: { type: Date, default: null },
    responseNote: { type: String, default: "", maxlength: 400 },
  },
  { timestamps: true }
);

meetingSchema.index({ participantUserIds: 1, status: 1, createdAt: -1 });

meetingSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("Meeting", meetingSchema);
