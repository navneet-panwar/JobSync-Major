const express = require("express");
const { z } = require("zod");
const mongoose = require("mongoose");

const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../shared/auth/requireAuth");
const { validate } = require("../middleware/validate");
const Notification = require("../models/Notification");
const Meeting = require("../models/Meeting");
const User = require("../shared/auth/User");
const College = require("../shared/auth/College");
const JobDescription = require("../models/JobDescription");

const { notify, notifyMany } = require("../services/notificationService");
const { emailStatus } = require("../services/emailService");
const { buildInterviewIcs } = require("../services/icsService");
const { bulkQueue } = require("../shared/queue");
const events = require("../shared/events");
const env = require("../config/env");
const crypto = require("crypto");

const router = express.Router();
router.use(requireAuth);

const objectIdSchema = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), { message: "Invalid id" });

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * A user's inbox: their own notifications PLUS anything addressed to their
 * institution channel (a placement cell receives messages sent to the college
 * rather than to a named staff member, since a recruiter has no way to know who
 * staffs it).
 */
function inboxFilter(user) {
  const clauses = [{ toUserId: user._id }];
  if (user.collegeId && user.role === "placement_cell") {
    clauses.push({ toCollegeId: user.collegeId, toRole: "placement_cell" });
  }
  return { $or: clauses };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);

    const filter = inboxFilter(req.user);

    const [items, unread] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      Notification.countDocuments({ ...filter, read: false }),
    ]);

    res.json({
      notifications: items,
      unread,
      email: emailStatus(),
    });
  })
);

const idParam = z.object({ id: objectIdSchema });

router.patch(
  "/:id/read",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const filter = { _id: req.params.id, ...inboxFilter(req.user) };
    const doc = await Notification.findOne(filter);
    if (!doc) throw ApiError.notFound("Notification not found");

    doc.read = true;
    doc.readAt = new Date();
    await doc.save();

    res.json({ notification: doc });
  })
);

router.patch(
  "/read-all",
  asyncHandler(async (req, res) => {
    const result = await Notification.updateMany(
      { ...inboxFilter(req.user), read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    res.json({ updated: result.modifiedCount });
  })
);

// ---------------------------------------------------------------------------
// Messaging — recruiter ↔ student, recruiter ↔ placement cell, cell ↔ student
// ---------------------------------------------------------------------------
const messageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  toUserId: objectIdSchema.optional(),
  toCollegeId: objectIdSchema.optional(),
  // Who to address within the institution channel — only placement_cell is
  // meaningful today, since a recruiter has no college to address.
  toRole: z.enum(["placement_cell", "student"]).optional(),
  jdId: objectIdSchema.optional(),
  studentUserId: objectIdSchema.optional(),
});

