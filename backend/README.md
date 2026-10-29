# JobSync — Backend API

Express 5 + MongoDB (Mongoose 9) + Google Gemini API. One Node process serves the whole
platform: auth, resume intelligence, JD parsing, readiness scoring, roadmap, placement-cell and
recruiter workspaces, notifications, meetings and mock interviews.

- Default port: **5000** (`http://localhost:5000`)
- Auth: JWT in an **httpOnly cookie** (`arr_token`) — never a bearer header from the SPA
- AI: Gemini with a **multi-model fallback chain** and Zod-validated structured output
- Everything else is plain JavaScript (CommonJS) — no TypeScript, no build step

---

## Contents

1. [Quick start](#1-quick-start)
2. [Scripts](#2-scripts)
3. [Environment variables](#3-environment-variables)
4. [Source layout](#4-source-layout)
5. [Request pipeline](#5-request-pipeline)
6. [Data models](#6-data-models)
7. [API reference](#7-api-reference)
8. [Services & domain logic](#8-services--domain-logic)
9. [The Full System Loop](#9-the-full-system-loop)
10. [AI layer](#10-ai-layer)
11. [Security, limits & failure behaviour](#11-security-limits--failure-behaviour)
12. [Testing](#12-testing)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Quick start

```powershell
cd backend
npm install
Copy-Item ..\.env.example .env     # bash: cp ../.env.example .env
# edit .env → MONGO_URI, JWT_SECRET, GEMINI_API_KEY
npm run seed                       # optional demo data (colleges + accounts)
npm run dev                        # nodemon, http://localhost:5000
```

Health check: `GET http://localhost:5000/api/health` →
`{ "status": "ok", "db": "connected", "uptime": …, "subsystems": { … } }`.

The server **refuses to boot** when `MONGO_URI` or `JWT_SECRET` is missing — by design, so a
misconfigured deployment fails loudly instead of accepting requests it cannot serve.

## 2. Scripts

| Command              | What it does                                                                       |
| -------------------- | ---------------------------------------------------------------------------------- |
| `npm run dev`        | `nodemon src/server.js` — restarts on changes in `src/`                            |
| `npm start`          | Plain `node src/server.js` (production)                                            |
| `npm run seed`       | Creates 2 colleges + 7 accounts with known passwords; resets passwords every run   |
| `npm run test:roles` | 29 checks — role postings, opt-ins, filters, cross-college isolation               |
| `npm run test:fixes` | 37 checks — gatekeeping pipeline, JD upload, meeting gate, foreign-version refusal |

All test scripts are plain Node HTTP clients: **start the server first**, then run them in a second
terminal. They print `✅` / `❌` per check and exit non-zero on failure.

Phase suites that are not wired into `package.json` (run directly with `node scripts/<file>`; they
are documented in `../projectimplementation.md`):

| File                         | Covers                                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `scripts/test-phase2.js`     | Role registration, code validation, admin gates, cross-college identity                                                       |
| `scripts/test-phase567.js`   | JD parse, readiness, roadmap (+ resource allow-list), cohort, audit log, the gatekeeping invariant                            |
| `scripts/test-phase8to12.js` | Bulk actions, analytics, notifications, messaging gate, `.ics`, interview integrity, consent withdrawal, the Full System Loop |

## 3. Environment variables

Copy `../.env.example` to `backend/.env`. It is read by `src/config/env.js` with a path relative to
`src/config/`, so the file **must** live at `backend/.env` (not the repo root).

| Variable                                   | Required    | Default                                       | Notes                                                                               |
| ------------------------------------------ | ----------- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `NODE_ENV`                                 | no          | `development`                                 | `production` enables the strict CORS list and disables `morgan`                     |
| `PORT`                                     | no          | `5000`                                        |                                                                                     |
| `MONGO_URI`                                | **yes**     | —                                             | Server exits if missing. Atlas M0 or local `mongod`                                 |
| `JWT_SECRET`                               | **yes**     | —                                             | Server exits if missing. Use a 64-hex random string                                 |
| `JWT_EXPIRES_IN`                           | no          | `7d`                                          | Passed straight to `jsonwebtoken`                                                   |
| `COOKIE_NAME`                              | no          | `arr_token`                                   | Legacy name kept so existing sessions survive                                       |
| `CLIENT_ORIGIN`                            | no          | `http://localhost:5173,http://localhost:5174` | Comma-separated allow-list; dev also accepts any `localhost:*` / `127.0.0.1:*` port |
| `GEMINI_API_KEY`                           | recommended | `""`                                          | Without it, AI endpoints return a clear 500                                         |
| `GEMINI_MODEL`                             | no          | `gemini-3.5-flash-lite`                       | Chosen for the largest free-tier daily headroom                                     |
| `GEMINI_FALLBACK_MODELS`                   | no          | `gemini-3.5-flash,gemini-3.6-flash`           | Tried in order on transient failure                                                 |
| `EMAIL_PROVIDER`                           | no          | `""`                                          | `brevo` · `resend` · `gmail-smtp` · `smtp`                                          |
| `EMAIL_API_KEY`                            | no          | `""`                                          | SMTP password                                                                       |
| `EMAIL_FROM`                               | no          | `""`                                          | Sender address                                                                      |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USER` | no          | —                                             | For `smtp` / custom relays (`587`, or `465` for implicit TLS)                       |
| `EMAIL_DAILY_CAP`                          | no          | `300`                                         | Local send cap so a bulk action cannot drain the free tier                          |
| `CLIENT_URL`                               | no          | `http://localhost:5173`                       | Base URL for links inside emails                                                    |

> Email is **never load-bearing**: every notification is written in-app first and sending is
> best-effort on top. A missing provider only means no email — nothing else breaks.

## 4. Source layout

```
backend/
├── src/
│   ├── server.js                 App wiring, CORS allow-list, route mounting, graceful shutdown
│   ├── config/
│   │   ├── env.js                dotenv + required-var check + CORS/Gemini config
│   │   └── db.js                 Mongoose connect
│   ├── middleware/
│   │   ├── auth.js               requireAuth (JWT cookie → req.user)
│   │   ├── upload.js             multer memory storage, PDF only, 5 MB, 1 file
│   │   ├── validate.js           Zod body/params/query validation
│   │   ├── rateLimit.js          authLimiter (30/15 min), registerLimiter (10/h), analyzeLimiter (5/min)
│   │   └── errorHandler.js       notFound + central error handler
│   ├── routes/                   HTTP layer — one file per prefix (see API reference)
│   ├── services/                 Domain + AI logic (see services section)
│   ├── shared/
│   │   ├── auth/                 Canonical User, College, jwt, requireAuth/requireRole
│   │   ├── gemini/               client.js, runGemini.js (fallback chain)
│   │   ├── collegeScope.js       collegeId query scoping helpers
│   │   ├── events.js             tiny event bus with emitSafe()
│   │   ├── queue.js              p-queue bulk queue + stats
│   │   └── systemLoop.js         event → recompute wiring (the Full System Loop)
│   ├── models/                   Mongoose schemas
│   └── utils/                    ApiError, asyncHandler, jwt helpers
└── scripts/                      seed + end-to-end test scripts
```

`models/User.js` is a compatibility re-export of `shared/auth/User.js`; new code should import from
`shared/auth/User`.

## 5. Request pipeline

```
request
  → cors (origin allow-list; rejects cleanly, no 500)
  → express.json / urlencoded (1 MB)
  → cookie-parser
  → morgan (dev only)
  → router
       → rate limiter (where applied)
       → requireAuth             (verified JWT → req.user)
       → requireRole(...)        (role gate: student | placement_cell | recruiter | admin)
       → validate(zodShape)      (422-style ApiError on bad input)
       → asyncHandler(handler)   (errors propagate to one handler)
  → notFound (404 ApiError)
  → errorHandler (normalised { error: { message, details } })
```

Business routes are thin: they scope queries to the caller, call a service, and return JSON.

## 6. Data models

19 collections in `src/models/` (plus `shared/auth/User.js` and `shared/auth/College.js`).

| Model                            | Purpose                                       | Key fields                                                                                                                                                        |
| -------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User**                         | Every account, all roles                      | `email` (unique, lowercase), `passwordHash` (`select:false`), `role`, `collegeId`, `consent`, `name`; `toJSON()` strips secrets                                   |
| **College**                      | Tenant                                        | `name` (case/punctuation-insensitive uniqueness), `code` (rotatable), counts                                                                                      |
| **Resume**                       | A candidate's resume                          | `userId`, `title`, `currentVersionId`, `latestVersionNumber`                                                                                                      |
| **ResumeVersion**                | Immutable snapshot                            | `versionNumber`, `label`, `rawText`, `parsedSections`, `sourceType`, `parentVersionId`, `latestAnalysisId`                                                        |
| **Analysis**                     | One ATS evaluation                            | `atsScore`, `scoreBreakdown{keywords,formatting,impact,clarity}`, `issues[5]`, `strengths[5]`, `bulletRewrites[0–8]` (keep `_id`), keywords, model + token counts |
| **JobDescription**               | A JD, pasted or uploaded                      | `title`, `company`, `rawText`, `requiredSkills[{name,importance}]`, `ownerUserId`, `collegeId`                                                                    |
| **SkillAlias**                   | Canonical skill vocabulary                    | `canonical` ↔ aliases; seeded and admin-extendable                                                                                                                |
| **ReadinessScore**               | Append-only score per (version × JD)          | `composite`, `skillMatch`, `projectRelevance`, `experienceRelevance`, `atsSubscore`, `breakdown`, `weights`, `cacheKey`                                           |
| **RoadmapItem**                  | One missing skill → milestone                 | `skill`, `status`, `resource` (host allow-listed), `jdId`, `versionId`                                                                                            |
| **PlacementStatus**              | Cell's view of a student                      | `status`, `tags`, `audit[]` (status / tag / pass entries in one story)                                                                                            |
| **RecruiterPass**                | **The gate** — cell approved student for a JD | `studentUserId`, `jdId`, `collegeId`, `passedBy`, `passedAt`. Recruiter feeds INNER JOIN against this                                                             |
| **RolePosting**                  | Cell posts a role to its own college          | `roleKey`, `title`, `company`, responses (`interested` / `not_interested`)                                                                                        |
| **StudentRoleProfile**           | Two _separate_ role lists                     | `resumeRoles` (inferred from resume) vs `interestedRoles` (stated opt-in) — never merged                                                                          |
| **Notification**                 | Single inbox                                  | `toUserId` or `toCollegeId + toRole`, `type`, `read`, `meta`, `ctaUrl`                                                                                            |
| **Meeting**                      | In-app slot picker                            | `proposedSlots[]`, `confirmedSlot`, `icsUid`, `status`                                                                                                            |
| **InterviewSession**             | Mock interview                                | questions, answers with telemetry (`timeToFirstKeystrokeMs`, `pasteEvents`), scores                                                                               |
| **IntegrityFlag**                | Non-punitive college-scoped signal            | duplicate-resume detection, interview signals; visible to the cell, **never** to the student                                                                      |
| **ResumeVersion / Analysis / …** | (see above)                                   |                                                                                                                                                                   |

Conventions worth knowing:

- **Ownership is checked on load**, not inferred — every user-scoped query includes
  `userId: req.user._id` (or `collegeId` for institution endpoints).
- **Bullet rewrites keep `_id`** so the SPA can target and apply individual rewrites.
- **Scores are append-only**; "latest" is a sort, never a mutation of history.

## 7. API reference

Every route is JSON under `/api`. Auth = the `arr_token` httpOnly cookie unless marked public.
Errors always use `{ "error": { "message": "…", "details": null } }`.

### Health & root

| Method | Path          | Auth | Description                                                                                           |
| ------ | ------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/`           | —    | API banner + endpoint directory                                                                       |
| GET    | `/api/health` | —    | `{ status, db, uptime, subsystems }` — reports degrading subsystems (email unconfigured, queue depth) |

### Auth — `/api/auth`

| Method | Path        | Auth | Body                                                    | Description                                                                             |
| ------ | ----------- | ---- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| POST   | `/register` | —    | `{name,email,password,role?,collegeCode?,collegeName?}` | Create account, set cookie → `{user}` (201)                                             |
| POST   | `/login`    | —    | `{email,password}`                                      | Verify + set cookie → `{user}`                                                          |
| POST   | `/logout`   | —    | —                                                       | Clear cookie → `{ok:true}`                                                              |
| GET    | `/me`       | ✔    | —                                                       | Session bootstrap → `{user}`                                                            |
| PATCH  | `/profile`  | ✔    | `{name}`                                                | Update display name                                                                     |
| PATCH  | `/email`    | ✔    | `{email, currentPassword}`                              | Change email (password required — email is a credential)                                |
| PATCH  | `/password` | ✔    | `{currentPassword,newPassword}`                         | Change password                                                                         |
| PATCH  | `/consent`  | ✔    | `{shownToRecruiters}`                                   | Withdraw/restore recruiter visibility; withdrawal removes passed visibility immediately |

### Colleges — `/api/colleges`

| Method | Path               | Auth                   | Description                                          |
| ------ | ------------------ | ---------------------- | ---------------------------------------------------- |
| GET    | `/validate/:code`  | — (rate-limited)       | Does this college code exist?                        |
| GET    | `/directory?q=`    | recruiter / admin      | Server-side searchable college list                  |
| POST   | `/`                | admin                  | Create a college + generate a code                   |
| POST   | `/:id/rotate-code` | admin                  | Rotate a college's code                              |
| GET    | `/me`              | placement_cell / admin | Own college + its code                               |
| POST   | `/join`            | student                | Self-join a college with a code (permanent once set) |
| GET    | `/`                | admin                  | College directory with live registration counts      |

### Resumes — `/api/resumes`

| Method | Path                                | Description                                                                    |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------ |
| POST   | `/`                                 | Multipart `file` (+ optional `title`). Extract → AI parse → Resume + V1        |
| GET    | `/`                                 | Own resumes, newest first                                                      |
| GET    | `/:id`                              | Resume + versions (without `rawText`)                                          |
| GET    | `/:id/versions/:versionId`          | One full version (with `rawText`)                                              |
| DELETE | `/:id`                              | Delete resume + versions + analyses                                            |
| POST   | `/:id/analyze`                      | `{versionId?, targetRole?}` → ATS analysis                                     |
| GET    | `/:id/analyses`                     | All analyses, newest first                                                     |
| GET    | `/:id/versions/:versionId/analysis` | Latest analysis for a version                                                  |
| POST   | `/:id/rewrite`                      | `{analysisId, rewriteIds?, label?}` → new immutable version + auto re-analysis |
| GET    | `/:id/diff`                         | `?from=&to=&mode=words\|lines` → diff parts + stats                            |

### Job descriptions — `/api/jd`

| Method | Path           | Description                                               |
| ------ | -------------- | --------------------------------------------------------- |
| POST   | `/`            | Paste a JD (identical text is **reused**, not duplicated) |
| POST   | `/upload`      | Upload a JD PDF (≤ 5 MB, PDF only)                        |
| GET    | `/`            | Own JDs, newest first                                     |
| GET    | `/:id`         | One JD including `rawText`                                |
| PATCH  | `/:id`         | Rename / close / reopen                                   |
| POST   | `/:id/reparse` | Re-run the AI parse after an edit                         |
| DELETE | `/:id`         | Delete                                                    |

### Readiness — `/api/readiness`

| Method | Path            | Description                                                                                            |
| ------ | --------------- | ------------------------------------------------------------------------------------------------------ |
| POST   | `/compute`      | `{jdId, versionId?}` → new `ReadinessScore` (accepts own JD **or** one posted to the caller's college) |
| GET    | `/latest?jdId=` | Newest score + band label                                                                              |
| GET    | `?jdId=`        | Score history for the trend chart                                                                      |

### Roadmap — `/api/roadmap`

| Method | Path              | Description                                                                                   |
| ------ | ----------------- | --------------------------------------------------------------------------------------------- |
| POST   | `/generate`       | `{jdId, versionId?}` → milestones from missing skills. Regeneration preserves completed items |
| GET    | `/`               | Own roadmap items                                                                             |
| PATCH  | `/:itemId/status` | Update milestone (emits `roadmap.itemCompleted` → readiness refresh + notification)           |
| DELETE | `/:itemId`        | Remove a milestone                                                                            |

### Placement cell — `/api/placement-cell` _(placement_cell / admin, college-scoped)_

| Method | Path                               | Description                                                                        |
| ------ | ---------------------------------- | ---------------------------------------------------------------------------------- |
| GET    | `/students`                        | Cohort with filters (status × readiness × role × training tag), search, pagination |
| GET    | `/students/:id`                    | Student detail                                                                     |
| PATCH  | `/students/:id/status`             | Set status (audit logged)                                                          |
| POST   | `/students/:id/training-tags`      | Assign/remove training tags                                                        |
| PATCH  | `/students/:id/pass`               | **Pass a student into a recruiter JD** (creates `RecruiterPass`)                   |
| POST   | `/bulk`                            | Bulk status / tags / pass through the shared queue                                 |
| GET    | `/integrity-flags`                 | College-scoped informational flags                                                 |
| PATCH  | `/integrity-flags/:id/acknowledge` | Acknowledge a flag                                                                 |
| GET    | `/students/:id/review`             | Review bundle                                                                      |
| GET    | `/pipeline`                        | Every JD posted to this college (drives the pass modal)                            |
| GET    | `/pipeline/:jdId/candidates`       | Candidates for one JD with pass state                                              |
| GET    | `/training`                        | Tag vocabulary, each tag's cohort, students with no training                       |
| GET    | `/analytics`                       | Cohort analytics                                                                   |

### Roles — `/api/roles` (mounted from `routes/placementRoles.js`)

Cell side is under `/cell` (placement_cell / admin), student side under `/me` (student).

| Method   | Path                                    | Description                                                   |
| -------- | --------------------------------------- | ------------------------------------------------------------- |
| GET      | `/cell/roles`                           | Role index for the filter bar                                 |
| GET      | `/cell/roles/:roleKey/students?source=` | Resume-derived vs interested lists — **kept distinct**        |
| GET·POST | `/cell/roles/postings`                  | Cell posts a role to its college (role created automatically) |
| PATCH    | `/cell/roles/postings/:id`              | Close / reopen a posting                                      |
| GET      | `/cell/roles/postings/:id`              | Who responded and how                                         |
| GET      | `/me/roles/my-postings`                 | Postings for the student's college                            |
| POST     | `/me/roles/postings/:id/respond`        | Opt in / out                                                  |
| GET      | `/me/roles/my-roles`                    | The student's own resume + interested roles                   |

### Recruiter — `/api/recruiter` _(recruiter only)_

| Method | Path                       | Description                                                              |
| ------ | -------------------------- | ------------------------------------------------------------------------ |
| POST   | `/jds` · `/jds/upload`     | Create a JD (paste or PDF) — one shared create path                      |
| GET    | `/jds` · `PATCH /jds/:id`  | Own JDs; close/reopen                                                    |
| GET    | `/jds/:id/candidates`      | **Passed-only**, ranked, college-tagged candidate pool                   |
| GET    | `/candidates/:id/profile`  | Candidate profile (pass-gated)                                           |
| PATCH  | `/candidates/:id/decision` | Shortlist / reject                                                       |
| GET    | `/role-suggestions`        | Role suggestions from own postings                                       |
| GET    | `/meeting-options`         | Propose-meeting candidates, grouped by role (built from the passed pool) |

### Notifications, meetings & messaging — `/api/notifications`

| Method | Path                      | Description                                                                                                            |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| GET    | `/` · `/unread-count`     | Inbox                                                                                                                  |
| PATCH  | `/:id/read` · `/read-all` | Mark read                                                                                                              |
| POST   | `/messages`               | Direct message; role-scoped (no `jdId` → must be passed for _some_ role; with `jdId` → must be passed for _that_ role) |
| POST   | `/meetings`               | Propose 2–3 slots                                                                                                      |
| GET    | `/meetings`               | Meetings the caller is in                                                                                              |
| POST   | `/meetings/:id/confirm`   | Confirm a slot → notification + optional email                                                                         |
| GET    | `/meetings/:id/ics`       | Direct `.ics` download (no email required)                                                                             |
| POST   | `/meetings/:id/cancel`    | Cancel                                                                                                                 |
| POST   | `/bulk-notify`            | Cell → cohort broadcast (queued)                                                                                       |

### Interviews — `/api/interviews`

| Method | Path                  | Description                                                  |
| ------ | --------------------- | ------------------------------------------------------------ |
| POST   | `/start`              | Start a session for a role (optionally a chosen `versionId`) |
| POST   | `/:id/answer`         | Submit an answer + client telemetry                          |
| POST   | `/:id/complete`       | Finalise, score, raise integrity signals                     |
| GET    | `/` · `/:id`          | Own sessions                                                 |
| GET    | `/college/:studentId` | Cell view — includes flags the student cannot see            |

### Student aggregates

| Method | Path             | Description                                                                                          |
| ------ | ---------------- | ---------------------------------------------------------------------------------------------------- |
| GET    | `/api/dashboard` | KPIs + deltas + sparklines, version stack, score series, recent activity                             |
| GET    | `/api/insights`  | Totals, average, best score, trend, top issues, top present/missing keywords, per-resume performance |
| GET    | `/api/versions`  | All versions across resumes + totals by source type                                                  |
| GET    | `/api/history`   | Merged chronological timeline (upload / rewrite / analyze)                                           |

## 8. Services & domain logic

| Service                  | Responsibility                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `geminiService.js`       | ATS analysis prompt + response schema; returns `{ analysis, model, tokens }`         |
| `structuredParser.js`    | PDF text → typed resume sections; sanitises hallucinated skill avalanches            |
| `jdParser.js`            | JD text/PDF → `{title, company, requiredSkills[]}` with a title fallback chain       |
| `normalizeSkills.js`     | Maps skill strings onto the canonical vocabulary (`SkillAlias`)                      |
| `skillMatch.js`          | Resume × JD match: direct/transferable, must-vs-nice, project & experience relevance |
| `readinessScore.js`      | Pure weighted composite (§ below) — no AI, deterministic                             |
| `roadmapGen.js`          | Missing skills → milestones with **allow-listed** free-resource URLs                 |
| `roleExtract.js`         | Infers the roles a resume points at (feeds the cell's role filter)                   |
| `resumeBaseline.js`      | Scores a resume against its own implicit target role                                 |
| `candidateProfile.js`    | Assembles the recruiter-facing candidate view (pass-gated)                           |
| `interviewService.js`    | Question generation, answer scoring, integrity signal computation                    |
| `notificationService.js` | Writes in-app notifications, then best-effort email                                  |
| `emailService.js`        | SMTP relay via nodemailer, local daily cap, `emailStatus()`                          |
| `icsService.js`          | RFC-compliant `.ics` generation for confirmed meetings                               |
| `diffService.js`         | Word/line diff + add/remove stats                                                    |
| `pdfService.js`          | `pdf-parse` wrapper with guaranteed teardown                                         |

### Readiness Score

```
readiness = 0.45 · skillMatch          (must-skills weighted ×2; transferable = 0.8 credit)
          + 0.20 · projectRelevance
          + 0.15 · experienceRelevance
          + 0.20 · ats                 (latest ATS score for the chosen version)
```

The weights live in one `WEIGHTS` object so they can be tuned in one place. Each stored score keeps
its own `breakdown` and `weights`, so old rows remain explainable after a tuning change.

## 9. The Full System Loop

`shared/systemLoop.js` subscribes to `shared/events.js` so an update anywhere refreshes everything
downstream without the user re-triggering a thing.

| Event                                                  | Effect                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `resume.analyzed`                                      | Recompute readiness for the active JD **and** refresh resume-derived roles |
| `resume.rewriteApplied`                                | Same as above                                                              |
| `roadmap.itemCompleted`                                | Recompute readiness for that JD + notify the student                       |
| `placement.statusChanged`, `recruiter.candidatePassed` | Recorded for dashboards / audit                                            |

Two invariants the file protects:

1. **Fire-and-forget** — a listener throwing never fails the request that emitted the event.
2. **Idempotent and cheap** — one in-flight recompute per user (a burst of events = one recompute)
   and a SHA-256 `cacheKey` over (version, JD, raw-text length) skips the AI call entirely when
   nothing changed.

Bulk operations (passing 40 students, notifying a cohort) run through `shared/queue.js`, a single
`p-queue` with concurrency 2 — no Redis, no second sleeping service. Depth is exposed on
`/api/health`.

## 10. AI layer

Two independent pipelines share one fallback chain:

```
model list = [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS]
           = gemini-3.5-flash-lite → gemini-3.5-flash → gemini-3.6-flash   (defaults)
```

- Calls use `responseMimeType: "application/json"` plus a `responseSchema`, so output is
  structurally constrained, then **Zod-validated** before anything is persisted.
- On a **transient** error (`429/500/502/503/504`, or "high demand", "temporarily unavailable",
  "resource exhausted", "unavailable", "overloaded") the code moves **immediately** to the next
  model rather than burning time in retries.
- If every model fails, the endpoint returns a clear `Gemini analysis failed: …` 500.
- The **model that actually succeeded** and its token counts are persisted with the result, so
  cost and quality are auditable per record.

Prompting rules of note: full credit for already-strong quantified bullets, no invented
weaknesses, exactly 5 issues / 5 strengths / 0–8 rewrites, and no repetition of already-resolved
issues.

## 11. Security, limits & failure behaviour

**Security**

- bcrypt hashing (12 rounds); `passwordHash` is `select:false` and stripped by `toJSON()`.
- JWT in an httpOnly cookie (`secure` + `SameSite=None` in production) — no token in JS or
  localStorage.
- CORS is an explicit allow-list with `credentials: true`; an unknown origin is rejected cleanly
  (no CORS headers) instead of throwing a 500.
- `trust proxy` is set so rate limits key on the real client IP behind a proxy.
- Every user/institution query is scoped in the database (`collegeScope.js`), so a crafted request
  cannot reach another college's students.
- The recruiter gate is structural: the feed INNER JOINs `RecruiterPass`, so no client input can
  surface an unpassed candidate.
- Central error handler returns operational `ApiError` messages only — never stack traces.

**Limits**

| Limit                                      | Value                                        |
| ------------------------------------------ | -------------------------------------------- |
| PDF upload                                 | PDF only, 1 file, **≤ 5 MB** (resume and JD) |
| JSON body                                  | 1 MB                                         |
| Auth attempts                              | 30 / 15 min per IP                           |
| Registration                               | 10 / hour per IP                             |
| AI-heavy routes (analyze, JD parse/upload) | 5 / min per user                             |
| Email                                      | `EMAIL_DAILY_CAP` per day (default 300)      |

**Failure behaviour**

- Missing `MONGO_URI` / `JWT_SECRET` → process exits with a named-variable message.
- Missing Gemini key → AI endpoints return a clear 500; everything else works.
- Email unconfigured → in-app notifications and `.ics` downloads still work; the UI says email is
  off.
- Shutdown (`SIGINT`/`SIGTERM`) closes the HTTP server then MongoDB, with a 10 s forced-exit guard.

## 12. Testing

There is no unit-test runner yet; the suites are end-to-end HTTP scripts with a `✅/❌` checklist.
Workflow:

```powershell
# terminal 1
npm run seed
npm run dev

# terminal 2
npm run test:roles
npm run test:fixes
```

Key behaviours proved by these scripts (not merely asserted):

- A student at high readiness with a matching resume **does not appear** in a recruiter feed until
  their placement cell passes them; after passing 2 of N the feed contains exactly those 2,
  college-tagged and ranked.
- An interview answer that arrives instantly, is long, and follows a paste raises all four flag
  types, scores lower than honest answers, is **invisible to the student**, and visible to the cell.
- Withdrawing consent removes a passed student from every recruiter feed immediately.
- Re-analysing a resume refreshes readiness with no user action.
- A role the college has never seen is created by posting it; opt-ins land in _Interested_ while the
  student's _resume_ role list is untouched.

## 13. Troubleshooting

| Symptom                                               | Cause / fix                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Missing required env vars: …`                        | `backend/.env` missing or not in `backend/`. Copy `../.env.example`.                                                |
| `Server listening` then a Mongo timeout               | `MONGO_URI` wrong, or this IP is not allow-listed in Atlas (Network Access).                                        |
| Every API call fails in the browser with a CORS error | SPA origin not in `CLIENT_ORIGIN` (production), or the backend isn't on `:5000`. Dev allows any `localhost:*` port. |
| `Gemini analysis failed`                              | Key missing/invalid, or all models hit quota. `gemini-3.5-flash-lite` has the largest free daily allowance.         |
| `analyze` returns 429                                 | analyzeLimiter: 5 / min / user. Wait a minute.                                                                      |
| Notifications arrive in-app but no email              | `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` unset. `/api/health` reports `email: not_configured`.               |
| Seed accounts reject the documented password          | Re-run `npm run seed` — it resets fixture passwords every run.                                                      |
