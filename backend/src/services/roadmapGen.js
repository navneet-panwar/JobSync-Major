const { Type } = require("@google/genai");
const { z } = require("zod");

const { ai } = require("../shared/gemini/client");
const { runGemini } = require("../shared/gemini/runGemini");
const { normalizeSkillName, skillLabel } = require("./normalizeSkills");

/**
 * Roadmap generation — turns missing skills into resource-backed milestones.
 *
 * Two hard rules:
 *
 * 1. ONE AI call per batch. A student missing eight skills must not cost eight
 *    Gemini calls; the whole list goes in one prompt and comes back together.
 *
 * 2. URLs are allow-listed. A model asked for "a learning resource" will
 *    confidently produce plausible dead links and occasionally spam domains.
 *    Anything whose host is not on the free-resource list is DROPPED — the
 *    item still ships, just without a clickable link.
 */

// Hosts that are genuinely free to read and stable. Keep this tight: an
// unvetted link in a student's roadmap is worse than no link.
const ALLOWED_HOSTS = [
  "developer.mozilla.org",
  "roadmap.sh",
  "www.roadmap.sh",
  "freecodecamp.org",
  "www.freecodecamp.org",
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "docs.python.org",
  "nodejs.org",
  "react.dev",
  "reactjs.org",
  "vuejs.org",
  "angular.io",
  "svelte.dev",
  "typescriptlang.org",
  "docs.docker.com",
  "kubernetes.io",
  "postgresql.org",
  "www.postgresql.org",
  "dev.mysql.com",
  "mongodb.com",
  "www.mongodb.com",
  "redis.io",
  "git-scm.com",
  "docs.github.com",
  "docs.aws.amazon.com",
  "cloud.google.com",
  "learn.microsoft.com",
  "docs.nestjs.com",
  "expressjs.com",
  "djangoproject.com",
  "docs.djangoproject.com",
  "flask.palletsprojects.com",
  "fastapi.tiangolo.com",
  "spring.io",
  "jestjs.io",
  "vitest.dev",
  "docs.cypress.io",
  "playwright.dev",
  "docs.pytest.org",
  "scikit-learn.org",
  "pytorch.org",
  "www.tensorflow.org",
  "pandas.pydata.org",
  "numpy.org",
  "kafka.apache.org",
  "www.rabbitmq.com",
  "www.figma.com",
  "www.atlassian.com",
  "coursera.org",
  "www.coursera.org",
  "nptel.ac.in",
  "swayam.gov.in",
  "w3schools.com",
  "www.w3schools.com",
  "geeksforgeeks.org",
  "www.geeksforgeeks.org",
  "leetcode.com",
  "www.hackerrank.com",
  "neetcode.io",
];

function isAllowedUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    return ALLOWED_HOSTS.includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Strip the scheme/www so a link reads as a source, not a URL dump. */
function resourceLabelFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host;
  } catch {
    return "";
  }
}

const responseSchema = {
  type: Type.OBJECT,
  required: ["items"],
  properties: {
    items: {
      type: Type.ARRAY,
      description: "One item per missing skill, in the same order as the input list.",
      items: {
        type: Type.OBJECT,
        required: ["skill", "title", "description", "milestone"],
        properties: {
          skill: {
            type: Type.STRING,
            description: "The exact missing skill this item addresses, copied from the input.",
          },
          title: {
            type: Type.STRING,
            description:
              "A short, specific learning goal, e.g. 'Learn Docker fundamentals and containerize a service'.",
          },
          description: {
            type: Type.STRING,
            description:
              "Two or three sentences on what to learn and why it matters for this role.",
          },
          resourceLabel: {
            type: Type.STRING,
            description:
              "Display name of a well-known FREE resource, e.g. 'Docker official docs' or 'roadmap.sh'.",
          },
          resourceUrl: {
            type: Type.STRING,
            description:
              "A real URL to that resource. Prefer official documentation of the technology itself. Must be a genuinely existing free page. Empty string if unsure.",
          },
          milestone: {
            type: Type.STRING,
            description:
              "A concrete, self-verifiable 'done' statement, e.g. 'A Dockerfile in your project builds and runs locally'.",
          },
        },
      },
    },
  },
};

const validator = z.object({
  items: z
    .array(
      z.object({
        skill: z.string(),
        title: z.string(),
        description: z.string().default(""),
        resourceLabel: z.string().default(""),
        resourceUrl: z.string().default(""),
        milestone: z.string().default(""),
      })
    )
    .default([]),
});

