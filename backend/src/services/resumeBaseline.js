const crypto = require("crypto");

const Resume = require("../models/Resume");
const ResumeVersion = require("../models/ResumeVersion");
const ReadinessScore = require("../models/ReadinessScore");
const Analysis = require("../models/Analysis");

const { matchSkills } = require("./skillMatch");
const { buildReadinessScore, readinessBand } = require("./readinessScore");
const { normalizeSkillName, skillLabel } = require("./normalizeSkills");

/**
 * resumeBaseline — readiness and roadmap WITHOUT a job description.
 *
 * Readiness and the roadmap are, at heart, comparisons. Until now both demanded
 * a JD before showing anything, which meant a student who had just uploaded a
 * resume saw two dead pages and no signal at all. But a resume can always be
 * compared against something we already know:
 *
 *   · itself          — is this a strong resume for any engineering role?
 *   · its own roles   — the role profile derived from the parsed resume
 *   · the role corpus — the skills that actually appear in real postings
 *
 * So when no JD is selected we synthesize an "implicit target role" from the
 * student's parsed resume (their dominant role + the corpus skills every role
 * of that kind asks for), score the resume against it, and — crucially — mark
 * the target `implicit` and `targetJdId: null` so it can NEVER be mistaken for
 * a real posting. Everything built from it carries `source: "resume_baseline"`
 * and is replaced the moment a real JD is scored.
 */

/**
 * The skills a role typically asks for, by normalized role key.
 *
 * "must" = almost every posting for this role lists it.
 * "nice" = commonly listed, a genuine differentiator.
 *
 * Deliberately conservative: a baseline that claims too much would tell a
 * student they are missing things nobody asked for.
 */
const ROLE_CORPUS = {
  frontend: {
    label: "Frontend Developer",
    skills: [
      ["javascript", "must"],
      ["html", "must"],
      ["css", "must"],
      ["react", "must"],
      ["typescript", "nice"],
      ["tailwind css", "nice"],
      ["git", "nice"],
      ["rest api", "nice"],
      ["testing", "nice"],
    ],
  },
  backend: {
    label: "Backend Developer",
    skills: [
      ["node.js", "must"],
      ["javascript", "must"],
      ["sql", "must"],
      ["rest api", "must"],
      ["mysql", "nice"],
      ["mongodb", "nice"],
      ["docker", "nice"],
      ["redis", "nice"],
      ["testing", "nice"],
    ],
  },
  fullstack: {
    label: "Full Stack Developer",
    skills: [
      ["javascript", "must"],
      ["react", "must"],
      ["node.js", "must"],
      ["sql", "must"],
      ["html", "must"],
      ["css", "must"],
      ["typescript", "nice"],
      ["docker", "nice"],
      ["rest api", "nice"],
      ["mongodb", "nice"],
      ["git", "nice"],
    ],
  },
  data: {
    label: "Data Analyst",
    skills: [
      ["python", "must"],
      ["sql", "must"],
      ["pandas", "must"],
      ["excel", "nice"],
      ["power bi", "nice"],
      ["machine learning", "nice"],
      ["statistics", "nice"],
    ],
  },
  ml: {
    label: "Machine Learning Engineer",
    skills: [
      ["python", "must"],
      ["machine learning", "must"],
      ["pandas", "must"],
      ["numpy", "must"],
      ["scikit-learn", "nice"],
      ["tensorflow", "nice"],
      ["pytorch", "nice"],
      ["sql", "nice"],
      ["docker", "nice"],
    ],
  },
  mobile: {
    label: "Mobile Developer",
    skills: [
      ["flutter", "must"],
      ["dart", "must"],
      ["firebase", "must"],
      ["rest api", "nice"],
      ["kotlin", "nice"],
      ["swift", "nice"],
      ["git", "nice"],
    ],
  },
  devops: {
    label: "DevOps Engineer",
    skills: [
      ["docker", "must"],
      ["kubernetes", "must"],
      ["linux", "must"],
      ["aws", "must"],
      ["ci/cd", "nice"],
      ["terraform", "nice"],
      ["bash", "nice"],
    ],
  },
  testing: {
    label: "QA / Test Engineer",
    skills: [
      ["testing", "must"],
      ["automation", "must"],
      ["selenium", "nice"],
      ["javascript", "nice"],
      ["sql", "nice"],
    ],
  },
  general: {
    label: "Software Engineer",
    skills: [
      ["javascript", "must"],
      ["python", "nice"],
      ["sql", "nice"],
      ["git", "must"],
      ["rest api", "nice"],
      ["html", "nice"],
      ["css", "nice"],
      ["data structures", "nice"],
      ["algorithms", "nice"],
      ["docker", "nice"],
    ],
  },
};

