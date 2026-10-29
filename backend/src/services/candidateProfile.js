const User = require("../shared/auth/User");
const College = require("../shared/auth/College");
const Resume = require("../models/Resume");
const ResumeVersion = require("../models/ResumeVersion");
const Analysis = require("../models/Analysis");
const ReadinessScore = require("../models/ReadinessScore");
const PlacementStatus = require("../models/PlacementStatus");
const RecruiterPass = require("../models/RecruiterPass");
const StudentRoleProfile = require("../models/StudentRoleProfile");
const IntegrityFlag = require("../models/IntegrityFlag");
const InterviewSession = require("../models/InterviewSession");

/**
 * candidateProfile — everything anyone needs to judge ONE student, in one place.
 *
 * Two callers with different questions ask for the same shape:
 *
 *   · a placement cell, BEFORE passing a student: "is this person actually
 *     ready, and what should I warn them about?"
 *   · a recruiter, AFTER receiving a student: "what has this person built, and
 *     how do they line up against my role?"
 *
 * Building it twice would guarantee the two views disagree — a cell approving on
 * one set of facts while the recruiter reads another. One builder, one truth.
 *
 * `jdId` is optional and only changes the READINESS section: with a JD, the
 * readiness is the one computed against that role (or an explicit "not scored
 * for this role"); without one, it is the student's latest score across any role.
 */

/**
 * Warnings a placement cell should see before passing a student.
 *
 * These are ADVISORY, never blocking. A cell may have context the system does
 * not — a student may have a strong offline portfolio, or the score may simply
 * be stale. The point is that the decision is informed, not that the system
 * makes it.
 */
function buildWarnings({ student, resume, version, readiness, analysis, flags, jdId }) {
  const warnings = [];

  if (!resume) {
    warnings.push({
      level: "high",
      code: "no_resume",
      title: "No resume uploaded",
      detail:
        "A recruiter will receive this student with nothing to read. Ask them to upload a resume before you pass them.",
    });
  } else if (!version) {
    warnings.push({
      level: "high",
      code: "no_version",
      title: "Resume has no parsed version",
      detail:
        "The resume exists but was never successfully parsed, so there is no content to show a recruiter.",
    });
  }

  if (!readiness) {
    warnings.push({
      level: jdId ? "high" : "medium",
      code: "no_readiness",
      title: jdId
        ? "Readiness not calculated for this role"
        : "Readiness never calculated",
      detail: jdId
        ? "This student has not been scored against this specific role, so a recruiter will see no fit number for them. Ask them to run a readiness check on this job description."
        : "This student has not run a readiness check against any role yet. Their fit is unknown.",
    });
  }

  if (!analysis && version) {
    warnings.push({
      level: "low",
      code: "no_analysis",
      title: "Resume never analysed",
      detail:
        "Without an ATS analysis the resume-quality component of readiness is zero, which understates the student.",
    });
  }

  if (readiness && readiness.skillMatch?.degraded) {
    warnings.push({
      level: "medium",
      code: "degraded_score",
      title: "Readiness was computed in degraded mode",
      detail:
        "The AI match service was unavailable when this score was produced, so it reflects exact skill-name overlap only. Consider re-running it.",
    });
  }

  if (student?.consent?.shownToRecruiters === false) {
    warnings.push({
      level: "high",
      code: "consent_withdrawn",
      title: "This student has withdrawn consent",
      detail:
        "They will not appear in any recruiter feed even if you pass them. Resolve this with the student first.",
    });
  }

  if (flags?.length) {
    warnings.push({
      level: "medium",
      code: "integrity_flags",
      title: `${flags.length} integrity signal${flags.length === 1 ? "" : "s"} on record`,
      detail:
        "Flagged interview behaviour was recorded. These are informational and never automatic — look at the transcript before deciding.",
    });
  }

  if (version && !(version.parsedSections?.skills || []).length) {
    warnings.push({
      level: "low",
      code: "no_skills",
      title: "No skills extracted from the resume",
      detail:
        "The parser found no skills list, so skill-match scoring will be weak regardless of the student's actual ability.",
    });
  }

  return warnings;
}