function buildPrompt({ missingSkills, jd, resumeSummary }) {
  const list = missingSkills
    .map((s, i) => `${i + 1}. ${s.label || s.name} (${s.importance})`)
    .join("\n");

  return [
    "You are a career coach building a focused learning plan.",
    "",
    `Target role: ${jd?.title || "the role"}${jd?.company ? ` at ${jd.company}` : ""}`,
    jd?.parsed?.summary ? `Role summary: ${jd.parsed.summary}` : "",
    resumeSummary ? `Candidate's current level: ${resumeSummary}` : "",
    "",
    "The candidate is MISSING these skills for that role:",
    list,
    "",
    "For EACH skill above, return one roadmap item. Rules:",
    "- `title` must be specific to the skill, not generic ('Learn X' is too vague — say what they will be able to DO).",
    "- `milestone` must be a concrete completion test the candidate could verify alone, with no instructor.",
    "- Order matters: prerequisites first (if one skill builds on another, teach the foundation first).",
    "- `resourceUrl` must be a real, stable, FREE page — official documentation is the best answer. If you are not certain a URL exists, return an empty string instead of guessing.",
    "- Never suggest a paid course, a signup-walled resource, or a link you are unsure about.",
    "- Keep descriptions to 2-3 sentences. Be concrete about what this role actually needs.",
    "- If two skills are closely related (e.g. 'SQL' and 'PostgreSQL'), still return one item per skill but you may cross-reference them.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Deterministic roadmap used when the AI is unavailable. Produces honest,
 * useful items (still with the official docs as a resource) rather than
 * failing the whole request.
 */
function fallbackRoadmap({ missingSkills }) {
  const DOCS = {
    react: "https://react.dev",
    javascript: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
    typescript: "https://www.typescriptlang.org/docs/",
    "node.js": "https://nodejs.org/en/docs",
    docker: "https://docs.docker.com",
    kubernetes: "https://kubernetes.io/docs/home/",
    postgresql: "https://www.postgresql.org/docs/",
    mongodb: "https://www.mongodb.com/docs/",
    redis: "https://redis.io/docs/",
    git: "https://git-scm.com/doc",
    aws: "https://docs.aws.amazon.com",
    python: "https://docs.python.org/3/",
    sql: "https://developer.mozilla.org/en-US/docs/Glossary/SQL",
    "system-design": "https://github.com/donnemartin/system-design-primer",
    "data-structures": "https://neetcode.io/roadmap",
  };

  return {
    items: missingSkills.map((s) => {
      const canonical = normalizeSkillName(s.name);
      const label = s.label || skillLabel(canonical);
      const url = DOCS[canonical] || "";
      return {
        skill: label,
        title: `Build working familiarity with ${label}`,
        description: `This role expects ${label}. Work through the fundamentals and then apply them in your own project so you have something concrete to show.`,
        resourceLabel: url ? resourceLabelFromUrl(url) : "",
        resourceUrl: url,
        milestone: `You can explain ${label} and demonstrate it in a project of your own.`,
      };
    }),
    degraded: true,
  };
}

/**
 * Generate roadmap items for a set of missing skills.
 * Returns items with skill names canonicalised and URLs allow-listed.
 */
async function generateRoadmap({ missingSkills, jd, resumeSummary }) {
  if (!missingSkills?.length) return { items: [], degraded: false };

  if (!ai) return fallbackRoadmap({ missingSkills });

  const prompt = buildPrompt({ missingSkills, jd, resumeSummary });

  try {
    const { data, model, promptTokens, responseTokens } = await runGemini({
      label: "Roadmap generation",
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
            temperature: 0.3,
            maxOutputTokens: 8192,
          },
        });
        const text =
          typeof result.text === "function" ? result.text() : result.text;
        return { text, usage: result.usageMetadata || {} };
      },
      onError: (attempt, modelName, err) => {
        console.warn(
          `Roadmap attempt ${attempt} with ${modelName} failed:`,
          err.message || err
        );
      },
    });

    // Map generated items back onto the requested skills, so we always return
    // EXACTLY the skills asked for — even if the model renamed, reordered or
    // dropped one.
    const bySkill = new Map();
    for (const item of data.items) {
      const key = normalizeSkillName(item.skill);
      if (key && !bySkill.has(key)) bySkill.set(key, item);
    }

    const items = missingSkills.map((s, index) => {
      const canonical = normalizeSkillName(s.name);
      const generated = bySkill.get(canonical);
      const label = s.label || skillLabel(canonical);

      if (!generated) {
        // Model skipped it — fall back to a solid generic item rather than
        // silently omitting a gap from the student's plan.
        return {
          skill: canonical,
          skillLabel: label,
          importance: s.importance || "must",
          title: `Build working familiarity with ${label}`,
          description: `This role expects ${label}. Learn the fundamentals, then use it in a project so you can show it.`,
          resource: { label: "", url: "" },
          milestone: `You can explain ${label} and demonstrate it in your own project.`,
          order: index,
        };
      }

      const url = isAllowedUrl(generated.resourceUrl) ? generated.resourceUrl : "";
      const resourceLabel =
        generated.resourceLabel?.trim() ||
        (url ? resourceLabelFromUrl(url) : "");

      return {
        skill: canonical,
        skillLabel: label,
        importance: s.importance || "must",
        title: (generated.title || `Learn ${label}`).slice(0, 160),
        description: (generated.description || "").slice(0, 600),
        resource: {
          label: url ? resourceLabel.slice(0, 160) : "",
          url,
        },
        milestone: (generated.milestone || "").slice(0, 300),
        order: index,
      };
    });

    return { items, model, promptTokens, responseTokens, degraded: false };
  } catch (err) {
    console.warn("Roadmap generation fell back to the deterministic plan:", err.message);
    const fb = fallbackRoadmap({ missingSkills });
    return {
      items: fb.items.map((it, index) => ({
        ...it,
        skill: normalizeSkillName(it.skill),
        skillLabel: it.skill,
        importance: missingSkills[index]?.importance || "must",
        resource: {
          label: it.resourceUrl ? resourceLabelFromUrl(it.resourceUrl) : "",
          url: it.resourceUrl,
        },
        order: index,
      })),
      degraded: true,
    };
  }
}

module.exports = { generateRoadmap, isAllowedUrl, ALLOWED_HOSTS, fallbackRoadmap };
