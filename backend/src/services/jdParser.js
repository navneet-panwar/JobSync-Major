const { Type } = require("@google/genai");
const { z } = require("zod");
const crypto = require("crypto");

const { ai } = require("../shared/gemini/client");
const { runGemini } = require("../shared/gemini/runGemini");
const { normalizeSkillName, skillLabel } = require("./normalizeSkills");

/**
 * Job-description parser — the same pattern as structuredParser.js:
 * shared multi-model fallback runner, JSON mode + response schema, Zod
 * validation before anything is persisted, plus a sanitisation pass.
 */

const responseSchema = {
  type: Type.OBJECT,
  required: ["title", "company", "location", "experienceLevel", "requiredSkills", "responsibilities", "keywords"],
  properties: {
    title: {
      type: Type.STRING,
      description: "The job title, e.g. 'Backend Engineer'. Empty string if absent.",
    },
    company: {
      type: Type.STRING,
      description: "Hiring company name. Empty string if absent.",
    },
    location: {
      type: Type.STRING,
      description: "Location or 'Remote'. Empty string if absent.",
    },
    experienceLevel: {
      type: Type.STRING,
      enum: ["internship", "entry", "mid", "senior", "lead", "unspecified"],
      description:
        "Required experience band. internship=student/intern, entry=0-2y, mid=2-5y, senior=5-8y, lead=8y+/staff/principal. unspecified when the JD does not say.",
    },
    requiredSkills: {
      type: Type.ARRAY,
      description:
        "Concrete, verifiable technical skills, tools, technologies and methodologies the role requires. Max 30. Do NOT include soft skills, generic phrases ('good communication'), or the company name.",
      items: {
        type: Type.OBJECT,
        required: ["name", "importance"],
        properties: {
          name: { type: Type.STRING, description: "The skill, e.g. 'Docker'" },
          importance: {
            type: Type.STRING,
            enum: ["must", "nice"],
            description:
              "must = explicitly required or core to the role; nice = 'bonus', 'plus', 'familiarity with'.",
          },
        },
      },
    },
    responsibilities: {
      type: Type.ARRAY,
      description: "The main duties, one short sentence each. Max 8.",
      items: { type: Type.STRING },
    },
    keywords: {
      type: Type.ARRAY,
      description:
        "Other terms an ATS would screen for that are not already in requiredSkills — certifications, domain terms, methodologies. Max 20.",
      items: { type: Type.STRING },
    },
    senioritySignals: {
      type: Type.ARRAY,
      description:
        "Short quotes from the JD that justify the experienceLevel, e.g. '5+ years of experience'. Max 4.",
      items: { type: Type.STRING },
    },
    summary: {
      type: Type.STRING,
      description: "One sentence describing the role.",
    },
  },
};

const validator = z.object({
  title: z.string().default(""),
  company: z.string().default(""),
  location: z.string().default(""),
  experienceLevel: z
    .enum(["internship", "entry", "mid", "senior", "lead", "unspecified"])
    .default("unspecified"),
  requiredSkills: z
    .array(
      z.object({
        name: z.string(),
        importance: z.enum(["must", "nice"]).default("must"),
      })
    )
    .default([]),
  responsibilities: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  senioritySignals: z.array(z.string()).default([]),
  summary: z.string().default(""),
});

function buildPrompt(rawText) {
  return [
    "You are parsing a job description for an applicant-tracking system.",
    "",
    "Extract structured data:",
    "- title, company, location, experienceLevel",
    "- requiredSkills: the CONCRETE technical skills the role requires, each marked must or nice",
    "- responsibilities: what the person will actually do",
    "- keywords: other ATS-relevant terms not already listed as skills",
    "- senioritySignals: short quotes justifying the experience level",
    "- summary: one sentence",
    "",
    "Rules:",
    "- title is REQUIRED: use the posting's own job title (e.g. 'Frontend Engineer (React)'). If the posting never states one, infer the most accurate short title from the responsibilities — never leave it empty.",
    "- Extract only what is present. Never invent a technology the JD does not mention.",
    "- Prefer canonical technology names: 'Node.js' not 'node backend', 'PostgreSQL' not 'postgres db'.",
    "- Exclude vague requirements ('team player', 'fast-paced environment', 'good communication').",
    "- Exclude the company's own name and generic business terms from requiredSkills.",
    "- Distinguish must (requirement) from nice ('bonus', 'plus', 'exposure to').",
    "- Keep each skill under 40 characters.",
    "",
    "JOB DESCRIPTION TEXT:",
    "──────────",
    rawText,
    "──────────",
  ].join("\n");
}

