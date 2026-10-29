const express = require("express");
const { z } = require("zod");
const mongoose = require("mongoose");

const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRole } = require("../shared/auth/requireAuth");
const {
  scopeQueryToCollege,
  assertStudentInOwnCollege,
} = require("../shared/collegeScope");
const { validate } = require("../middleware/validate");

const User = require("../shared/auth/User");
const College = require("../shared/auth/College");
const Resume = require("../models/Resume");
const ReadinessScore = require("../models/ReadinessScore");
const PlacementStatus = require("../models/PlacementStatus");
const RecruiterPass = require("../models/RecruiterPass");
const JobDescription = require("../models/JobDescription");
const IntegrityFlag = require("../models/IntegrityFlag");
const InterviewSession = require("../models/InterviewSession");
const StudentRoleProfile = require("../models/StudentRoleProfile");
const { buildCandidateProfile, quickFlags } = require("../services/candidateProfile");
const events = require("../shared/events");
const { bulkQueue } = require("../shared/queue");
const { readinessBand } = require("../services/readinessScore");

const router = express.Router();

// Every route here is placement-cell-only AND college-scoped. Scoping happens
// inside the database query via scopeQueryToCollege — never only in the UI.
router.use(requireAuth, requireRole("placement_cell", "admin"));

const objectIdSchema = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), { message: "Invalid id" });

const STATUSES = [
  "not_reviewed",
  "referred",
  "shortlisted",
  "hired",
  "needs_improvement",
  "critical",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Bulk-fetch everything the cohort table needs for a page of students.
 * Four batched queries instead of per-student lookups — a 100-row page must
 * not be 400 round-trips.
 */
async function enrichStudents(studentIds) {
  const [readiness, statuses, resumes, passes, roleProfiles] = await Promise.all([
    // Latest readiness per student (across any JD) — the number a cell acts on.
    ReadinessScore.aggregate([
      { $match: { userId: { $in: studentIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$userId",
          composite: { $first: "$composite" },
          skillMatchPercent: { $first: "$skillMatch.percent" },
          jdId: { $first: "$jdId" },
          missing: { $first: "$skillMatch.missing" },
          createdAt: { $first: "$createdAt" },
        },
      },
    ]),
    PlacementStatus.find({ studentUserId: { $in: studentIds } }).lean(),
    Resume.aggregate([
      { $match: { userId: { $in: studentIds } } },
      { $sort: { updatedAt: -1 } },
      {
        $group: {
          _id: "$userId",
          resumeId: { $first: "$_id" },
          title: { $first: "$title" },
          latestVersionNumber: { $first: "$latestVersionNumber" },
          updatedAt: { $first: "$updatedAt" },
        },
      },
    ]),
    RecruiterPass.aggregate([
      { $match: { studentUserId: { $in: studentIds } } },
      { $group: { _id: "$studentUserId", count: { $sum: 1 } } },
    ]),
    // The roles each student's resume points at — shown next to their profile
    // and used by the role filter. Resume-derived only here; opt-in roles live
    // on the role pages, kept separate on purpose.
    StudentRoleProfile.find({ studentUserId: { $in: studentIds } })
      .select("studentUserId resumeRoles interestedRoles")
      .lean(),
  ]);

  return {
    readiness: new Map(readiness.map((r) => [r._id.toString(), r])),
    status: new Map(statuses.map((s) => [s.studentUserId.toString(), s])),
    resume: new Map(resumes.map((r) => [r._id.toString(), r])),
    passes: new Map(passes.map((p) => [p._id.toString(), p.count])),
    roles: new Map(roleProfiles.map((p) => [p.studentUserId.toString(), p])),
  };
}

function shapeStudent(student, maps) {
  const id = student._id.toString();
  const r = maps.readiness.get(id);
  const st = maps.status.get(id);
  const resume = maps.resume.get(id);
  const roleProfile = maps.roles.get(id);

  // Top missing skills, must-haves first — what a cell acts on at a glance.
  const allMissing = (r?.missing || [])
    .slice()
    .sort((a, b) => (a.importance === "must" ? 0 : 1) - (b.importance === "must" ? 0 : 1))
    .map((m) => m.jdSkill);

  return {
    _id: student._id,
    name: student.name,
    email: student.email,
    joinedAt: student.createdAt,
    consent: student.consent,
    readiness: r?.composite ?? null,
    skillMatchPercent: r?.skillMatchPercent ?? null,
    scoredJdId: r?.jdId ?? null,
    // Truncated for the table; full list drives cohort gap analytics.
    missingSkills: allMissing.slice(0, 3),
    allMissingSkills: allMissing,
    resume: resume
      ? { _id: resume.resumeId, title: resume.title, version: resume.latestVersionNumber }
      : null,
    resumeUpdatedAt: resume?.updatedAt ?? null,
    status: st?.status || "not_reviewed",
    trainingTags: st?.trainingTags || [],
    // The row's own tags, under one name the UI can rely on, so a tag is
    // visible alongside the profile without a second request.
    tags: st?.trainingTags || [],
    passedCount: maps.passes.get(id) || 0,
    // Roles the resume points at (separate from opt-in interest).
    resumeRoles: (roleProfile?.resumeRoles || []).map((x) => ({
      key: x.key,
      label: x.label,
      confidence: x.confidence,
    })),
    interestedRoles: (roleProfile?.interestedRoles || []).map((x) => ({
      key: x.key,
      label: x.label,
      response: x.response,
    })),
  };
}

// ---------------------------------------------------------------------------
// GET /api/placement-cell/students — the cohort table
// ---------------------------------------------------------------------------
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(80).optional(),
  status: z.enum(STATUSES).optional(),
  minReadiness: z.coerce.number().int().min(0).max(100).optional(),
  maxReadiness: z.coerce.number().int().min(0).max(100).optional(),
  // Tag filter — same standing as status and readiness. Matches any one of the
  // comma-separated tags, so "dsa,aptitude" finds students with EITHER.
  tags: z.string().trim().max(300).optional(),
  // Role filter — students whose RESUME points at this role.
  roleKey: z.string().trim().max(80).optional(),
  // Restrict the role filter to resume-derived or opt-in roles.
  roleSource: z.enum(["resume", "interested", "both"]).default("both"),
});

