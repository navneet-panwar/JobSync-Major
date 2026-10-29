const express = require("express");
const { z } = require("zod");
const mongoose = require("mongoose");
const crypto = require("crypto");

const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRole } = require("../shared/auth/requireAuth");
const { validate } = require("../middleware/validate");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const InterviewSession = require("../models/InterviewSession");
const JobDescription = require("../models/JobDescription");
const PlacementStatus = require("../models/PlacementStatus");
const User = require("../shared/auth/User");

const { generateQuestions, scoreAnswers } = require("../services/interviewService");
const { notify } = require("../services/notificationService");
const events = require("../shared/events");

const router = express.Router();
router.use(requireAuth);

const objectIdSchema = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), { message: "Invalid id" });

// Starting an interview is expensive (an AI call) and abusive in a loop.
const interviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 6,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id?.toString() || ipKeyGenerator(req),
  message: {
    error: { message: "Too many mock interviews started — try again in an hour." },
  },
});

// ---------------------------------------------------------------------------
// Integrity thresholds
// ---------------------------------------------------------------------------

/**
 * A paste of >120 characters is suspicious only relative to how fast the answer
 * appeared. These are the numbers the server enforces — deliberately set by the
 * SERVER, not taken from the client's word, so a modified client cannot
 * suppress a flag (scope §8.2).
 */
const LARGE_PASTE_CHARS = 120;
const FAST_ANSWER_MS = 1500; // answer appeared within this of the question
const FAST_ANSWER_CHARS = 400;

/**
 * Turn raw telemetry into flags. Nothing here changes a score or blocks a
 * submission — it only records what a human might want to look at.
 */
function deriveFlags({ telemetry, question, priorBlurCount }) {
  const flags = [];
  if (!telemetry) return flags;

  const {
    timeToFirstKeystrokeMs,
    totalMs,
    pasteEvents = [],
    blurCount = 0,
    fullscreenExits = 0,
  } = telemetry;

  // Tab / window switches. Reported as a total, not per-event, so the log stays
  // readable — the first switch is recorded with a timestamp.
  const newBlurs = Math.max(0, Number(blurCount) - (priorBlurCount || 0));
  if (newBlurs > 0) {
    flags.push({
      type: "tab_blur",
      detail: `Left the interview tab ${newBlurs} time(s) while answering this question.`,
    });
  }

  if (Number(fullscreenExits) > 0) {
    flags.push({
      type: "fullscreen_exit",
      detail: `Exited fullscreen ${fullscreenExits} time(s).`,
    });
  }

  for (const pe of pasteEvents) {
    if (Number(pe?.chars) > LARGE_PASTE_CHARS) {
      flags.push({
        type: "large_paste",
        detail: `Pasted ${pe.chars} characters at once.`,
      });
    }
  }

  // The cross-check: an answer that appeared almost instantly but is long could
  // not have been typed. This is the server's own inference from the timing it
  // was given, so it holds even if the client sent no paste event at all.
  const chars = (telemetry.answerLength || 0);
  if (
    timeToFirstKeystrokeMs != null &&
    Number(timeToFirstKeystrokeMs) < FAST_ANSWER_MS &&
    chars > FAST_ANSWER_CHARS
  ) {
    flags.push({
      type: "fast_long_answer",
      detail: `A ${chars}-character answer appeared within ${timeToFirstKeystrokeMs}ms of the question.`,
    });
  }

  // Sanity: an answer claiming a typing speed no human reaches.
  if (totalMs != null && chars > 200) {
    const charsPerMinute = (chars / Number(totalMs)) * 60000;
    if (charsPerMinute > 900) {
      flags.push({
        type: "fast_long_answer",
        detail: `Sustained ~${Math.round(charsPerMinute)} characters/minute, well beyond typing speed.`,
      });
    }
  }

  void question;
  return flags;
}

