const { Type } = require("@google/genai");
const { z } = require("zod");

const { ai } = require("../shared/gemini/client");
const { runGemini } = require("../shared/gemini/runGemini");
const { skillLabel } = require("./normalizeSkills");

/**
 * roleExtract — infer the job roles a resume is actually targeting, from the
 * resume's own text.
 *
 * This powers the placement cell's "students by role" view. It is a DIFFERENT
 * question from skill matching: skill match answers "does this person fit THIS
 * role", while this answers "which roles does this person's resume point at at
 * all" — the shortlist a cell starts from before a specific JD exists.
 *
 * The output is normalised to a stable key so "SDE", "Software Engineer" and
 * "Software Development Engineer" collapse to one role bucket rather than
 * fragmenting the filter into three near-identical options.
 */

const responseSchema = {
  type: Type.OBJECT,
  required: ["roles"],
  properties: {
    roles: {
      type: Type.ARRAY,
      description:
        "Roles this resume plausibly targets, most likely first. 1-5 entries. Do not pad the list.",
      items: {
        type: Type.OBJECT,
        required: ["label", "confidence", "evidence"],
        properties: {
          label: {
            type: Type.STRING,
            description:
              "A standard, hireable role title, e.g. 'Backend Engineer', 'Data Analyst', 'Frontend Developer'. Not a company name, not a skill.",
          },
          confidence: {
            type: Type.NUMBER,
            description:
              "0-100. How strongly the resume's own content supports this role — summary, titled experience, and project substance. A generic fresher resume with no direction should score low, not 90.",
          },
          evidence: {
            type: Type.STRING,
            description:
              "One short phrase naming what implies this role (e.g. 'summary states Backend Developer; two Node.js APIs').",
          },
        },
      },
    },
  },
};

const validator = z.object({
  roles: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        confidence: z.number().min(0).max(100).default(50),
        evidence: z.string().default(""),
      })
    )
    .default([]),
});

/**
 * Canonical role key. Lowercase, collapse punctuation/whitespace, and fold a
 * handful of very common Indian-campus abbreviations so "SDE" and "Software
 * Development Engineer" land in the same bucket instead of two.
 */
const ROLE_ALIASES = {
  sde: "software engineer",
  "sde-1": "software engineer",
  "sde 1": "software engineer",
  "sde1": "software engineer",
  "software developer": "software engineer",
  "software development engineer": "software engineer",
  "software engineer": "software engineer",
  "full stack developer": "full stack engineer",
  "full-stack developer": "full stack engineer",
  "fullstack developer": "full stack engineer",
  "front end developer": "frontend engineer",
  "frontend developer": "frontend engineer",
  "front-end developer": "frontend engineer",
  "back end developer": "backend engineer",
  "backend developer": "backend engineer",
  "back-end developer": "backend engineer",
  "nodejs developer": "backend engineer",
  "java developer": "backend engineer",
  "python developer": "backend engineer",
  "data scientist": "data scientist",
  "ml engineer": "machine learning engineer",
  "machine learning engineer": "machine learning engineer",
  "ai engineer": "machine learning engineer",
  "data analyst": "data analyst",
  "business analyst": "business analyst",
  "qa engineer": "qa engineer",
  "test engineer": "qa engineer",
  "devops engineer": "devops engineer",
  "cloud engineer": "devops engineer",
  "android developer": "mobile engineer",
  "ios developer": "mobile engineer",
  "mobile developer": "mobile engineer",
  "ui developer": "frontend engineer",
  "ui/ux designer": "ui/ux designer",
  "ux designer": "ui/ux designer",
};

function normalizeRoleKey(label) {
  const base = String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#./ -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return "";
  return ROLE_ALIASES[base] || base;
}

