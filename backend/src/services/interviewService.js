const { Type } = require("@google/genai");
const { z } = require("zod");

const { ai } = require("../shared/gemini/client");
const { runGemini } = require("../shared/gemini/runGemini");

/**
 * Interview question generation and answer scoring.
 *
 * Two calls, not one-per-question: generating a pool costs one call, and
 * grading all five answers costs another. A 5-question interview must not be
 * 10 Gemini requests on a free tier.
 */

const QUESTION_POOL_SIZE = 8;
const QUESTIONS_ASKED = 5;

// ---------------------------------------------------------------------------
// Question generation
// ---------------------------------------------------------------------------
const questionsSchema = {
  type: Type.OBJECT,
  required: ["questions"],
  properties: {
    questions: {
      type: Type.ARRAY,
      description: `Exactly ${QUESTION_POOL_SIZE} interview questions.`,
      items: {
        type: Type.OBJECT,
        required: ["text", "focus"],
        properties: {
          text: {
            type: Type.STRING,
            description: "A realistic interview question, as a hiring manager would ask it.",
          },
          focus: {
            type: Type.STRING,
            description:
              "What this question probes — e.g. 'system design', 'Node.js internals', 'conflict handling'.",
          },
        },
      },
    },
  },
};

const questionsValidator = z.object({
  questions: z
    .array(z.object({ text: z.string(), focus: z.string().default("") }))
    .default([]),
});

