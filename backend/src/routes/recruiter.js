const express = require("express");
const { z } = require("zod");
const mongoose = require("mongoose");

const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRole } = require("../shared/auth/requireAuth");
const { validate } = require("../middleware/validate");
const { analyzeLimiter } = require("../middleware/rateLimit");

const JobDescription = require("../models/JobDescription");
const RecruiterPass = require("../models/RecruiterPass");
const ReadinessScore = require("../models/ReadinessScore");
const PlacementStatus = require("../models/PlacementStatus");
const User = require("../shared/auth/User");
const College = require("../shared/auth/College");

const { parseJobDescription, contentHash } = require("../services/jdParser");
const { extractText } = require("../services/pdfService");
const { uploadPdf } = require("../middleware/upload");
const { buildCandidateProfile } = require("../services/candidateProfile");
const events = require("../shared/events");

const router = express.Router();
router.use(requireAuth, requireRole("recruiter"));

const objectIdSchema = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), { message: "Invalid id" });

// ---------------------------------------------------------------------------
// Job descriptions — a recruiter's own postings
// ---------------------------------------------------------------------------

/**
 * A recruiter's JD must be attributed to a college to be gatekeepable: the
 * placement cell of THAT college is who passes students in. Real recruiters
 * hire from many campuses, so a posting can be opened to several colleges.
 * We model the MVP as one college per posting (scope §6 sets the college tag as
 * the unit recruiters work with) and note multi-college as future work.
 */
const createJdSchema = z.object({
  rawText: z.string().trim().min(40).max(20000),
  title: z.string().trim().max(140).optional(),
  collegeId: objectIdSchema,
});

/**
 * The shared create path for both paste and file upload.
 *
 * Extracted so a dropped PDF and a pasted posting go through EXACTLY the same
 * validation, de-duplication and parsing — a second copy of this logic would
 * drift, and the duplicate-check in particular is easy to forget in a copy.
 */
async function createRecruiterJd(req, res, rawText, { title, collegeId }) {
  const college = await College.findOne({ _id: collegeId, isActive: true });
  if (!college) throw ApiError.badRequest("Unknown or inactive college");

  // A recruiter posting the same JD to two colleges must get a separate
  // document per college, or the gatekeeping pools would merge.
  const hash = contentHash(rawText);
  const existing = await JobDescription.findOne({
    ownerUserId: req.user._id,
    collegeId,
    contentHash: hash,
  });
  if (existing) {
    throw ApiError.conflict(
      `You already posted this role to ${college.name}.`
    );
  }

  const result = await parseJobDescription(rawText);

  const jd = await JobDescription.create({
    ownerUserId: req.user._id,
    collegeId: college._id,
    title: (title || "").trim() || result.parsed.title || "Untitled role",
    company: result.parsed.company || "",
    location: result.parsed.location || "",
    experienceLevel: result.parsed.experienceLevel,
    rawText,
    parsed: {
      requiredSkills: result.parsed.requiredSkills,
      responsibilities: result.parsed.responsibilities,
      keywords: result.parsed.keywords,
      senioritySignals: result.parsed.senioritySignals,
      summary: result.parsed.summary,
    },
    status: "active",
    contentHash: result.contentHash,
    model: result.model,
    promptTokens: result.promptTokens,
    responseTokens: result.responseTokens,
  });

  events.emitSafe("recruiter.jdPosted", {
    recruiterId: req.user._id.toString(),
    jdId: jd._id.toString(),
    collegeId: college._id.toString(),
  });

  res.status(201).json({ jd });
}

router.post(
  "/jds",
  analyzeLimiter,
  validate(createJdSchema),
  asyncHandler(async (req, res) => {
    await createRecruiterJd(req, res, req.body.rawText, {
      title: req.body.title,
      collegeId: req.body.collegeId,
    });
  })
);

/**
 * POST /api/recruiter/jds/upload — drop a JD as a PDF/TXT.
 *
 * Recruiters asked to drop a JD the same way they drop a resume; the file is
 * read in memory and never persisted, exactly like the resume pipeline.
 */
router.post(
  "/jds/upload",
  analyzeLimiter,
  (req, res, next) => uploadPdf("file")(req, res, next),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest("No file received");

    const collegeId = String(req.body.collegeId || "");
    if (!mongoose.isValidObjectId(collegeId)) {
      throw ApiError.badRequest("Choose a college to post this role to.");
    }

    const { text } = await extractText(req.file.buffer);
    if (text.trim().length < 40) {
      throw ApiError.badRequest(
        "That file has too little text to be a job description."
      );
    }
    if (text.trim().length > 20000) {
      throw ApiError.badRequest(
        "That file is far longer than a job description — paste the role text instead."
      );
    }

    await createRecruiterJd(req, res, text, {
      title: req.body.title,
      collegeId,
    });
  })
);