// ---------------------------------------------------------------------------
// POST /api/interviews/start
// ---------------------------------------------------------------------------
const startSchema = z.object({
  jdId: objectIdSchema.optional(),
  targetRole: z.string().trim().max(160).optional(),
  // Which resume version the questions should be tailored to. Optional: without
  // it the student's CURRENT version is used, so the common case needs no pick.
  versionId: objectIdSchema.optional(),
  integrityAcknowledged: z.literal(true, {
    errorMap: () => ({
      message: "You must acknowledge the academic-integrity notice before starting.",
    }),
  }),
});

router.post(
  "/start",
  interviewLimiter,
  validate(startSchema),
  asyncHandler(async (req, res) => {
    const { jdId, targetRole, versionId } = req.body;

    let jd = null;
    if (jdId) {
      jd = await JobDescription.findOne({ _id: jdId, ownerUserId: req.user._id });
      if (!jd) throw ApiError.notFound("Job description not found");
    }

    // Resolve the resume version to interview against. Questions built from the
    // student's own resume are far more useful than generic ones, so this is
    // passed to the generator alongside the role.
    const Resume = require("../models/Resume");
    const ResumeVersion = require("../models/ResumeVersion");

    let version = null;
    if (versionId) {
      // An explicit choice must be one of THEIR OWN versions — an id from
      // another account must not become interview material.
      version = await ResumeVersion.findOne({ _id: versionId }).lean();
      if (!version) throw ApiError.notFound("Resume version not found");
      const owns = await Resume.exists({ _id: version.resumeId, userId: req.user._id });
      if (!owns) throw ApiError.forbidden("That resume version is not yours.");
    } else {
      const resume = await Resume.findOne({ userId: req.user._id })
        .sort({ updatedAt: -1 })
        .lean();
      if (resume?.currentVersionId) {
        version = await ResumeVersion.findById(resume.currentVersionId).lean();
      }
    }

    if (!jd && !targetRole) {
      throw ApiError.badRequest("Choose a role to interview for.");
    }

    // SINGLE-SESSION LOCK: a new session invalidates any other active one, so an
    // interview cannot be answered from two devices at once (two people, two
    // laptops, one interview).
    const invalidated = await InterviewSession.updateMany(
      { userId: req.user._id, status: "active" },
      { $set: { status: "abandoned", invalidatedByNewerSession: true, invalidatedAt: new Date() } }
    );
    if (invalidated.modifiedCount) {
      console.log(`[interview] invalidated ${invalidated.modifiedCount} prior active session(s)`);
    }

    const { questions, model, degraded } = await generateQuestions({
      jd,
      targetRole: targetRole || jd?.title,
      skills: jd?.parsed?.requiredSkills || [],
      // The student's own resume context — what they actually claim to have
      // built. Without it the questions can only be generic to the role.
      resumeVersion: version,
    });

    const session = await InterviewSession.create({
      userId: req.user._id,
      collegeId: req.user.collegeId || null,
      jdId: jd?._id || null,
      resumeVersionId: version?._id || null,
      targetRole: targetRole || jd?.title || "",
      questions: questions.map((q) => ({ id: q.id, text: q.text, focus: q.focus })),
      sessionToken: crypto.randomUUID(),
      integrityAcknowledgedAt: new Date(),
      model: model || "",
    });

    events.emitSafe("interview.started", {
      userId: req.user._id.toString(),
      sessionId: session._id.toString(),
    });

    res.status(201).json({
      session: {
        _id: session._id,
        // Sent to the client so answers can be attributed to this session.
        sessionToken: session.sessionToken,
        targetRole: session.targetRole,
        resumeVersionId: session.resumeVersionId,
        questions: session.questions.map((q) => ({ id: q.id, text: q.text, focus: q.focus })),
        startedAt: session.startedAt,
      },
      degraded,
      invalidatedPrevious: invalidated.modifiedCount,
    });
  })
);

