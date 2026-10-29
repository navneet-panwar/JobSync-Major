const { Type } = require("@google/genai");
const { z } = require("zod");

const { ai } = require("../shared/gemini/client");
const { runGemini } = require("../shared/gemini/runGemini");
const { normalizeSkillName, skillLabel, skillsMatch } = require("./normalizeSkills");

/**
 * Semantic skill match — resume skills × JD required skills.
 *
 * The one thing this must NOT do is exact string matching: a JD asking for
 * "React" and a resume saying "ReactJS" are the same skill, and a placement
 * cell ranking students on literal string overlap would report a false gap for
 * every one of them.
 *
 * The AI call is given the RESUME CONTEXT (projects, experience bullets), not
 * just the skills array, because a resume that lists "Express" but whose
 * projects say "built a Node.js REST API" genuinely covers the JD's
 * "Node.js backend" requirement. Judging the skills array alone under-counts.
 */

const responseSchema = {
  type: Type.OBJECT,
  required: ["matched", "missing", "extra", "projectRelevance", "experienceRelevance", "summary"],
  properties: {
    matched: {
      type: Type.ARRAY,
      description:
        "JD required skills the resume genuinely covers, directly or through an equivalent/related technology.",
      items: {
        type: Type.OBJECT,
        required: ["jdSkill", "evidence", "strength"],
        properties: {
          jdSkill: {
            type: Type.STRING,
            description: "The required skill, spelled as the JD spells it.",
          },
          evidence: {
            type: Type.STRING,
            description:
              "Where the resume demonstrates it — quote the actual skill, project tech or bullet.",
          },
          strength: {
            type: Type.STRING,
            enum: ["direct", "transferable"],
            description:
              "direct = same technology named; transferable = an adjacent technology that genuinely carries the skill (Express → Node.js backend), not a guess.",
          },
        },
      },
    },
    missing: {
      type: Type.ARRAY,
      description: "JD required skills with NO genuine coverage anywhere in the resume.",
      items: {
        type: Type.OBJECT,
        required: ["jdSkill", "importance"],
        properties: {
          jdSkill: { type: Type.STRING },
          importance: { type: Type.STRING, enum: ["must", "nice"] },
        },
      },
    },
    extra: {
      type: Type.ARRAY,
      description:
        "Notable skills the resume has that the JD does not ask for. Max 12.",
      items: { type: Type.STRING },
    },
    projectRelevance: {
      type: Type.OBJECT,
      required: ["percent", "rationale"],
      properties: {
        percent: {
          type: Type.NUMBER,
          description:
            "0-100. How well the candidate's projects demonstrate the technologies and work this JD needs. Judge substance (what was built), not project count.",
        },
        rationale: { type: Type.STRING, description: "One or two sentences." },
      },
    },
    experienceRelevance: {
      type: Type.OBJECT,
      required: ["percent", "rationale"],
      properties: {
        percent: {
          type: Type.NUMBER,
          description:
            "0-100. How relevant the candidate's work experience is to this role — domain, responsibilities and seniority. A student with only internships is not penalised to zero if those internships are on-point.",
        },
        rationale: { type: Type.STRING },
      },
    },
    summary: {
      type: Type.STRING,
      description: "Two sentences a placement cell could put in front of a student.",
    },
  },
};

const validator = z.object({
  matched: z
    .array(
      z.object({
        jdSkill: z.string(),
        evidence: z.string().default(""),
        strength: z.enum(["direct", "transferable"]).default("direct"),
      })
    )
    .default([]),
  missing: z
    .array(
      z.object({
        jdSkill: z.string(),
        importance: z.enum(["must", "nice"]).default("must"),
      })
    )
    .default([]),
  extra: z.array(z.string()).default([]),
  projectRelevance: z
    .object({
      percent: z.number().min(0).max(100),
      rationale: z.string().default(""),
    })
    .default({ percent: 0, rationale: "" }),
  experienceRelevance: z
    .object({
      percent: z.number().min(0).max(100),
      rationale: z.string().default(""),
    })
    .default({ percent: 0, rationale: "" }),
  summary: z.string().default(""),
});

function buildPrompt({ jd, resumeVersion }) {
  const sections = resumeVersion?.parsedSections || {};
  const skills = (sections.skills || []).map((s) => `- ${s}`).join("\n") || "- (none listed)";

  const projects =
    (sections.projects || [])
      .slice(0, 8)
      .map(
        (p) =>
          `- ${p.name || "Untitled"}: ${p.description || ""}${p.tech?.length ? ` [tech: ${p.tech.join(", ")}]` : ""
          }`
      )
      .join("\n") || "- (none listed)";

  const experience =
    (sections.experience || [])
      .slice(0, 6)
      .map(
        (e) =>
          `- ${e.role || "Role"} at ${e.company || "Company"} (${e.period || "dates n/a"})\n` +
          (e.bullets || []).slice(0, 5).map((b) => `    • ${b}`).join("\n")
      )
      .join("\n") || "- (none listed)";

  const required =
    (jd?.parsed?.requiredSkills || [])
      .map((s) => `- ${s.label || s.name} (${s.importance})`)
      .join("\n") || "- (none)";

  return [
    "You are a technical recruiter comparing ONE candidate's resume against ONE job description.",
    "",
    "Your job is an accurate GAP ANALYSIS, not encouragement. Do not credit a skill the candidate does not have; do not deny one they clearly do.",
    "",
    "Job description:",
    `Title: ${jd?.title || "unknown"}`,
    jd?.company ? `Company: ${jd.company}` : "",
    jd?.location ? `Location: ${jd.location}` : "",
    `Experience level: ${jd?.experienceLevel || "unspecified"}`,
    jd?.parsed?.summary ? `Summary: ${jd.parsed.summary}` : "",
    "",
    "Required skills:",
    required,
    "",
    jd?.parsed?.responsibilities?.length
      ? `Responsibilities:\n${jd.parsed.responsibilities.map((r) => `- ${r}`).join("\n")}`
      : "",
    "",
    "─── CANDIDATE ───",
    `Summary: ${sections.summary || "(none)"}`,
    "",
    `Listed skills:\n${skills}`,
    "",
    `Projects:\n${projects}`,
    "",
    `Experience:\n${experience}`,
    "",
    "─── RULES ───",
    "1. A required skill is MATCHED only if the resume genuinely demonstrates it — in the skills list, a project's tech, or a work bullet.",
    "2. 'transferable' is allowed ONLY for a real adjacent technology that carries the skill (Express → Node.js backend; Next.js → React). Never credit an unrelated tool to make the numbers look better.",
    "3. Everything else goes in `missing` with the JD's own importance value.",
    "4. Judge projects on SUBSTANCE — what was actually built and its complexity — not on how many projects are listed.",
    "5. Judge experience on domain, responsibility and seniority fit. Be fair to students: strong internships and real projects count.",
    "6. Be honest. If the candidate is a poor fit for this role, say so plainly in the summary and let the percentages reflect it.",
  ].filter(Boolean).join("\n");
}

