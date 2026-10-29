const express = require("express");
const { z } = require("zod");
const mongoose = require("mongoose");

const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../shared/auth/requireAuth");
const { validate } = require("../middleware/validate");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const RoadmapItem = require("../models/RoadmapItem");
const ReadinessScore = require("../models/ReadinessScore");
const JobDescription = require("../models/JobDescription");
const Resume = require("../models/Resume");
const ResumeVersion = require("../models/ResumeVersion");

const { generateRoadmap } = require("../services/roadmapGen");
const {
  computeResumeBaseline,
  findLatestBaseline,
  shapeStoredBaseline,
  buildImplicitTarget,
} = require("../services/resumeBaseline");
const StudentRoleProfile = require("../models/StudentRoleProfile");
const events = require("../shared/events");

const router = express.Router();
router.use(requireAuth);

// Generating a roadmap is one AI call per batch, so the limit is tight
// (2/minute/user) — it is not a route a user should hit in a loop.
const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 2,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id?.toString() || ipKeyGenerator(req),
  message: {
    error: { message: "Too many roadmap generations — wait a minute and retry." },
  },
});

const objectIdSchema = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), { message: "Invalid id" });

const generateSchema = z.object({
  // Optional: with no JD the plan is built from the RESUME BASELINE — the gaps
  // between the resume and the role its own content implies. A student with no
  // postings pasted yet still gets a roadmap instead of a dead page.
  jdId: objectIdSchema.optional(),
  // Which resume version's readiness to build from. Omitted = the latest score
  // for this role, which is the common case.
  versionId: objectIdSchema.optional(),
});

/**
 * POST /api/roadmap/generate
 *
 * Builds the roadmap from the LATEST readiness result for this JD. Idempotent
 * in the way that matters: regenerating replaces `not_started` items but NEVER
 * touches `in_progress` or `done` items — a student who has already completed
 * three milestones must not lose that progress because the role was re-scored.
 */
router.post(
  "/generate",
  generateLimiter,
  validate(generateSchema),
  asyncHandler(async (req, res) => {
    const { jdId, versionId } = req.body;

    // --- No JD: build the plan from the resume's own baseline gaps. ---
    if (!jdId) {
      return generateResumeBaselineRoadmap({ req, res, versionId });
    }

    // A student may build a roadmap against EITHER their own exploratory JD or a
    // role a recruiter posted to their college. Restricting this to
    // `ownerUserId` alone meant a student who was passed into a real drive could
    // not plan for it — the exact role they most need a roadmap for.
    const jd = await JobDescription.findOne({
      _id: jdId,
      $or: [
        { ownerUserId: req.user._id },
        ...(req.user.collegeId ? [{ collegeId: req.user.collegeId }] : []),
      ],
    });
    if (!jd) throw ApiError.notFound("Job description not found");

    // When a version is chosen, the roadmap must grow from THAT version's
    // readiness — otherwise a student picks an old resume and gets a plan built
    // from a different one's gaps.
    const readinessFilter = { userId: req.user._id, jdId: jd._id };
    if (versionId) {
      const version = await ResumeVersion.findOne({ _id: versionId }).lean();
      if (!version) throw ApiError.notFound("Resume version not found");
      const owned = await Resume.exists({ _id: version.resumeId, userId: req.user._id });
      if (!owned) throw ApiError.forbidden("That resume version is not yours.");
      readinessFilter.resumeVersionId = versionId;
    }

    const readiness = await ReadinessScore.findOne(readinessFilter).sort({ createdAt: -1 });

    if (!readiness) {
      throw ApiError.badRequest(
        "Run a readiness check against this role first — the roadmap is built from your missing skills."
      );
    }

    const missing = readiness.skillMatch?.missing || [];
    if (!missing.length) {
      return res.json({
        items: [],
        degraded: false,
        message: "You already cover every required skill for this role — nothing to work on.",
      });
    }

    // Preserve completed / in-progress work before regenerating.
    const existing = await RoadmapItem.find({ userId: req.user._id, jdId: jd._id });
    const protectedSkills = new Set(
      existing
        .filter((i) => i.status !== "not_started")
        .map((i) => i.skill)
    );

    // Only ask the AI about skills that aren't already in progress/done, so a
    // regeneration after partial progress costs less and can't duplicate work.
    const toGenerate = missing.filter(
      (m) => !protectedSkills.has(m.jdSkill.toLowerCase())
    );

    let generated = { items: [], degraded: false };
    if (toGenerate.length) {
      const resumeSummary = (
        await ResumeVersion.findOne({ _id: readiness.resumeVersionId })
          .select("parsedSections.summary")
          .lean()
      )?.parsedSections?.summary;

      generated = await generateRoadmap({
        missingSkills: toGenerate.map((m) => ({
          name: m.jdSkill,
          label: m.jdSkill,
          importance: m.importance,
        })),
        jd,
        resumeSummary,
      });
    }

    // Replace the untouched items; leave progress alone.
    await RoadmapItem.deleteMany({
      userId: req.user._id,
      jdId: jd._id,
      status: "not_started",
    });

    const created = generated.items.length
      ? await RoadmapItem.insertMany(
        generated.items.map((it) => ({
          userId: req.user._id,
          jdId: jd._id,
          skill: it.skill,
          skillLabel: it.skillLabel,
          importance: it.importance,
          title: it.title,
          description: it.description,
          resource: it.resource,
          milestone: it.milestone,
          status: "not_started",
          order: it.order,
          generatedAt: new Date(),
          model: generated.model || "",
        }))
      )
      : [];

    const all = await RoadmapItem.find({ userId: req.user._id, jdId: jd._id })
      .sort({ order: 1, createdAt: 1 });

    events.emitSafe("roadmap.generated", {
      userId: req.user._id.toString(),
      jdId: jd._id.toString(),
      itemCount: all.length,
      createdCount: created.length,
      preservedCount: protectedSkills.size,
    });

    res.status(201).json({
      items: all,
      degraded: Boolean(generated.degraded),
      createdCount: created.length,
      preservedCount: protectedSkills.size,
    });
  })
);

