const express = require("express");
const mongoose = require("mongoose");
const z = require("zod");
const crypto = require("crypto");

const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { uploadPdf } = require("../middleware/upload");

const Resume = require("../models/Resume");
const ResumeVersion = require("../models/ResumeVersion");
const User = require("../shared/auth/User");

const {analyzeLimiter} = require("../middleware/rateLimit");
const Analysis = require("../models/Analysis");
const {analyzeResume} = require("../services/geminiService");

const {diffText,summarize} = require("../services/diffService");

const { extractText } = require("../services/pdfService");
const { parseResume: parseStructured } = require("../services/structuredParser");
const events = require("../shared/events");

const router = express.Router();
router.use(requireAuth);

const objectIdSchema = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), { message: "Invalid id" });

const idParam = z.object({ id: objectIdSchema });

async function loadOwnedResume(req) {
  const resume = await Resume.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!resume) throw ApiError.notFound("Resume not found");
  return resume;
}

async function loadVersion(resumeId, versionId) {
  const version = await ResumeVersion.findOne({
    _id: versionId,
    resumeId,
  });

  if (!version) throw ApiError.notFound("Version not found");
  return version;
}
router.post(
  "/",
  uploadPdf("file"),
  asyncHandler(async (req, res) => {
    const { text, meta } = await extractText(req.file.buffer);
    const parsedSections = await parseStructured(text);

    const title =
      (req.body.title || "").trim() ||
      req.file.originalname.replace(/\.pdf$/i, "") ||
      "Untitled Resume";

    // Content hash: powers duplicate-resume detection below, and lets a
    // re-analysis of identical text be skipped entirely.
    const contentHash = crypto
      .createHash("sha256")
      .update(text.replace(/\s+/g, " ").trim().toLowerCase())
      .digest("hex");

    const resume = await Resume.create({
      userId: req.user._id,
      title,
      latestVersionNumber: 1,
      contentHash,
    });

    const version = await ResumeVersion.create({
      resumeId: resume._id,
      versionNumber: 1,
      label: "V1",
      rawText: text,
      parsedSections,
      sourceType: "upload",
      parentVersionId: null,
    });

    resume.currentVersionId = version._id;
    await resume.save();

    // --- Duplicate-resume detection (scope §12.1) -------------------------
    // The same text under a DIFFERENT account in the SAME college. The upload
    // is allowed (never blocked) and a flag is raised for the placement cell to
    // look at — shared templates and group projects exist, so treating this as
    // fraud would punish innocent students for a coincidence.
    let duplicateFlagged = false;
    if (req.user.collegeId) {
      try {
        const others = await Resume.find({
          contentHash,
          userId: { $ne: req.user._id },
        })
          .select("userId")
          .lean();

        if (others.length) {
          const otherIds = others.map((r) => r.userId);
          const sameCollege = await User.findOne({
            _id: { $in: otherIds },
            collegeId: req.user.collegeId,
          })
            .select("name")
            .lean();

          if (sameCollege) {
            const IntegrityFlag = require("../models/IntegrityFlag");
            await IntegrityFlag.create({
              collegeId: req.user.collegeId,
              studentUserId: req.user._id,
              kind: "duplicate_resume",
              summary: "Identical resume text already exists under another account",
              detail:
                "The uploaded PDF has byte-identical extracted text to a resume already on file for another student in this college. This is informational — shared templates and group projects are common. Review before drawing any conclusion.",
              relatedUserId: sameCollege._id,
              relatedResumeId: others[0]._id,
            });
            duplicateFlagged = true;
            console.log(
              `[resume] duplicate content flag raised for ${req.user._id} (matches ${sameCollege._id})`
            );
          }
        }
      } catch (err) {
        // Detection is an extra; never let it fail the upload.
        console.error("[resume] duplicate detection failed:", err.message);
      }
    }

    res.status(201).json({
      resume,
      version,
      meta,
      duplicateFlagged,
    });
  })

);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const resumes = await Resume.find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .lean();

    res.json({ resumes });
  })
);