/**
 * A recruiter's JD list, with the size of each gated pool. `candidates` counts
 * only students the placement cell has actually passed — the honest number for
 * a recruiter dashboard.
 */
router.get(
  "/jds",
  asyncHandler(async (req, res) => {
    const jds = await JobDescription.find({ ownerUserId: req.user._id })
      .sort({ createdAt: -1 })
      .select("-rawText")
      .lean();

    const counts = await RecruiterPass.aggregate([
      { $match: { jdId: { $in: jds.map((j) => j._id) } } },
      {
        $group: {
          _id: "$jdId",
          passed: { $sum: 1 },
          shortlisted: {
            $sum: { $cond: [{ $eq: ["$recruiterDecision", "shortlisted"] }, 1, 0] },
          },
          rejected: {
            $sum: { $cond: [{ $eq: ["$recruiterDecision", "rejected"] }, 1, 0] },
          },
        },
      },
    ]);
    const byJd = new Map(counts.map((c) => [c._id.toString(), c]));

    // Average readiness of the passed pool — the quality signal for a posting.
    const avgReadiness = await ReadinessScore.aggregate([
      { $match: { jdId: { $in: jds.map((j) => j._id) } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: { jd: "$jdId", user: "$userId" }, composite: { $first: "$composite" } } },
      { $group: { _id: "$_id.jd", avg: { $avg: "$composite" }, scored: { $sum: 1 } } },
    ]);
    const byAvg = new Map(avgReadiness.map((a) => [a._id.toString(), a]));

    const colleges = await College.find({
      _id: { $in: jds.map((j) => j.collegeId).filter(Boolean) },
    })
      .select("name")
      .lean();
    const collegeById = new Map(colleges.map((c) => [c._id.toString(), c.name]));

    res.json({
      jds: jds.map((j) => {
        const c = byJd.get(j._id.toString());
        const a = byAvg.get(j._id.toString());
        return {
          ...j,
          collegeTag: j.collegeId ? collegeById.get(j.collegeId.toString()) || null : null,
          candidateCounts: {
            passed: c?.passed ?? 0,
            shortlisted: c?.shortlisted ?? 0,
            rejected: c?.rejected ?? 0,
          },
          averageReadiness: a ? Math.round(a.avg) : null,
          scoredCandidates: a?.scored ?? 0,
        };
      }),
    });
  })
);

const patchJdSchema = z.object({
  status: z.enum(["draft", "active", "closed"]).optional(),
  title: z.string().trim().min(1).max(140).optional(),
});

router.patch(
  "/jds/:id",
  validate(patchJdSchema),
  asyncHandler(async (req, res) => {
    const id = objectIdSchema.parse(req.params.id);
    const jd = await JobDescription.findOne({ _id: id, ownerUserId: req.user._id });
    if (!jd) throw ApiError.notFound("Job description not found");

    if (req.body.status) jd.status = req.body.status;
    if (req.body.title) jd.title = req.body.title;
    await jd.save();

    res.json({ jd });
  })
);

// ---------------------------------------------------------------------------
// GET /api/recruiter/jds/:id/candidates — THE GATED FEED
// ---------------------------------------------------------------------------

/**
 * Candidates for a JD. The ONLY students that can appear here are those with a
 * RecruiterPass for this JD — i.e. explicitly approved by their placement cell.
 *
 * This is enforced by the aggregation starting from RecruiterPass, so there is
 * no code path that returns an un-passed student. Ranked by readiness desc.
 */
