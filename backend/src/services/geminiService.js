const { z } = require("zod");
const { Type } = require("@google/genai");

const ApiError = require("../utils/ApiError");
const { ai } = require("../shared/gemini/client");
const { runGemini, isTransientError: sharedIsTransientError } = require("../shared/gemini/runGemini");

const responseSchema = {
  type: Type.OBJECT,
  required: [
    "atsScore",
    "scoreBreakdown",
    "issues",
    "strengths",
    "bulletRewrites",
    "keywordsPresent",
    "keywordsMissing",
    "summary",
  ],

  properties: {
    atsScore: {
      type: Type.NUMBER,
      description: "ATS-readiness score from 0 to 100",
    },

    scoreBreakdown: {
      type: Type.OBJECT,
      required: ["keywords", "formatting", "impact", "clarity"],
      properties: {
        keywords: {
          type: Type.NUMBER,
          description: "0-25",
        },
        formatting: {
          type: Type.NUMBER,
          description: "0-25",
        },
        impact: {
          type: Type.NUMBER,
          description: "0-25",
        },
        clarity: {
          type: Type.NUMBER,
          description: "0-25",
        },
      },
    },

    issues: {
      type: Type.ARRAY,
      description:
        "All remaining prioritized issues (3-8). Do not include issues that are already resolved.",
      items: {
        type: Type.OBJECT,
        required: ["title", "severity", "explanation", "fix"],
        properties: {
          title: {
            type: Type.STRING,
          },
          severity: {
            type: Type.STRING,
            enum: ["low", "medium", "high"],
          },
          explanation: {
            type: Type.STRING,
          },
          fix: {
            type: Type.STRING,
          },
        },
      },
    },

    strengths: {
      type: Type.ARRAY,
      description: "Exactly 5 strengths",
      items: {
        type: Type.OBJECT,
        required: ["title", "evidence"],
        properties: {
          title: {
            type: Type.STRING,
          },
          evidence: {
            type: Type.STRING,
          },
        },
      },
    },

    bulletRewrites: {
      type: Type.ARRAY,
      description:
        "Every remaining weak bullet rewritten (up to 12). Never include a bullet that was already improved in a previous pass.",
      items: {
        type: Type.OBJECT,
        required: ["section", "original", "rewritten", "rationale"],
        properties: {
          section: {
            type: Type.STRING,
          },
          original: {
            type: Type.STRING,
          },
          rewritten: {
            type: Type.STRING,
          },
          rationale: {
            type: Type.STRING,
          },
        },
      },
    },

    keywordsPresent: {
      type: Type.ARRAY,
      items: {
        type: Type.STRING,
      },
    },

    keywordsMissing: {
      type: Type.ARRAY,
      items: {
        type: Type.STRING,
      },
    },

    keywordsToAdd: {
      type: Type.ARRAY,
      description:
        "Concrete, resume-ready phrasing that inserts each missing keyword naturally into the resume. One entry per missing keyword.",
      items: {
        type: Type.OBJECT,
        required: ["keyword", "phrase"],
        properties: {
          keyword: { type: Type.STRING },
          phrase: {
            type: Type.STRING,
            description:
              "A short, natural sentence or clause that contains the keyword and fits the resume's tone.",
          },
        },
      },
    },

    summary: {
      type: Type.STRING,
      description: "One short paragraph overall verdict",
    },
  },
};
const analysisValidator = z.object({
  atsScore: z.number().min(0).max(100),

  scoreBreakdown: z.object({
    keywords: z.number().min(0).max(25),
    formatting: z.number().min(0).max(25),
    impact: z.number().min(0).max(25),
    clarity: z.number().min(0).max(25),
  }),

  issues: z
    .array(
      z.object({
        title: z.string(),
        severity: z.enum(["low", "medium", "high"]),
        explanation: z.string(),
        fix: z.string(),
      })
    )
    .min(1),

  strengths: z
    .array(
      z.object({
        title: z.string(),
        evidence: z.string(),
      })
    )
    .min(1),

  bulletRewrites: z
    .array(
      z.object({
        section: z.string(),
        original: z.string(),
        rewritten: z.string(),
        rationale: z.string(),
      })
    )
    .default([]),

  keywordsPresent: z.array(z.string()).default([]),
  keywordsMissing: z.array(z.string()).default([]),

  keywordsToAdd: z
    .array(
      z.object({
        keyword: z.string(),
        phrase: z.string(),
      })
    )
    .default([]),

  summary: z.string(),
});