/** A readiness score, shaped for display, or null. */
function shapeReadiness(score) {
  if (!score) return null;
  return {
    _id: score._id,
    composite: score.composite,
    skillMatchPercent: score.skillMatch?.percent ?? 0,
    matched: (score.skillMatch?.matched || []).map((m) => ({
      skill: m.jdSkill,
      evidence: m.evidence || "",
      strength: m.strength || "direct",
    })),
    missing: (score.skillMatch?.missing || [])
      .slice()
      .sort((a, b) => (a.importance === "must" ? 0 : 1) - (b.importance === "must" ? 0 : 1))
      .map((m) => ({ skill: m.jdSkill, importance: m.importance })),
    extra: (score.skillMatch?.extra || []).slice(0, 12),
    degraded: Boolean(score.skillMatch?.degraded),
    projectRelevance: score.projectRelevance || null,
    experienceRelevance: score.experienceRelevance || null,
    atsSubscore: score.atsSubscore ?? null,
    breakdown: score.breakdown || [],
    summary: score.summary || "",
    jdId: score.jdId,
    createdAt: score.createdAt,
  };
}

/**
 * Build the full profile for one student.
 *
 * @param {ObjectId} studentUserId
 * @param {Object}   [opts]
 * @param {ObjectId} [opts.jdId]  score readiness against this role specifically
 * @param {Boolean}  [opts.includeRawText]  include the resume's raw text (heavy)
 */
async function buildCandidateProfile(studentUserId, { jdId = null, includeRawText = false } = {}) {
  const student = await User.findById(studentUserId)
    .select("name email role collegeId createdAt consent")
    .lean();

  if (!student) return null;

  const [college, resume, status, passes, roleProfile, flags, interviews] = await Promise.all([
    student.collegeId ? College.findById(student.collegeId).select("name").lean() : null,
    Resume.findOne({ userId: studentUserId }).sort({ updatedAt: -1 }).lean(),
    PlacementStatus.findOne({ studentUserId }).lean(),
    RecruiterPass.find({ studentUserId }).populate("jdId", "title company").lean(),
    StudentRoleProfile.findOne({ studentUserId }).lean(),
    IntegrityFlag.find({ studentUserId, acknowledged: { $ne: true } })
      .select("kind summary detail createdAt")
      .lean(),
    InterviewSession.find({ userId: studentUserId })
      .select("targetRole status score integrityFlags createdAt completedAt")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
  ]);

  // The resume's current version carries everything a reader needs: sections,
  // and the link to its latest ATS analysis.
  let version = null;
  let analysis = null;
  if (resume?.currentVersionId) {
    version = await ResumeVersion.findById(resume.currentVersionId).lean();
    if (version) {
      analysis = await Analysis.findOne({ versionId: version._id })
        .sort({ createdAt: -1 })
        .select("atsScore scoreBreakdown issues strengths summary createdAt")
        .lean();
    }
  }

  // Readiness: the one for THIS role when a role is given, else the latest
  // across any role. Never silently substitutes the other — a cell judging a
  // student for one role must not be shown their fit for a different one.
  let readinessDoc = null;
  if (jdId) {
    readinessDoc = await ReadinessScore.findOne({ userId: studentUserId, jdId }).sort({
      createdAt: -1,
    });
  } else {
    readinessDoc = await ReadinessScore.findOne({ userId: studentUserId }).sort({
      createdAt: -1,
    });
  }

  const readiness = shapeReadiness(readinessDoc);

  const warnings = buildWarnings({
    student,
    resume,
    version,
    readiness,
    analysis,
    flags,
    jdId,
  });

  const sections = version?.parsedSections || {};

  return {
    student: {
      _id: student._id,
      name: student.name,
      email: student.email,
      joinedAt: student.createdAt,
      consent: student.consent,
      college: college ? { _id: college._id, name: college.name } : null,
    },

    // --- The resume itself, in the shape a reader wants ---
    resume: resume
      ? {
        _id: resume._id,
        title: resume.title,
        versionNumber: version?.versionNumber ?? resume.latestVersionNumber,
        versionId: version?._id ?? null,
        sourceType: version?.sourceType ?? null,
        updatedAt: resume.updatedAt,
        parsed: {
          basics: sections.basics || {},
          summary: sections.summary || "",
          skills: sections.skills || [],
          experience: (sections.experience || []).map((e) => ({
            company: e.company || "",
            role: e.role || "",
            period: e.period || "",
            location: e.location || "",
            bullets: (e.bullets || []).slice(0, 6),
          })),
          projects: (sections.projects || []).map((p) => ({
            name: p.name || "",
            description: p.description || "",
            tech: p.tech || [],
            links: p.links || [],
          })),
          education: (sections.education || []).map((e) => ({
            degree: e.degree || "",
            school: e.school || "",
            period: e.period || "",
          })),
          certifications: (sections.certifications || []).map((c) => ({
            name: c.name || "",
            issuer: c.issuer || "",
            year: c.year || "",
          })),
          languages: sections.languages || [],
        },
        ...(includeRawText ? { rawText: version?.rawText || "" } : {}),
      }
      : null,

    // --- Resume quality (the ATS sub-score), kept clearly labelled ---
    analysis: analysis
      ? {
        atsScore: analysis.atsScore,
        breakdown: analysis.scoreBreakdown || [],
        issues: (analysis.issues || []).slice(0, 5),
        strengths: (analysis.strengths || []).slice(0, 5),
        summary: analysis.summary || "",
        createdAt: analysis.createdAt,
      }
      : null,

    // --- Readiness against the role in question, or the latest ---
    readiness,
    readinessJdId: jdId || readinessDoc?.jdId || null,
    readinessForRequestedRole: jdId ? Boolean(readinessDoc) : null,

    // --- Placement-cell context ---
    placement: {
      status: status?.status || "not_reviewed",
      tags: status?.trainingTags || [],
      auditLog: (status?.auditLog || []).slice(-10),
    },

    // --- Where this student has already been passed ---
    passes: passes.map((p) => ({
      _id: p._id,
      jd: p.jdId ? { _id: p.jdId._id, title: p.jdId.title, company: p.jdId.company } : null,
      note: p.note,
      decision: p.recruiterDecision || "none",
      createdAt: p.createdAt,
    })),

    // --- The two role signals, kept separate as everywhere else ---
    roles: {
      fromResume: (roleProfile?.resumeRoles || []).map((r) => ({
        key: r.key,
        label: r.label,
        confidence: r.confidence,
      })),
      interested: (roleProfile?.interestedRoles || [])
        .filter((r) => r.response === "interested")
        .map((r) => ({ key: r.key, label: r.label })),
      resumeRolesUpdatedAt: roleProfile?.resumeRolesUpdatedAt || null,
    },

    // --- Integrity signals (informational only) ---
    integrityFlags: flags.map((f) => ({
      _id: f._id,
      kind: f.kind,
      summary: f.summary,
      detail: f.detail,
      createdAt: f.createdAt,
    })),

    interviews: interviews.map((i) => ({
      _id: i._id,
      targetRole: i.targetRole,
      status: i.status,
      score: i.score?.overall ?? null,
      flagCount: (i.integrityFlags || []).length,
      createdAt: i.createdAt,
    })),

    // --- What a placement cell must know BEFORE passing ---
    warnings,
  };
}