router.post(
  "/messages",
  validate(messageSchema),
  asyncHandler(async (req, res) => {
    const { body, toUserId, toCollegeId, toRole, jdId, studentUserId } = req.body;

    if (!toUserId && !toCollegeId) {
      throw ApiError.badRequest(
        "Address the message to a person or to a college placement cell."
      );
    }

    let recipientCollegeId = toCollegeId;
    let recipientRole = toRole;

    if (toUserId) {
      const recipient = await User.findById(toUserId).select("name email role collegeId").lean();
      if (!recipient) throw ApiError.notFound("Recipient not found");

      // A recruiter may only message a student their placement cell has PASSED.
      //
      // NOT conditioned on a jdId being supplied: an earlier version only checked
      // when the request carried a JD, so omitting it bypassed the gate entirely.
      // The pass must exist for SOME role — that is what being passed means.
      if (req.user.role === "recruiter" && recipient.role === "student") {
        const RecruiterPass = require("../models/RecruiterPass");

        // Two distinct rules, and conflating them was a latent hole:
        //   · without a jdId  — the recruiter must have been passed this student
        //                       for AT LEAST ONE role (a general check-in,
        //                       which is legitimate once they are in your pool)
        //   · with a jdId     — the pass must be for THAT role, so a recruiter
        //                       cannot use a pass on role A to discuss role B
        //                       the student was never approved for.
        const filter = { studentUserId: recipient._id };
        if (jdId) filter.jdId = jdId;

        const pass = await RecruiterPass.findOne(filter);
        if (!pass) {
          throw ApiError.forbidden(
            jdId
              ? "This student was not passed to you for that role."
              : "You can only message students your placement cell has passed to you."
          );
        }
      }

      // A placement cell may only message a student in its OWN college.
      if (req.user.role === "placement_cell" && recipient.role === "student") {
        if (!recipient.collegeId || String(recipient.collegeId) !== String(req.user.collegeId)) {
          throw ApiError.forbidden("That student does not belong to your college.");
        }
      }
    }

    const fromLabel = req.user.name;

    const doc = await notify({
      toUserId: toUserId || null,
      toCollegeId: toUserId ? null : recipientCollegeId,
      toRole: toUserId ? null : recipientRole || "placement_cell",
      type: "message",
      title: `Message from ${fromLabel}`,
      body,
      meta: { jdId: jdId || null, studentUserId: studentUserId || null },
      from: { _id: req.user._id, name: fromLabel },
    });

    res.status(201).json({ notification: doc });
  })
);

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------
const proposeSchema = z.object({
  participantUserIds: z.array(objectIdSchema).min(1).max(30),
  studentUserId: objectIdSchema.optional(),
  jdId: objectIdSchema.optional(),
  title: z.string().trim().max(160).optional(),
  agenda: z.string().trim().max(1000).optional(),
  location: z.string().trim().max(200).optional(),
  slots: z
    .array(
      z.object({
        start: z.string().datetime(),
        end: z.string().datetime(),
      })
    )
    .min(1)
    .max(5),
});

router.post(
  "/meetings",
  validate(proposeSchema),
  asyncHandler(async (req, res) => {
    const { participantUserIds, studentUserId, jdId, title, agenda, location, slots } = req.body;

    // Confirm every participant really exists before creating the meeting, so a
    // typo'd id does not produce an invite nobody can see.
    const participants = await User.find({ _id: { $in: participantUserIds } })
      .select("name email role collegeId")
      .lean();
    if (participants.length !== participantUserIds.length) {
      throw ApiError.badRequest("One or more participants could not be found.");
    }

    // A recruiter may only propose a meeting about a student they can actually
    // see — i.e. one the placement cell has passed.
    if (req.user.role === "recruiter") {
      const RecruiterPass = require("../models/RecruiterPass");
      const studentIds = participants.filter((p) => p.role === "student").map((p) => p._id);
      if (studentIds.length) {
        const passes = await RecruiterPass.countDocuments({
          studentUserId: { $in: studentIds },
          ...(jdId ? { jdId } : {}),
        });
        if (!passes) {
          throw ApiError.forbidden(
            "You can only propose a meeting with students passed to you."
          );
        }
      }
    }

    for (const s of slots) {
      if (new Date(s.end) <= new Date(s.start)) {
        throw ApiError.badRequest("Each slot's end must be after its start.");
      }
    }

    const meeting = await Meeting.create({
      createdBy: req.user._id,
      createdByName: req.user.name,
      createdByRole: req.user.role === "admin" ? "admin" : req.user.role,
      participantUserIds,
      collegeId: req.user.collegeId || participants.find((p) => p.collegeId)?.collegeId || null,
      jdId: jdId || null,
      studentUserId: studentUserId || participants.find((p) => p.role === "student")?._id || null,
      title: title || "Interview",
      agenda: agenda || "",
      location: location || "Online",
      proposedSlots: slots.map((s) => ({ start: new Date(s.start), end: new Date(s.end) })),
      // Stable across reschedules so a mail client updates one event.
      icsUid: `${crypto.randomUUID()}@jobsync`,
    });

    const slotLines = meeting.proposedSlots
      .map(
        (s, i) =>
          `${i + 1}. ${new Date(s.start).toLocaleString()} – ${new Date(s.end).toLocaleTimeString()}`
      )
      .join("\n");

    await notifyMany(
      participants.map((p) => ({
        toUserId: p._id,
        type: "meeting_invite",
        title: `${req.user.name} proposed a meeting: ${meeting.title}`,
        body: `Choose one of the proposed times:\n${slotLines}${meeting.agenda ? `\n\nAgenda: ${meeting.agenda}` : ""
          }`,
        meta: { meetingId: meeting._id.toString(), jdId: jdId || null },
        from: { _id: req.user._id, name: req.user.name },
        ctaUrl: "/meetings",
        ctaLabel: "Choose a time",
      }))
    );

    events.emitSafe("meeting.proposed", {
      meetingId: meeting._id.toString(),
      participants: participants.length,
    });

    res.status(201).json({ meeting });
  })
);

