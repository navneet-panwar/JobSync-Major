const express = require("express");
const { z } = require("zod");
const mongoose = require("mongoose");

const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../shared/auth/requireAuth");
const { validate } = require("../middleware/validate");
const { analyzeLimiter } = require("../middleware/rateLimit");
const { extractText } = require("../services/pdfService");
const { uploadPdf } = require("../middleware/upload");
const {
  parseJobDescription,
  contentHash,
  titleFromText,
} = require("../services/jdParser");
const JobDescription = require("../models/JobDescription");
const events = require("../shared/events");

const router = express.Router();
router.use(requireAuth);

const objectIdSchema = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), { message: "Invalid id" });
const idParam = z.object({ id: objectIdSchema });

// A recruiter's JD belongs to the JDs they will later gate candidates into.
// A student's JD is a private "how do I measure up against this posting"
// sandbox. Both are owned the same way; only collegeId differs.
function isRecruiter(user) {
  return user.role === "recruiter";
}

async function loadOwnedJd(req) {
  const jd = await JobDescription.findOne({
    _id: req.params.id,
    ownerUserId: req.user._id,
  });
  if (!jd) throw ApiError.notFound("Job description not found");
  return jd;
}

/**
 * Shared create path for both paste and file upload.
 *
 * Reuses a previous parse when the identical text was already parsed by THIS
 * owner — the AI call is the expensive part, and re-uploading the same posting
 * is common.
 *
 * With `reuseExisting`, an identical JD is RETURNED rather than duplicated.
 * Without it (a recruiter posting the same role to a second college, where the
 * gatekeeping pools must stay separate) a new document is created.
 */
async function createFromText(req, res, rawText, overrides = {}) {
  const hash = contentHash(rawText);

  const existing = await JobDescription.findOne({
    ownerUserId: req.user._id,
    contentHash: hash,
    // A student's JD has no college; a recruiter's is college-scoped, so match
    // on the same scope to avoid cross-linking unrelated pipelines.
    collegeId: isRecruiter(req.user) ? req.user.collegeId : null,
  }).lean();

  // Re-pasting the same posting should not create a second identical entry in
  // the role selector — that produced a list of near-identical titles with no
  // way to tell them apart. Return the existing one and let the UI navigate.
  if (existing && overrides.reuseExisting) {
    console.log(`[jd] identical JD already exists for owner ${req.user._id} — reusing it`);
    return res.status(200).json({ jd: existing, reused: true });
  }

  let parsedResult;
  if (existing?.parsed?.requiredSkills?.length) {
    // Cache hit — no Gemini call. Log it so the saving is visible.
    console.log(`[jd] parse cache hit for owner ${req.user._id} (hash ${hash.slice(0, 8)}))`);
    parsedResult = {
      parsed: existing.parsed,
      model: `${existing.model} (cached)`,
      promptTokens: 0,
      responseTokens: 0,
      contentHash: hash,
    };
  } else {
    parsedResult = await parseJobDescription(rawText);
  }

  const title =
    (overrides.title || "").trim() ||
    parsedResult.parsed.title ||
    titleFromText(rawText) ||
    overrides.fallbackTitle ||
    "Untitled role";

  const jd = await JobDescription.create({
    ownerUserId: req.user._id,
    collegeId: isRecruiter(req.user) ? req.user.collegeId : null,
    title: title.slice(0, 140),
    company: parsedResult.parsed.company,
    location: parsedResult.parsed.location,
    experienceLevel: parsedResult.parsed.experienceLevel,
    rawText,
    parsed: {
      requiredSkills: parsedResult.parsed.requiredSkills,
      responsibilities: parsedResult.parsed.responsibilities,
      keywords: parsedResult.parsed.keywords,
      senioritySignals: parsedResult.parsed.senioritySignals,
      summary: parsedResult.parsed.summary,
    },
    status: "active",
    contentHash: parsedResult.contentHash,
    model: parsedResult.model,
    promptTokens: parsedResult.promptTokens,
    responseTokens: parsedResult.responseTokens,
  });

  events.emitSafe("jd.created", {
    userId: req.user._id.toString(),
    jdId: jd._id.toString(),
    skillCount: jd.parsed.requiredSkills.length,
  });

  res.status(201).json({ jd });
}

