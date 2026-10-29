const express = require("express");
const { z } = require("zod");
const mongoose = require("mongoose");
const crypto = require("crypto");

const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../shared/auth/requireAuth");
const { validate } = require("../middleware/validate");
const { analyzeLimiter } = require("../middleware/rateLimit");

const Resume = require("../models/Resume");
const ResumeVersion = require("../models/ResumeVersion");
const Analysis = require("../models/Analysis");
const JobDescription = require("../models/JobDescription");
const ReadinessScore = require("../models/ReadinessScore");

const { matchSkills } = require("../services/skillMatch");
const { buildReadinessScore, readinessBand } = require("../services/readinessScore");
const {
  computeResumeBaseline,
  findLatestBaseline,
  shapeStoredBaseline,
} = require("../services/resumeBaseline");
const StudentRoleProfile = require("../models/StudentRoleProfile");
const events = require("../shared/events");

const router = express.Router();
router.use(requireAuth);

const objectIdSchema = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), { message: "Invalid id" });

const computeSchema = z.object({
  resumeId: objectIdSchema,
  versionId: objectIdSchema.optional(),
  // Optional: without a JD the score is a RESUME BASELINE — the resume measured
  // against the target role its own content implies. Readiness must never be a
  // dead page just because no posting has been pasted yet.
  jdId: objectIdSchema.optional(),
});

/**
 * Cache key = version content + JD content. If neither changed, the previous
 * score is returned without spending an AI call. Scope §9's "analysis caching
 * by content hash", implemented where it matters most — readiness is the
 * computation that runs most often (every rewrite, every milestone).
 */
function cacheKeyFor(version, jd) {
  return crypto
    .createHash("sha256")
    .update(
      [
        version._id.toString(),
        version.updatedAt?.toISOString() || "",
        jd._id.toString(),
        jd.updatedAt?.toISOString() || "",
        String(version.rawText || "").length,
      ].join("|")
    )
    .digest("hex");
}

// POST /api/readiness/compute
router.post(
  "/compute",
  analyzeLimiter,
  validate(computeSchema),
  asyncHandler(async (req, res) => {
    const { resumeId, versionId, jdId } = req.body;

    const resume = await Resume.findOne({ _id: resumeId, userId: req.user._id });
    if (!resume) throw ApiError.notFound("Resume not found");

    // --- No JD: score against the resume's own implicit target role. ---
    if (!jdId) {
      const roleProfile = await StudentRoleProfile.findOne({ studentUserId: req.user._id }).lean();
      const baseline = await computeResumeBaseline({
        userId: req.user._id,
        resumeId: resume._id,
        versionId: versionId || undefined,
        roleProfile,
        force: true,
      });
      if (!baseline) throw ApiError.badRequest("No parsed resume version to score");
      return res.status(201).json({ readiness: baseline, cached: false, source: "resume_baseline" });
    }

    const targetVersionId = versionId || resume.currentVersionId;
    if (!targetVersionId) throw ApiError.badRequest("No resume version to score");

    const version = await ResumeVersion.findOne({
      _id: targetVersionId,
      resumeId: resume._id,
    });
    if (!version) throw ApiError.notFound("Resume version not found");

    // A student scores against their own exploratory JD OR a role a recruiter
    // posted to their college. The second case matters most: it is the role they
    // were actually passed into, so it must be scoreable.
    const jd = await JobDescription.findOne({
      _id: jdId,
      $or: [
        { ownerUserId: req.user._id },
        ...(req.user.collegeId ? [{ collegeId: req.user.collegeId }] : []),
      ],
    });
    if (!jd) throw ApiError.notFound("Job description not found");

    if (!jd.parsed?.requiredSkills?.length) {
      throw ApiError.badRequest(
        "This job description has no parsed skills — re-parse it before scoring."
      );
    }

    const cacheKey = cacheKeyFor(version, jd);
    const cached = await ReadinessScore.findOne({
      userId: req.user._id,
      cacheKey,
    }).sort({ createdAt: -1 });

    if (cached) {
      console.log(`[readiness] cache hit ${cacheKey.slice(0, 8)} — no AI call`);
      return res.json({ readiness: cached, cached: true });
    }

    // The ATS score is an input, not a separate step: take the latest analysis
    // for THIS version so the composite reflects the resume that was scored.
    const latestAnalysis = await Analysis.findOne({
      resumeId: resume._id,
      versionId: version._id,
    }).sort({ createdAt: -1 });

    const match = await matchSkills({ jd, resumeVersion: version });

    const computed = buildReadinessScore({
      jd,
      match,
      atsScore: latestAnalysis?.atsScore ?? null,
    });

    const readiness = await ReadinessScore.create({
      userId: req.user._id,
      resumeVersionId: version._id,
      jdId: jd._id,
      composite: computed.composite,
      skillMatch: {
        percent: computed.skillMatchPercent,
        matched: match.matched,
        missing: match.missing,
        extra: match.extra,
        degraded: Boolean(match.degraded),
      },
      projectRelevance: {
        percent: computed.breakdown.find((b) => b.key === "projectRelevance").value,
        rationale: match.projectRelevance?.rationale || "",
      },
      experienceRelevance: {
        percent: computed.breakdown.find((b) => b.key === "experienceRelevance").value,
        rationale: match.experienceRelevance?.rationale || "",
      },
      atsSubscore: computed.breakdown.find((b) => b.key === "ats").value,
      atsAnalysisId: latestAnalysis?._id || null,
      breakdown: computed.breakdown,
      weights: computed.weights,
      summary: match.summary || "",
      cacheKey,
      model: match.model || "",
      promptTokens: match.promptTokens || 0,
      responseTokens: match.responseTokens || 0,
    });

    events.emitSafe("readiness.computed", {
      userId: req.user._id.toString(),
      jdId: jd._id.toString(),
      versionId: version._id.toString(),
      composite: readiness.composite,
    });

    res.status(201).json({ readiness, cached: false });
  })
);

