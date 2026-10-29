const {Type} = require("@google/genai");
const { z } = require("zod");

const { ai } = require("../shared/gemini/client");
const { runGemini, isTransientError: sharedIsTransientError } = require("../shared/gemini/runGemini");
const { normalizeSkillList, skillLabel } = require("./normalizeSkills");

const linkSchema = {
    type : Type.OBJECT,
    required : ["label","url"],
    properties : {
        label : {type : Type.STRING},
        url : {type : Type.STRING},
    },
};

const responseSchema = {
    type : Type.OBJECT,
    required : [
        "basics",
        "summary",
        "experience",
        "education",
        "skills",
        "projects",
        "certifications",
        "languages",
        "interests",
    ],
    properties : {
        basics : {
            type : Type.OBJECT,
            required : ["name","title","location","email","phone","links"],
            properties : {
                name : {type : Type.STRING},
                title : {type : Type.STRING},
                location : {type : Type.STRING},
                email : {type : Type.STRING},
                phone : {type : Type.STRING},
                links : {type : Type.ARRAY, items : linkSchema},
            },
        },
        summary : {type : Type.STRING},
        experience : {
            type : Type.ARRAY,
            items:{
                type : Type.OBJECT,
                required : ["company","role","period","bullets"],
                properties: {
                    company : {type : Type.STRING},
                    role : {type : Type.STRING},
                    location : {type : Type.STRING},
                    period : {type : Type.STRING},
                    bullets : {type : Type.ARRAY,items : {type : Type.STRING}},
                },
            },

        },
        education : {
            type : Type.ARRAY,
            items : {
                type : Type.OBJECT,
                required : ["degree","school","period"],
                properties : {
                    degree : {type : Type.STRING},
                    school : {type : Type.STRING},
                    location : {type : Type.STRING},
                    period : {type : Type.STRING},
                    details : {type : Type.STRING},
                },
            },
        },
        skills : {type : Type.ARRAY,items : {type : Type.STRING}},
        projects : {
            type : Type.ARRAY,
            items : {
                type : Type.OBJECT,
                required : ["name","description"],
                properties : {
                    name : {type : Type.STRING},
                    description : {type : Type.STRING},
                    tech : {type : Type.ARRAY,items : {type : Type.STRING}},
                    links : {type : Type.ARRAY,items : linkSchema},
                },
            },
        },
        certifications : {
            type : Type.ARRAY,
            items : {
                type : Type.OBJECT,
                required : ["name"],
                properties : {
                    name : {type : Type.STRING},
                    issuer : {type : Type.STRING},
                    year : {type : Type.STRING},
                },
            },
        },
        languages : {type : Type.ARRAY,items : {type : Type.STRING}},
        interests : {type : Type.ARRAY,items : {type : Type.STRING}},
    },
};