router.get(
  "/jds/:id/candidates",
  asyncHandler(async (req, res) => {
    const id = objectIdSchema.parse(req.params.id);

    const jd = await JobDescription.findOne({ _id: id, ownerUserId: req.user._id })
      .select("-rawText")
      .lean();
    if (!jd) throw ApiError.notFound("Job description not found");

    // Start from the passes — the gate. A student with no pass is not a row in
    // this pipeline at all.
    const passes = await RecruiterPass.find({
      jdId: jd._id,
      recruiterDecision: { $ne: "rejected" },
    })
      .sort({ createdAt: -1 })
      .lean();

    const studentIds = passes.map((p) => p.studentUserId);
    if (!studentIds.length) {
      return res.json({
        jd: { _id: jd._id, title: jd.title, company: jd.company, collegeTag: null },
        candidates: [],
        count: 0,
      });
    }

    const [students, readiness, statuses, colleges, resumeSections] = await Promise.all([
      User.find({
        _id: { $in: studentIds },
        // Consent is re-checked here, not just at pass time: a student who
        // withdraws consent must vanish from recruiter feeds immediately,
        // independent of their placement status (scope §12.4).
        "consent.shownToRecruiters": { $ne: false },
      })
        .select("name email collegeId consent")
        .lean(),
      ReadinessScore.aggregate([
        { $match: { userId: { $in: studentIds }, jdId: jd._id } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$userId",
            composite: { $first: "$composite" },
            skillMatchPercent: { $first: "$skillMatch.percent" },
            matched: { $first: "$skillMatch.matched" },
            missing: { $first: "$skillMatch.missing" },
            summary: { $first: "$summary" },
          },
        },
      ]),
      PlacementStatus.find({ studentUserId: { $in: studentIds } }).lean(),
      College.find({ _id: { $in: passes.map((p) => p.collegeId) } })
        .select("name")
        .lean(),
      // A short preview per candidate (headline + counts) so a recruiter can
      // triage the list without opening every profile. Only the summary fields
      // are pulled — the full resume is fetched per candidate on demand.
      ResumeVersion.aggregate([
        {
          $match: {
            resumeId: {
              $in: await Resume.find({ userId: { $in: studentIds } }).distinct("_id"),
            },
          },
        },
        { $sort: { versionNumber: -1 } },
        {
          $group: {
            _id: "$resumeId",
            summary: { $first: "$parsedSections.summary" },
            skills: { $first: "$parsedSections.skills" },
            projects: { $first: "$parsedSections.projects" },
            experience: { $first: "$parsedSections.experience" },
          },
        },
      ]),
    ]);

    // Map resumeId → userId so the preview rows can be attached to students.
    const resumes = await Resume.find({ userId: { $in: studentIds } })
      .select("userId")
      .lean();
    const userByResume = new Map(resumes.map((r) => [r._id.toString(), r.userId.toString()]));
    const sectionsByUser = new Map();
    for (const sec of resumeSections) {
      const uid = userByResume.get(sec._id.toString());
      if (uid) sectionsByUser.set(uid, sec);
    }

    const consentingIds = new Set(students.map((s) => s._id.toString()));
    const readinessByUser = new Map(readiness.map((r) => [r._id.toString(), r]));
    const statusByUser = new Map(statuses.map((s) => [s.studentUserId.toString(), s]));
    const collegeById = new Map(colleges.map((c) => [c._id.toString(), c.name]));
    const passByUser = new Map(passes.map((p) => [p.studentUserId.toString(), p]));

    const candidates = students
      .map((s) => {
        const sid = s._id.toString();
        const r = readinessByUser.get(sid);
        const st = statusByUser.get(sid);
        const pass = passByUser.get(sid);
        return {
          _id: s._id,
          name: s.name,
          email: s.email,
          // Always present — a recruiter must never have to guess whose
          // student this is (scope §6.1).
          collegeTag: collegeById.get(s.collegeId?.toString()) || "Unknown college",
          readiness: r?.composite ?? null,
          skillMatchPercent: r?.skillMatchPercent ?? null,
          matchedSkills: (r?.matched || []).slice(0, 6).map((m) => m.jdSkill),
          missingSkills: (r?.missing || [])
            .slice()
            .sort((a, b) => (a.importance === "must" ? 0 : 1) - (b.importance === "must" ? 0 : 1))
            .slice(0, 6)
            .map((m) => m.jdSkill),
          readinessSummary: r?.summary || "",
          status: st?.status || "not_reviewed",
          trainingTags: st?.trainingTags || [],
          passedAt: pass?.createdAt,
          passNote: pass?.note || "",
          decision: pass?.recruiterDecision || "none",
          // A short preview so a recruiter can triage without opening each one.
          headline: sectionsByUser.get(sid)?.summary || "",
          skillCount: (sectionsByUser.get(sid)?.skills || []).length,
          projectCount: (sectionsByUser.get(sid)?.projects || []).length,
          experienceCount: (sectionsByUser.get(sid)?.experience || []).length,
        };
      })
      // Rank by readiness server-side; candidates with no score sort last.
      .sort((a, b) => (b.readiness ?? -1) - (a.readiness ?? -1))
      .map((c, i) => ({ ...c, rank: i + 1 }));

    res.json({
      jd: {
        _id: jd._id,
        title: jd.title,
        company: jd.company,
        collegeTag: jd.collegeId
          ? collegeById.get(jd.collegeId.toString()) || null
          : null,
        requiredSkills: jd.parsed?.requiredSkills || [],
      },
      candidates,
      count: candidates.length,
      // Students whose placement cell passed them but who withdrew consent.
      withheldForConsent: studentIds.length - consentingIds.size,
    });
  })
);

