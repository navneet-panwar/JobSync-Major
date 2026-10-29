const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");

const env = require("./config/env");
const { connectDB } = require("./config/db");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const healthRouter = require("./routes/health");
const authRouter = require("./routes/auth");
const collegesRouter = require("./routes/colleges");
const placementCellRouter = require("./routes/placementCell");
const placementRolesRouter = require("./routes/placementRoles");
const jdRouter = require("./routes/jd");
const readinessRouter = require("./routes/readiness");
const roadmapRouter = require("./routes/roadmap");
const recruiterRouter = require("./routes/recruiter");
const notificationsRouter = require("./routes/notifications");
const interviewsRouter = require("./routes/interviews");
const { registerLoopListeners } = require("./shared/systemLoop");
const { queueStats } = require("./shared/queue");
const { emailStatus } = require("./services/emailService");
const resumesRouter = require("./routes/resumes");
const dashboardRouter = require("./routes/dashboard");
const insightsRouter = require("./routes/insights");
const versionsRouter = require("./routes/version");
const historyRouter = require("./routes/history");

const app = express();

app.set("trust proxy", 1);

// CORS: only the origins listed in CLIENT_ORIGIN are allowed. `origin: true`
// reflected ANY origin back while `credentials: true` sent the auth cookie
// along with it, which lets any website on the internet make authenticated
// requests on a logged-in user's behalf. We compare against the allow-list.
app.use(
  cors({
    origin(origin, callback) {
      // No origin header: same-origin, curl, mobile apps, health checks.
      if (!origin) return callback(null, true);

      if (env.clientOrigins.some((rule) =>
        typeof rule === "string" ? rule === origin : rule.test(origin)
      )) {
        return callback(null, true);
      }

      // Rejecting here is a 500 from the CORS middleware — confusing for a
      // browser session where the real problem is "dev server on an unexpected
      // port". Answer the request cleanly (no CORS headers) instead, so the
      // browser reports a normal CORS block and the server logs stay readable.
      console.warn(`[cors] Blocked origin: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());


if (!env.isProd) {
  app.use(morgan("dev"));
}

app.get("/", (req, res) => {
  res.json({
    name: "JobSync API",
    status: "ok",
    version: "0.2.0",
    docs: {
      health: "/api/health",
      auth: "/api/auth",
      colleges: "/api/colleges",
      resumes: "/api/resumes",
      dashboard: "/api/dashboard",
      insights: "/api/insights",
      versions: "/api/versions",
      history: "/api/history",
      jd: "/api/jd",
      readiness: "/api/readiness",
      roadmap: "/api/roadmap",
      placementCell: "/api/placement-cell",
      roles: "/api/roles",
      recruiter: "/api/recruiter",
      notifications: "/api/notifications",
      interviews: "/api/interviews",
    },
  });
});

app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/colleges", collegesRouter);
app.use("/api/placement-cell", placementCellRouter);
app.use("/api/roles", placementRolesRouter);
app.use("/api/jd", jdRouter);
app.use("/api/readiness", readinessRouter);
app.use("/api/roadmap", roadmapRouter);
app.use("/api/recruiter", recruiterRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/interviews", interviewsRouter);

// Full System Loop listeners (Phase 11). Registered once at boot so a resume
// re-analysis or a completed milestone refreshes readiness automatically.
registerLoopListeners();
app.use("/api/resumes",resumesRouter);
app.use("/api/dashboard",dashboardRouter);
app.use("/api/insights",insightsRouter);
app.use("/api/versions",versionsRouter);
app.use("/api/history",historyRouter);


app.use(notFound);
app.use(errorHandler);

async function start() {
  try {
    await connectDB();

    const server = app.listen(env.port, () => {
      console.log(
        `Server listening on http://localhost:${env.port} (${env.nodeEnv})`
      );
    });

    // Graceful shutdown: stop accepting new connections, then close the DB.
    // Without this, a redeploy or `docker stop` kills in-flight requests and
    // leaves the Mongo connection dangling until the process is hard-killed.
    const shutdown = (signal) => {
      console.log(`${signal} received, shutting down gracefully...`);
      server.close(async () => {
        try {
          await mongoose.connection.close();
          console.log("HTTP server and MongoDB connection closed.");
          process.exit(0);
        } catch (err) {
          console.error("Error during shutdown:", err.message);
          process.exit(1);
        }
      });

      // Don't hang forever if a connection refuses to drain.
      setTimeout(() => {
        console.error("Forced shutdown after 10s timeout.");
        process.exit(1);
      }, 10_000).unref();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

start();

module.exports = app;