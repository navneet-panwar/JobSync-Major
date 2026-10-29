const events = require("./events");

/**
 * The Full System Loop (scope gap L2).
 *
 * Wires domain events to the work they imply, so an update anywhere refreshes
 * everything downstream without the user re-triggering anything:
 *
 *   resume re-analysed / rewrites applied → readiness recomputed
 *   roadmap milestone completed           → readiness recomputed + notification
 *   student joined / left a college       → aggregation-facing caches invalidated
 *
 * TWO INVARIANTS THIS FILE MUST PRESERVE:
 *
 * 1. Fire-and-forget. A listener throwing must never fail the request that
 *    emitted the event. `events.emitSafe` already swallows listener errors, and
 *    every handler here catches its own.
 *
 * 2. Idempotent and cheap. The recompute path skips when nothing relevant
 *    changed (the ReadinessScore cache key covers version + JD content), and one
 *    in-flight recompute per user is enforced, so a burst of events cannot spend
 *    a burst of AI quota.
 */

// One in-flight recompute per user. A rewrite that fires three events in a
// second should produce ONE recompute, not three.
const inFlight = new Map();

// Separate in-flight guard for role extraction — it is a different AI call and
// should not be blocked by (or block) a readiness recompute.
const roleInFlight = new Map();

/**
 * Refresh the resume-derived roles on a student's role profile.
 *
 * A placement cell filters students by the roles their resume points at, so this
 * must stay current whenever the resume changes. Fire-and-forget: a failure here
 * must never fail the upload/analysis the student just performed.
 */
async function refreshRolesForUser({ userId, reason }) {
  if (roleInFlight.get(userId)) return;
  roleInFlight.set(userId, true);

  try {
    const Resume = require("../models/Resume");
    const ResumeVersion = require("../models/ResumeVersion");
    const User = require("../shared/auth/User");
    const StudentRoleProfile = require("../models/StudentRoleProfile");
    const { extractRoles } = require("../services/roleExtract");

    const user = await User.findById(userId).select("role collegeId").lean();
    // Only students in a college have a role profile a cell can browse.
    if (!user || user.role !== "student" || !user.collegeId) return;

    const resume = await Resume.findOne({ userId }).sort({ updatedAt: -1 }).lean();
    if (!resume?.currentVersionId) return;

    const version = await ResumeVersion.findById(resume.currentVersionId).lean();
    if (!version) return;

    const { roles, degraded, model } = await extractRoles({ resumeVersion: version });

    // Replace resume roles wholesale — a re-parse is a fresh statement about
    // the same resume, so stale roles from an earlier version must not linger.
    // Interest roles are a SEPARATE list and are never touched here.
    await StudentRoleProfile.findOneAndUpdate(
      { studentUserId: userId },
      {
        $set: {
          collegeId: user.collegeId,
          resumeRoles: roles,
          resumeRolesUpdatedAt: new Date(),
          resumeRolesModel: degraded ? `${model} (degraded)` : model || "",
        },
      },
      { upsert: true, new: true }
    );

    console.log(
      `[loop] roles refreshed for ${userId} after ${reason}: ${roles.map((r) => r.label).join(", ") || "none"}`
    );
  } catch (err) {
    console.error(`[loop] role refresh failed (${reason}):`, err.message);
  } finally {
    roleInFlight.delete(userId);
  }
}