// ---------------------------------------------------------------------------
// GET /api/recruiter/candidates/:id/profile — the full candidate view
// ---------------------------------------------------------------------------

/**
 * Everything a recruiter needs to judge one candidate: the resume they actually
 * wrote, their readiness for THIS role with the matched and missing skills, the
 * resume-quality detail, their projects and experience, and the college tag.
 *
 * The gate is re-checked here, not inherited from the list view: a candidate can
 * only be read if a RecruiterPass exists for one of THIS recruiter's JDs. Being
 * able to guess an id must not be enough.
 *
 * `?jdId=` scopes the readiness to that role. Without it, the recruiter's most
 * recent posting that this student was passed to is used, so the profile is
 * never shown against a role they were not approved for.
 */
router.get(
  "/candidates/:id/profile",
  asyncHandler(async (req, res) => {
    const studentId = objectIdSchema.parse(req.params.id);
    const jdId = req.query.jdId ? objectIdSchema.parse(req.query.jdId) : null;

    // Which of MY JDs was this student passed to?
    const myJds = await JobDescription.find({ ownerUserId: req.user._id })
      .select("title company")
      .lean();
    const myJdIds = myJds.map((j) => j._id);

    const passFilter = { studentUserId: studentId, jdId: { $in: myJdIds } };
    if (jdId) passFilter.jdId = jdId;

    const pass = await RecruiterPass.findOne(passFilter).sort({ createdAt: -1 }).lean();
    if (!pass) {
      throw ApiError.forbidden(
        "That candidate was not passed to you, or not for that role."
      );
    }

    const profile = await buildCandidateProfile(studentId, { jdId: pass.jdId });
    if (!profile) throw ApiError.notFound("Candidate not found");

    // A recruiter must never receive a candidate who withdrew consent, even via
    // a direct id — the same rule the feed enforces.
    if (profile.student.consent?.shownToRecruiters === false) {
      throw ApiError.forbidden(
        "This candidate has withdrawn consent to be shown to recruiters."
      );
    }

    const jd = myJds.find((j) => j._id.toString() === pass.jdId.toString());

    res.json({
      ...profile,
      // The role this profile is presented against — always explicit.
      viewingRole: jd ? { _id: jd._id, title: jd.title, company: jd.company } : null,
      pass: {
        note: pass.note || "",
        passedAt: pass.createdAt,
        decision: pass.recruiterDecision || "none",
      },
      // A recruiter sees the resume and the readiness, but NOT the placement
      // cell's internal warnings — those are a private conversation between the
      // cell and its student.
      warnings: undefined,
      placement: {
        status: profile.placement.status,
        tags: profile.placement.tags,
      },
    });
  })
);

// ---------------------------------------------------------------------------
// PATCH /api/recruiter/candidates/:id/decision
// ---------------------------------------------------------------------------
const decisionSchema = z.object({
  jdId: objectIdSchema,
  decision: z.enum(["shortlisted", "rejected", "none"]),
});

router.patch(
  "/candidates/:id/decision",
  validate(decisionSchema),
  asyncHandler(async (req, res) => {
    const studentId = objectIdSchema.parse(req.params.id);
    const { jdId, decision } = req.body;

    // The JD must be this recruiter's own — you cannot decide on a candidate
    // in someone else's pipeline.
    const jd = await JobDescription.findOne({ _id: jdId, ownerUserId: req.user._id });
    if (!jd) throw ApiError.notFound("Job description not found");

    const pass = await RecruiterPass.findOne({ jdId: jd._id, studentUserId: studentId });
    if (!pass) {
      throw ApiError.notFound("That candidate was not passed to this role");
    }

    pass.recruiterDecision = decision;
    pass.decisionAt = decision === "none" ? null : new Date();
    pass.decisionBy = decision === "none" ? null : req.user._id;
    await pass.save();

    // Audited on the student's record — a recruiter's decision is part of their
    // placement history. The placement cell keeps final status authority.
    let doc = await PlacementStatus.findOne({ studentUserId: studentId });
    if (!doc) {
      doc = new PlacementStatus({
        studentUserId: studentId,
        collegeId: pass.collegeId,
      });
    }
    doc.appendAudit({
      by: req.user._id,
      byName: req.user.name,
      note: `Recruiter marked ${decision} for "${jd.title}"`,
      kind: "recruiter_decision",
      meta: { jdId: jd._id.toString(), decision },
    });
    await doc.save();

    events.emitSafe("recruiter.decision", {
      studentUserId: studentId,
      jdId: jd._id.toString(),
      decision,
    });

    res.json({ ok: true, decision });
  })
);