// GET /api/roadmap?jdId= — items for a role (or all roles if omitted)
const listQuery = z.object({ jdId: objectIdSchema.optional() });

router.get(
  "/",
  validate(listQuery, "query"),
  asyncHandler(async (req, res) => {
    const filter = { userId: req.user._id, source: { $ne: "resume_baseline" } };
    if (req.query.jdId) filter.jdId = req.query.jdId;

    console.log("[roadmap.debug] filter=", JSON.stringify(filter));

    const items = await RoadmapItem.find(filter).sort({ order: 1, createdAt: 1 }).lean();
    console.log(
      "[roadmap.debug] got",
      items.length,
      items.map((i) => `${i.skill}:${JSON.stringify(i.source)}`).join(" | ")
    );

    const total = items.length;
    const done = items.filter((i) => i.status === "done").length;
    const inProgress = items.filter((i) => i.status === "in_progress").length;

    res.json({
      items,
      progress: {
        total,
        done,
        inProgress,
        notStarted: total - done - inProgress,
        percent: total ? Math.round((done / total) * 100) : 0,
      },
    });
  })
);

const statusSchema = z.object({
  status: z.enum(["not_started", "in_progress", "done"]),
});

/**
 * The no-JD path: roadmap from resume baseline gaps.
 *
 * Stored with `jdId: null` and `source: "resume_baseline"`, so these items are
 * invisible to per-role queries and can never be shown as "required by <role>".
 * Progress is preserved on regenerate exactly as it is for a real role.
 */