const validator = z.object({
    basics : z.object({
        name : z.string().default(""),
        title : z.string().default(""),
        location : z.string().default(""),
        email : z.string().default(""),
        phone : z.string().default(""),
        links : z.array(z.object({label : z.string(),url : z.string()})).default([]),
    }),

    summary : z.string().default(""),
    experience : z
    .array(
        z.object({
            company : z.string().default(""),
            role : z.string().default(""),
            location : z.string().default(""),
            period : z.string().default(""),
            bullets : z.array(z.string()).default([]),
        })
    )
    .default([]),
    education : z
    .array(
        z.object({
            degree : z.string().default(""),
            school : z.string().default(""),
            location : z.string().default(""),
            period: z.string().default(""),
            details : z.string().default(""),
        })
    )
    .default([]),
    skills : z.array(z.string()).default([]),
    projects : z
    .array(
        z.object({
            name : z.string().default(""),
            description : z.string().default(""),
            tech : z.array(z.string()).default([]),
            links : z.array(z.object({label : z.string(),url : z.string()})).default([]),
        })
    )
    .default([]),
    certifications : z
    .array(
        z.object({
            name : z.string().default(""),
            issuer : z.string().default(""),
            year : z.string().default(""),
        })
    )
    .default([]),
    languages : z.array(z.string()).default([]),
    interests : z.array(z.string()).default([]),

});
function buildPrompt(rawText) {
  return [
    "You are a resume parser. The input is text extracted from a PDF — lines may be jumbled or out of natural reading order.",
    "",
    "Extract structured data:",
    "- basics: name, professional title, location, email, phone, social links (LinkedIn / GitHub / portfolio etc.; label like \"LinkedIn\", full URL)",
    "- summary: the professional summary paragraph (rejoin if split across lines)",
    "- experience: jobs most recent first, with company, role, period (preserve original date format), location if available, and bullet points",
    "- education: degree, school, period, location, optional details",
    "- skills: flat array of technical skills",
    "- projects: name, one-sentence description, optional tech tags, optional links",
    "- certifications: name, issuer, year",
    "- languages: flat array",
    "- interests: flat array",
    "",
    "Rules:",
    "- Be conservative: omit fields that are not clearly present. Use empty strings/arrays where missing.",
    "- Do not invent or paraphrase — extract verbatim where possible.",
    "- Each experience bullet should read as a complete sentence.",
    "- Preserve original date formats (e.g. 'Jan 2022 – Dec 2023').",
    "",
    "RESUME TEXT:",
    "------------",
    rawText,
    "------------",
  ].join("\n");
}
const EMPTY = {
    basics : {name : "",title : "",location : "",email : "",phone : "",links : []},
    summary : "",
    experience : [],
    education : [],
    skills : [],
    projects : [],
    certifications : [],
    languages : [],
    interests : [],
};
function isTransientError(err) {
  // Shared classification — one source of truth in shared/gemini/runGemini.js.
  return sharedIsTransientError(err);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Post-parse sanitation shared by the parse pipeline: drop hallucinated,
// empty or oversized tech tags before anything is persisted.
function sanitizeProjectTech(parsed) {
  if (Array.isArray(parsed.projects)) {
    for (const p of parsed.projects) {
      if (Array.isArray(p.tech)) {
        p.tech = p.tech
          .filter((t) => typeof t === "string" && t.trim().length > 0 && t.trim().length < 80)
          .slice(0, 15);
      }
    }
  }

  // Put the resume's skills into the platform-wide canonical vocabulary so they
  // can be compared against a JD's required skills (services/normalizeSkills.js).
  // Without this, "ReactJS" on a resume would never match "React" in a JD and
  // every student would show a false skill gap.
  if (Array.isArray(parsed.skills)) {
    parsed.skills = normalizeSkillList(parsed.skills).map(skillLabel);
  }
  if (Array.isArray(parsed.projects)) {
    for (const p of parsed.projects) {
      if (Array.isArray(p.tech) && p.tech.length) {
        p.tech = normalizeSkillList(p.tech).map(skillLabel);
      }
    }
  }

  return parsed;
}

async function parseResume(rawText) {
  if (!ai || !rawText?.trim()) return EMPTY;

  const prompt = buildPrompt(rawText);

  try {
    const { data } = await runGemini({
      label: "Structured parse",
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
            maxOutputTokens: 8192,
          },
        });

        const text = typeof result.text === "function"
          ? result.text()
          : result.text;
        return { text, usage: result.usageMetadata || {} };
      },
      onError: (attempt, modelName, err) => {
        console.warn(
          `Structured parse attempt ${attempt} with ${modelName} failed:`,
          err.message || err
        );
      },
    });

    return sanitizeProjectTech(data);
  } catch (err) {
    // Every model in the cascade failed. Returning EMPTY here would silently
    // create a resume with blank sections while reporting success to the user —
    // they would see an empty resume and no error. Fail loudly instead so the
    // caller aborts the upload and the user gets a retryable message.
    console.error("Structured parse failed across all models.");
    const wrapped = new Error(
      "Could not read your resume right now — the parsing service is unavailable."
    );
    wrapped.statusCode = 503;
    wrapped.isOperational = true;
    wrapped.isAiFailure = true;
    wrapped.cause = err;
    throw wrapped;
  }
}

module.exports = {parseResume};