/**
 * Which corpus entry does this resume most resemble?
 *
 * The student's own role profile (derived from their resume) wins when present;
 * otherwise we vote by counting corpus skills the resume actually shows, so the
 * baseline is never arbitrarily "general" when the resume is obviously frontend.
 */
function resolveRoleKey({ roleProfile, resumeVersion }) {
  const fromResume = roleProfile?.resumeRoles || [];
  const best = fromResume
    .slice()
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .map((r) => String(r.key || "").toLowerCase())
    .find((k) => ROLE_CORPUS[k]);
  if (best) return best;

  const haystack = resumeCorpusText(resumeVersion);
  let topKey = "general";
  let topHits = 0;

  for (const [key, entry] of Object.entries(ROLE_CORPUS)) {
    if (key === "general") continue;
    const hits = entry.skills.filter(([skill]) =>
      haystack.includes(normalizeSkillName(skill))
    ).length;
    if (hits > topHits) {
      topHits = hits;
      topKey = key;
    }
  }

  return topHits >= 2 ? topKey : "general";
}

/** Normalized searchable text of everything the resume shows. */
function resumeCorpusText(version) {
  const s = version?.parsedSections || {};
  const parts = [
    s.summary || "",
    ...(s.skills || []),
    ...(s.experience || []).flatMap((e) => [e.role, e.company, ...(e.bullets || [])]),
    ...(s.projects || []).flatMap((p) => [p.name, p.description, ...(p.tech || [])]),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/**
 * Build a pseudo-JD for the implicit baseline target.
 *
 * It carries only the fields `matchSkills` and `buildReadinessScore` read —
 * `parsed.requiredSkills` in particular — and is explicitly labelled implicit
 * so no caller can confuse it with a stored posting.
 */
function buildImplicitTarget({ roleKey, resumeVersion }) {
  const entry = ROLE_CORPUS[roleKey] || ROLE_CORPUS.general;

  // A skill the resume already shows is still "required" — it is part of the
  // role. It will simply come back as matched, which is the point.
  const requiredSkills = entry.skills.map(([name, importance]) => ({
    name,
    label: skillLabel(name),
    importance,
  }));

  return {
    _id: null,
    implicit: true,
    implicitRoleKey: roleKey,
    title: entry.label,
    company: "",
    location: "",
    experienceLevel: "unspecified",
    parsed: {
      requiredSkills,
      summary: `Typical requirements for a ${entry.label} role, derived from the resume's dominant role.`,
      responsibilities: [],
    },
  };
}

function baselineCacheKey(version) {
  return crypto
    .createHash("sha256")
    .update(["baseline", version._id.toString(), version.updatedAt?.toISOString() || ""].join("|"))
    .digest("hex");
}

function shapeBaseline(doc, { version, target }) {
  if (!doc) return null;
  const composite = doc.composite ?? 0;
  return {
    _id: doc._id,
    source: "resume_baseline",
    implicit: true,
    composite,
    band: readinessBand(composite),
    skillMatchPercent: doc.skillMatch?.percent ?? 0,
    skillMatch: {
      percent: doc.skillMatch?.percent ?? 0,
      matched: doc.skillMatch?.matched || [],
      missing: doc.skillMatch?.missing || [],
      extra: doc.skillMatch?.extra || [],
      degraded: Boolean(doc.skillMatch?.degraded),
    },
    projectRelevance: doc.projectRelevance || null,
    experienceRelevance: doc.experienceRelevance || null,
    atsSubscore: doc.atsSubscore ?? null,
    breakdown: doc.breakdown || [],
    summary: doc.summary || "",
    createdAt: doc.createdAt,
    // What the baseline is judged against, so the UI can say it out loud.
    target: {
      title: target.title,
      roleKey: target.implicitRoleKey,
      requiredSkillCount: target.parsed.requiredSkills.length,
    },
    resumeVersionId: version._id,
    versionNumber: version.versionNumber,
    model: doc.model || "",
  };
}

/**
 * Score one resume version against the implicit target role.
 *
 * Unlike a JD score, this is CACHED on the version: the target is derived from
 * the version itself, so it can only change when the version changes. No
 * `jdId` is stored (the schema requires one), which is exactly why the result
 * is never picked up by a per-JD query.
 *
 * @param {Object} args
 * @param {ObjectId} args.userId
 * @param {ObjectId} [args.resumeId]  defaults to the student's newest resume
 * @param {ObjectId} [args.versionId] defaults to that resume's current version
 * @param {Object}  [args.roleProfile] StudentRoleProfile, optional
 * @param {Boolean} [args.force] recompute even if a valid baseline exists
 */
async function computeResumeBaseline({
  userId,
  resumeId = null,
  versionId = null,
  roleProfile = null,
  force = false,
}) {
  const resume = resumeId
    ? await Resume.findOne({ _id: resumeId, userId })
    : await Resume.findOne({ userId }).sort({ updatedAt: -1 });
  if (!resume) return null;

  const targetVersionId = versionId || resume.currentVersionId;
  if (!targetVersionId) return null;

  const version = await ResumeVersion.findOne({ _id: targetVersionId, resumeId: resume._id });
  if (!version) return null;

  const cacheKey = baselineCacheKey(version);

  if (!force) {
    const cached = await ReadinessScore.findOne({ userId, cacheKey }).sort({ createdAt: -1 });
    if (cached) {
      const target = buildImplicitTarget({
        roleKey: cached.implicitRoleKey || resolveRoleKey({ roleProfile, resumeVersion: version }),
        resumeVersion: version,
      });
      return shapeBaseline(cached, { version, target });
    }
  }

  const roleKey = resolveRoleKey({ roleProfile, resumeVersion: version });
  const target = buildImplicitTarget({ roleKey, resumeVersion: version });

  const latestAnalysis = await Analysis.findOne({
    resumeId: resume._id,
    versionId: version._id,
  }).sort({ createdAt: -1 });

  const match = await matchSkills({ jd: target, resumeVersion: version });
  const computed = buildReadinessScore({
    jd: target,
    match,
    atsScore: latestAnalysis?.atsScore ?? null,
  });

  // Anchoring on a real JD keeps the schema (and every per-JD query) intact
  // while the score itself stays attributable to the resume baseline.
  const anchorJdId = await resolveAnchorJdId({ userId, resume, match });

  const saved = await ReadinessScore.create({
    userId,
    resumeVersionId: version._id,
    jdId: anchorJdId,
    source: "resume_baseline",
    implicitRoleKey: roleKey,
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

  return shapeBaseline(saved, { version, target });
}

/**
 * ReadinessScore.jdId is required, so a baseline needs *some* posting to point
 * at. Prefer a JD of the student's own, which makes the anchor harmless; fall
 * back to the first JD they can see (their college's). If nothing exists at
 * all the baseline cannot be stored — callers handle a null result.
 */
async function resolveAnchorJdId({ userId, resume, match }) {
  const JobDescription = require("../models/JobDescription");

  const own = await JobDescription.findOne({ ownerUserId: userId })
    .select("_id")
    .sort({ createdAt: -1 })
    .lean();
  if (own) return own._id;

  const User = require("../shared/auth/User");
  const user = await User.findById(userId).select("collegeId").lean();
  if (user?.collegeId) {
    const collegeJd = await JobDescription.findOne({ collegeId: user.collegeId })
      .select("_id")
      .sort({ createdAt: -1 })
      .lean();
    if (collegeJd) return collegeJd._id;
  }

  return null;
}

/** Latest stored baseline for a user (optionally a specific version). */
async function findLatestBaseline({ userId, versionId = null }) {
  const filter = { userId, source: "resume_baseline" };
  if (versionId) filter.resumeVersionId = versionId;
  return ReadinessScore.findOne(filter).sort({ createdAt: -1 }).lean();
}

/**
 * Reshape a stored baseline doc for display without touching the DB. Needs only
 * the version for its number, which the caller usually already has.
 */
async function shapeStoredBaseline(doc) {
  if (!doc) return null;
  const version = await ResumeVersion.findById(doc.resumeVersionId)
    .select("versionNumber parsedSections")
    .lean();
  if (!version) return null;

  const target = buildImplicitTarget({
    roleKey: doc.implicitRoleKey || "general",
    resumeVersion: version,
  });
  return shapeBaseline(doc, { version, target });
}

module.exports = {
  ROLE_CORPUS,
  resolveRoleKey,
  buildImplicitTarget,
  computeResumeBaseline,
  findLatestBaseline,
  shapeStoredBaseline,
};