const pasteSchema = z.object({
  rawText: z.string().trim().min(40).max(20000),
  title: z.string().trim().max(140).optional(),
});

// POST /api/jd — paste a JD
router.post(
  "/",
  analyzeLimiter,
  validate(pasteSchema),
  asyncHandler(async (req, res) => {
    await createFromText(req, res, req.body.rawText, {
      title: req.body.title,
      fallbackTitle: "Untitled role",
      // Pasting the same posting twice should not litter the selector.
      reuseExisting: true,
    });
  })
);

// POST /api/jd/upload — upload a .pdf JD (≤ 2 MB enforced by middleware)
router.post(
  "/upload",
  analyzeLimiter,
  (req, res, next) => uploadPdf("file")(req, res, next),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest("No file received");

    // PDFs of job postings are usually short; pdfService enforces ≥50 chars,
    // which is also the right floor for "this is actually a JD".
    const { text } = await extractText(req.file.buffer);
    if (text.trim().length > 20000) {
      throw ApiError.badRequest(
        "That file is far longer than a job description — paste the role text instead."
      );
    }

    await createFromText(req, res, text, {
      title: req.body.title,
      fallbackTitle: req.file.originalname.replace(/\.(pdf|txt)$/i, ""),
    });
  })
);

// GET /api/jd — own JDs, newest first
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const jds = await JobDescription.find({ ownerUserId: req.user._id })
      .sort({ createdAt: -1 })
      .select("-rawText")
      .lean();

    res.json({
      jds,
      totals: {
        all: jds.length,
        active: jds.filter((j) => j.status === "active").length,
        closed: jds.filter((j) => j.status === "closed").length,
      },
    });
  })
);

// GET /api/jd/:id — one JD incl. rawText
router.get(
  "/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const jd = await loadOwnedJd(req);
    res.json({ jd });
  })
);

const patchSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  status: z.enum(["draft", "active", "closed"]).optional(),
  company: z.string().trim().max(140).optional(),
  location: z.string().trim().max(140).optional(),
});

// PATCH /api/jd/:id — rename / close / reopen
router.patch(
  "/:id",
  validate(idParam, "params"),
  validate(patchSchema),
  asyncHandler(async (req, res) => {
    const jd = await loadOwnedJd(req);

    if (req.body.title !== undefined) jd.title = req.body.title;
    if (req.body.status !== undefined) jd.status = req.body.status;
    if (req.body.company !== undefined) jd.company = req.body.company;
    if (req.body.location !== undefined) jd.location = req.body.location;

    await jd.save();
    res.json({ jd });
  })
);

// POST /api/jd/:id/reparse — re-run the AI parse for an edited JD
router.post(
  "/:id/reparse",
  analyzeLimiter,
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const jd = await loadOwnedJd(req);

    const result = await parseJobDescription(jd.rawText);
    jd.parsed = {
      requiredSkills: result.parsed.requiredSkills,
      responsibilities: result.parsed.responsibilities,
      keywords: result.parsed.keywords,
      senioritySignals: result.parsed.senioritySignals,
      summary: result.parsed.summary,
    };
    if (!jd.title || jd.title === "Untitled role") {
      jd.title = result.parsed.title || jd.title;
    }
    jd.company = result.parsed.company || jd.company;
    jd.location = result.parsed.location || jd.location;
    jd.experienceLevel = result.parsed.experienceLevel;
    jd.model = result.model;
    jd.promptTokens = result.promptTokens;
    jd.responseTokens = result.responseTokens;
    jd.contentHash = result.contentHash;
    jd.parseError = "";
    await jd.save();

    res.json({ jd });
  })
);

// DELETE /api/jd/:id
router.delete(
  "/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const jd = await loadOwnedJd(req);
    await jd.deleteOne();

    events.emitSafe("jd.deleted", {
      userId: req.user._id.toString(),
      jdId: req.params.id,
    });

    res.json({ ok: true });
  })
);

module.exports = router;