/** Meetings the current user is involved in (proposed by or invited to). */
router.get(
  "/meetings",
  asyncHandler(async (req, res) => {
    const meetings = await Meeting.find({
      $or: [{ createdBy: req.user._id }, { participantUserIds: req.user._id }],
    })
      .sort({ createdAt: -1 })
      .populate("participantUserIds", "name email role")
      .populate("jdId", "title company")
      .lean();

    res.json({ meetings });
  })
);

const confirmSchema = z.object({
  slotIndex: z.coerce.number().int().min(0).max(4),
  note: z.string().trim().max(400).optional(),
});

/**
 * Confirm a slot. Generates the .ics and emails it as an attachment to everyone
 * invited — the only place an attachment is used, because a calendar invite
 * without the file is just a sentence.
 */
router.post(
  "/meetings/:id/confirm",
  validate(idParam, "params"),
  validate(confirmSchema),
  asyncHandler(async (req, res) => {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) throw ApiError.notFound("Meeting not found");

    const invitee = meeting.participantUserIds.some(
      (id) => id.toString() === req.user._id.toString()
    );
    if (!invitee && meeting.createdBy.toString() !== req.user._id.toString()) {
      throw ApiError.forbidden("You are not part of this meeting.");
    }
    if (meeting.status === "cancelled") {
      throw ApiError.badRequest("This meeting was cancelled.");
    }

    const slot = meeting.proposedSlots[req.body.slotIndex];
    if (!slot) throw ApiError.badRequest("That time slot no longer exists.");

    meeting.confirmedSlot = slot;
    meeting.status = "confirmed";
    meeting.confirmedBy = req.user._id;
    meeting.confirmedAt = new Date();
    meeting.responseNote = req.body.note || "";
    await meeting.save();

    const participants = await User.find({
      _id: { $in: meeting.participantUserIds },
    })
      .select("name email")
      .lean();

    const organiser = await User.findById(meeting.createdBy).select("name email").lean();
    const student = participants.find(
      (p) => p._id.toString() !== organiser?._id?.toString()
    );

    const icsContent = buildInterviewIcs({
      uid: meeting.icsUid,
      title: meeting.title,
      description: `${meeting.agenda || "Interview"}\n\nOrganised via JobSync.`,
      location: meeting.location,
      start: slot.start,
      end: slot.end,
      organiserName: organiser?.name,
      organiserEmail: organiser?.email,
      attendeeName: student?.name,
      attendeeEmail: student?.email,
    });

    const when = new Date(slot.start).toLocaleString();

    await notifyMany(
      participants.map((p) => ({
        toUserId: p._id,
        type: "meeting_confirmed",
        title: `Confirmed: ${meeting.title} — ${when}`,
        body: `${req.user.name} confirmed the meeting.${meeting.responseNote ? `\n\n"${meeting.responseNote}"` : ""
          }\n\nA calendar invite is attached if you receive these by email.`,
        meta: { meetingId: meeting._id.toString() },
        from: { _id: req.user._id, name: req.user.name },
        ctaUrl: "/meetings",
        ctaLabel: "View meeting",
        attachments: icsContent
          ? [
            {
              filename: "interview.ics",
              content: icsContent,
              contentType: "text/calendar; charset=utf-8; method=REQUEST",
            },
          ]
          : null,
      }))
    );

    events.emitSafe("meeting.confirmed", {
      meetingId: meeting._id.toString(),
      at: slot.start,
    });

    res.json({
      meeting,
      ics: icsContent,
      // Downloadable even when email is unconfigured — the file is generated
      // server-side either way, so the feature never depends on the mail tier.
      emailConfigured: Boolean(env.emailProvider && env.emailApiKey),
    });
  })
);