async function generateResumeBaselineRoadmap({ req, res, versionId }) {
  const userId = req.user._id;
  const roleProfile = await StudentRoleProfile.findOne({ studentUserId: userId }).lean();

  let baseline = versionId
    ? await findLatestBaseline({ userId, versionId })
    : await findLatestBaseline({ userId });

  if (!baseline) {
    await computeResumeBaseline({
      userId,
      versionId: versionId || undefined,
      roleProfile,
    }).catch((err) => {
      console.warn("[roadmap] baseline unavailable:", err.message);
    });
    baseline = versionId
      ? await findLatestBaseline({ userId, versionId })
      : await findLatestBaseline({ userId });
  }

  if (!baseline) return res.json({ items: [], progress: emptyProgress(), source: "resume_baseline" });

  const target = buildImplicitTarget({ roleKey: baseline.implicitRoleKey || "general" });
  const missing = baseline.skillMatch?.missing || [];

  if (!missing.length) {
    const kept = await RoadmapItem.find({ userId, jdId: null, source: "resume_baseline" })
      .sort({ order: 1, createdAt: 1 })
      .lean();
    return res.json({
      items: kept,
      progress: progressOf(kept),
      source: "resume_baseline",
      message: "Your resume already covers every core skill for your target role — paste a job description to plan against a specific posting.",
    });
  }

  const existing = await RoadmapItem.find({ userId, jdId: null, source: "resume_baseline" });
  const protectedSkills = new Set(
    existing.filter((i) => i.status !== "not_started").map((i) => i.skill)
  );

  const toGenerate = missing.filter((m) => !protectedSkills.has(m.jdSkill.toLowerCase()));

  const resumeSummary = (
    await ResumeVersion.findById(baseline.resumeVersionId).select("parsedSections.summary").lean()
  )?.parsedSections?.summary;

  const generated = toGenerate.length
    ? await generateRoadmap({
      missingSkills: toGenerate.map((m) => ({
        name: m.jdSkill,
        label: m.jdSkill,
        importance: m.importance,
      })),
      jd: target,
      resumeSummary,
    })
    : { items: [], degraded: false };

  await RoadmapItem.deleteMany({
    userId,
    jdId: null,
    source: "resume_baseline",
    status: "not_started",
  });

  if (generated.items.length) {
    await RoadmapItem.insertMany(
      generated.items.map((it) => ({
        userId,
        jdId: null,
        source: "resume_baseline",
        skill: it.skill,
        skillLabel: it.skillLabel,
        importance: it.importance,
        title: it.title,
        description: it.description,
        resource: it.resource,
        milestone: it.milestone,
        status: "not_started",
        order: it.order,
        generatedAt: new Date(),
        model: generated.model || "",
      }))
    );
  }

  const all = await RoadmapItem.find({ userId, jdId: null, source: "resume_baseline" })
    .sort({ order: 1, createdAt: 1 })
    .lean();

  res.status(201).json({
    items: all,
    progress: progressOf(all),
    source: "resume_baseline",
    targetRole: target.title,
    degraded: Boolean(generated.degraded),
    createdCount: generated.items.length,
    preservedCount: protectedSkills.size,
  });
}

function progressOf(items) {
  const total = items.length;
  const done = items.filter((i) => i.status === "done").length;
  const inProgress = items.filter((i) => i.status === "in_progress").length;
  return {
    total,
    done,
    inProgress,
    notStarted: total - done - inProgress,
    percent: total ? Math.round((done / total) * 100) : 0,
  };
}

function emptyProgress() {
  return { total: 0, done: 0, inProgress: 0, notStarted: 0, percent: 0 };
}

const idParam = z.object({ itemId: objectIdSchema });

/**
 * PATCH /api/roadmap/:itemId/status
 *
 * Completing an item emits `roadmap.itemCompleted` rather than calling the
 * scoring pipeline directly — the Full System Loop listener (Phase 11) owns
 * that, so this route stays a single, cheap write.
 */
router.patch(
  "/:itemId/status",
  validate(idParam, "params"),
  validate(statusSchema),
  asyncHandler(async (req, res) => {
    const item = await RoadmapItem.findOne({
      _id: req.params.itemId,
      userId: req.user._id,
    });
    if (!item) throw ApiError.notFound("Roadmap item not found");

    const previous = item.status;
    item.status = req.body.status;
    item.completedAt = req.body.status === "done" ? new Date() : null;
    await item.save();

    if (req.body.status === "done" && previous !== "done") {
      events.emitSafe("roadmap.itemCompleted", {
        userId: req.user._id.toString(),
        jdId: item.jdId.toString(),
        itemId: item._id.toString(),
        skill: item.skill,
      });
    }

    res.json({ item });
  })
);

// DELETE /api/roadmap/:itemId
router.delete(
  "/:itemId",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const item = await RoadmapItem.findOneAndDelete({
      _id: req.params.itemId,
      userId: req.user._id,
    });
    if (!item) throw ApiError.notFound("Roadmap item not found");
    res.json({ ok: true });
  })
);

module.exports = router;
