const express = require("express");
const { z } = require("zod");

const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth, requireRole } = require("../shared/auth/requireAuth");
const College = require("../shared/auth/College");
const User = require("../shared/auth/User");
const { validate } = require("../middleware/validate");
const { authLimiter } = require("../middleware/rateLimit");
const events = require("../shared/events");

const router = express.Router();

// Public: code validation happens on the Register page, pre-login, so it must
// NOT require a session. Rate-limited so it can't be used to enumerate codes.
router.get(
  "/validate/:code",
  authLimiter,
  asyncHandler(async (req, res) => {
    const code = String(req.params.code || "").trim().toUpperCase();
    if (!code) throw ApiError.badRequest("Code is required");

    const college = await College.findOne({ code, isActive: true }).select("name").lean();
    res.json({ valid: Boolean(college), college: college ? { name: college.name } : null });
  })
);

// Everything below requires a session.
router.use(requireAuth);

/**
 * GET /api/colleges/directory?q=
 *
 * A minimal, safe college picker for RECRUITERS (they have no college of their
 * own and must choose which campus to post a role to). Returns name + id only
 * — never the registration code, which is a credential the placement cell
 * shares with its own students.
 *
 * `q` searches by name. It is applied server-side rather than filtering in the
 * browser so the picker stays usable as the college list grows past a screenful
 * — a recruiter looking for "GNIOT" should not scroll through every campus on
 * the platform.
 */
router.get(
  "/directory",
  requireRole("recruiter", "admin"),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim().slice(0, 80);

    const filter = { isActive: true };
    if (q) {
      // Escape regex metacharacters — a user typing "(" must not become a
      // malformed pattern (or, worse, an unintended expression).
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.name = { $regex: safe, $options: "i" };
    }

    const colleges = await College.find(filter)
      .select("name")
      .sort({ name: 1 })
      .limit(50)
      .lean();

    res.json({ colleges });
  })
);

const createSchema = z.object({
  name: z.string().trim().min(3).max(120),
});

const joinSchema = z.object({
  code: z.string().trim().min(1).max(32).toUpperCase(),
});

// Admin-only college creation. Onboarding is deliberately NOT self-serve
// (scope §6.3): a bad actor must not be able to spin up a fake "college" to
// harvest resumes or impersonate an institution to recruiters. For now the
// JobSync team creates colleges via this route or the seed script.
router.post(
  "/",
  requireRole("admin"),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const existing = await College.findOne({ name: req.body.name });
    if (existing) throw ApiError.conflict("A college with this name already exists");

    const college = await College.create({
      name: req.body.name,
      code: College.generateCode(req.body.name),
    });

    res.status(201).json({ college });
  })
);

// Rotate the registration code. Only affects FUTURE registrations — every
// already-registered student/placement cell keeps their stamped collegeId.
router.post(
  "/:id/rotate-code",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const college = await College.findById(req.params.id);
    if (!college) throw ApiError.notFound("College not found");

    college.code = College.generateCode(college.name);
    await college.save();

    res.json({ college });
  })
);

// A placement cell can see its own college's details (name + code so it can
// share the code with its students).
router.get(
  "/me",
  requireRole("placement_cell", "admin"),
  asyncHandler(async (req, res) => {
    if (!req.user.collegeId) {
      throw ApiError.forbidden("This account has no college scope");
    }
    const college = await College.findById(req.user.collegeId);
    if (!college) throw ApiError.notFound("College not found");

    res.json({ college });
  })
);

// Students link themselves to a college with the code their placement cell
// issued. Until this happens the student belongs to no college, so they can't
// appear in any college-scoped view (cohort, gatekeeping, analytics).
//
// Re-linking is allowed while the student has no college — after that the
// collegeId is permanent (scope §6.1: "stamped onto the student's account
// permanently at signup"). A placement cell must move a student, not the
// student, so the account can't be re-homed to dodge a status decision.
router.post(
  "/join",
  requireRole("student"),
  validate(joinSchema),
  authLimiter,
  asyncHandler(async (req, res) => {
    if (req.user.collegeId) {
      throw ApiError.conflict(
        "You're already part of a college. Ask your placement cell to change it."
      );
    }

    const college = await College.findOne({ code: req.body.code, isActive: true });
    if (!college) throw ApiError.badRequest("Invalid or inactive college code");

    const user = await User.findById(req.user._id);
    user.collegeId = college._id;
    await user.save();

    events.emitSafe("student.joinedCollege", {
      userId: user._id.toString(),
      collegeId: college._id.toString(),
    });

    res.json({
      user: user.toJSON(),
      college: { _id: college._id, name: college.name },
    });
  })
);

// Admin directory of colleges with live registration counts.
router.get(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const colleges = await College.find().sort({ createdAt: -1 }).lean();
    const counts = await User.aggregate([
      { $match: { collegeId: { $ne: null } } },
      { $group: { _id: "$collegeId", students: { $sum: { $cond: [{ $eq: ["$role", "student"] }, 1, 0] } }, cells: { $sum: { $cond: [{ $eq: ["$role", "placement_cell"] }, 1, 0] } } } },
    ]);
    const byCollege = new Map(counts.map((c) => [c._id.toString(), c]));
    res.json({
      colleges: colleges.map((c) => ({
        ...c,
        students: byCollege.get(c._id.toString())?.students ?? 0,
        placementCells: byCollege.get(c._id.toString())?.cells ?? 0,
      })),
    });
  })
);

module.exports = router;