/**
 * Sanitise model output before validation/persistence:
 *  - trim and bound every skill, dropping empties / runaway strings
 *  - cap list sizes so a hallucinating model can't bloat the document
 */
function sanitize(parsed) {
  const cleanList = (arr, max, maxLen) =>
    (Array.isArray(arr) ? arr : [])
      .filter((v) => typeof v === "string")
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && v.length <= maxLen)
      .slice(0, max);

  const skills = (Array.isArray(parsed.requiredSkills) ? parsed.requiredSkills : [])
    .map((s) => ({
      name: typeof s?.name === "string" ? s.name.trim() : "",
      importance: s?.importance === "nice" ? "nice" : "must",
    }))
    .filter((s) => s.name.length > 0 && s.name.length <= 60)
    .slice(0, 30);

  // Canonicalise + de-duplicate. A later "must" beats an earlier "nice", so a
  // skill listed as a bonus in one bullet and required in another stays
  // required.
  const byCanonical = new Map();
  for (const s of skills) {
    const canonical = normalizeSkillName(s.name);
    if (!canonical) continue;
    const existing = byCanonical.get(canonical);
    if (!existing) {
      byCanonical.set(canonical, {
        name: canonical,
        label: skillLabel(canonical),
        importance: s.importance,
      });
    } else if (s.importance === "must") {
      existing.importance = "must";
    }
  }

  return {
    title: typeof parsed.title === "string" ? parsed.title.trim().slice(0, 140) : "",
    company: typeof parsed.company === "string" ? parsed.company.trim().slice(0, 140) : "",
    location: typeof parsed.location === "string" ? parsed.location.trim().slice(0, 140) : "",
    experienceLevel: parsed.experienceLevel || "unspecified",
    requiredSkills: [...byCanonical.values()],
    responsibilities: cleanList(parsed.responsibilities, 8, 400),
    keywords: cleanList(parsed.keywords, 20, 80),
    senioritySignals: cleanList(parsed.senioritySignals, 4, 200),
    summary: typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 500) : "",
  };
}

/** Stable hash of the meaningful text — used to skip duplicate AI calls. */
function contentHash(rawText) {
  return crypto
    .createHash("sha256")
    .update(String(rawText || "").replace(/\s+/g, " ").trim().toLowerCase())
    .digest("hex");
}

/**
 * Best-effort title from the raw text, used when the model returns none.
 * The first non-empty line of a posting is almost always its title.
 */
function titleFromText(rawText) {
  const firstLine = String(rawText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length >= 3 && l.length <= 90);
  return firstLine || "";
}

/**
 * Parse a job description into structured JSON.
 *
 * Throws a 503-tagged operational error when every model fails, exactly like
 * structuredParser — the route turns that into a retryable message rather than
 * silently creating a JD with no skills (which would then score every student
 * against nothing).
 */
async function parseJobDescription(rawText) {
  if (!ai) {
    const err = new Error(
      "AI job-description parsing is not configured on this server."
    );
    err.statusCode = 503;
    err.isOperational = true;
    err.isAiFailure = true;
    throw err;
  }
  if (!rawText || rawText.trim().length < 40) {
    const err = new Error(
      "That job description is too short to parse — paste the full posting."
    );
    err.statusCode = 400;
    err.isOperational = true;
    throw err;
  }

  const prompt = buildPrompt(rawText);

  try {
    const { data, model, promptTokens, responseTokens } = await runGemini({
      label: "JD parse",
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
            temperature: 0.2,
            maxOutputTokens: 4096,
          },
        });
        const text =
          typeof result.text === "function" ? result.text() : result.text;
        return { text, usage: result.usageMetadata || {} };
      },
      onError: (attempt, modelName, err) => {
        console.warn(
          `JD parse attempt ${attempt} with ${modelName} failed:`,
          err.message || err
        );
      },
    });

    return {
      parsed: sanitize(data),
      model,
      promptTokens,
      responseTokens,
      contentHash: contentHash(rawText),
    };
  } catch (err) {
    console.error("JD parse failed across all models.");
    const wrapped = new Error(
      "Couldn't read that job description right now — the parsing service is unavailable."
    );
    wrapped.statusCode = 503;
    wrapped.isOperational = true;
    wrapped.isAiFailure = true;
    wrapped.cause = err;
    throw wrapped;
  }
}

module.exports = { parseJobDescription, contentHash, sanitize, validator, titleFromText };