/**
 * Does this student have anything worth warning about? Used to badge rows
 * without shipping the whole profile to a list view.
 */
async function quickFlags(studentIds, jdId = null) {
  const [resumes, readiness, statuses, consents] = await Promise.all([
    Resume.aggregate([
      { $match: { userId: { $in: studentIds } } },
      { $sort: { updatedAt: -1 } },
      { $group: { _id: "$userId", resumeId: { $first: "$_id" }, versionId: { $first: "$currentVersionId" } } },
    ]),
    jdId
      ? ReadinessScore.aggregate([
        { $match: { userId: { $in: studentIds }, jdId } },
        { $group: { _id: "$userId" } },
      ])
      : ReadinessScore.aggregate([
        { $match: { userId: { $in: studentIds } } },
        { $group: { _id: "$userId" } },
      ]),
    PlacementStatus.find({ studentUserId: { $in: studentIds } }).select("studentUserId").lean(),
    User.find({ _id: { $in: studentIds } }).select("_id consent").lean(),
  ]);

  const hasResume = new Set(
    resumes.filter((r) => r.versionId).map((r) => r._id.toString())
  );
  const hasReadiness = new Set(readiness.map((r) => r._id.toString()));
  const consentWithdrawn = new Set(
    consents.filter((c) => c.consent?.shownToRecruiters === false).map((c) => c._id.toString())
  );

  const out = new Map();
  for (const id of studentIds) {
    const sid = id.toString();
    out.set(sid, {
      hasResume: hasResume.has(sid),
      hasReadiness: hasReadiness.has(sid),
      consentWithdrawn: consentWithdrawn.has(sid),
      reviewNeeded:
        !hasResume.has(sid) || !hasReadiness.has(sid) || consentWithdrawn.has(sid),
    });
  }
  return out;
}

module.exports = { buildCandidateProfile, quickFlags, buildWarnings };