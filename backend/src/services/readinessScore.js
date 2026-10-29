const { skillLabel } = require("./normalizeSkills");

/**
 * Weighted composite Readiness Score — pure arithmetic, no AI.
 *
 * Kept deliberately separate from skillMatch.js so the weights can be tuned (or
 * defended in the paper) without touching the model calls, and so the number is
 * reproducible by hand from the four sub-scores.
 *
 *   composite = 0.45·skillMatch + 0.20·projectRelevance
 *             + 0.15·experienceRelevance + 0.20·ats
 *
 * Skill match dominates because it is what a recruiter screens on. ATS is 20%
 * because presentation quality genuinely gates whether a human ever sees the
 * resume — but it must not outweigh actual skill fit.
 */
const WEIGHTS = {
  skillMatch: 0.45,
  projectRelevance: 0.2,
  experienceRelevance: 0.15,
  ats: 0.2,
};

const LABELS = {
  skillMatch: "Skill match",
  projectRelevance: "Project relevance",
  experienceRelevance: "Experience relevance",
  ats: "Resume quality (ATS)",
};

/**
 * Skill-match percentage.
 *
 * Weighted by importance rather than a plain ratio: missing a *must* skill
 * should hurt more than missing a *nice* one. Credits transferable matches at
 * 80% — a genuinely adjacent technology covers the requirement but is not the
 * same as having it directly.
 */
function computeSkillMatchPercent(matched, missing, jdSkills) {
  const required = jdSkills || [];
  if (required.length === 0) return 0;

  const matchedByCanonical = new Map();
  for (const m of matched || []) {
    matchedByCanonical.set(
      String(m.jdSkill || "").toLowerCase(),
      m.strength === "transferable" ? 0.8 : 1
    );
  }

  let earned = 0;
  let total = 0;

  for (const req of required) {
    const weight = req.importance === "nice" ? 1 : 2; // must-skills count double
    total += weight;

    const key = String(req.label || req.name || "").toLowerCase();
    const direct = String(req.name || "").toLowerCase();

    const credit = matchedByCanonical.get(key) ?? matchedByCanonical.get(direct);
    if (credit != null) earned += weight * credit;
  }

  if (total === 0) return 0;
  return Math.round((earned / total) * 100);
}

function clampPercent(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * Build the composite score document payload.
 *
 * @param {Object} args
 * @param {Object} args.jd            JobDescription (parsed.requiredSkills)
 * @param {Object} args.match         output of matchSkills()
 * @param {Number} args.atsScore      latest ATS score for this resume version (0-100), or null
 */
function buildReadinessScore({ jd, match, atsScore }) {
  const jdSkills = jd?.parsed?.requiredSkills || [];

  const skillPercent = computeSkillMatchPercent(match.matched, match.missing, jdSkills);
  const projectPercent = clampPercent(match.projectRelevance?.percent);
  const experiencePercent = clampPercent(match.experienceRelevance?.percent);

  // A resume version with no analysis yet contributes 0 rather than being
  // ignored — otherwise a candidate could look "ready" purely by never having
  // been scored. The breakdown shows the zero so it is obvious why.
  const atsPercent = atsScore == null ? 0 : clampPercent(atsScore);

  const values = {
    skillMatch: skillPercent,
    projectRelevance: projectPercent,
    experienceRelevance: experiencePercent,
    ats: atsPercent,
  };

  const breakdown = Object.keys(WEIGHTS).map((key) => ({
    key,
    label: LABELS[key],
    weight: WEIGHTS[key],
    value: values[key],
    contribution: Math.round(values[key] * WEIGHTS[key] * 100) / 100,
  }));

  const composite = Math.round(
    breakdown.reduce((sum, b) => sum + b.contribution, 0)
  );

  return {
    skillMatchPercent: skillPercent,
    composite: Math.max(0, Math.min(100, composite)),
    breakdown,
    weights: { ...WEIGHTS },
  };
}

/**
 * Named readiness bands. Used for the ring colour and the placement-cell
 * distribution chart, so the vocabulary is identical everywhere.
 */
function readinessBand(score) {
  if (score >= 80) return { key: "excellent", label: "Interview-ready" };
  if (score >= 65) return { key: "strong", label: "Strong" };
  if (score >= 45) return { key: "developing", label: "Developing" };
  return { key: "early", label: "Early" };
}

module.exports = {
  WEIGHTS,
  LABELS,
  buildReadinessScore,
  computeSkillMatchPercent,
  readinessBand,
  skillLabel,
};