router.get(
  "/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const resume = await loadOwnedResume(req);

    const versions = await ResumeVersion.find({
      resumeId: resume._id,
    })
      .sort({ versionNumber: 1 })
      .select("-rawText")
      .lean();

    res.json({ resume, versions });
  })
);

router.get(
  "/:id/versions/:versionId",
  validate(
    z.object({ id: objectIdSchema, versionId: objectIdSchema }),
    "params"
  ),
  asyncHandler(async (req, res) => {
    const resume = await loadOwnedResume(req);
    const version = await loadVersion(resume._id, req.params.versionId);
    res.json({ version });
  })
);

router.delete(
  "/:id",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const resume = await loadOwnedResume(req);

    await ResumeVersion.deleteMany({
      resumeId: resume._id,
    });

    await Analysis.deleteMany({resumeId : resume._id});

    await resume.deleteOne();

    res.json({ ok: true });
  })
);

const analyzeBody = z.object({
  versionId: objectIdSchema.optional(),
  targetRole: z.string().trim().max(120).optional(),
});

router.post(
  "/:id/analyze",
  analyzeLimiter,
  validate(idParam, "params"),
  validate(analyzeBody),
  asyncHandler(async (req, res) => {
    const resume = await loadOwnedResume(req);

    const versionId = req.body.versionId || resume.currentVersionId;
    if (!versionId) throw ApiError.badRequest("No version to analyze");
    const version = await loadVersion(resume._id, versionId);

    // Collect the history of rewrites already applied to this resume so the
    // model never re-suggests an improvement the candidate already made.
    const rewriteVersions = await ResumeVersion.find({
      resumeId: resume._id,
      sourceType: "rewrite",
    })
      .select("parentVersionId versionNumber")
      .lean();

    const appliedRewrites = [];

    if (rewriteVersions.length) {
      const parents = await ResumeVersion.find({
        _id: { $in: rewriteVersions.map((v) => v.parentVersionId).filter(Boolean) },
      })
        .select("_id parsedSections")
        .lean();

      for (const parent of parents) {
        const analyses = await Analysis.find({
          resumeId: resume._id,
          versionId: parent._id,
        })
          .select("bulletRewrites")
          .lean();

        for (const a of analyses) {
          for (const r of a.bulletRewrites || []) {
            if (r.rewritten) appliedRewrites.push(r.rewritten);
          }
        }
      }
    }

    // Carry forward the most recent prior issues so the model keeps unresolved
    // ones but drops anything already fixed.
    const priorAnalysis = await Analysis.findOne({
      resumeId: resume._id,
      versionId: version._id,
    }).sort({ createdAt: -1 }).lean();

    const priorIssues = (priorAnalysis?.issues || []).map((i) => i.title);

    const { analysis, model, promptTokens, responseTokens } =
      await analyzeResume({
        rawText: version.rawText,
        targetRole: req.body.targetRole,
        appliedRewrites: [...new Set(appliedRewrites)],
        priorIssues,
      });
const saved = await Analysis.create({
  userId: req.user._id,
  resumeId: resume._id,
  versionId: version._id,
  atsScore: analysis.atsScore,
  scoreBreakdown: analysis.scoreBreakdown,
  issues: analysis.issues,
  strengths: analysis.strengths,
  bulletRewrites: analysis.bulletRewrites,
  keywordsPresent: analysis.keywordsPresent,
  keywordsMissing: analysis.keywordsMissing,
  keywordsToAdd: analysis.keywordsToAdd,
  summary: analysis.summary,
  model,
  promptTokens,
  responseTokens,
});

version.latestAnalysisId = saved._id;
await version.save();

// Full System Loop hook (wired in Phase 11) — fire-and-forget, never blocks
// the response.
events.emitSafe("resume.analyzed", {
  userId: req.user._id.toString(),
  resumeId: resume._id.toString(),
  versionId: version._id.toString(),
  analysisId: saved._id.toString(),
  atsScore: saved.atsScore,
});

res.status(201).json({ analysis: saved });
})
);
router.get(
  "/:id/analyses",
  validate(idParam, "params"),
  asyncHandler(async (req, res) => {
    const resume = await loadOwnedResume(req);
    const analyses = await Analysis.find({ resumeId: resume._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ analyses });
  })
);