/**
 * GET /api/recruiter/role-suggestions
 *
 * The role names a recruiter can pick from when posting, derived from their OWN
 * previous postings. Deliberately not the placement-cell role index
 * (/api/roles/cell/roles): that is a college-scoped endpoint and calling it from
 * a recruiter produced a 403 on every page load.
 *
 * Only the recruiter's own history is used — a recruiter has no college, so
 * there is nothing else legitimate to draw on.
 */
router.get(
  "/role-suggestions",
  asyncHandler(async (req, res) => {
    const jds = await JobDescription.find({ ownerUserId: req.user._id })
      .select("title")
      .lean();

    // Collapse to a canonical key so "Backend Engineer" and "backend engineer"
    // do not both appear.
    const seen = new Map();
    for (const jd of jds) {
      const label = String(jd.title || "").trim();
      if (!label) continue;
      const key = label.toLowerCase();
      const existing = seen.get(key);
      if (existing) existing.count += 1;
      else seen.set(key, { key, label, count: 1 });
    }

    res.json({
      roles: [...seen.values()].sort(
        (a, b) => b.count - a.count || a.label.localeCompare(b.label)
      ),
    });
  })
);

// ---------------------------------------------------------------------------
// GET /api/recruiter/meeting-options — who a recruiter may propose a meeting to
// ---------------------------------------------------------------------------

/**
 * The meeting-proposal picker's data: which candidates a recruiter can meet and
 * for which role.
 *
 * The rule is the same gate as everywhere else — only students a placement cell
 * has PASSED to this recruiter. Returned grouped by role so the recruiter picks
 * a posting first and then a person from its approved pool, which is how the
 * gate actually works.
 */
router.get(
  "/meeting-options",
  asyncHandler(async (req, res) => {
    const jds = await JobDescription.find({ ownerUserId: req.user._id, status: { $ne: "closed" } })
      .select("title company collegeId")
      .lean();

    if (!jds.length) return res.json({ roles: [], totalCandidates: 0 });

    const passes = await RecruiterPass.find({
      jdId: { $in: jds.map((j) => j._id) },
      recruiterDecision: { $ne: "rejected" },
    })
      .select("jdId studentUserId collegeId")
      .lean();

    const studentIds = [...new Set(passes.map((p) => p.studentUserId.toString()))];
    const students = studentIds.length
      ? await User.find({
          _id: { $in: studentIds },
          // Consent is re-checked here as in the candidate feed: a student who
          // withdrew must not be proposable for a meeting either.
          "consent.shownToRecruiters": { $ne: false },
        })
          .select("name email collegeId")
          .lean()
      : [];

    const colleges = await College.find({
      _id: { $in: [...new Set(students.map((s) => s.collegeId?.toString()).filter(Boolean))] },
    })
      .select("name")
      .lean();

    const studentById = new Map(students.map((s) => [s._id.toString(), s]));
    const collegeById = new Map(colleges.map((c) => [c._id.toString(), c.name]));

    const roles = jds
      .map((jd) => {
        const forJd = passes.filter((p) => p.jdId.toString() === jd._id.toString());
        return {
          _id: jd._id,
          title: jd.title,
          company: jd.company,
          collegeTag: jd.collegeId ? collegeById.get(jd.collegeId.toString()) || null : null,
          candidates: forJd
            .map((p) => studentById.get(p.studentUserId.toString()))
            .filter(Boolean)
            .map((s) => ({
              _id: s._id,
              name: s.name,
              email: s.email,
              collegeTag: collegeById.get(s.collegeId?.toString()) || null,
            })),
        };
      })
      .filter((r) => r.candidates.length > 0);

    res.json({
      roles,
      totalCandidates: roles.reduce((a, r) => a + r.candidates.length, 0),
    });
  })
);

module.exports = router;
