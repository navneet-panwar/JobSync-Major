const dotenv = require("dotenv");
const path = require("path");

dotenv.config({path:path.resolve(__dirname,"../../.env")});

const required = ["MONGO_URI","JWT_SECRET"];
const missing = required.filter((key) => !process.env[key]);
if(missing.length){
    console.log(`Missing required env vars : ${missing.join(", ")}`);
    process.exit(1);
}

module.exports = {
    nodeEnv : process.env.NODE_ENV || "development",
    port : Number(process.env.PORT) || 5000,
    mongoUri : process.env.MONGO_URI,
    jwtSecret : process.env.JWT_SECRET,
    jwtExpiresIn : process.env.JWT_EXPIRES_IN || "7d",
    cookieName : process.env.COOKIE_NAME || "arr_token",
    clientOrigins : (process.env.CLIENT_ORIGIN || "https://localhost:5173,http://localhost:5174").split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .concat(
      // Any localhost/127.0.0.1 port is allowed in development only. Vite picks
      // 5174, 5175… whenever 5173 is taken (a second dev server, a preview, a
      // stale process), and a fixed allow-list made those cases fail with an
      // opaque CORS error that looked like an app bug. In production this is
      // off and only CLIENT_ORIGIN applies.
      process.env.NODE_ENV === "production"
        ? []
        : [/^https?:\/\/localhost:\d+$/, /^https?:\/\/127\.0\.0\.1:\d+$/]
    ),
    geminiApiKey : process.env.GEMINI_API_KEY || "",
    // gemini-3.5-flash-lite has the largest free-tier daily headroom, so it
    // leads; the smarter models are kept as fallbacks.
    geminiModel : process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    geminiFallbackModels: (process.env.GEMINI_FALLBACK_MODELS || "gemini-3.5-flash,gemini-3.6-flash")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),

    // Email (Phase 9). All optional — the app works with in-app notifications
    // only, and emailStatus() reports "not_configured" rather than failing.
    emailProvider : process.env.EMAIL_PROVIDER || "",
    emailApiKey : process.env.EMAIL_API_KEY || "",
    emailFrom : process.env.EMAIL_FROM || "",
    emailHost : process.env.EMAIL_HOST || "",
    emailPort : process.env.EMAIL_PORT || "",
    emailUser : process.env.EMAIL_USER || "",
    emailDailyCap : Number(process.env.EMAIL_DAILY_CAP || 300),

    // Public base URL of the SPA — used for links inside emails.
    clientUrl : process.env.CLIENT_URL || "http://localhost:5173",

    isProd : process.env.NODE_ENV === "production",
};