/** Direct .ics download for the confirmed slot — no email required. */
router.get(
  "/meetings/:id/ics",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) throw ApiError.notFound("Meeting not found");

    const allowed =
      meeting.participantUserIds.some((id) => id.toString() === req.user._id.toString()) ||
      meeting.createdBy.toString() === req.user._id.toString();
    if (!allowed) throw ApiError.forbidden("You are not part of this meeting.");

    if (!meeting.confirmedSlot) {
      throw ApiError.badRequest("This meeting has no confirmed time yet.");
    }

    const organiser = await User.findById(meeting.createdBy).select("name email").lean();
    const icsContent = buildInterviewIcs({
      uid: meeting.icsUid,
      title: meeting.title,
      description: meeting.agenda,
      location: meeting.location,
      start: meeting.confirmedSlot.start,
      end: meeting.confirmedSlot.end,
      organiserName: organiser?.name,
      organiserEmail: organiser?.email,
    });

    if (!icsContent) throw ApiError.internal("Could not generate the calendar file.");

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="interview-${meeting._id}.ics"`);
    res.send(icsContent);
  })
);

const cancelSchema = z.object({ reason: z.string().trim().max(400).optional() });

router.post(
  "/meetings/:id/cancel",
  validate(idParam, "params"),
  validate(cancelSchema),
  asyncHandler(async (req, res) => {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) throw ApiError.notFound("Meeting not found");

    const allowed =
      meeting.createdBy.toString() === req.user._id.toString() ||
      meeting.participantUserIds.some((id) => id.toString() === req.user._id.toString());
    if (!allowed) throw ApiError.forbidden("You are not part of this meeting.");

    meeting.status = "cancelled";
    meeting.responseNote = req.body.reason || "";
    await meeting.save();

    await notifyMany(
      meeting.participantUserIds.map((id) => ({
        toUserId: id,
        type: "meeting_cancelled",
        title: `Cancelled: ${meeting.title}`,
        body: `${req.user.name} cancelled this meeting.${req.body.reason ? `\n\n"${req.body.reason}"` : ""
          }`,
        meta: { meetingId: meeting._id.toString() },
        from: { _id: req.user._id, name: req.user.name },
      }))
    );

    res.json({ meeting });
  })
);

// ---------------------------------------------------------------------------
// Bulk notify — capped hard so a cell cannot spam a whole cohort
// ---------------------------------------------------------------------------

/**
 * Scope §12.3: a placement cell must not be able to bulk-message an entire
 * cohort more than a small number of times per day. This protects the free
 * email quota AND the students. Enforced with a per-college daily counter.
 */
const BULK_NOTIFY_DAILY_CAP = 5;
const bulkNotifyLog = new Map(); // collegeId -> { day, count }

router.post(
  "/bulk-notify",
  validate(
    z.object({
      studentIds: z.array(objectIdSchema).min(1).max(100),
      title: z.string().trim().min(1).max(160),
      body: z.string().trim().max(1000),
    })
  ),
  asyncHandler(async (req, res) => {
    const { studentIds, title, body } = req.body;

    if (!req.user.collegeId) {
      throw ApiError.forbidden("This account has no college scope.");
    }

    const key = req.user.collegeId.toString();
    const day = new Date().toISOString().slice(0, 10);
    const entry = bulkNotifyLog.get(key);
    const count = entry?.day === day ? entry.count : 0;

    if (count >= BULK_NOTIFY_DAILY_CAP) {
      throw ApiError.tooMany(
        `Your college has already sent ${BULK_NOTIFY_DAILY_CAP} bulk notifications today. Try again tomorrow.`
      );
    }

    const { scopeQueryToCollege } = require("../shared/collegeScope");
    const students = await User.find(
      scopeQueryToCollege(req.user, { _id: { $in: studentIds }, role: "student" })
    )
      .select("name _id")
      .lean();

    await bulkQueue.add(() =>
      notifyMany(
        students.map((s) => ({
          toUserId: s._id,
          type: "system",
          title,
          body,
          from: { _id: req.user._id, name: req.user.name },
        }))
      )
    );

    bulkNotifyLog.set(key, { day, count: count + 1 });

    res.json({
      sent: students.length,
      remainingToday: BULK_NOTIFY_DAILY_CAP - (count + 1),
      message: `Queued for ${students.length} student(s).`,
    });
  })
);

module.exports = router;