function buildQuestionPrompt({ jd, targetRole, skills, resumeVersion }) {
  const skillList = (skills || []).map((s) => s.label || s.name || s).join(", ");

  const sections = resumeVersion?.parsedSections || {};
  const resumeSkills = (sections.skills || []).slice(0, 20).join(", ");

  const projects = (sections.projects || [])
    .slice(0, 5)
    .map(
      (p) =>
        `- ${p.name || "Untitled"}: ${p.description || ""}${p.tech?.length ? ` [tech: ${p.tech.join(", ")}]` : ""}`
    )
    .join("\n");

  const experience = (sections.experience || [])
    .slice(0, 4)
    .map((e) => `- ${e.role || "Role"} at ${e.company || "Company"} (${e.period || "dates n/a"})`)
    .join("\n");

  const hasResume = Boolean(sections.summary || resumeSkills || projects || experience);

  return [
    "You are a technical interviewer preparing a mock interview for a student.",
    "",
    targetRole ? `Target role: ${targetRole}` : "",
    jd?.title ? `Job: ${jd.title}${jd.company ? ` at ${jd.company}` : ""}` : "",
    jd?.parsed?.summary ? `Role summary: ${jd.parsed.summary}` : "",
    skillList ? `Technologies the role requires: ${skillList}` : "",
    jd?.parsed?.responsibilities?.length
      ? `Responsibilities:\n${jd.parsed.responsibilities.map((r) => `- ${r}`).join("\n")}`
      : "",
    "",
    // The candidate's own resume, when available. This is what turns a generic
    // role interview into one that probes what THIS student actually claims.
    hasResume ? "─── THE CANDIDATE'S RESUME ───" : "",
    sections.summary ? `Summary: ${sections.summary}` : "",
    resumeSkills ? `Listed skills: ${resumeSkills}` : "",
    projects ? `Projects:\n${projects}` : "",
    experience ? `Experience:\n${experience}` : "",
    hasResume ? "" : "",
    hasResume ? "Reference their actual projects and experience where relevant — ask them to go deeper on something they claim, or to justify a choice they made. Do not invent details that are not in the resume." : "",
    "",
    `Write exactly ${QUESTION_POOL_SIZE} interview questions. Rules:`,
    "- Mix behavioural and technical: at least 3 technical, at least 2 behavioural/situational.",
    "- Technical questions must be answerable IN WRITING, in a few paragraphs. Never ask for code to be written or diagrams to be drawn.",
    "- Test understanding, not trivia. 'Explain how you would debug a slow API endpoint' beats 'What is the default port of MongoDB?'.",
    "- Draw on the specific technologies listed above — a generic question helps nobody prepare.",
    "- Spread difficulty: not all should be hard, but none should be a warm-up.",
    "- Each question one or two sentences. No preamble, no numbering, no 'Question 1:' prefix.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Deterministic fallback set so an AI outage does not block practice. */
function fallbackQuestions({ targetRole, skills }) {
  const primary = (skills || [])[0]?.label || (skills || [])[0]?.name || "your main technology";
  return [
    { text: `Walk me through how you would design a feature end to end using ${primary}.`, focus: "system design" },
    { text: `Describe a time you had to debug something you did not understand. How did you approach it?`, focus: "problem solving" },
    { text: `How do you make sure the work you deliver is correct before it reaches a reviewer?`, focus: "quality" },
    { text: `Tell me about a disagreement with a teammate. How was it resolved?`, focus: "collaboration" },
    { text: `Why are you interested in this ${targetRole || "role"}, and what would you want to learn first?`, focus: "motivation" },
  ];
}

/** Fisher–Yates — a real shuffle, so two students rarely share an order. */
function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function generateQuestions({ jd, targetRole, skills, resumeVersion }) {
  if (!ai) {
    const qs = fallbackQuestions({ targetRole, skills });
    return {
      questions: shuffle(qs).slice(0, QUESTIONS_ASKED).map((q, i) => ({ ...q, id: `q${i + 1}` })),
      degraded: true,
    };
  }

  try {
    const { data, model } = await runGemini({
      label: "Interview questions",
      zodSchema: questionsValidator,
      retriesPerModel: 2,
      backoffMs: 1000,
      call: async (modelName) => {
        const result = await ai.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [{ text: buildQuestionPrompt({ jd, targetRole, skills, resumeVersion }) }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema: questionsSchema,
            temperature: 0.8,
            maxOutputTokens: 4096,
          },
        });
        const text = typeof result.text === "function" ? result.text() : result.text;
        return { text, usage: result.usageMetadata || {} };
      },
    });

    const pool = data.questions.filter((q) => q.text?.trim()).slice(0, QUESTION_POOL_SIZE);
    if (pool.length < QUESTIONS_ASKED) {
      const fb = fallbackQuestions({ targetRole, skills });
      while (pool.length < QUESTIONS_ASKED) pool.push(fb[pool.length % fb.length]);
    }

    // Ask 5 of the pool, in a randomised order — two students interviewing for
    // the same role should rarely see the same sequence, which is what makes
    // shared "leaked answers" much less useful (scope §8.2).
    return {
      questions: shuffle(pool)
        .slice(0, QUESTIONS_ASKED)
        .map((q, i) => ({ id: `q${i + 1}`, text: q.text.trim(), focus: q.focus || "" })),
      model,
      degraded: false,
    };
  } catch (err) {
    console.warn("Interview question generation fell back:", err.message);
    const qs = fallbackQuestions({ targetRole, skills });
    return {
      questions: shuffle(qs).slice(0, QUESTIONS_ASKED).map((q, i) => ({ ...q, id: `q${i + 1}` })),
      degraded: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Answer scoring
// ---------------------------------------------------------------------------
const feedbackSchema = {
  type: Type.OBJECT,
  required: ["answers", "overallSummary"],
  properties: {
    answers: {
      type: Type.ARRAY,
      description: "One entry per submitted answer, in the same order.",
      items: {
        type: Type.OBJECT,
        required: ["questionIndex", "score", "strengths", "improvements", "modelAnswer"],
        properties: {
          questionIndex: {
            type: Type.NUMBER,
            description: "0-based index of the question this scores.",
          },
          score: {
            type: Type.NUMBER,
            description: "0-10. Be discriminating: 5 is an average answer, 8+ needs specific detail.",
          },
          strengths: {
            type: Type.ARRAY,
            description: "What the answer did well. Quote the candidate where useful. Max 3.",
            items: { type: Type.STRING },
          },
          improvements: {
            type: Type.ARRAY,
            description: "What was missing or weak, and how to fix it. Max 3.",
            items: { type: Type.STRING },
          },
          modelAnswer: {
            type: Type.STRING,
            description: "A strong answer to the same question, in a few sentences.",
          },
        },
      },
    },
    overallSummary: {
      type: Type.STRING,
      description: "Two or three sentences on overall interview readiness for this role.",
    },
    weakAreas: {
      type: Type.ARRAY,
      description: "Recurring themes the candidate should work on. Max 4.",
      items: { type: Type.STRING },
    },
  },
};

const feedbackValidator = z.object({
  answers: z
    .array(
      z.object({
        questionIndex: z.number(),
        score: z.number().min(0).max(10),
        strengths: z.array(z.string()).default([]),
        improvements: z.array(z.string()).default([]),
        modelAnswer: z.string().default(""),
      })
    )
    .default([]),
  overallSummary: z.string().default(""),
  weakAreas: z.array(z.string()).default([]),
});

function buildScoringPrompt({ targetRole, jd, pairs }) {
  const blocks = pairs
    .map(
      (p, i) =>
        `--- QUESTION ${i} ---\n${p.question}\n\n--- ANSWER ${i} ---\n${p.answer?.trim() || "(no answer given)"}`
    )
    .join("\n\n");

  return [
    "You are an experienced interviewer giving written feedback on a mock interview.",
    "",
    targetRole ? `Role: ${targetRole}` : "",
    jd?.title ? `Job: ${jd.title}` : "",
    "",
    blocks,
    "",
    "For each answer, in order:",
    "- score from 0 to 10. Be genuinely discriminating — an answer that is vague, generic or dodges the question should score below 6, however fluent it sounds.",
    "- 1-3 strengths. Quote the candidate's own words where that helps.",
    "- 1-3 improvements, each phrased as an ACTION ('quantify the impact by naming a metric') rather than an observation ('the answer was vague').",
    "- A model answer: how a strong candidate would actually respond, a few sentences, using their context where you can.",
    "",
    "Then an overall summary of 2-3 sentences on interview readiness, and up to 4 weak areas you saw recurring.",
    "Be constructive and specific. A student should know exactly what to practise next.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function scoreAnswers({ targetRole, jd, pairs }) {
  if (!ai) {
    return {
      answers: pairs.map((_, i) => ({
        questionIndex: i,
        score: null,
        strengths: [],
        improvements: ["Automatic feedback is unavailable right now — ask your placement cell to review this transcript."],
        modelAnswer: "",
      })),
      overallSummary: "Your answers were recorded, but automated feedback is unavailable.",
      weakAreas: [],
      degraded: true,
    };
  }

  try {
    const { data, model, promptTokens, responseTokens } = await runGemini({
      label: "Interview feedback",
      zodSchema: feedbackValidator,
      retriesPerModel: 2,
      backoffMs: 1000,
      call: async (modelName) => {
        const result = await ai.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [{ text: buildScoringPrompt({ targetRole, jd, pairs }) }] }],
          config: {
            responseMimeType: "application/json",
            responseSchema: feedbackSchema,
            temperature: 0.3,
            maxOutputTokens: 8192,
          },
        });
        const text = typeof result.text === "function" ? result.text : result.text;
        return { text, usage: result.usageMetadata || {} };
      },
    });

    return { ...data, model, promptTokens, responseTokens, degraded: false };
  } catch (err) {
    console.warn("Interview scoring fell back:", err.message);
    return {
      answers: pairs.map((_, i) => ({
        questionIndex: i,
        score: null,
        strengths: [],
        improvements: ["Automated feedback could not be generated for this answer."],
        modelAnswer: "",
      })),
      overallSummary: "Your answers were recorded, but automated feedback is unavailable.",
      weakAreas: [],
      degraded: true,
    };
  }
}

module.exports = {
  generateQuestions,
  scoreAnswers,
  QUESTIONS_ASKED,
  QUESTION_POOL_SIZE,
};
