const env = require("../../config/env");

// The shared multi-model fallback chain: primary GEMINI_MODEL first, then any
// GEMINI_FALLBACK_MODELS. Every AI pipeline in JobSync must use this exact list
// so a "high demand" spike on one model transparently moves to the next.
function modelChain() {
  return [env.geminiModel, ...(env.geminiFallbackModels || [])].filter(Boolean);
}

// A transient error is one where retrying / switching models may help.
// Mirrors the original classification used by both pipelines before extraction.
function isTransientError(err) {
  const code = Number(err?.status ?? err?.code ?? err?.response?.status);
  const message = String(err?.message || "").toLowerCase();

  return (
    [429, 500, 502, 503, 504].includes(code) ||
    message.includes("temporarily unavailable") ||
    message.includes("high demand") ||
    message.includes("resource exhausted") ||
    message.includes("unavailable") ||
    message.includes("overloaded")
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Some models wrap JSON in a markdown fence even when JSON mime type is
// requested — tolerate both shapes before parsing.
function stripFences(text) {
  return String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * runGemini — the one shared fallback runner for every AI pipeline.
 *
 * @param {Object}    opts
 * @param {Function}  opts.call          async (modelName) => { text, usage } —
 *                                       builds the model-specific request and
 *                                       invokes the Gemini SDK.
 * @param {import("zod").ZodType} opts.zodSchema  validates/normalizes the parsed JSON.
 * @param {String}    opts.label         human label for logs, e.g. "ATS analysis".
 * @param {Boolean}   [opts.retriesPerModel=2]  attempts per model before advancing.
 * @param {Number}    [opts.backoffMs=1000]     wait between attempts on transient errors.
 * @param {Function}  [opts.onError]     optional per-attempt hook (attempt, model, err).
 * @param {Function}  [opts.onModelExhausted]  optional hook when moving off a model.
 *
 * @returns {{ data: any, model: string, promptTokens: number, responseTokens: number }}
 * @throws  Error when every model in the cascade fails (caller maps it to a
 *          user-facing ApiError — pipelines differ in wording).
 */
async function runGemini({
  call,
  zodSchema,
  label = "gemini call",
  retriesPerModel = 2,
  backoffMs = 1000,
  onError,
  onModelExhausted,
}) {
  const models = modelChain();
  let lastErr;

  for (const modelName of models) {
    for (let attempt = 1; attempt <= retriesPerModel; attempt++) {
      try {
        const { text, usage = {} } = await call(modelName);
        if (!text) throw new Error("Empty response from Gemini");

        const parsed = JSON.parse(stripFences(text));
        const data = zodSchema ? zodSchema.parse(parsed) : parsed;

        return {
          data,
          model: modelName,
          promptTokens: usage.promptTokenCount,
          responseTokens: usage.candidatesTokenCount,
        };
      } catch (err) {
        lastErr = err;
        onError?.(attempt, modelName, err);

        // JSON/validation failures are deterministic — retrying the same model
        // wastes quota without changing the outcome. Only transient errors get
        // a backoff-and-retry; everything else advances to the next model.
        if (isTransientError(err) && attempt < retriesPerModel) {
          await wait(backoffMs);
          continue;
        }
        break;
      }
    }
    onModelExhausted?.(modelName);
  }

  const err = new Error(`${label} failed across all ${models.length} model(s): ${lastErr?.message || lastErr}`);
  err.statusCode = 503;
  err.isOperational = true;
  err.isAiFailure = true;
  err.cause = lastErr;
  throw err;
}

module.exports = { runGemini, modelChain, isTransientError, stripFences, wait };
