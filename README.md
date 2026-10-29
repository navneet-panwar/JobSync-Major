# JobSync — AI-Powered Job Readiness & Career Gap Analyzer

> Group 35 · Department of CSE, GNIOT Greater Noida
> Praful Kr. Singh · Preet Verma · Navneet Panwar · Prince Barnwal
> Supervisor: Ms. Akansha Sharma

JobSync replaces guesswork in campus placement with a **measurable readiness score**, a
**personalized improvement roadmap**, and one closed loop between the three people who actually
decide an outcome: the **student**, the **placement cell**, and the **recruiter**.

A resume score alone is not enough, and a job board alone is not enough. JobSync's novel edge is
**institution-governed gatekeeping**: a student only becomes visible to a recruiter for a given
role after their placement cell has reviewed and *passed* them for it. The gate is enforced in the
database query, not in the UI — a student who was never passed cannot appear in a recruiter feed no
matter how high their score is or what the client sends.

---

## Table of contents

1. [What the platform does](#1-what-the-platform-does)
2. [Feature status (built vs. planned)](#2-feature-status-built-vs-planned)
3. [Architecture](#3-architecture)
4. [Repository layout](#4-repository-layout)
5. [Quick start](#5-quick-start)
6. [Seed accounts & test scripts](#6-seed-accounts--test-scripts)
7. [Readiness Score — how it is computed](#7-readiness-score--how-it-is-computed)
8. [Roles & tenancy (college codes)](#8-roles--tenancy-college-codes)
9. [API surface](#9-api-surface)
10. [Tech stack](#10-tech-stack)
11. [Documentation map](#11-documentation-map)
12. [Contributing](#12-contributing)
13. [License & credits](#13-license--credits)

---

## 1. What the platform does

```
   STUDENT                          PLACEMENT CELL                     RECRUITER
   ───────                          ──────────────                     ─────────
   Upload resume  ──┐
   AI parse + ATS   │               Review cohort ──┐
   Rewrite & version│               Tag / train      │
   Paste a JD   ────┼──► Readiness Score ◄──────────┘
   Get a roadmap    │     (0–100, weighted)
   Practice interview│                        Pass student for a role
   Track milestones ┘                                │  ▲
                                                     ▼  │  (gate — DB-enforced)
                                          Recruiter candidate feed
                                          Shortlist / reject → meeting (.ics)
```

- **Diagnose** — ATS score, structural issues, strengths, and bullet-level rewrites on every resume
  version, plus a JD-vs-resume skill match.
- **Improve** — a milestone roadmap generated from the *missing* skills, and mock interviews that
  feed new signals back into the score.
- **Decide** — a placement cell that governs visibility, and a recruiter who only ever sees passed,
  ranked, college-tagged candidates.

## 2. Feature status (built vs. planned)

The build follows the phase plan in [`projectimplementation.md`](./projectimplementation.md).
Phases 1–12 are **built in code** and are awaiting formal review; the status log there is the
source of truth.

| Area | Status | Where |
| --- | --- | --- |
| Resume Intelligence (upload, AI parse, ATS score, rewrites, versioning, diff, PDF export) | ✅ Built | `backend/src/routes/resumes.js`, `components/analysis/*` |
| Shared auth with roles (`student`, `placement_cell`, `recruiter`, `admin`) | ✅ Built | `backend/src/shared/auth/*` |
| Multi-college tenancy via college codes | ✅ Built | `routes/colleges.js`, `shared/collegeScope.js` |
| JD parsing + AI skill normalisation | ✅ Built | `routes/jd.js`, `services/jdParser.js`, `services/normalizeSkills.js` |
| Readiness Score engine | ✅ Built | `services/readinessScore.js`, `services/skillMatch.js` |
| Roadmap / milestones | ✅ Built | `routes/roadmap.js`, `services/roadmapGen.js` |
| Placement cell cohort, status tags, bulk actions, analytics, training | ✅ Built | `routes/placementCell.js`, `routes/placementRoles.js` |
| Recruiter gatekeeping, ranking, shortlist/reject | ✅ Built | `routes/recruiter.js`, `models/RecruiterPass.js` |
| In-app notifications + meetings (`.ics`, no calendar API) + optional email | ✅ Built | `routes/notifications.js`, `services/icsService.js`, `services/emailService.js` |
| AI mock interview + integrity telemetry | ✅ Built | `routes/interviews.js`, `services/interviewService.js` |
| Full System Loop (events → readiness auto-refresh) | ✅ Built | `shared/systemLoop.js`, `shared/events.js` |
| Async job queue for AI work | ✅ Built (in-process `p-queue`) | `shared/queue.js` |

Everything degrades gracefully on a free tier: no email provider → in-app notifications only; no
Gemini key → AI endpoints return a clear error instead of crashing the app.

## 3. Architecture

```
┌──────────────────────────────┐        ┌────────────────────────────────────────┐
│  React 19 SPA (Vite :5173)   │  /api  │  Express 5 API (:5000)                 │
│  TanStack Query · Tailwind 4 │ ─────► │  routes → services → models            │
│  Recharts · react-pdf        │ cookie │  JWT httpOnly · Zod · rate limits      │
└──────────────────────────────┘        └───────────┬──────────────┬─────────────┘
                                                    │              │
                                        ┌───────────▼───┐   ┌──────▼──────────┐
                                        │ MongoDB Atlas │   │ Google Gemini   │
                                        │ 19 collections│   │ multi-model      │
                                        │               │   │ fallback chain   │
                                        └───────────────┘   └─────────────────┘
```

- **Stateless API** — the session is a JWT in an `httpOnly` cookie; no server-side session store.
- **Append-only score history** — every `ReadinessScore` is a row, so trends are real, not derived.
- **Event bus + loop** — analysis, rewrite, and milestone events trigger one deduplicated
  readiness recompute per user (`shared/systemLoop.js`).

## 4. Repository layout

```
major jobsync/
├── backend/                 Express 5 API — see backend/README.md
│   ├── src/
│   │   ├── routes/          HTTP layer (auth, resumes, jd, readiness, roadmap,
│   │   │                    placementCell, placementRoles, recruiter,
│   │   │                    notifications, interviews, dashboard, insights,
│   │   │                    versions, history, colleges, health)
│   │   ├── services/        AI + domain logic (gemini, parser, match, readiness…)
│   │   ├── models/          Mongoose schemas (19 collections)
│   │   ├── shared/          auth, college scoping, gemini client, queue, loop
│   │   ├── middleware/      auth, upload, validate, rateLimit, errorHandler
│   │   └── config/          env + db
│   └── scripts/             seed + end-to-end test scripts
├── frontend/                npm wrapper — see frontend/README.md
│   └── client/              React 19 + Vite SPA — see frontend/client/README.md
├── fe-qa/                   ad-hoc browser QA snippet (not part of the build)
├── scope.md                 master report: scope, research grounding, literature
├── projectimplementation.md full phase plan, deviation log (D1–D41), test matrix
├── VIVA-QNA.md              viva / defense preparation Q&A
└── .env.example             template for backend/.env
```

## 5. Quick start

**Prerequisites:** Node.js ≥ 20, a MongoDB connection string (Atlas M0 is fine), and a free
[Gemini API key](https://aistudio.google.com/apikey).

```powershell
git clone https://github.com/navneet-panwar/JobSync-Major.git
cd JobSync-Major

# 1. Backend
cd backend
npm install
Copy-Item ..\.env.example .env      # bash: cp ../.env.example .env
#   → edit .env: at minimum MONGO_URI and JWT_SECRET (and GEMINI_API_KEY)
npm run seed                        # optional: demo colleges + accounts
npm run dev                         # http://localhost:5000

# 2. Frontend (second terminal)
cd frontend/client
npm install
npm run dev                         # http://localhost:5173
```

Vite proxies `/api/*` to `http://localhost:5000`, so cookies work in development with no CORS
fiddling. Verify the API first: `GET http://localhost:5000/api/health` should report
`{ "status": "ok", "db": "connected" }`.

Full backend details, environment variable reference, and every script are in
[`backend/README.md`](./backend/README.md).

## 6. Seed accounts & test scripts

`npm run seed` (inside `backend/`) creates two colleges and one account per role. Passwords are
**reset on every run**, so the values below always work.

| College | Code | Account | Password |
| --- | --- | --- | --- |
| GNIOT Greater Noida | `GNIOT-TEST` | `student1@jobsync.dev` (student) | `student12345` |
| GNIOT Greater Noida | `GNIOT-TEST` | `cell@jobsync.dev` (placement cell) | `cell12345` |
| KCC Institute | `KCC-TEST` | `student2@jobsync.dev` (student) | `student12345` |
| — | — | `student0@jobsync.dev` (student, no college) | `student12345` |
| — | — | `recruiter@jobsync.dev` | `recruiter12345` |
| — | — | `admin@jobsync.dev` | `admin123456` |

End-to-end checks (run with the server up, from `backend/`):

| Script | Purpose |
| --- | --- |
| `npm run test:roles` | Role postings, opt-ins, tag × role × status filters, cross-college isolation |
| `npm run test:fixes` | Gatekeeping pipeline, JD upload, meeting gate, foreign-version refusal |

Additional phase suites live in `backend/scripts/` (`test-phase2.js`, `test-phase567.js`,
`test-phase8to12.js`) and are documented in `projectimplementation.md`.

## 7. Readiness Score — how it is computed

Pure arithmetic, no AI, so the same inputs always produce the same number
(`backend/src/services/readinessScore.js`):

```
readiness = 0.45 · skillMatch          (must-skills count double; transferable skill = 0.8 credit)
          + 0.20 · projectRelevance
          + 0.15 · experienceRelevance
          + 0.20 · ats                 (latest ATS score for the chosen resume version)
```

Scores are stored **per (resume version × JD)** and append-only, so a placement cell can show a
trend rather than a single snapshot. Re-analysing a resume or completing a roadmap milestone
refreshes readiness automatically through the Full System Loop.

## 8. Roles & tenancy (college codes)

| Role | Joins how | Sees |
| --- | --- | --- |
| `student` | Registers with a college code (or self-joins later via `POST /api/colleges/join`) | Own resumes, readiness, roadmap, interviews, own role lists |
| `placement_cell` | Registers with a college **name**; gets a generated code to issue | Only their own college's students, requires review → pass |
| `recruiter` | Self-registers | Only *passed* candidates, ranked, college-tagged |
| `admin` | Created by seed / DB | College directory, create & rotate codes |

Every college-scoped query is filtered by `collegeId` **in the database query**
(`shared/collegeScope.js`), never only in the UI. College names are matched case- and
punctuation-insensitively so a campus cannot be duplicated and silently split the gate.

## 9. API surface

All routes are JSON under `/api`, authenticated by the `arr_token` httpOnly JWT cookie.

| Prefix | Owns |
| --- | --- |
| `/api/health` | Status, DB state, degrading subsystems |
| `/api/auth` | Register, login, logout, `/me`, profile, email, password, consent |
| `/api/colleges` | Code validation, join, directory, admin create/rotate |
| `/api/resumes` | Upload, versions, analyze, rewrite, diff, delete |
| `/api/jd` | Paste/upload a JD, reparse, close/reopen |
| `/api/readiness` | Compute, latest, history |
| `/api/roadmap` | Generate, list, update milestone, delete |
| `/api/placement-cell` | Cohort, student detail, status, tags, pass, bulk, integrity flags, pipeline, training, analytics |
| `/api/roles` | Role index, postings, student opt-ins, my roles |
| `/api/recruiter` | JDs, ranked candidates, profile, decisions, meeting options |
| `/api/notifications` | Inbox, messages, meetings, `.ics`, bulk notify |
| `/api/interviews` | Start, answer, complete, history, college view |
| `/api/dashboard`, `/api/insights`, `/api/versions`, `/api/history` | Student aggregates |

The running API publishes its own directory at `GET /`. Error envelope:

```json
{ "error": { "message": "Resume not found", "details": null } }
```

## 10. Tech stack

| Layer | Stack |
| --- | --- |
| **Backend** | Node.js ≥ 20, Express 5, Mongoose 9, MongoDB Atlas, Zod 4, JWT (`jsonwebtoken`), bcryptjs, multer, pdf-parse, `@google/genai` (Gemini), `diff`, `p-queue`, nodemailer, `ics`, express-rate-limit |
| **Frontend** | React 19, Vite 8, React Router 7, TanStack Query 5, Axios, Tailwind CSS 4, Framer Motion, Recharts, lucide-react, react-dropzone, `@react-pdf/renderer` |
| **AI** | Google Gemini with a multi-model fallback chain + Zod-validated structured output |
| **Infra** | Free-tier only: Atlas M0, Gemini free tier, any static host for the SPA |

## 11. Documentation map

| File | Read this for |
| --- | --- |
| [`scope.md`](./scope.md) | Problem statement, literature gaps, full feature spec, architecture |
| [`projectimplementation.md`](./projectimplementation.md) | Phase plan, status log, deviation log D1–D41, test coverage |
| [`VIVA-QNA.md`](./VIVA-QNA.md) | Defense / viva preparation |
| [`backend/README.md`](./backend/README.md) | API, models, services, env vars, scripts |
| [`frontend/README.md`](./frontend/README.md) | Workspace layout and scripts |
| [`frontend/client/README.md`](./frontend/client/README.md) | SPA structure, routes, data flow, design system |

## 12. Contributing

1. Branch from `main`: `git switch -c feat/<short-slug>`.
2. Keep changes scoped; do not commit `backend/.env`, `node_modules/`, or `dist/`.
3. Run `npm run lint` (frontend) and the relevant `backend/scripts/test-*.js` suite before pushing.
4. Use Conventional Commit prefixes (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
5. Open a PR describing *why*, plus the test you ran and what you saw.

If you add a new API surface, update `server.js`'s root directory, this table, and
`backend/README.md` in the same PR.

## 13. License & credits

Released under the [MIT License](./LICENSE).

Built by Group 35, Department of CSE, GNIOT Greater Noida — Praful Kr. Singh, Preet Verma,
Navneet Panwar, Prince Barnwal — supervised by Ms. Akansha Sharma.