async function recomputeForUser({ userId, jdId, reason }) {
  if (inFlight.get(userId)) {
    console.log(`[loop] recompute already in flight for ${userId} — skipping (${reason})`);
    return;
  }
  inFlight.set(userId, true);

  try {
    // Imported lazily to avoid a require cycle: the readiness route imports
    // models that this module's callers also import.
    const ReadinessScore = require("../models/ReadinessScore");
    const JobDescription = require("../models/JobDescription");
    const Resume = require("../models/Resume");
    const { matchSkills } = require("../services/skillMatch");
    const { buildReadinessScore } = require("../services/readinessScore");
    const Analysis = require("../models/Analysis");
    const ResumeVersion = require("../models/ResumeVersion");
    const crypto = require("crypto");

    // Which JD is the user actively working toward? The one they most recently
    // scored against. Without a score there is nothing to keep fresh.
    const latest = await ReadinessScore.findOne({ userId }).sort({ createdAt: -1 }).lean();
    const targetJdId = jdId || latest?.jdId;
    if (!targetJdId) {
      console.log(`[loop] no active JD for ${userId} — nothing to refresh`);
      return;
    }

    const jd = await JobDescription.findById(targetJdId).lean();
    if (!jd) return;

    const resume = await Resume.findOne({ userId }).sort({ updatedAt: -1 }).lean();
    if (!resume?.currentVersionId) return;

    const version = await ResumeVersion.findById(resume.currentVersionId);
    if (!version) return;

    // Cache key mirrors the readiness route: unchanged version + unchanged JD
    // means an identical result, so skip the AI call entirely.
    const cacheKey = crypto
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

    const cached = await ReadinessScore.findOne({ userId, cacheKey }).lean();
    if (cached) {
      console.log(`[loop] readiness already current for ${userId} (${reason}) — no AI call`);
      return;
    }

    const analysis = await Analysis.findOne({
      resumeId: resume._id,
      versionId: version._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    const match = await matchSkills({ jd, resumeVersion: version });
    const computed = buildReadinessScore({
      jd,
      match,
      atsScore: analysis?.atsScore ?? null,
    });

    const doc = await ReadinessScore.create({
      userId,
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
      atsAnalysisId: analysis?._id || null,
      breakdown: computed.breakdown,
      weights: computed.weights,
      summary: match.summary || "",
      cacheKey,
      model: match.model || "",
      promptTokens: match.promptTokens || 0,
      responseTokens: match.responseTokens || 0,
    });

    console.log(
      `[loop] refreshed readiness for ${userId} after ${reason}: ${doc.composite}%`
    );

    events.emitSafe("readiness.autoRefreshed", {
      userId,
      jdId: jd._id.toString(),
      composite: doc.composite,
      reason,
    });
  } catch (err) {
    // A loop failure must never surface as a failure of the original action.
    console.error(`[loop] recompute failed (${reason}):`, err.message);
  } finally {
    inFlight.delete(userId);
  }
}

function registerLoopListeners() {
  events.on("resume.analyzed", (p) => {
    recomputeForUser({ userId: p.userId, reason: "resume analysed" });
    refreshRolesForUser({ userId: p.userId, reason: "resume analysed" });
  });

  events.on("resume.rewriteApplied", (p) => {
    recomputeForUser({ userId: p.userId, reason: "rewrites applied" });
    refreshRolesForUser({ userId: p.userId, reason: "rewrites applied" });
  });

  events.on("roadmap.itemCompleted", async (p) => {
    // A completed milestone can move a skill from missing → matched.
    await recomputeForUser({ userId: p.userId, jdId: p.jdId, reason: "milestone completed" });

    try {
      const { notify } = require("../services/notificationService");
      await notify({
        toUserId: p.userId,
        type: "milestone_complete",
        title: `Milestone complete — readiness updated`,
        body: `You finished "${p.skill}". Your readiness for this role has been recalculated.`,
        meta: { jdId: p.jdId, itemId: p.itemId },
        ctaUrl: "/readiness",
        ctaLabel: "See your readiness",
      });
    } catch (err) {
      console.error("[loop] milestone notification failed:", err.message);
    }
  });

  // Placement-cell actions that change what dashboards should show.
  events.on("placement.statusChanged", (p) => {
    console.log(`[loop] status ${p.from} → ${p.to} recorded for student ${p.studentUserId}`);
  });

  events.on("recruiter.candidatePassed", (p) => {
    console.log(`[loop] candidate ${p.studentUserId} passed to JD ${p.jdId}`);
  });

  console.log("[loop] Full System Loop listeners registered");
}

module.exports = { registerLoopListeners, recomputeForUser, refreshRolesForUser };