router.get(
  "/:id/versions/:versionId/analysis",
  validate(
    z.object({ id: objectIdSchema, versionId: objectIdSchema }),
    "params"
  ),
  asyncHandler(async (req, res) => {
    const resume = await loadOwnedResume(req);
    const version = await loadVersion(resume._id, req.params.versionId);

    const analysis = await Analysis.findOne({
      resumeId: resume._id,
      versionId: version._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ analysis: analysis || null });
  })
);

const rewriteBody = z.object({
  analysisId : objectIdSchema,
  rewriteIds : z.array(objectIdSchema).optional(),
  label : z.string().trim().max(40).optional(),
});

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyRewritesToText(rawText, rewrites) {
  let result = rawText;

  for (const r of rewrites) {
    if (!r.original || !r.rewritten) continue;

    // 1. Direct exact match
    const idx = result.indexOf(r.original);
    if (idx >= 0) {
      result =
        result.slice(0, idx) +
        r.rewritten +
        result.slice(idx + r.original.length);
      continue;
    }

    // 2. Whitespace-flexible regex match (handles line breaks introduced during PDF text extraction)
    const words = r.original.trim().split(/\s+/).map(escapeRegExp);
    if (words.length > 0) {
      const pattern = words.join("[\\s\\r\\n]+");
      const regex = new RegExp(pattern, "i");
      if (regex.test(result)) {
        result = result.replace(regex, r.rewritten);
        continue;
      }
    }

    // 3. Fallback: only if it truly couldn't be matched in place
    result += `\n${r.rewritten}`;
  }

  return result;
}

function patchBulletsInSections(sections, rewrites) {
  if (!sections) return null;

  const cloned = JSON.parse(JSON.stringify(sections));

  for (const r of rewrites) {
    if (!r?.original || !r?.rewritten) continue;

    // Patch in experience bullets
    for (const exp of cloned.experience || []) {
      if (!Array.isArray(exp.bullets)) continue;

      exp.bullets = exp.bullets.map((b) => {
        if (b === r.original) return r.rewritten;
        // Check normalized equality
        if (b.replace(/\s+/g, " ").trim() === r.original.replace(/\s+/g, " ").trim()) {
          return r.rewritten;
        }
        return b;
      });
    }

    // Patch in project descriptions
    for (const proj of cloned.projects || []) {
      if (proj.description) {
        if (proj.description === r.original) {
          proj.description = r.rewritten;
        } else if (proj.description.replace(/\s+/g, " ").trim() === r.original.replace(/\s+/g, " ").trim()) {
          proj.description = r.rewritten;
        }
      }
    }
  }

  return cloned;
}

function looksEmpty(sections) {
  if (!sections) return true;

  const b = sections.basics || {};

  const hasIdentity = b.name || b.email || b.title;

  const hasBody =
    sections.summary ||
    sections.experience?.length ||
    sections.education?.length ||
    sections.skills?.length;

  return !hasIdentity && !hasBody;
}

/**
 * Guarantee keyword coverage.
 *
 * The model is instructed to weave every missing keyword into a rewritten
 * bullet, but it does not always manage all of them. After a rewrite pass we
 * check each missing keyword against the new text and, for any still absent,
 * append the model-supplied resume-ready phrase (from keywordsToAdd) into the
 * Skills section so the improved resume actually matches the target role.
 */
function ensureKeywordCoverage(text, parsedSections, keywordsMissing, keywordsToAdd) {
  const missing = Array.isArray(keywordsMissing) ? keywordsMissing : [];
  if (!missing.length) return { text, sections: parsedSections, added: [] };

  const phraseByKeyword = new Map(
    (keywordsToAdd || [])
      .filter((k) => k?.keyword && k?.phrase)
      .map((k) => [k.keyword.toLowerCase(), k.phrase.trim()])
  );

  const stillMissing = missing.filter(
    (k) => k && !new RegExp(escapeRegExp(k), "i").test(text)
  );

  if (!stillMissing.length) return { text, sections: parsedSections, added: [] };

  // Build a single, natural "Additional skills" style line from the phrases
  // (or the bare keywords when the model gave no phrase for them).
  const phrases = stillMissing.map(
    (k) => phraseByKeyword.get(k.toLowerCase()) || k
  );

  const addition = phrases.join("; ");
  const newText = `${text.trim()}\n\nAdditional Skills & Keywords: ${addition}`;

  // Mirror it into the structured sections so the exported PDF carries it too.
  const sections = parsedSections ? JSON.parse(JSON.stringify(parsedSections)) : null;
  if (sections) {
    sections.skills = Array.from(
      new Set([...(sections.skills || []), ...stillMissing])
    );
  }

  return { text: newText, sections, added: stillMissing };
}