function roleLabelFromKey(key) {
  return String(key || "")
    .split(" ")
    .map((w) => (w === "ui/ux" ? "UI/UX" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function buildPrompt({ resumeVersion }) {
  const s = resumeVersion?.parsedSections || {};

  const experience =
    (s.experience || [])
      .slice(0, 6)
      .map(
        (e) =>
          `- ${e.role || "Role"} at ${e.company || "Company"} (${e.period || "dates n/a"})`
      )
      .join("\n") || "- (none listed)";

  const projects =
    (s.projects || [])
      .slice(0, 8)
      .map(
        (p) =>
          `- ${p.name || "Untitled"}: ${p.description || ""}${p.tech?.length ? ` [tech: ${p.tech.join(", ")}]` : ""
          }`
      )
      .join("\n") || "- (none listed)";

  return [
    "You are a campus placement officer reading ONE student's resume to decide which job roles to shortlist them for.",
    "",
    "Return the roles this resume genuinely targets — the roles a recruiter would interview this person for TODAY.",
    "",
    "Resume:",
    `Basics title: ${s.basics?.title || "(none)"}`,
    `Summary: ${s.summary || "(none)"}`,
    "",
    `Skills: ${(s.skills || []).join(", ") || "(none listed)"}`,
    "",
    `Experience:\n${experience}`,
    "",
    `Projects:\n${projects}`,
    "",
    "─── RULES ───",
    "1. Roles must be real, hireable job titles (Backend Engineer, Data Analyst) — never a bare skill (React) or a company (Infosys).",
    "2. Judge from EVIDENCE: the stated title, the summary's direction, and what the projects actually built. A resume with only web CRUD projects does not target 'Machine Learning Engineer'.",
    "3. A resume with no clear direction should return few roles with LOW confidence — do not invent five to fill the list.",
    "4. Return at most 5 roles, most likely first. Fewer is better than padded.",
    "5. confidence reflects how strongly THIS resume supports the role, not how common the role is.",
  ].join("\n");
}

/**
 * Deterministic fallback when the AI is unavailable: derive coarse roles from
 * the listed skills. Deliberately conservative — it produces a usable shortlist
 * rather than an authoritative one, and the caller marks the profile degraded.
 */
function deterministicRoles(resumeVersion) {
  const s = resumeVersion?.parsedSections || {};
  const skills = (s.skills || []).map((x) => String(x).toLowerCase());
  const title = String(s.basics?.title || "").toLowerCase();

  const has = (re) => skills.some((x) => re.test(x));
  const out = [];

  const push = (label, confidence, evidence) =>
    out.push({ label, confidence, evidence });

  if (/frontend|front-end|react|vue|angular/.test(title) || (has(/react|vue|angular/) && has(/css|html|tailwind/))) {
    push("Frontend Engineer", 60, "Resume lists frontend frameworks and styling.");
  }
  if (/backend|back-end|node|java|spring|django|express/.test(title) || has(/node\.js|express|django|spring/)) {
    push("Backend Engineer", 60, "Resume lists backend frameworks/runtimes.");
  }
  if (has(/machine learning|tensorflow|pytorch|scikit|pandas|numpy/) || /ml|data scien/.test(title)) {
    push("Machine Learning Engineer", 55, "Resume lists ML tooling.");
  }
  if (has(/sql|power bi|tableau|excel|analytics/)) {
    push("Data Analyst", 50, "Resume lists analytics tooling.");
  }
  if (has(/mongodb|mysql|postgres|firebase/) && !out.length) {
    push("Software Engineer", 45, "Resume lists general software and database skills.");
  }

  return out.length ? out : [{ label: "Software Engineer", confidence: 30, evidence: "No strong role signal in the resume." }];
}

/**
 * Extract roles. Never throws for the caller: an AI outage yields the
 * deterministic shortlist plus `degraded: true`, because a slightly coarse role
 * list is more useful to a placement cell than an error page.
 */
async function extractRoles({ resumeVersion }) {
  if (!ai) {
    return { roles: shapeRoles(deterministicRoles(resumeVersion)), degraded: true, model: "heuristic" };
  }

  try {
    const { data, model, promptTokens, responseTokens } = await runGemini({
      label: "Role extraction",
      zodSchema: validator,
      retriesPerModel: 2,
      backoffMs: 1000,
      call: async (modelName) => {
        const result = await ai.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [{ text: buildPrompt({ resumeVersion }) }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema,
            temperature: 0.2,
            maxOutputTokens: 2048,
          },
        });
        const text = typeof result.text === "function" ? result.text() : result.text;
        return { text, usage: result.usageMetadata || {} };
      },
      onError: (attempt, modelName, err) =>
        console.warn(`Role extraction attempt ${attempt} with ${modelName} failed:`, err.message || err),
    });

    return {
      roles: shapeRoles(data.roles),
      degraded: false,
      model,
      promptTokens,
      responseTokens,
    };
  } catch (err) {
    console.warn("Role extraction fell back to heuristics:", err.message);
    return { roles: shapeRoles(deterministicRoles(resumeVersion)), degraded: true, model: "heuristic" };
  }
}

/** Normalise, dedupe by canonical key, cap, and sort by confidence. */
function shapeRoles(roles) {
  const seen = new Map();
  for (const r of roles || []) {
    const key = normalizeRoleKey(r.label);
    if (!key) continue;
    const entry = {
      key,
      label: roleLabelFromKey(key),
      confidence: Math.round(Number(r.confidence) || 0),
      evidence: String(r.evidence || "").slice(0, 200),
      source: "resume",
    };
    const existing = seen.get(key);
    // Keep the strongest evidence for a role the model mentioned twice.
    if (!existing || entry.confidence > existing.confidence) seen.set(key, entry);
  }
  return [...seen.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

module.exports = {
  extractRoles,
  normalizeRoleKey,
  roleLabelFromKey,
  shapeRoles,
  skillLabel,
};