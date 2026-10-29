const { GoogleGenAI } = require("@google/genai");
const env = require("../../config/env");

// One shared Gemini client instance for the whole platform. Created lazily-safe:
// `ai` is null when no key is configured, and every pipeline checks for null
// before calling so a missing key returns a clean operational error instead of
// crashing the process.
const ai = env.geminiApiKey ? new GoogleGenAI({ apiKey: env.geminiApiKey }) : null;

module.exports = { ai };