router.get(
  "/students",
  validate(listQuery, "query"),
  asyncHandler(async (req, res) => {
    const { page, limit, q, status, minReadiness, maxReadiness, tags, roleKey, roleSource } =
      req.query;

    const filter = scopeQueryToCollege(req.user, { role: "student" });
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ];
    }

    const [students, total] = await Promise.all([
      User.find(filter)
        .select("name email createdAt consent")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    const maps = await enrichStudents(students.map((s) => s._id));
    let shaped = students.map((s) => shapeStudent(s, maps));

    // A per-row "review needed" flag, so a cell can see at a glance who is
    // missing a resume or a readiness score without opening each profile.
    const flags = await quickFlags(students.map((s) => s._id));
    shaped = shaped.map((s) => ({
      ...s,
      review: flags.get(s._id.toString()) || null,
    }));

    // Status/readiness/tag/role filters apply after enrichment because they
    // live in collections joined above. With one page of ≤100 rows this is cheap
    // and keeps the query plan simple rather than $looking-up on every request.
    if (status) shaped = shaped.filter((s) => s.status === status);
    if (minReadiness != null) {
      shaped = shaped.filter((s) => s.readiness != null && s.readiness >= minReadiness);
    }
    if (maxReadiness != null) {
      shaped = shaped.filter((s) => s.readiness != null && s.readiness <= maxReadiness);
    }

    // Tag filter — same standing as status and readiness. Any one matching tag
    // is enough, because a cell filtering "dsa,aptitude" wants either cohort.
    if (tags) {
      const wanted = tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      if (wanted.length) {
        shaped = shaped.filter((s) =>
          s.tags.some((t) => wanted.includes(String(t).toLowerCase()))
        );
      }
    }

    // Role filter — resume-derived, opt-in, or either. The two sources stay
    // distinct in the payload so the UI can label each row honestly.
    if (roleKey) {
      const key = roleKey.toLowerCase();
      shaped = shaped.filter((s) => {
        const inResume = s.resumeRoles.some((r) => r.key === key);
        const inInterested = s.interestedRoles.some(
          (r) => r.key === key && r.response === "interested"
        );
        if (roleSource === "resume") return inResume;
        if (roleSource === "interested") return inInterested;
        return inResume || inInterested;
      });
    }

    // Highest readiness first — the useful default for a placement cell.
    shaped.sort((a, b) => (b.readiness ?? -1) - (a.readiness ?? -1));

    // Every tag in use across the college, so the filter bar can offer real
    // values instead of a free-text box. Computed from the scoped cohort only.
    const tagCounts = new Map();
    for (const s of shaped) {
      for (const t of s.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }

    const college = await College.findById(req.user.collegeId)
      .select("name code")
      .lean();

    res.json({
      college: college ? { name: college.name, code: college.code } : null,
      students: shaped,
      // The filter bar's own data — same response, no second round-trip.
      availableTags: [...tagCounts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  })
);

// ---------------------------------------------------------------------------
// GET /api/placement-cell/students/:id — drill-down
// ---------------------------------------------------------------------------
router.get(
  "/students/:id",
  asyncHandler(async (req, res) => {
    const id = objectIdSchema.parse(req.params.id);

    // A student from another college is a 404, not a 403 — a cell should not be
    // able to confirm that a foreign id exists.
    const student = await User.findOne(
      scopeQueryToCollege(req.user, { _id: id, role: "student" })
    )
      .select("name email createdAt consent")
      .lean();
    if (!student) throw ApiError.notFound("Student not found in your college");

    const maps = await enrichStudents([student._id]);
    const shaped = shapeStudent(student, maps);

    const [readinessHistory, statusDoc, passes] = await Promise.all([
      ReadinessScore.find({ userId: student._id })
        .sort({ createdAt: 1 })
        .select("composite skillMatch.percent jdId createdAt")
        .lean(),
      PlacementStatus.findOne({ studentUserId: student._id }).lean(),
      RecruiterPass.find({ studentUserId: student._id })
        .populate("jdId", "title company")
        .lean(),
    ]);

    res.json({
      student: shaped,
      readinessHistory: readinessHistory.map((r) => ({
        composite: r.composite,
        skillMatchPercent: r.skillMatch?.percent ?? 0,
        jdId: r.jdId,
        createdAt: r.createdAt,
      })),
      auditLog: statusDoc?.auditLog || [],
      passes: passes.map((p) => ({
        _id: p._id,
        jd: p.jdId
          ? { _id: p.jdId._id, title: p.jdId.title, company: p.jdId.company }
          : null,
        note: p.note,
        createdAt: p.createdAt,
      })),
    });
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/placement-cell/students/:id/status
// ---------------------------------------------------------------------------
const statusBody = z.object({
  status: z.enum(STATUSES),
  note: z.string().trim().max(400).optional(),
});

router.patch(
  "/students/:id/status",
  validate(statusBody),
  asyncHandler(async (req, res) => {
    const id = objectIdSchema.parse(req.params.id);

    const student = await User.findOne(
      scopeQueryToCollege(req.user, { _id: id, role: "student" })
    )
      .select("name email collegeId")
      .lean();
    assertStudentInOwnCollege(student, req.user);

    let doc = await PlacementStatus.findOne({ studentUserId: id });
    if (!doc) {
      doc = new PlacementStatus({
        studentUserId: id,
        collegeId: req.user.collegeId,
        status: "not_reviewed",
      });
    }

    const from = doc.status;
    doc.status = req.body.status;
    doc.appendAudit({
      by: req.user._id,
      byName: req.user.name,
      from,
      to: req.body.status,
      note: req.body.note || "",
      kind: "status",
    });
    await doc.save();

    events.emitSafe("placement.statusChanged", {
      studentUserId: id,
      collegeId: req.user.collegeId.toString(),
      from,
      to: req.body.status,
    });

    res.json({ status: doc });
  })
);

// ---------------------------------------------------------------------------
// POST /api/placement-cell/students/:id/training-tags
// ---------------------------------------------------------------------------
const tagsBody = z.object({
  tags: z.array(z.string().trim().min(1).max(40)).max(10),
});

router.post(
  "/students/:id/training-tags",
  validate(tagsBody),
  asyncHandler(async (req, res) => {
    const id = objectIdSchema.parse(req.params.id);

    const student = await User.findOne(
      scopeQueryToCollege(req.user, { _id: id, role: "student" })
    )
      .select("name collegeId")
      .lean();
    assertStudentInOwnCollege(student, req.user);

    let doc = await PlacementStatus.findOne({ studentUserId: id });
    if (!doc) {
      doc = new PlacementStatus({
        studentUserId: id,
        collegeId: req.user.collegeId,
      });
    }

    const before = [...doc.trainingTags];
    doc.trainingTags = [...new Set(req.body.tags)];
    doc.appendAudit({
      by: req.user._id,
      byName: req.user.name,
      note: "Training tags updated",
      kind: "training_tag",
      meta: { from: before, to: doc.trainingTags },
    });
    await doc.save();

    res.json({ status: doc });
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/placement-cell/students/:id/pass — gatekeeping (Phase 7)
// ---------------------------------------------------------------------------
const passBody = z.object({
  jdId: objectIdSchema,
  note: z.string().trim().max(400).optional(),
  pass: z.boolean().default(true),
});

router.patch(
  "/students/:id/pass",
  validate(passBody),
  asyncHandler(async (req, res) => {
    const id = objectIdSchema.parse(req.params.id);
    const { jdId, note, pass } = req.body;

    const student = await User.findOne(
      scopeQueryToCollege(req.user, { _id: id, role: "student" })
    )
      .select("name collegeId")
      .lean();
    assertStudentInOwnCollege(student, req.user);

    // The JD must belong to this college's pipeline: a recruiter's posting that
    // was shared with this cell. Passing a student into an arbitrary JD would
    // let a cell write into another institution's feed.
    const jd = await JobDescription.findOne({ _id: jdId, collegeId: req.user.collegeId });
    if (!jd) {
      throw ApiError.notFound(
        "That job description is not in your college's pipeline."
      );
    }

    const existing = await RecruiterPass.findOne({
      studentUserId: id,
      jdId: jd._id,
    });

    if (pass) {
      if (!existing) {
        await RecruiterPass.create({
          jdId: jd._id,
          studentUserId: id,
          collegeId: req.user.collegeId,
          passedBy: req.user._id,
          note: note || "",
        });
      }
    } else if (existing) {
      await existing.deleteOne();
    }

    // Every pass/withdraw is audited so the decision is attributable.
    let doc = await PlacementStatus.findOne({ studentUserId: id });
    if (!doc) {
      doc = new PlacementStatus({ studentUserId: id, collegeId: req.user.collegeId });
    }
    doc.appendAudit({
      by: req.user._id,
      byName: req.user.name,
      note: note || "",
      kind: pass ? "pass_to_recruiter" : "pass_withdrawn",
      meta: { jdId: jd._id.toString(), jdTitle: jd.title },
    });
    await doc.save();
    events.emitSafe(pass ? "recruiter.candidatePassed" : "recruiter.passWithdrawn", {
      studentUserId: id,
      jdId: jd._id.toString(),
      collegeId: req.user.collegeId.toString(),
    });

    res.json({ ok: true, passed: pass, jd: { _id: jd._id, title: jd.title } });
  })
);

// ---------------------------------------------------------------------------
// POST /api/placement-cell/bulk — group actions across many students
// ---------------------------------------------------------------------------

/**
 * One request, many students. Runs through the shared queue so a 40-student
 * action does not stampede the database or (later) the email provider.
 *
 * Returns a PER-STUDENT outcome rather than a bare success, because a bulk
 * action that silently skips half its targets is worse than one that fails: the
 * placement cell needs to know exactly who was affected.
 */
const bulkSchema = z.object({
  studentIds: z.array(objectIdSchema).min(1).max(100),
  action: z.enum(["setStatus", "assignTrainingTag", "passToJd"]),
  status: z.enum(STATUSES).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  jdId: objectIdSchema.optional(),
  note: z.string().trim().max(400).optional(),
});

router.post(
  "/bulk",
  validate(bulkSchema),
  asyncHandler(async (req, res) => {
    const { studentIds, action, status, tags, jdId, note } = req.body;

    // Validate the action's own requirements up front — failing after doing half
    // the work would leave the cohort in a partially-updated state.
    if (action === "setStatus" && !status) {
      throw ApiError.badRequest("A status is required for setStatus");
    }
    if (action === "assignTrainingTag" && !tags?.length) {
      throw ApiError.badRequest("At least one training tag is required");
    }
    let jd = null;
    if (action === "passToJd") {
      if (!jdId) throw ApiError.badRequest("A job description is required to pass students");
      jd = await JobDescription.findOne({ _id: jdId, collegeId: req.user.collegeId });
      if (!jd) {
        throw ApiError.notFound("That job description is not in your college's pipeline.");
      }
    }

    // Resolve the targets ONCE, scoped to this college. Anything that does not
    // come back is either foreign or gone — both are reported as failures below
    // rather than being silently dropped.
    const students = await User.find(
      scopeQueryToCollege(req.user, { _id: { $in: studentIds }, role: "student" })
    )
      .select("name email collegeId")
      .lean();

    const found = new Map(students.map((s) => [s._id.toString(), s]));

    const results = await bulkQueue.addAll(
      studentIds.map((id) => async () => {
        const student = found.get(id.toString());
        if (!student) {
          return { studentId: id, ok: false, reason: "Not found in your college" };
        }

        try {
          let doc = await PlacementStatus.findOne({ studentUserId: student._id });
          if (!doc) {
            doc = new PlacementStatus({
              studentUserId: student._id,
              collegeId: req.user.collegeId,
              status: "not_reviewed",
            });
          }

          if (action === "setStatus") {
            const from = doc.status;
            doc.status = status;
            doc.appendAudit({
              by: req.user._id,
              byName: req.user.name,
              from,
              to: status,
              note: note || "Bulk status update",
              kind: "status",
              meta: { bulk: true },
            });
          } else if (action === "assignTrainingTag") {
            const before = [...doc.trainingTags];
            doc.trainingTags = [...new Set([...doc.trainingTags, ...tags])];
            doc.appendAudit({
              by: req.user._id,
              byName: req.user.name,
              note: note || "Bulk training tags added",
              kind: "training_tag",
              meta: { from: before, to: doc.trainingTags, bulk: true },
            });
          } else if (action === "passToJd") {
            const existing = await RecruiterPass.findOne({
              studentUserId: student._id,
              jdId: jd._id,
            });
            if (!existing) {
              await RecruiterPass.create({
                jdId: jd._id,
                studentUserId: student._id,
                collegeId: req.user.collegeId,
                passedBy: req.user._id,
                note: note || "",
              });
            }
            doc.appendAudit({
              by: req.user._id,
              byName: req.user.name,
              note: note || "",
              kind: "pass_to_recruiter",
              meta: { jdId: jd._id.toString(), jdTitle: jd.title, bulk: true },
            });
          }

          await doc.save();
          return { studentId: student._id, name: student.name, ok: true };
        } catch (err) {
          return {
            studentId: id,
            name: student.name,
            ok: false,
            reason: err.message,
          };
        }
      })
    );

    const succeeded = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    events.emitSafe("placement.bulkAction", {
      collegeId: req.user.collegeId.toString(),
      action,
      succeeded: succeeded.length,
      failed: failed.length,
      jdId: jd?._id?.toString(),
    });

    res.json({
      action,
      requested: studentIds.length,
      succeeded: succeeded.length,
      failed: failed.length,
      results,
      jd: jd ? { _id: jd._id, title: jd.title } : null,
    });
  })
);

// ---------------------------------------------------------------------------
// GET /api/placement-cell/integrity-flags
// ---------------------------------------------------------------------------

/**
 * Signals for the placement cell to review — duplicate resumes and interview
 * integrity flags. Non-punitive by design: nothing here has changed a status,
 * score or visibility, and the endpoint's own copy says so.
 */
router.get(
  "/integrity-flags",
  asyncHandler(async (req, res) => {
    const flags = await IntegrityFlag.find(
      scopeQueryToCollege(req.user, { acknowledged: { $ne: true } })
    )
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("studentUserId", "name email")
      .populate("relatedUserId", "name email")
      .lean();

    // Interview flags live on the session rather than the IntegrityFlag
    // collection (they belong to a transcript), so surface a summary count of
    // students with flagged sessions too.
    const flaggedSessions = await InterviewSession.aggregate([
      { $match: { collegeId: req.user.collegeId, "integrityFlags.0": { $exists: true } } },
      { $group: { _id: "$userId", sessions: { $sum: 1 }, flags: { $sum: { $size: "$integrityFlags" } } } },
    ]);

    const flaggedUserIds = flaggedSessions.map((s) => s._id);
    const flaggedUsers = flaggedUserIds.length
      ? await User.find({ _id: { $in: flaggedUserIds } }).select("name email").lean()
      : [];
    const userById = new Map(flaggedUsers.map((u) => [u._id.toString(), u]));

    res.json({
      flags: flags.map((f) => ({
        _id: f._id,
        kind: f.kind,
        summary: f.summary,
        detail: f.detail,
        createdAt: f.createdAt,
        student: f.studentUserId
          ? { _id: f.studentUserId._id, name: f.studentUserId.name, email: f.studentUserId.email }
          : null,
        related: f.relatedUserId
          ? { _id: f.relatedUserId._id, name: f.relatedUserId.name, email: f.relatedUserId.email }
          : null,
      })),
      interviewFlags: flaggedSessions.map((s) => ({
        student: userById.get(s._id.toString())
          ? {
            _id: userById.get(s._id.toString())._id,
            name: userById.get(s._id.toString()).name,
          }
          : null,
        sessionCount: s.sessions,
        flagCount: s.flags,
      })),
      note: "These signals are informational. They never change a student's status, score or visibility — a human decides what, if anything, to do.",
    });
  })
);

router.patch(
  "/integrity-flags/:id/acknowledge",
  asyncHandler(async (req, res) => {
    const id = objectIdSchema.parse(req.params.id);

    const flag = await IntegrityFlag.findOne(
      scopeQueryToCollege(req.user, { _id: id })
    );
    if (!flag) throw ApiError.notFound("Flag not found in your college");

    flag.acknowledged = true;
    flag.acknowledgedBy = req.user._id;
    flag.acknowledgedAt = new Date();
    await flag.save();

    res.json({ flag });
  })
);

// ---------------------------------------------------------------------------
// GET /api/placement-cell/students/:id/review — the pre-pass decision view
// ---------------------------------------------------------------------------

/**
 * Everything a placement cell needs BEFORE passing a student to a recruiter.
 *
 * The cell was previously asked to approve a name and an email. This returns
 * the resume itself, the readiness for the specific role being considered, the
 * ATS detail behind it, integrity signals, and an explicit list of warnings —
 * "readiness not calculated for this role", "no resume uploaded", "consent
 * withdrawn" — so the decision is informed rather than blind.
 *
 * Pass `?jdId=` to see readiness for THAT role. Without it, the student's
 * latest score across any role is shown and the warning list says so.
 */
router.get(
  "/students/:id/review",
  asyncHandler(async (req, res) => {
    const id = objectIdSchema.parse(req.params.id);
    const jdId = req.query.jdId ? objectIdSchema.parse(req.query.jdId) : null;

    // Scoped: a student from another college is a 404, not a 403.
    const student = await User.findOne(
      scopeQueryToCollege(req.user, { _id: id, role: "student" })
    )
      .select("_id")
      .lean();
    if (!student) throw ApiError.notFound("Student not found in your college");

    // If a role is named, it must be in this college's pipeline — a cell must
    // not be able to probe readiness against another institution's posting.
    let jd = null;
    if (jdId) {
      jd = await JobDescription.findOne(
        scopeQueryToCollege(req.user, { _id: jdId })
      )
        .select("title company parsed.requiredSkills")
        .lean();
      if (!jd) throw ApiError.notFound("That role is not in your college's pipeline.");
    }

    const profile = await buildCandidateProfile(id, { jdId });
    if (!profile) throw ApiError.notFound("Student not found");

    res.json({
      ...profile,
      // The role the review was run against, so the UI can label the score.
      reviewRole: jd
        ? {
            _id: jd._id,
            title: jd.title,
            company: jd.company,
            requiredSkills: (jd.parsed?.requiredSkills || []).map((s) => s.label || s.name),
          }
        : null,
    });
  })
);

// ---------------------------------------------------------------------------
// GET /api/placement-cell/pipeline — recruiter JDs open to THIS college
// ---------------------------------------------------------------------------

/**
 * The roles a placement cell can pass students into.
 *
 * This is NOT /api/jd (which returns the CALLER's own JDs). A placement cell
 * owns no JDs, so the pass modal read an empty list and told the cell "no
 * recruiter roles are open to your college yet" even when a recruiter had
 * plainly posted one. The roles a cell works with belong to RECRUITERS and are
 * stamped with the cell's own collegeId — so that is the query.
 *
 * Scoped by collegeId at the database layer like every other cell route: a cell
 * can never pass a student into another institution's pipeline.
 */
router.get(
  "/pipeline",
  asyncHandler(async (req, res) => {
    const jds = await JobDescription.find(
      scopeQueryToCollege(req.user, { status: { $ne: "closed" } })
    )
      .sort({ createdAt: -1 })
      .select("title company location experienceLevel parsed.requiredSkills status createdAt collegeId ownerUserId")
      .populate("ownerUserId", "name")
      .lean();

    // How many students this cell has already passed into each role, and how
    // the recruiter has since decided on them — the funnel a cell actually acts
    // on. One aggregation rather than a per-role query.
    const passStats = await RecruiterPass.aggregate([
      { $match: { jdId: { $in: jds.map((j) => j._id) } } },
      {
        $group: {
          _id: "$jdId",
          count: { $sum: 1 },
          shortlisted: {
            $sum: { $cond: [{ $eq: ["$recruiterDecision", "shortlisted"] }, 1, 0] },
          },
          rejected: {
            $sum: { $cond: [{ $eq: ["$recruiterDecision", "rejected"] }, 1, 0] },
          },
        },
      },
    ]);
    const byJd = new Map(passStats.map((p) => [p._id.toString(), p]));

    res.json({
      jds: jds.map((j) => {
        const stats = byJd.get(j._id.toString());
        return {
          _id: j._id,
          title: j.title,
          company: j.company,
          location: j.location,
          experienceLevel: j.experienceLevel,
          status: j.status,
          createdAt: j.createdAt,
          // A student-owned exploratory JD never has a collegeId, so it can never
          // appear here — the query above already guarantees that.
          collegeId: j.collegeId,
          recruiter: j.ownerUserId?.name || "Recruiter",
          requiredSkills: (j.parsed?.requiredSkills || []).map((s) => s.label || s.name),
          passedCount: stats?.count || 0,
          shortlisted: stats?.shortlisted || 0,
          rejected: stats?.rejected || 0,
        };
      }),
    });
  })
);

// ---------------------------------------------------------------------------
// GET /api/placement-cell/pipeline/:jdId/candidates — who was passed, and where
// ---------------------------------------------------------------------------

/**
 * The students this cell has passed into ONE role, with the recruiter's decision
 * on each. This is the placement-side view of a role's pipeline — the same
 * people the recruiter sees, plus the decision status, so a cell can tell who is
 * still waiting rather than only how many.
 */
router.get(
  "/pipeline/:jdId/candidates",
  asyncHandler(async (req, res) => {
    const jdId = objectIdSchema.parse(req.params.jdId);

    // The role must be in this college's pipeline — scoped at the query layer.
    const jd = await JobDescription.findOne(
      scopeQueryToCollege(req.user, { _id: jdId })
    )
      .select("title company")
      .lean();
    if (!jd) throw ApiError.notFound("That role is not in your college's pipeline.");

    const passes = await RecruiterPass.find({ jdId: jd._id }).lean();
    if (!passes.length) return res.json({ jd, candidates: [] });

    const studentIds = passes.map((p) => p.studentUserId);
    const [students, readiness, statuses] = await Promise.all([
      User.find({ _id: { $in: studentIds } }).select("name email consent").lean(),
      ReadinessScore.aggregate([
        { $match: { userId: { $in: studentIds }, jdId: jd._id } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: "$userId", composite: { $first: "$composite" } } },
      ]),
      PlacementStatus.find({ studentUserId: { $in: studentIds } }).lean(),
    ]);

    const byUser = new Map(students.map((s) => [s._id.toString(), s]));
    const readinessByUser = new Map(readiness.map((r) => [r._id.toString(), r.composite]));
    const statusByUser = new Map(statuses.map((s) => [s.studentUserId.toString(), s]));

    const candidates = passes
      .map((p) => {
        const s = byUser.get(p.studentUserId.toString());
        if (!s) return null;
        const st = statusByUser.get(p.studentUserId.toString());
        return {
          _id: s._id,
          name: s.name,
          email: s.email,
          readiness: readinessByUser.get(s._id.toString()) ?? null,
          status: st?.status || "not_reviewed",
          tags: st?.trainingTags || [],
          decision: p.recruiterDecision || "none",
          passNote: p.note || "",
          passedAt: p.createdAt,
          consent: s.consent,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b.readiness ?? -1) - (a.readiness ?? -1));

    res.json({ jd, candidates });
  })
);

// ---------------------------------------------------------------------------
// GET /api/placement-cell/training — the Training workspace
// ---------------------------------------------------------------------------

/**
 * Everything the Training page needs in one request: the tag vocabulary in use
 * across the college, who carries each tag, and which students still have no
 * training assignment (the group a cell most needs to act on).
 *
 * College-scoped through scopeQueryToCollege like every other cell query.
 */
router.get(
  "/training",
  asyncHandler(async (req, res) => {
    const scope = scopeQueryToCollege(req.user, { role: "student" });
    const students = await User.find(scope).select("_id name email").lean();
    const ids = students.map((s) => s._id);
    const byId = new Map(students.map((s) => [s._id.toString(), s]));

    if (!ids.length) {
      return res.json({ empty: true, tags: [], students: [], untagged: [] });
    }

    const [statuses, readiness, resumes] = await Promise.all([
      PlacementStatus.find({ studentUserId: { $in: ids } }).lean(),
      ReadinessScore.aggregate([
        { $match: { userId: { $in: ids } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: "$userId", composite: { $first: "$composite" } } },
      ]),
      Resume.aggregate([
        { $match: { userId: { $in: ids } } },
        { $sort: { updatedAt: -1 } },
        { $group: { _id: "$userId", updatedAt: { $first: "$updatedAt" } } },
      ]),
    ]);

    const statusById = new Map(statuses.map((s) => [s.studentUserId.toString(), s]));
    const readinessById = new Map(readiness.map((r) => [r._id.toString(), r.composite]));
    const resumeById = new Map(resumes.map((r) => [r._id.toString(), r.updatedAt]));

    const shaped = students.map((s) => {
      const sid = s._id.toString();
      const st = statusById.get(sid);
      return {
        _id: s._id,
        name: s.name,
        email: s.email,
        status: st?.status || "not_reviewed",
        tags: st?.trainingTags || [],
        readiness: readinessById.get(sid) ?? null,
        resumeUpdatedAt: resumeById.get(sid) || null,
      };
    });

    // Tag vocabulary with the cohort behind each tag. This is the cell's real
    // "training needs report" — what the college is actually running.
    const tagMap = new Map();
    for (const s of shaped) {
      for (const t of s.tags) {
        if (!tagMap.has(t)) tagMap.set(t, { tag: t, students: [] });
        tagMap.get(t).students.push({ _id: s._id, name: s.name, readiness: s.readiness });
      }
    }

    const tags = [...tagMap.values()]
      .map((t) => ({
        ...t,
        count: t.students.length,
        avgReadiness: t.students.filter((x) => x.readiness != null).length
          ? Math.round(
              t.students
                .filter((x) => x.readiness != null)
                .reduce((a, x) => a + x.readiness, 0) /
                t.students.filter((x) => x.readiness != null).length
            )
          : null,
      }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

    res.json({
      empty: false,
      tags,
      students: shaped,
      // Students nobody has assigned training to yet — the actionable gap.
      untagged: shaped
        .filter((s) => s.tags.length === 0)
        .map((s) => ({ _id: s._id, name: s.name, readiness: s.readiness })),
      totals: {
        students: shaped.length,
        tagged: shaped.filter((s) => s.tags.length > 0).length,
        tags: tags.length,
      },
    });
  })
);

// ---------------------------------------------------------------------------
// GET /api/placement-cell/analytics
// ---------------------------------------------------------------------------
router.get(
  "/analytics",
  asyncHandler(async (req, res) => {
    const scope = scopeQueryToCollege(req.user, { role: "student" });
    const students = await User.find(scope).select("_id").lean();
    const ids = students.map((s) => s._id);

    if (!ids.length) {
      return res.json({ empty: true, totals: { students: 0 } });
    }

    const maps = await enrichStudents(ids);
    const shaped = students.map((s) => shapeStudent(s, maps));
    const scored = shaped.filter((s) => s.readiness != null);

    const buckets = [
      { label: "0–39", min: 0, max: 39, count: 0 },
      { label: "40–59", min: 40, max: 59, count: 0 },
      { label: "60–79", min: 60, max: 79, count: 0 },
      { label: "80–100", min: 80, max: 100, count: 0 },
    ];
    for (const s of scored) {
      const b = buckets.find((x) => s.readiness >= x.min && s.readiness <= x.max);
      if (b) b.count += 1;
    }

    // Common skill gaps across the cohort — the training-needs report.
    // Counted from the FULL missing list, not the truncated top-3 shown in the
    // table, otherwise a cohort's most common gap could be invisible simply
    // because it was ranked fourth for every individual student.
    const gapCounts = new Map();
    for (const s of shaped) {
      for (const skill of s.allMissingSkills || s.missingSkills) {
        gapCounts.set(skill, (gapCounts.get(skill) || 0) + 1);
      }
    }

    const trainingCounts = new Map();
    for (const s of shaped) {
      for (const tag of s.trainingTags) {
        trainingCounts.set(tag, (trainingCounts.get(tag) || 0) + 1);
      }
    }

    // Named bands, same vocabulary as the readiness ring, so the placement cell
    // and the student describe the same number the same way.
    const bandCounts = new Map();
    for (const s of scored) {
      const band = readinessBand(s.readiness);
      bandCounts.set(band.key, (bandCounts.get(band.key) || 0) + 1);
    }

    res.json({
      empty: false,
      totals: {
        students: shaped.length,
        scored: scored.length,
        unscored: shaped.length - scored.length,
        averageReadiness: scored.length
          ? Math.round(scored.reduce((a, s) => a + s.readiness, 0) / scored.length)
          : 0,
        medianReadiness: (() => {
          if (!scored.length) return 0;
          const sorted = scored.map((s) => s.readiness).sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2
            ? sorted[mid]
            : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
        })(),
        passedToRecruiters: shaped.filter((s) => s.passedCount > 0).length,
        needsAttention: shaped.filter(
          (s) => s.status === "needs_improvement" || s.status === "critical"
        ).length,
      },
      distribution: buckets,
      bands: ["excellent", "strong", "developing", "early"].map((key) => ({
        key,
        label: readinessBand(key === "excellent" ? 80 : key === "strong" ? 65 : key === "developing" ? 45 : 0).label,
        count: bandCounts.get(key) || 0,
      })),
      topGaps: [...gapCounts.entries()]
        .map(([skill, count]) => ({ skill, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      statusCounts: STATUSES.map((s) => ({
        status: s,
        count: shaped.filter((x) => x.status === s).length,
      })),
      trainingTags: [...trainingCounts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    });
  })
);

module.exports = router;