// ---------------------------------------------------------------------------
// POST /api/interviews/:id/answer
// ---------------------------------------------------------------------------
const answerSchema = z.object({
  sessionToken: z.string().min(1),
  questionId: z.string().min(1),
  text: z.string().max(12000),
  telemetry: z
    .object({
      timeToFirstKeystrokeMs: z.number().min(0).nullable().optional(),
      totalMs: z.number().min(0).nullable().optional(),
      answerLength: z.number().min(0).optional(),
      blurCount: z.number().min(0).optional(),
      fullscreenExits: z.number().min(0).optional(),
      pasteEvents: z
        .array(z.object({ at: z.string().optional(), chars: z.number().min(0) }))
        .max(50)
        .optional(),
    })
    .optional(),
});

const idParam = z.object({ id: objectIdSchema });

router.post(
  "/:id/answer",
  validate(idParam, "params"),
  validate(answerSchema),
  asyncHandler(async (req, res) => {
    const session = await InterviewSession.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!session) throw ApiError.notFound("Interview session not found");

    if (session.sessionToken !== req.body.sessionToken) {
      throw ApiError.forbidden(
        "This interview session is no longer active — it may have been superseded by a newer session."
      );
    }
    if (session.status !== "active") {
      throw ApiError.badRequest("This interview is no longer accepting answers.");
    }

    const question = session.questions.find((q) => q.id === req.body.questionId);
    if (!question) throw ApiError.badRequest("That question is not part of this session.");

    const already = session.answers.find((a) => a.questionId === req.body.questionId);
    if (already) throw ApiError.conflict("That question has already been answered.");

    const totalBlurSoFar = session.answers.reduce((sum, a) => sum + (a.blurCount || 0), 0);

    const flags = deriveFlags({
      telemetry: {
        ...req.body.telemetry,
        answerLength: req.body.text?.length || 0,
      },
      question,
      priorBlurCount: totalBlurSoFar,
    });

    session.answers.push({
      questionId: req.body.questionId,
      text: req.body.text || "",
      timeToFirstKeystrokeMs: req.body.telemetry?.timeToFirstKeystrokeMs ?? null,
      totalMs: req.body.telemetry?.totalMs ?? null,
      blurCount: req.body.telemetry?.blurCount ?? 0,
      pasteEvents: (req.body.telemetry?.pasteEvents || []).map((p) => ({
        at: p.at ? new Date(p.at) : new Date(),
        chars: p.chars,
      })),
      answeredAt: new Date(),
    });

    for (const f of flags) session.integrityFlags.push(f);

    await session.save();

    res.json({
      answered: session.answers.length,
      total: session.questions.length,
      // Flags are recorded silently — the STUDENT is never interrupted
      // mid-interview, which would both tip them off and be unfair.
      recorded: flags.length,
    });
  })
);

// ---------------------------------------------------------------------------
// POST /api/interviews/:id/complete
// ---------------------------------------------------------------------------
router.post(
  "/:id/complete",
  validate(idParam, "params"),
  validate(z.object({ sessionToken: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const session = await InterviewSession.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!session) throw ApiError.notFound("Interview session not found");
    if (session.sessionToken !== req.body.sessionToken) {
      throw ApiError.forbidden("This interview session is no longer active.");
    }
    if (session.status === "completed") {
      return res.json({ session, alreadyCompleted: true });
    }

    const pairs = session.questions.map((q) => ({
      question: q.text,
      answer: session.answers.find((a) => a.questionId === q.id)?.text || "",
    }));

    const jd = session.jdId
      ? await JobDescription.findById(session.jdId).select("title company").lean()
      : null;

    const result = await scoreAnswers({ targetRole: session.targetRole, jd, pairs });

    // Attach feedback by INDEX — the model returns answers positionally, and
    // matching by text would break on a paraphrase.
    for (const fb of result.answers) {
      const q = session.questions[fb.questionIndex];
      if (!q) continue;
      const answer = session.answers.find((a) => a.questionId === q.id);
      if (!answer) continue;
      answer.feedback = {
        score: fb.score,
        strengths: fb.strengths || [],
        improvements: fb.improvements || [],
        modelAnswer: fb.modelAnswer || "",
      };
    }

    session.overallSummary = result.overallSummary || "";
    session.status = "completed";
    session.completedAt = new Date();
    session.model = result.model || session.model;
    session.promptTokens = result.promptTokens || 0;
    session.responseTokens = result.responseTokens || 0;

    await session.save();

    // Tell the student's placement cell there is a transcript to review — with
    // an honest note that flags are a prompt to look, not a verdict.
    if (session.collegeId && session.integrityFlags.length) {
      const student = await User.findById(session.userId).select("name").lean();
      await notify({
        toCollegeId: session.collegeId,
        toRole: "placement_cell",
        type: "system",
        title: `Mock interview completed by ${student?.name || "a student"}`,
        body: `${session.integrityFlags.length} integrity flag(s) were recorded. Flags are informational — review the transcript and decide.`,
        meta: { sessionId: session._id.toString(), userId: session.userId.toString() },
        ctaUrl: `/placement/students/${session.userId}`,
        ctaLabel: "Review transcript",
      }).catch((err) => console.error("[interview] notify failed:", err.message));
    }

    events.emitSafe("interview.completed", {
      userId: session.userId.toString(),
      sessionId: session._id.toString(),
      flags: session.integrityFlags.length,
    });

    res.json({ session, degraded: result.degraded });
  })
);