function buildPrompt({ rawText, targetRole, appliedRewrites, priorIssues }) {
  const lines = [
    "You are a senior technical recruiter and ATS expert reviewing a resume for large companies (Google, Amazon, Microsoft, Meta level ATS systems).",
    targetRole
      ? `Target role: ${targetRole}.`
      : "No specific target role was provided — assess for the role the candidate appears to be aiming for.",
    "",
    "YOUR JOB IS TO FIX THE RESUME IN ONE PASS — not to drip-feed advice across multiple reviews.",
    "",
    "CRITICAL EVALUATION GUIDELINES:",
    "1. Score the resume accurately from 0–100 based on ATS readiness (keyword match, parseable formatting, quantified impact, clarity).",
    "2. Give FULL CREDIT for what is already strong. Strong, quantified, modern bullets should push the impact and keyword sub-scores to 20-25 each and the overall score into the 80s-90s.",
    "3. COMPLETENESS OVER INCREMENTALISM: In a single response, surface EVERY remaining meaningful improvement you would ever ask for. Do not hold back improvements for a 'next round'. If 8 things are wrong, return 8 issues and up to 12 rewrites — do not return 2 and save the rest.",
    "4. NO REPEATED SUGGESTIONS: Any bullet already listed under ALREADY APPLIED is RESOLVED. Never flag it again, never rewrite it again, never list an issue about it. Treat it as a strength instead.",
    "5. Do NOT re-raise an issue that appears in the PREVIOUS ISSUES list if the current text already fixes it. Only carry forward an issue if the problem genuinely still exists verbatim in the current text — and if so, state exactly what is still missing.",
    "6. Return between 3 and 8 prioritized issues covering ALL remaining bottlenecks (fewer only if the resume is genuinely near-perfect), 5 standout strengths, and up to 12 rewrites.",
    "7. Rewrites must preserve the original meaning, be quantified where possible, start with a strong action verb, and each needs a one-line rationale.",
    "8. Identify keywords clearly present and notable keywords missing for the target role.",
    "9. Be specific and evidence-based — cite phrasing from the resume in explanations.",
    "10. Never invent experience, metrics, employers, or technologies that are not implied by the resume text.",
    "",
    "SCORING AFTER A REWRITE PASS — READ THIS TWICE:",
    "A candidate who applies ALL of your rewrites trusts you to have fixed everything fixable. You owe them a score that reflects that trust.",
    "- If ALREADY APPLIED rewrites are present AND the current text now incorporates them, the score MUST reflect the FULL effect of those fixes in this single pass. Do not stage gains across rounds.",
    "- If the resume still scores below 85, you must be able to name the SPECIFIC missing items that justify it — and every one of them MUST appear in bulletRewrites or issues right now. A sub-85 score with nothing actionable left is a contradiction and is FORBIDDEN.",
    "- 90+ is the normal score for a resume where: all bullets are quantified/action-verb led, all target keywords are present, formatting is parseable, and the summary is sharp. If that state exists in the current text, score it accordingly.",
    "- If you cannot find any meaningful rewrite to suggest (0–2 rewrites), that is a signal the resume is strong — score it 90+ and say so in the summary. Do NOT invent cosmetic objections to justify withholding score.",
    "- Never withhold score to 'leave room for the next review'. There is no next review from the candidate's perspective: each pass is the last pass.",
    "",
    "KEYWORD COVERAGE — THIS IS THE HIGHEST-PRIORITY GOAL:",
    "A. The candidate wants the IMPROVED resume to match ALL target-role keywords after applying your rewrites. Aim for 100% coverage of the keywords that matter for the role.",
    "B. Every keyword you list in keywordsMissing MUST be inserted naturally into at least one entry of bulletRewrites. Do not report a missing keyword you are not also placing somewhere.",
    "C. For each missing keyword, also return a keywordsToAdd entry with the exact resume-ready phrase you used, so the applicant can see where it lands.",
    "D. Prefer inserting keywords into an EXISTING bullet that is already being rewritten for that entry, rather than inventing a new bullet. Rewrite a bullet for EVERY entry that needs keyword coverage — do not skip an entry because its bullets 'look okay'.",
    "E. Rewriting is not only for weak bullets. You MUST also rewrite bullets whose only purpose is to weave in missing keywords/technologies, as long as the addition is truthful and implied by the existing content.",
    "F. Keep the resume to ONE PAGE worth of content: blend keywords into existing bullets instead of adding many net-new lines.",
  ];

  if (appliedRewrites?.length) {
    lines.push(
      "",
      "ALREADY APPLIED (these are RESOLVED — do not re-suggest or re-flag them):"
    );
    for (const r of appliedRewrites) {
      lines.push(`- ${r}`);
    }
  }

  if (priorIssues?.length) {
    lines.push(
      "",
      "PREVIOUS ISSUES (carry forward ONLY those still unfixed in the current text):"
    );
    for (const i of priorIssues) {
      lines.push(`- ${i}`);
    }
  }

  lines.push(
    "",
    "RESUME TEXT (this is the CURRENT state — judge only this):",
    "──────────",
    rawText,
    "──────────"
  );

  return lines.join("\n");
}

function isTransientGeminiError(err) {
  // Kept as a named alias for readability in logs; the real logic lives in
  // shared/gemini/runGemini.js and is used by every AI pipeline.
  return sharedIsTransientError(err);
}

async function analyzeResume({ rawText, targetRole, appliedRewrites, priorIssues }) {
  if (!ai) {
    // A misconfigured key is a server-side deployment problem, not a transient
    // outage — but it must never look like an application crash. 503 tells the
    // operator "this deployment is missing config" without leaking internals.
    throw ApiError.aiUnavailable(
      "AI analysis is not configured on this server. Please contact support."
    );
  }

  const prompt = buildPrompt({
    rawText,
    targetRole,
    appliedRewrites,
    priorIssues,
  });

  const { data, model, promptTokens, responseTokens } = await runGemini({
    label: "Gemini analysis",
    zodSchema: analysisValidator,
    retriesPerModel: 1,
    call: async (modelName) => {
      const result = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema,
          temperature: 0.3,
        },
      });
      const text =
        typeof result.text === "function" ? result.text() : result.text;
      return { text, usage: result.usageMetadata || {} };
    },
    onError: (attempt, modelName, err) => {
      console.warn(
        `Gemini attempt ${attempt} with model ${modelName} failed:`,
        err.message || err
      );
    },
    onModelExhausted: (modelName) => {
      console.log(`Switching from ${modelName} to fallback model...`);
    },
  });

  return {
    analysis: data,
    model,
    promptTokens,
    responseTokens,
  };
}
module.exports = {analyzeResume};