// GET /api/readiness/latest?jdId= — newest score, with the band label
router.get(
  "/latest",
  asyncHandler(async (req, res) => {
    // With a JD: the newest real score for that role. A resume baseline is
    // NEVER returned here — it measures a different thing, and substituting it
    // would let a student believe they had been scored for a role they hadn't.
    if (req.query.jdId) {
      if (!mongoose.isValidObjectId(req.query.jdId)) {
        throw ApiError.badRequest("Invalid jdId");
      }

      const readiness = await ReadinessScore.findOne({
        userId: req.user._id,
        jdId: req.query.jdId,
        source: { $ne: "resume_baseline" },
      })
        .sort({ createdAt: -1 })
        .lean();
      if (!readiness) return res.json({ readiness: null });

      return res.json({
        readiness: { ...readiness, band: readinessBand(readiness.composite) },
      });
    }

    // No JD: the resume baseline. Computed on first read so a fresh upload
    // shows a score without the student having to press anything.
    let baseline = await findLatestBaseline({ userId: req.user._id });
    if (!baseline) {
      const roleProfile = await StudentRoleProfile.findOne({
        studentUserId: req.user._id,
      }).lean();
      await computeResumeBaseline({ userId: req.user._id, roleProfile }).catch((err) => {
        console.warn("[readiness] baseline unavailable:", err.message);
      });
      baseline = await findLatestBaseline({ userId: req.user._id });
    }

    if (!baseline) return res.json({ readiness: null, source: "resume_baseline" });

    const shaped = await shapeStoredBaseline(baseline);
    if (!shaped) return res.json({ readiness: null, source: "resume_baseline" });

    return res.json({ readiness: shaped, source: "resume_baseline" });

    res.json({
      readiness: { ...readiness, band: readinessBand(readiness.composite) },
    });
  })
);

// GET /api/readiness?jdId= — score history for a JD (trend view)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = { userId: req.user._id, source: { $ne: "resume_baseline" } };
    if (req.query.jdId) {
      if (!mongoose.isValidObjectId(req.query.jdId)) {
        throw ApiError.badRequest("Invalid jdId");
      }
      filter.jdId = req.query.jdId;
    }

    const scores = await ReadinessScore.find(filter)
      .sort({ createdAt: 1 })
      .select("composite skillMatch.percent resumeVersionId jdId createdAt")
      .lean();

    res.json({
      scores: scores.map((s) => ({
        _id: s._id,
        composite: s.composite,
        skillMatchPercent: s.skillMatch?.percent ?? 0,
        resumeVersionId: s.resumeVersionId,
        jdId: s.jdId,
        createdAt: s.createdAt,
      })),
      latest: scores.length ? scores[scores.length - 1] : null,
    });
  })
);

module.exports = router;