/**
 * Deterministic fallback used when the AI is unavailable: exact + alias
 * matching on normalised skill names. Marked `degraded` so the UI can say the
 * result is approximate rather than presenting a guess as an assessment.
 */
function deterministicMatch(jd, resumeVersion) {
  const jdSkills = jd?.parsed?.requiredSkills || [];
  const resumeSkills = resumeVersion?.parsedSections?.skills || [];

  const matched = [];
  const missing = [];

  for (const req of jdSkills) {
    const hit = resumeSkills.find((s) => skillsMatch(s, req.name) || skillsMatch(s, req.label));
    if (hit) {
      matched.push({ jdSkill: req.label || req.name, evidence: hit, strength: "direct" });
    } else {
      missing.push({ jdSkill: req.label || req.name, importance: req.importance || "must" });
    }
  }

  const matchedNames = new Set(matched.map((m) => normalizeSkillName(m.jdSkill)));
  const extra = resumeSkills
    .map((s) => normalizeSkillName(s))
    .filter((s) => s && !matchedNames.has(s))
    .slice(0, 12)
    .map(skillLabel);

  return {
    matched,
    missing,
    extra,
    projectRelevance: { percent: 0, rationale: "Not assessed — AI unavailable." },
    experienceRelevance: { percent: 0, rationale: "Not assessed — AI unavailable." },
    summary:
      "Approximate result: the AI match service was unavailable, so this reflects exact skill-name overlap only.",
    degraded: true,
  };
}

/**
 * Run the semantic match. Falls back to the deterministic matcher rather than
 * failing the whole readiness computation — a degraded score with a visible
 * flag is more useful to a placement cell than an error.
 */
async function matchSkills({ jd, resumeVersion }) {
  if (!ai) return deterministicMatch(jd, resumeVersion);

  const prompt = buildPrompt({ jd, resumeVersion });

  try {
    const { data, model, promptTokens, responseTokens } = await runGemini({
      label: "Skill match",
      zodSchema: validator,
      retriesPerModel: 2,
      backoffMs: 1000,
      call: async (modelName) => {
        const result = await ai.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema,
            temperature: 0.1,
            maxOutputTokens: 4096,
          },
        });
        const text =
          typeof result.text === "function" ? result.text() : result.text;
        return { text, usage: result.usageMetadata || {} };
      },
      onError: (attempt, modelName, err) => {
        console.warn(
          `Skill match attempt ${attempt} with ${modelName} failed:`,
          err.message || err
        );
      },
    });

    // Guard against a model that credits the same skill twice, or returns a
    // skill in both lists.
    const missingNames = new Set(data.missing.map((m) => normalizeSkillName(m.jdSkill)));
    const matched = data.matched.filter(
      (m) => !missingNames.has(normalizeSkillName(m.jdSkill))
    );

    const totalRequired = jd?.parsed?.requiredSkills?.length || 0;
    const accountedFor = matched.length + data.missing.length;

    // A model that silently drops required skills would inflate the match rate,
    // so re-add anything it forgot to mention as missing.
    const mentioned = new Set(
      [...matched.map((m) => m.jdSkill), ...data.missing.map((m) => m.jdSkill)].map(
        normalizeSkillName
      )
    );
    const forgotten = (jd?.parsed?.requiredSkills || [])
      .filter((s) => !mentioned.has(normalizeSkillName(s.name)))
      .map((s) => ({ jdSkill: s.label || s.name, importance: s.importance || "must" }));

    return {
      matched,
      missing: [...data.missing, ...forgotten],
      extra: data.extra.slice(0, 12),
      projectRelevance: data.projectRelevance,
      experienceRelevance: data.experienceRelevance,
      summary: data.summary,
      degraded: false,
      // Diagnostics: how many required skills the model actually accounted for.
      coverage: totalRequired ? accountedFor / totalRequired : 1,
      model,
      promptTokens,
      responseTokens,
    };
  } catch (err) {
    console.warn("Skill match fell back to deterministic matching:", err.message);
    return deterministicMatch(jd, resumeVersion);
  }
}

module.exports = { matchSkills, deterministicMatch, buildPrompt };