// ---------------------------------------------------------------------------
// GET /api/interviews — own history
// ---------------------------------------------------------------------------
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const sessions = await InterviewSession.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .select("-integrityFlags -answers.modelAnswer")
      .lean();

    res.json({
      sessions: sessions.map((s) => ({
        _id: s._id,
        targetRole: s.targetRole,
        status: s.status,
        questionCount: s.questions?.length || 0,
        answeredCount: s.answers?.length || 0,
        averageScore: (() => {
          const scored = (s.answers || []).filter((a) => a.feedback?.score != null);
          if (!scored.length) return null;
          return Math.round(
            (scored.reduce((sum, a) => sum + a.feedback.score, 0) / scored.length) * 10
          ) / 10;
        })(),
        flagCount: s.integrityFlags?.length || 0,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
      })),
    });
  })
);

// ---------------------------------------------------------------------------
// GET /api/interviews/:id — own session detail.
//
// The STUDENT never sees their own integrity flags: they cannot correct what
// they cannot see, and showing them mid-course would only teach evasion. The
// placement cell sees them (below).
// ---------------------------------------------------------------------------
router.get(
  "/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const session = await InterviewSession.findOne({
      _id: req.params.id,
      userId: req.user._id,
    })
      .select("-integrityFlags")
      .lean();
    if (!session) throw ApiError.notFound("Interview session not found");
    res.json({ session });
  })
);

// ---------------------------------------------------------------------------
// GET /api/interviews/college/:studentId — placement-cell view (scoped)
// ---------------------------------------------------------------------------
const { scopeQueryToCollege } = require("../shared/collegeScope");

router.get(
  "/college/:studentId",
  requireRole("placement_cell", "admin"),
  asyncHandler(async (req, res) => {
    const studentId = objectIdSchema.parse(req.params.studentId);

    // The student must be in the caller's college — enforced in the query.
    const student = await User.findOne(
      scopeQueryToCollege(req.user, { _id: studentId, role: "student" })
    )
      .select("name email")
      .lean();
    if (!student) throw ApiError.notFound("Student not found in your college");

    const sessions = await InterviewSession.find({
      userId: studentId,
      collegeId: req.user.collegeId,
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      student: { _id: student._id, name: student.name, email: student.email },
      sessions: sessions.map((s) => ({
        _id: s._id,
        targetRole: s.targetRole,
        status: s.status,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        overallSummary: s.overallSummary,
        // Flags ARE shown here, with the caveat stated in the UI.
        integrityFlags: s.integrityFlags,
        transcript: s.questions.map((q) => {
          const a = s.answers?.find((x) => x.questionId === q.id);
          return {
            question: q.text,
            focus: q.focus,
            answer: a?.text || "",
            feedback: a?.feedback || null,
          };
        }),
      })),
    });
  })
);

module.exports = router;
