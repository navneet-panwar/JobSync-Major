const express = require("express");
const { z } = require("zod");
const mongoose = require("mongoose");

const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRole } = require("../shared/auth/requireAuth");
const { scopeQueryToCollege } = require("../shared/collegeScope");
const { validate } = require("../middleware/validate");

const User = require("../shared/auth/User");
const College = require("../shared/auth/College");
const PlacementStatus = require("../models/PlacementStatus");
const ReadinessScore = require("../models/ReadinessScore");
const StudentRoleProfile = require("../models/StudentRoleProfile");
const RolePosting = require("../models/RolePosting");
const JobDescription = require("../models/JobDescription");
const Notification = require("../models/Notification");
const { notify, notifyMany } = require("../services/notificationService");
const { normalizeRoleKey, roleLabelFromKey } = require("../services/roleExtract");
const { bulkQueue } = require("../shared/queue");
const events = require("../shared/events");

const router = express.Router();

const objectIdSchema = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), { message: "Invalid id" });

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Every role key the college knows about, with counts for the two SOURCES kept
 * separate. This is what powers the role filter bar: the cell sees "Backend
 * Engineer — 12 by resume · 5 interested" rather than one blended number.
 */
async function buildRoleIndex(collegeId) {
  const [resumeAgg, interestAgg, postings] = await Promise.all([
    StudentRoleProfile.aggregate([
      { $match: { collegeId } },
      { $unwind: "$resumeRoles" },
      {
        $group: {
          _id: "$resumeRoles.key",
          label: { $first: "$resumeRoles.label" },
          students: { $addToSet: "$studentUserId" },
          avgConfidence: { $avg: "$resumeRoles.confidence" },
        },
      },
    ]),
    StudentRoleProfile.aggregate([
      { $match: { collegeId } },
      { $unwind: "$interestedRoles" },
      { $match: { "interestedRoles.response": "interested" } },
      {
        $group: {
          _id: "$interestedRoles.key",
          label: { $first: "$interestedRoles.label" },
          students: { $addToSet: "$studentUserId" },
        },
      },
    ]),
    RolePosting.find({ collegeId })
      .select("title roleKey roleLabel status createdAt notifiedCount responses")
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const index = new Map();

  const ensure = (key, label) => {
    if (!index.has(key)) {
      index.set(key, {
        key,
        label: label || roleLabelFromKey(key),
        resumeCount: 0,
        interestedCount: 0,
        postings: [],
      });
    }
    return index.get(key);
  };

  for (const r of resumeAgg) {
    if (!r._id) continue;
    const entry = ensure(r._id, r.label);
    entry.resumeCount = r.students.length;
    entry.avgConfidence = r.avgConfidence ? Math.round(r.avgConfidence) : null;
  }

  for (const r of interestAgg) {
    if (!r._id) continue;
    const entry = ensure(r._id, r.label);
    entry.interestedCount = r.students.length;
  }

  for (const p of postings) {
    const entry = ensure(p.roleKey, p.roleLabel);
    entry.postings.push({
      _id: p._id,
      title: p.title,
      status: p.status,
      createdAt: p.createdAt,
      notifiedCount: p.notifiedCount || 0,
      interested: (p.responses || []).filter((x) => x.response === "interested").length,
      declined: (p.responses || []).filter((x) => x.response === "not_interested").length,
    });
  }

  return [...index.values()].sort(
    (a, b) =>
      b.resumeCount + b.interestedCount - (a.resumeCount + a.interestedCount) ||
      a.label.localeCompare(b.label)
  );
}

/**
 * Students matching a role, in the two separate buckets the cell asked for.
 *
 *   source=resume     → students whose RESUME implies this role
 *   source=interested → students who tapped "Interested" on a posting for it
 *   source=both       → everyone in either bucket, each row labelled with which
 *
 * Never merged into one anonymous list: a row always says WHY it is here.
 */
async function studentsForRole({ collegeId, roleKey, source = "both" }) {
  const profileFilter = {
    collegeId,
    ...(source === "resume"
      ? { "resumeRoles.key": roleKey }
      : source === "interested"
        ? { "interestedRoles.key": roleKey, "interestedRoles.response": "interested" }
        : {
          $or: [
            { "resumeRoles.key": roleKey },
            { "interestedRoles.key": roleKey, "interestedRoles.response": "interested" },
          ],
        }),
  };

  const profiles = await StudentRoleProfile.find(profileFilter).lean();
  if (!profiles.length) return { students: [], profileById: new Map() };

  const ids = profiles.map((p) => p.studentUserId);
  const profileById = new Map(profiles.map((p) => [p.studentUserId.toString(), p]));

  const [users, readiness, statuses, passes, postings] = await Promise.all([
    User.find({ _id: { $in: ids }, role: "student" })
      .select("name email createdAt consent")
      .lean(),
    ReadinessScore.aggregate([
      { $match: { userId: { $in: ids } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$userId", composite: { $first: "$composite" } } },
    ]),
    PlacementStatus.find({ studentUserId: { $in: ids } }).lean(),
    require("../models/RecruiterPass").aggregate([
      { $match: { studentUserId: { $in: ids } } },
      { $group: { _id: "$studentUserId", count: { $sum: 1 } } },
    ]),
    RolePosting.find({ collegeId, roleKey }).select("title responses").lean(),
  ]);

  const readinessByUser = new Map(readiness.map((r) => [r._id.toString(), r.composite]));
  const statusByUser = new Map(statuses.map((s) => [s.studentUserId.toString(), s]));
  const passByUser = new Map(passes.map((p) => [p._id.toString(), p.count]));

  // Which postings each student opted into for THIS role — the "who wants it".
  const interestByUser = new Map();
  for (const p of postings) {
    for (const r of p.responses || []) {
      if (r.response !== "interested") continue;
      const sid = r.studentUserId.toString();
      if (!interestByUser.has(sid)) interestByUser.set(sid, []);
      interestByUser.get(sid).push({ postingId: p._id, title: p.title, at: r.at });
    }
  }

  const students = users
    .map((u) => {
      const sid = u._id.toString();
      const profile = profileById.get(sid);
      const resumeRole = (profile?.resumeRoles || []).find((r) => r.key === roleKey);
      const interestRole = (profile?.interestedRoles || []).find(
        (r) => r.key === roleKey && r.response === "interested"
      );
      const st = statusByUser.get(sid);

      const sources = [];
      if (resumeRole) sources.push("resume");
      if (interestRole) sources.push("interested");

      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        consent: u.consent,
        // The two signals, always distinguishable on the row.
        fromResume: Boolean(resumeRole),
        resumeConfidence: resumeRole?.confidence ?? null,
        resumeEvidence: resumeRole?.evidence || "",
        interested: Boolean(interestRole),
        interestAt: interestRole?.at || null,
        interestPostings: interestByUser.get(sid) || [],
        sources,
        readiness: readinessByUser.get(sid) ?? null,
        status: st?.status || "not_reviewed",
        // Tags travel with the student so the cell sees them alongside the
        // profile here too, not only in the main cohort table.
        tags: st?.trainingTags || [],
        passedCount: passByUser.get(sid) || 0,
      };
    })
    // A resume-implied student with no opt-in sorts below one who opted in —
    // stated intent outranks inference when a cell is filling a drive.
    .sort(
      (a, b) =>
        Number(b.interested) - Number(a.interested) ||
        (b.readiness ?? -1) - (a.readiness ?? -1)
    );

  return { students, profileById };
}

// ---------------------------------------------------------------------------
// Placement-cell routes
// ---------------------------------------------------------------------------
const cellRouter = express.Router();
cellRouter.use(requireAuth, requireRole("placement_cell", "admin"));

/** GET /api/placement-cell/roles — the role index (filter bar data). */
cellRouter.get(
  "/roles",
  asyncHandler(async (req, res) => {
    const roles = await buildRoleIndex(req.user.collegeId);
    res.json({ roles });
  })
);

/** GET /api/placement-cell/roles/:roleKey/students?source= */
cellRouter.get(
  "/roles/:roleKey/students",
  validate(
    z.object({
      source: z.enum(["resume", "interested", "both"]).default("both"),
    }),
    "query"
  ),
  asyncHandler(async (req, res) => {
    const roleKey = normalizeRoleKey(decodeURIComponent(req.params.roleKey));
    if (!roleKey) throw ApiError.badRequest("A role is required");

    const { source } = req.query;
    const { students } = await studentsForRole({
      collegeId: req.user.collegeId,
      roleKey,
      source,
    });

    const college = await College.findById(req.user.collegeId).select("name").lean();

    res.json({
      role: { key: roleKey, label: roleLabelFromKey(roleKey) },
      source,
      college: college ? { name: college.name } : null,
      students,
      counts: {
        resume: students.filter((s) => s.fromResume).length,
        interested: students.filter((s) => s.interested).length,
        total: students.length,
      },
    });
  })
);

/** GET /api/placement-cell/roles/postings — the cell's own role postings. */
cellRouter.get(
  "/roles/postings",
  asyncHandler(async (req, res) => {
    const postings = await RolePosting.find(scopeQueryToCollege(req.user, {}))
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      postings: postings.map((p) => ({
        ...p,
        interested: (p.responses || []).filter((x) => x.response === "interested").length,
        declined: (p.responses || []).filter((x) => x.response === "not_interested").length,
      })),
    });
  })
);

const createPostingSchema = z.object({
  title: z.string().trim().min(2).max(140),
  // Free-text role. A new role key is created automatically — that is the
  // whole point: a cell should not have to pre-register a role to use it.
  role: z.string().trim().min(2).max(80).optional(),
  company: z.string().trim().max(140).optional(),
  location: z.string().trim().max(140).optional(),
  description: z.string().trim().max(4000).optional(),
  jdId: objectIdSchema.optional(),
  // Who to notify: every student in the college by default, or a subset.
  studentIds: z.array(objectIdSchema).max(500).optional(),
});

/**
 * POST /api/placement-cell/roles/postings — post a role to the college and
 * notify students, who answer interested / not_interested.
 *
 * "parse + wait": the notification is written for every target student first
 * (cheap, in-app), and any role that did not exist before is created here. The
 * response list fills in as students answer.
 */
cellRouter.post(
  "/roles/postings",
  validate(createPostingSchema),
  asyncHandler(async (req, res) => {
    const { title, role, company, location, description, jdId, studentIds } = req.body;

    // The role key comes from the explicit `role`, falling back to the title.
    // Either way a brand-new role is created on the fly.
    const roleKey = normalizeRoleKey(role || title);
    if (!roleKey) throw ApiError.badRequest("A role could not be derived from that title.");

    let jd = null;
    if (jdId) {
      jd = await JobDescription.findOne({ _id: jdId, collegeId: req.user.collegeId }).lean();
      if (!jd) throw ApiError.notFound("That job description is not in your college's pipeline.");
    }

    // Was this role already known to the college (resume or interest)? If not,
    // this posting introduces it — flagged so the UI can say so honestly.
    const known =
      (await StudentRoleProfile.countDocuments({ collegeId: req.user.collegeId, "resumeRoles.key": roleKey })) ||
      (await StudentRoleProfile.countDocuments({
        collegeId: req.user.collegeId,
        "interestedRoles.key": roleKey,
      })) ||
      (await RolePosting.countDocuments({ collegeId: req.user.collegeId, roleKey }));

    const posting = await RolePosting.create({
      collegeId: req.user.collegeId,
      createdBy: req.user._id,
      createdByName: req.user.name,
      title,
      company: company || jd?.company || "",
      location: location || jd?.location || "",
      description: description || jd?.parsed?.summary || "",
      roleKey,
      roleLabel: roleLabelFromKey(roleKey),
      roleIsNew: !known,
      jdId: jd?._id || null,
      skills: (jd?.parsed?.requiredSkills || []).slice(0, 12).map((s) => s.label || s.name),
    });

    // Resolve recipients: the chosen subset, or the whole college.
    const studentFilter = scopeQueryToCollege(req.user, { role: "student" });
    if (studentIds?.length) studentFilter._id = { $in: studentIds };

    const students = await User.find(studentFilter).select("name _id").lean();

    const body = [
      `${req.user.name} from your placement cell posted a role: ${title}.`,
      company ? `Company: ${company}` : "",
      location ? `Location: ${location}` : "",
      posting.skills.length ? `Skills: ${posting.skills.join(", ")}` : "",
      "",
      "Are you interested? Open the role in JobSync and answer — the placement cell sees who opted in.",
    ]
      .filter(Boolean)
      .join("\n");

    await bulkQueue.add(() =>
      notifyMany(
        students.map((s) => ({
          toUserId: s._id,
          type: "system",
          title: `New role posted: ${title}`,
          body,
          meta: {
            rolePostingId: posting._id.toString(),
            roleKey,
            roleLabel: posting.roleLabel,
            cta: "role_interest",
          },
          from: { _id: req.user._id, name: req.user.name },
          ctaUrl: "/roles",
          ctaLabel: "View role & respond",
        }))
      )
    );

    posting.notifiedCount = students.length;
    await posting.save();

    events.emitSafe("placement.rolePosted", {
      collegeId: req.user.collegeId.toString(),
      postingId: posting._id.toString(),
      roleKey,
      roleIsNew: posting.roleIsNew,
      notified: students.length,
    });

    res.status(201).json({
      posting: { ...posting.toObject(), interested: 0, declined: 0 },
      notified: students.length,
      roleIsNew: posting.roleIsNew,
      role: { key: roleKey, label: posting.roleLabel },
    });
  })
);

/** PATCH /api/placement-cell/roles/postings/:id — close/reopen a posting. */
cellRouter.patch(
  "/roles/postings/:id",
  validate(z.object({ status: z.enum(["open", "closed"]) })),
  asyncHandler(async (req, res) => {
    const posting = await RolePosting.findOne(
      scopeQueryToCollege(req.user, { _id: req.params.id })
    );
    if (!posting) throw ApiError.notFound("Posting not found in your college");

    posting.status = req.body.status;
    await posting.save();
    res.json({ posting });
  })
);

/** GET /api/placement-cell/roles/postings/:id — who responded, and how. */
cellRouter.get(
  "/roles/postings/:id",
  asyncHandler(async (req, res) => {
    const posting = await RolePosting.findOne(
      scopeQueryToCollege(req.user, { _id: req.params.id })
    ).lean();
    if (!posting) throw ApiError.notFound("Posting not found in your college");

    const ids = (posting.responses || []).map((r) => r.studentUserId);
    const users = ids.length
      ? await User.find({ _id: { $in: ids } }).select("name email").lean()
      : [];
    const byId = new Map(users.map((u) => [u._id.toString(), u]));

    res.json({
      posting: {
        ...posting,
        responses: (posting.responses || []).map((r) => ({
          student: byId.get(r.studentUserId.toString())
            ? {
              _id: byId.get(r.studentUserId.toString())._id,
              name: byId.get(r.studentUserId.toString()).name,
              email: byId.get(r.studentUserId.toString()).email,
            }
            : null,
          response: r.response,
          at: r.at,
        })),
      },
    });
  })
);

// ---------------------------------------------------------------------------
// Student-facing routes — the "interested / not" answer
// ---------------------------------------------------------------------------
const studentRouter = express.Router();
studentRouter.use(requireAuth, requireRole("student"));

/**
 * GET /api/placement-cell/roles/my-postings — open roles for the student's own
 * college, with their own answer already applied.
 */
studentRouter.get(
  "/roles/my-postings",
  asyncHandler(async (req, res) => {
    if (!req.user.collegeId) {
      return res.json({ postings: [], college: null });
    }

    const postings = await RolePosting.find({
      collegeId: req.user.collegeId,
      status: "open",
    })
      .sort({ createdAt: -1 })
      .lean();

    const mine = await StudentRoleProfile.findOne({
      studentUserId: req.user._id,
    }).lean();

    const myResponses = new Map();
    for (const p of postings) {
      const r = (p.responses || []).find(
        (x) => x.studentUserId.toString() === req.user._id.toString()
      );
      if (r) myResponses.set(p._id.toString(), r.response);
    }

    res.json({
      postings: postings.map((p) => ({
        _id: p._id,
        title: p.title,
        company: p.company,
        location: p.location,
        description: p.description,
        roleKey: p.roleKey,
        roleLabel: p.roleLabel,
        skills: p.skills,
        createdAt: p.createdAt,
        myResponse: myResponses.get(p._id.toString()) || null,
      })),
      myRoles: {
        resumeRoles: mine?.resumeRoles || [],
        interestedRoles: mine?.interestedRoles || [],
      },
    });
  })
);

const respondSchema = z.object({
  response: z.enum(["interested", "not_interested"]),
});

/**
 * POST /api/placement-cell/roles/postings/:id/respond
 *
 * Records the student's answer on the posting AND, when interested, on their
 * own role profile's `interestedRoles` — never touching `resumeRoles`, which is
 * a separate signal derived from the resume.
 */
studentRouter.post(
  "/roles/postings/:id/respond",
  validate(respondSchema),
  asyncHandler(async (req, res) => {
    const { response } = req.body;

    if (!req.user.collegeId) {
      throw ApiError.forbidden("Your account is not linked to a college.");
    }

    const posting = await RolePosting.findOne({
      _id: req.params.id,
      collegeId: req.user.collegeId,
      status: "open",
    });
    if (!posting) throw ApiError.notFound("That role is not open for your college.");

    // One answer per student per posting — update in place rather than
    // appending, so a change of mind does not double-count.
    const existing = posting.responses.find(
      (r) => r.studentUserId.toString() === req.user._id.toString()
    );
    if (existing) {
      existing.response = response;
      existing.at = new Date();
    } else {
      posting.responses.push({
        studentUserId: req.user._id,
        response,
        at: new Date(),
      });
    }
    await posting.save();

    // The interest list mirrors the answer: interested adds/updates the role,
    // not_interested removes it. The resume list is untouched.
    let profile = await StudentRoleProfile.findOne({ studentUserId: req.user._id });
    if (!profile) {
      profile = new StudentRoleProfile({
        studentUserId: req.user._id,
        collegeId: req.user.collegeId,
      });
    }

    const idx = profile.interestedRoles.findIndex(
      (r) => r.postingId?.toString() === posting._id.toString()
    );

    if (response === "interested") {
      const entry = {
        key: posting.roleKey,
        label: posting.roleLabel,
        confidence: null,
        evidence: `Opted in to "${posting.title}"`,
        source: "interest",
        postingId: posting._id,
        response: "interested",
        at: new Date(),
      };
      if (idx >= 0) profile.interestedRoles[idx] = entry;
      else profile.interestedRoles.push(entry);
    } else if (idx >= 0) {
      profile.interestedRoles.splice(idx, 1);
    }

    profile.collegeId = req.user.collegeId;
    await profile.save();

    // Tell the cell — the whole point of the opt-in is that it is visible.
    await notify({
      toCollegeId: req.user.collegeId,
      toRole: "placement_cell",
      type: "system",
      title:
        response === "interested"
          ? `${req.user.name} is interested — ${posting.title}`
          : `${req.user.name} declined — ${posting.title}`,
      body:
        response === "interested"
          ? `${req.user.name} opted in for the ${posting.roleLabel} role. They now appear under that role's "Interested" list.`
          : `${req.user.name} answered not interested for ${posting.roleLabel}.`,
      meta: {
        rolePostingId: posting._id.toString(),
        roleKey: posting.roleKey,
        studentUserId: req.user._id.toString(),
        response,
      },
      from: { _id: req.user._id, name: req.user.name },
      ctaUrl: `/placement/roles/${posting.roleKey}`,
      ctaLabel: "See who's interested",
    });

    events.emitSafe("student.roleInterest", {
      studentUserId: req.user._id.toString(),
      collegeId: req.user.collegeId.toString(),
      roleKey: posting.roleKey,
      response,
    });

    res.json({
      ok: true,
      response,
      role: { key: posting.roleKey, label: posting.roleLabel },
    });
  })
);

/** GET /api/placement-cell/roles/my-roles — the student's own role picture. */
studentRouter.get(
  "/roles/my-roles",
  asyncHandler(async (req, res) => {
    const profile = await StudentRoleProfile.findOne({
      studentUserId: req.user._id,
    }).lean();

    res.json({
      resumeRoles: profile?.resumeRoles || [],
      interestedRoles: profile?.interestedRoles || [],
      resumeRolesUpdatedAt: profile?.resumeRolesUpdatedAt || null,
    });
  })
);

// ---------------------------------------------------------------------------
// Unread role-interest notifications count (used by the student nav badge)
// ---------------------------------------------------------------------------
router.get(
  "/unread-count",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user.collegeId || req.user.role !== "student") {
      return res.json({ count: 0 });
    }
    const count = await Notification.countDocuments({
      toUserId: req.user._id,
      read: false,
      "meta.cta": "role_interest",
    });
    res.json({ count });
  })
);

// Mount both role-scoped sub-routers on DISTINCT prefixes.
//
// They cannot share a prefix: each begins with requireRole(...), and an
// Express router that rejects calls next(err) rather than falling through to
// the next router — so a student request would be stopped dead by the
// placement-cell gate before ever reaching its own routes.
router.use("/cell", cellRouter);
router.use("/me", studentRouter);

module.exports = router;