router.post(
  "/:id/rewrite",
  validate(idParam, "params"),
  validate(rewriteBody),
  asyncHandler(async (req, res) => {
    const resume = await loadOwnedResume(req);

    const analysis = await Analysis.findOne({
      _id: req.body.analysisId,
      resumeId: resume._id,
    });

    if (!analysis) throw ApiError.notFound("Analysis not found");

    const baseVersion = await loadVersion(
      resume._id,
      analysis.versionId
    );

    const selected = req.body.rewriteIds?.length
      ? analysis.bulletRewrites.filter((r) =>
          req.body.rewriteIds.includes(r._id.toString())
        )
      : analysis.bulletRewrites;

    if (!selected.length) {
      throw ApiError.badRequest(
        "No rewrites selected to apply"
      );
    }

    const newRaw = applyRewritesToText(baseVersion.rawText, selected);

// Safety net: pre-build a structured copy from the base version with the
// chosen bullets swapped in, so V2 never lands with empty sections even if
// Gemini's re-parse fails.
const patchedFromBase = patchBulletsInSections(
  baseVersion.parsedSections,
  selected
);

const reparsed = await parseStructured(newRaw);
let finalParsed = looksEmpty(reparsed)
  ? patchedFromBase
  : reparsed;

// Keyword-coverage guarantee: make sure every keyword the analysis flagged as
// missing actually ends up in the improved resume, even if the model's
// rewrites did not manage to weave them all in.
const coverage = ensureKeywordCoverage(
  newRaw,
  finalParsed,
  analysis.keywordsMissing,
  analysis.keywordsToAdd
);

const finalRaw = coverage.text;
if (coverage.sections) finalParsed = coverage.sections;

const nextNumber = resume.latestVersionNumber + 1;

const newVersion = await ResumeVersion.create({
  resumeId: resume._id,
  versionNumber: nextNumber,
  label: req.body.label?.trim() || `V${nextNumber}`,
  rawText: finalRaw,
  parsedSections: finalParsed,
  sourceType: "rewrite",
  parentVersionId: baseVersion._id,
});

resume.latestVersionNumber = nextNumber;
resume.currentVersionId = newVersion._id;
await resume.save();

// Full System Loop hook (wired in Phase 11) — fire-and-forget.
events.emitSafe("resume.rewriteApplied", {
  userId: req.user._id.toString(),
  resumeId: resume._id.toString(),
  versionId: newVersion._id.toString(),
  appliedCount: selected.length,
});

res.status(201).json({
  version: newVersion,
  appliedCount: selected.length,
  keywordsAdded: coverage.added,
});
  })

);
const diffQuery = z.object({
  from: objectIdSchema,
  to: objectIdSchema,
  mode: z.enum(["words", "lines"]).optional(),
});

router.get(
  "/:id/diff",
  validate(idParam, "params"),
  validate(diffQuery, "query"),
  asyncHandler(async (req, res) => {
    const resume = await loadOwnedResume(req);

    const [fromV, toV] = await Promise.all([
      loadVersion(resume._id, req.query.from),
      loadVersion(resume._id, req.query.to),
    ]);

    const parts = diffText(
      fromV.rawText,
      toV.rawText,
      req.query.mode
    );

    res.json({
      from: {
        id: fromV._id,
        label: fromV.label,
        versionNumber: fromV.versionNumber,
      },
      to: {
        id: toV._id,
        label: toV.label,
        versionNumber: toV.versionNumber,
      },
      parts,
      stats: summarize(parts),
    });
  })
);

module.exports = router;

