# JobSync — Full Platform Implementation Plan

**From Resume Intelligence Module → Complete JobSync Platform**

This document is the execution blueprint for turning the built **AI Resume Roaster** (Resume
Intelligence module) into the full **JobSync — AI-Powered Job Readiness & Career Gap Analyzer**
described in `scope.md`. It is written to be followed phase by phase, in order, with each phase
ending in something testable.

## STATUS LOG

> Convention: a phase is marked ✅ **only when the user confirms it in review**. Until then it
> stays 🟡 "BUILT, PENDING REVIEW".

| Phase | Status | Notes |
| --- | --- | --- |
| 1 — Shared backend shell | ✅ Complete | Reviewed & passed |
| 2 — Colleges, roles, college-code registration | 🟡 Built, pending review | + 12 extra items (D1–D12) |
| 3 — JD upload & AI parsing | 🟡 Built, pending review | + skill normalisation (D13) |
| 4 — Skill match & Readiness Score | 🟡 Built, pending review | |
| 5 — Roadmap | 🟡 Built, pending review | |
| 6 — Placement-cell cohort & status tagging | 🟡 Built, pending review | |
| 7 — Recruiter gatekeeping | 🟡 Built, pending review | **The invariant is live and tested** |
| 8 — Filters, bulk actions, analytics | 🟡 Built, pending review | + p-queue, integrity flag endpoints |
| 9 — Notifications, meetings, messaging | 🟡 Built, pending review | + nodemailer, ics |
| 10 — Mock interview + integrity monitor | 🟡 Built, pending review | |
| 11 — Full System Loop | 🟡 Built, pending review | Verified working |
| 12 — Hardening | 🟡 Built, pending review | |

**The build is feature-complete against `scope.md` §5.** What remains is your review and the
real-world setup items listed at the end of this document.

### Test coverage built along the way

| Script | Covers |
| --- | --- |
| `backend/scripts/seed.js` | 2 colleges + 7 accounts. **Resets passwords on every run** so a test that changed one cannot break later runs. |
| `backend/scripts/test-phase2.js` | 16 checks — role registration, code validation, admin gates, cross-college identity |
| `backend/scripts/test-phase567.js` | 34 checks — JD parse, readiness, roadmap (+ resource allow-list), cohort, audit log, **the gatekeeping invariant** |
| `backend/scripts/test-phase8to12.js` | 30 checks — bulk actions, analytics, notifications, messaging gate, `.ics`, **interview integrity signals**, consent withdrawal, **the Full System Loop** |
| `backend/scripts/test-roles-tags.js` | 29 checks — auto-created roles on posting, student notification, opt-in landing in the interested list, **the resume/interested lists staying distinct**, tag × role × status filter composition, training workspace, cross-college isolation on the new endpoints |
| `backend/scripts/test-fixes.js` | 37 checks — **the pass-modal bug** (a cell sees recruiter JDs posted to it, and its own JD list is still empty), the pipeline fields the role picker searches on, passing into a recruiter role, the per-role candidate list, JD file upload, college-directory search incl. regex escaping, recruiter meeting options and the meeting gate, interview + roadmap version selection, foreign-version refusal |

Key things proven by test, not by assertion:

- A student at 67% readiness with a matching resume **does not appear** in a recruiter feed
  until their placement cell passes them; after passing 2 of N, the feed contains *exactly*
  those 2, college-tagged and ranked.
- An interview answer that arrives **instantly, is long, and follows a 500-character paste**
  raises all four flag types, is **scored lower** than the honest answers, and is **invisible to
  the student** while being visible to their placement cell.
- Withdrawing consent removes a passed student from every recruiter feed immediately.
- Re-analysing a resume **auto-refreshes readiness** with no user action (score rows 5 → 6).
- A role the college has never seen **is created by posting it**, the college's students are notified, and an opt-in lands in that role's *Interested* list — while the student's *resume* list is left untouched, so the two signals never contaminate each other.

### Setup required before the free-tier features fully work

These are configuration, not code. Everything degrades gracefully without them.

| Feature | Needs | Without it |
| --- | --- | --- |
| Email delivery | `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` in `backend/.env` | In-app notifications still work; `.ics` still downloads; the UI says email isn't configured |
| Email links | `CLIENT_URL` | Links inside emails point at localhost |

### Deviations & additions (built outside the original phase text)

These were built because the original plan would have produced a broken or unprofessional
result. Listed so the plan and the code stay in agreement.

| # | Change | Why | Where |
| --- | --- | --- | --- |
| D1 | **Product renamed Resume Roaster → JobSync** everywhere (sidebar, landing, footer, auth panel, browser title) | "Roaster" is student-facing slang and looked unprofessional to a placement cell | `Sidebar`, `Navbar`, `Footer`, `AuthShell`, `index.html`, `backend/package.json` |
| D2 | **Role-scoped navigation** replaces the single nav list | A placement cell was shown Resumes/Insights/Versions/History — every link opened a *student* page | `Sidebar.jsx` (`NAV_BY_ROLE`) |
| D3 | **`RoleHome`** resolves `/dashboard` by role | `/dashboard` was hardcoded to the student dashboard, so a cell/recruiter saw an empty student page | `routes.jsx`, `PlacementCellHome.jsx`, `RecruiterHome.jsx` |
| D4 | **Role-aware topbar copy** | A placement cell was reading "Sharpen your resume with calm, focused AI insights" | `Topbar.jsx` |
| D5 | **Students roster** (`GET /api/placement-cell/students`) | `scopeQueryToCollege` existed but no route used it, so a cell could not see students who joined. Also the first live route proving the scoping invariant | `routes/placementCell.js`, `pages/PlacementStudents.jsx` |
| D6 | **Change email** (requires current password) | Requested. An email is both a credential and the reset destination, so an open session must not silently move it | `routes/auth.js` (`PATCH /api/auth/email`), `Settings.jsx` |
| D7 | **College create-on-signup for placement cells** | The original plan required a code to *create* a cell, which is backwards — the cell is the issuer. Cells now register with a college **name** and receive a generated code | `routes/auth.js`, `Register.jsx` |
| D8 | **Student self-join** (`POST /api/colleges/join`) | A student who registered before their cell existed had no way in. Permanent once set — a cell moves students, not the student | `routes/colleges.js`, `Settings.jsx` |
| D9 | **CORS dev-port tolerance** + clean rejection | A dev server on an unlisted port produced a 500 *after* creating a college. Dev now allows any `localhost:*` port; rejection is a clean CORS block | `config/env.js`, `server.js` |
| D10 | **Orphan-college rollback** | A college was created before its user, so any failure permanently reserved the name forever | `routes/auth.js` |
| D11 | **Toast argument guard** | `toast.success(msg, {duration})` passed the options object as the *description*; React rendered an object and the whole app unmounted (blank screen) | `context/UIContext.jsx` |
| D12 | **Nav items flagged `soon`** | Cell/recruiter nav entries whose pages arrive in later phases render disabled with a "soon" tag rather than as dead links | `Sidebar.jsx` |
| D13 | **Skill normalisation pulled forward into Phase 3** | Planned for later, but the match engine *depends* on it: without a shared vocabulary "ReactJS" on a resume never matches "React" in a JD | `services/normalizeSkills.js`, `models/SkillAlias.js` |
| D14 | **Readiness defaults to an already-scored JD** | Opening the page on an unscored role showed "No score yet" even when a valid result existed for another role | `pages/Readiness.jsx` |
| D15 | **JD title fallback chain** (form → AI → first line of text) | The model sometimes returns an empty title, producing "Untitled role" | `services/jdParser.js` (`titleFromText`), `routes/jd.js` |
| D16 | **College-name uniqueness is case/punctuation-insensitive** | `findOne({ name })` was an exact match, so "GNIOT" and "GNIOT Greater Noida" became TWO colleges. Not cosmetic: the gate is scoped to one `collegeId`, so a student on the duplicate is invisible to the real placement cell and a recruiter JD pointed at it can receive no passes at all. Found via the invariant test failing with a college mismatch. | `routes/auth.js` |
| D17 | **Identical JD text is reused, not duplicated** | Re-pasting the same posting created a second identical entry — the role selector filled with indistinguishable titles. Now returns the existing JD with `reused: true` and the UI says so. | `routes/jd.js`, `useJobDescriptions.js` |
| D18 | **Roadmap resource URLs are allow-listed** | A model asked for a learning link will confidently invent dead ones and occasionally point at spam. Host is checked against a curated free-resource list; a rejected URL becomes a label with no href rather than a broken link. | `services/roadmapGen.js` |
| D19 | **Roadmap regeneration preserves progress** | Regenerating replaces only `not_started` items; a student who completed three milestones must not lose that work when the role is re-scored. | `routes/roadmap.js` |
| D20 | **Two conflicting `/jobs` routes** | The student's job-descriptions page and the recruiter's job list both claimed `/jobs`. The recruiter's moved to `/recruiter/jobs`. | `routes.jsx` |
| D21 | **Recruiter messaging is role-scoped** | A pass for role A must not authorise discussion of role B. Two distinct rules now: no `jdId` → must be passed for *some* role (a legitimate check-in); with `jdId` → the pass must be for *that* role. | `routes/notifications.js` |
| D22 | **Integrity flags are visible to the cell, never the student** | A student cannot correct what they cannot see, and showing flags mid-course only teaches evasion. The teacher-facing view states plainly that flags are informational. | `routes/interviews.js` |
| D23 | **Email is never load-bearing** | Every notification is written in-app first; sending is best-effort on top with a daily cap. A quota failure cannot fail the user's action. | `services/notificationService.js`, `emailService.js` |
| D24 | **One in-flight recompute per user** | A rewrite firing several events at once produced several recomputes. The loop now dedupes per user, and the cache key skips unchanged inputs entirely. | `shared/systemLoop.js` |
| D25 | **`/api/health` reports degrading subsystems** | Lets an operator tell "the app is broken" from "email is unconfigured". | `routes/health.js` |
| D26 | **Training is a real page, not a `soon` stub** | The sidebar advertised a Training workspace that was disabled — a cell could tag students but had nowhere to see or manage the tags. It now lists the tag vocabulary, each tag's cohort, and the students with no training assigned. | `pages/PlacementTraining.jsx`, `routes/placementCell.js` (`GET /training`) |
| D27 | **Training tags render alongside the profile** | Tags existed only in the bulk-action modal and a tooltip; a cell could not see who carried what at a glance. They now appear on the cohort row, the student detail, the training page and the role lists through one shared `StudentTagChips` component. | `components/placement/StudentTagChips.jsx` |
| D28 | **Tag and role filters on the cohort table** | Scope §5.3's smart filter asked for score × missing-skill × **training tag** × status; only status and readiness were built. Tags and roles now sit in the same filter bar and compose with the rest. | `pages/PlacementStudents.jsx`, `routes/placementCell.js` |
| D29 | **Roles from the resume, inferred automatically** | The role filter needs a role signal that exists before any JD does. `roleExtract` reads the resume's own direction and the Full System Loop refreshes it on every analysis and rewrite, so it is never stale. | `services/roleExtract.js`, `models/StudentRoleProfile.js`, `shared/systemLoop.js` |
| D30 | **Placement cells can post a role and collect opt-ins** | Scope §5.3 has the cell notifying a cohort, but nothing let the cell ask "who wants this drive?". A posting notifies the college and students answer interested / not; a role the college has never seen is created automatically rather than rejected. | `routes/placementRoles.js`, `models/RolePosting.js` |
| D31 | **Resume roles and opt-in roles are two lists, never one** | They answer different questions — "who fits this role" versus "who wants it". Merging them would let an inferred match masquerade as stated intent. Every row carries which signal put it there, and the API returns them separately. | `models/StudentRoleProfile.js`, `pages/PlacementRoles.jsx` |
| D32 | **The pass modal read the wrong JD list** | It called `/api/jd`, which returns the **caller's own** JDs. A placement cell owns none, so the modal claimed "no recruiter roles are open to your college" even with a role plainly posted. The roles a cell works with belong to *recruiters* and carry the cell's `collegeId` — that is now the query. | `routes/placementCell.js` (`GET /pipeline`), `pages/PlacementStudents.jsx` |
| D33 | **A student could not plan or score against a recruiter-posted role** | Both `/roadmap/generate` and `/readiness/compute` required `ownerUserId: req.user._id`, so the one role a student was actually passed into was the one they could not prepare for. Both now accept their own JD *or* one posted to their college. | `routes/roadmap.js`, `routes/readiness.js` |
| D34 | **Recruiters can drop a JD, not only paste one** | The resume pipeline had a dropzone; the JD one did not, so a recruiter with the posting as a PDF had to copy-paste it. The recruiter route now shares one create path between paste and file, so the duplicate check cannot be forgotten in a second copy. | `routes/recruiter.js` (`POST /jds/upload`), `pages/RecruiterJobs.jsx` |
| D35 | **Searchable college picker, and a role create-or-select combobox** | Every college was a pill in a scroll box — unusable past a handful of campuses, with no way to confirm a pick. Search is server-side with a debounce. The role field was free text, so the same role got typed five ways; it now filters known roles *and* offers "Create …" for a new one. | `components/recruiter/CollegePicker.jsx`, `components/recruiter/RoleCombobox.jsx`, `routes/colleges.js` (`?q=`) |
| D36 | **Recruiters had no meetings workspace** | The page showed every role the same empty state with no action, so a recruiter could not start a meeting at all. They now get a propose flow built from their **passed** pool, grouped by role — the same gate as the candidate feed. | `pages/Meetings.jsx`, `routes/recruiter.js` (`GET /meeting-options`) |
| D37 | **Interview and roadmap can be built from a chosen resume version** | Both used whatever version happened to be current, so a student preparing against an older resume got questions and gaps for a different one. Both now accept a `versionId`, verified against the caller's own resumes. | `routes/interviews.js`, `routes/roadmap.js`, `components/student/ResumeVersionPicker.jsx` |
| D38 | **Readiness leads; ATS is a contributor** | The product's own scoring model makes resume quality 20% of readiness, but the dashboard led with an ATS gauge and the empty state said "let's roast your resume". Readiness is now the headline with ATS demoted beneath it and its 20% weight stated. | `pages/Dashboard.jsx` |
| D39 | **`Placements` was a `soon` stub** | The sidebar advertised a workspace that was disabled. It is now a real pipeline page: every role open to the college, its honest funnel (passed → pending → shortlisted → rejected), and the students behind each number. | `pages/PlacementPlacements.jsx` |
| D40 | **The role combobox called a college-scoped endpoint** | `PostJdModal` used `useRoleIndex()`, which hits `/api/roles/cell/roles` — placement-cell only. A recruiter got a 403 on every page load. Recruiters now have their own suggestions drawn from their own postings. | `routes/recruiter.js` (`GET /role-suggestions`) |
| D41 | **The cell's role picker read the wrong list, and had no search** | "Post a role" used `useJobDescriptions()` — the student-side `/api/jd`, which returns the caller's own JDs. A cell owns none, so the picker never appeared. It now lists the jobs recruiters posted to the college, with a real search box (all rows shown until you type, then narrowed across title, company and required skills), and a manual mode for an opening nobody has posted. A no-match search offers to post that term manually. | `pages/PlacementRoles.jsx`, `routes/placementCell.js` (`GET /pipeline`) |

---

Everything here is grounded in two things:

1. **What exists today** (per `README.md`): Express 5 + Mongoose + Gemini backend with
   multi-model fallback and Zod validation; React 19 + Vite SPA with TanStack Query, Framer
   Motion, Recharts, and a sage/green token-based design system.
2. **What the scope demands** (per `scope.md` §5–§13): shared college-aware auth, JD parsing,
   semantic skill match, composite Readiness Score, roadmap, three stakeholder dashboards,
   gatekeeping, notifications, meetings, text-only mock interviews with integrity monitoring,
   and the Full System Loop — all on a ₹0 free-tier budget.

---

## 0. Ground Rules (apply to every phase)

### 0.1 Design system — non-negotiable continuity

Every new page, component, and flow must reuse the existing design language of the Resume
module. This is not "make it look similar"; it is **reuse the same tokens, components, and
motion patterns**:

| Asset                              | Reuse rule                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Color tokens** (`src/index.css`) | `--bg #f4f4f0`, `--surface`, `--surface-2`, `--ink #0f1115`, `--ink-muted`, `--accent #5b7c6a`, `--accent-strong #2f4a3a`, `--accent-soft #e6efe8`, `--success/--warning/--danger`. Dark theme via `[data-theme="dark"]` already defined — every new component must look correct in **both** themes because it must only ever reference `var(--*)`, never hex values.                                             |
| **Typography**                     | `--font-sans` (Inter) for UI, `--font-display` (Geist, `-0.02em` tracking) for headings, `--font-serif` (Cormorant Garamond) for editorial accents on landing/statements. `.tabular` for all numerals (scores, counts).                                                                                                                                                                                           |
| **Shape**                          | `--radius-card: 20px` for panels, `--radius-pill: 999px` for buttons/chips. Card elevation via existing `.shadow-card` / `.shadow-hover` classes.                                                                                                                                                                                                                                                                 |
| **Components**                     | Build new screens **only** from the existing kit — `Card`, `Button` (CVA variants: `primary`, `accent`, `outline`, `ghost`, `soft`; sizes `sm/md/lg/icon`), `Badge`, `Checkbox`, `Tabs`, `Skeleton`, `EmptyState`, toasts, `Input`, `IconButton`, `Avatar`. New variants (e.g. a `danger` button for destructive placement-cell actions) are **added to the same CVA files**, never forked.                       |
| **Motion**                         | Page transitions: the `AppShell` `AnimatePresence` pattern (`opacity 0→1, y 8→0, exit y→−4, 0.25s, cubic-bezier(0.16,1,0.3,1)`). List items: staggered fade-up. Numbers: animated count-up on KPI tiles. Gauge/ring progress: animated arc (existing `AtsGauge` pattern). Hover: `shadow-card → shadow-hover` + `active:scale-[0.98]` on buttons. `tw-animate-css` for micro-animations. No new motion libraries. |
| **Layout**                         | Collapsible icon sidebar (the `group-hover/sidebar` width-expansion pattern) — new modules add `NavItem`s to the **same** `NAV` array, grouped by role once multi-role auth lands. `Topbar` + `CommandPalette` (Ctrl/Cmd+K) stay global; palette entries for new pages are appended to its existing registry.                                                                                                     |
| **Charts**                         | Recharts only, themed with `var(--accent)`/`var(--ink-muted)`, same axis/grid styling as the existing `ScoreEvolutionChart`.                                                                                                                                                                                                                                                                                      |
| **Empty/loading**                  | Every async surface gets `Skeleton` while loading and `EmptyState` when empty — same as Resumes/Dashboard today.                                                                                                                                                                                                                                                                                                  |

### 0.2 Engineering conventions (carry over from the module)

- **Backend pattern for every new AI feature**: same `@google/genai` call shape —
  `responseMimeType: "application/json"` + full `responseSchema`, then **Zod-validate before
  persisting**, strip ` ```json ` fences, sanitize runaway lists, and use the same
  multi-model fallback list (`GEMINI_MODEL → GEMINI_FALLBACK_MODELS`) with transient-error
  fast-advance. New AI pipelines are new prompt+schema modules beside `geminiService.js` and
  `structuredParser.js` — never copy-modified duplicates of the whole fallback machinery
  (extract the fallback loop into one shared helper in Phase 1).
- **Route pattern**: `routes/<module>.js` + `services/<module>Service.js` +
  `middleware/validate.js` Zod schemas. Errors only via `ApiError` factories; response
  envelope `{ error: { message, details } }` unchanged. Ownership/college scoping at the
  **query layer** (§0.4), never only in the UI.
- **Frontend pattern**: `api/<module>.js` (thin `apiClient` wrappers) →
  `hooks/use<Module>.js` (TanStack Query + invalidation + toasts) → `pages/<Module>.jsx` +
  `components/<module>/*`. Axios interceptor error normalization unchanged.
- **Rate limits**: every new AI-backed route gets its own limiter; bulk/staff routes get a
  queue-backed one (§11.5 of scope).
- **Free-tier discipline**: no paid service anywhere. Email = free transactional tier;
  scheduling = `.ics` files, no calendar API; integrity monitoring = browser APIs only;
  storage = extract text in memory, never persist PDFs (JDs likewise).

### 0.3 Verification after every phase

Each phase ends with: backend boots clean (`cd backend && npm run dev`), frontend boots clean
(`cd frontend && npm run dev`), the phase's golden path clicked through in the browser in
**light and dark themes**, and existing Resume-module flows still working (no regression).
A phase is "done" when its acceptance checklist in this document passes.

### 0.4 The one security invariant

> A placement cell can never retrieve another college's students — not through the UI, not
> through a manually crafted API request. Every placement-cell query is filtered by
> `req.user.collegeId` **in the database query itself**, via one shared helper
> (`scopeQueryToCollege(user, baseFilter)`) that all placement-cell routes are required to use.
> One integration test proves a cross-college request returns empty/403 (Phase 2).

---

## 1. Current State (baseline)

| Area                                                                                                                                | Status       |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Auth (module-local: register/login/logout/me/profile/password, bcrypt-12, httpOnly JWT cookie)                                      | ✅ Built     |
| Resume upload → pdf-parse → Gemini structured parse → Resume + V1                                                                   | ✅ Built     |
| ATS analysis (score, 4-way breakdown, 5 issues, 5 strengths, 0–8 rewrites, keywords, summary)                                       | ✅ Built     |
| Apply rewrites → immutable V2+ → auto re-analyze                                                                                    | ✅ Built     |
| Diff (word/line) + stats                                                                                                            | ✅ Built     |
| Student dashboard (KPIs, sparklines, version stack, activity feed)                                                                  | ✅ Built     |
| Insights / Versions / History pages                                                                                                 | ✅ Built     |
| Client-side PDF export from `parsedSections`                                                                                        | ✅ Built     |
| Multi-model Gemini fallback, Zod AI validation, sanitization, token accounting                                                      | ✅ Built     |
| Rate limits (auth 30/15min IP; analyze 5/min/user)                                                                                  | ✅ Built     |
| Tests, seed script, email, multi-role, college tenancy, JD, readiness, roadmap, recruiter/placement-cell, interviews, notifications | ❌ Not built |

---

## 2. Target End-State Architecture

```
major jobsync/
├── backend/src/
│   ├── server.js                     # mounts all namespaced routers
│   ├── config/                       # env.js (extended), db.js
│   ├── shared/                       # NEW — the "shell" everything reuses
│   │   ├── auth/                     # User model, requireAuth, requireRole, jwt, cookies
│   │   ├── events.js                 # internal EventEmitter (Full System Loop)
│   │   ├── gemini.js                 # shared model-fallback runner + fence stripping
│   │   └── collegeScope.js           # scopeQueryToCollege() helper + guard middleware
│   ├── models/                       # User, College, Resume, ResumeVersion, Analysis,
│   │                                 # JobDescription, SkillAlias, ReadinessScore, RoadmapItem,
│   │                                 # PlacementStatus, RecruiterPass, Notification, Meeting,
│   │                                 # InterviewSession, Message
│   ├── routes/                       # health, auth (shared), resumes, dashboard, insights,
│   │                                 # version, history  (existing, kept)
│   │                                 # NEW: colleges, jd, readiness, roadmap, placementCell,
│   │                                 # recruiter, notifications, meetings, interviews
│   ├── services/                     # geminiService, structuredParser, pdfService, diffService
│   │                                 # NEW: jdParser, skillMatch, readinessScore, roadmapGen,
│   │                                 # interviewService, emailService, icsService, normalizeSkills
│   └── middleware/                   # auth, upload, rateLimit (extended), validate, errorHandler
└── frontend/client/src/
    ├── routes.jsx                    # role-aware route tree
    ├── context/                      # AuthContext (role+college aware), ThemeContext, UIContext
    ├── components/
    │   ├── ui/                       # existing kit (+ Select, Modal, ProgressRing, StatusPill, RoleGate)
    │   ├── layout/                   # AppShell/Sidebar/Topbar/CommandPalette (role-grouped nav)
    │   ├── resume/  analysis/  dashboard/  export/   # existing, unchanged
    │   ├── jd/        readiness/     roadmap/        # NEW modules
    │   ├── placement/ recruiter/     interview/      # NEW modules
    │   └── notifications/                            # NEW (bell + inbox)
    └── pages/
        # existing: Landing, Login, Register, Dashboard, Resumes, ResumeDetail, Export,
        #            Insights, Versions, History, Settings
        # NEW: Register (extended w/ college code + role + consent), JobDescriptions,
        #      JDMatch, Readiness, Roadmap, MockInterview, PlacementCohort, PlacementStudent,
        #      RecruiterJobs, RecruiterCandidates, CandidateDetail, Messages, Meetings
```

Route namespaces (single Express app, one Atlas connection — per scope §7):
`/api/auth`, `/api/resumes`, `/api/jd`, `/api/readiness`, `/api/roadmap`,
`/api/placement-cell`, `/api/recruiter`, `/api/notifications`, `/api/meetings`,
`/api/interviews`, `/api/dashboard`, `/api/insights`, `/api/versions`, `/api/history`,
`/api/health`.

---

## 3. Phase Plan (12 phases, executed in this exact order)

> Rhythm: **one phase = one focused build session = one reviewable, testable increment.**
> Fix any issue within its phase before starting the next; never let problems compound.

---

### PHASE 1 — Shared Backend Shell (reorganization, no behavior change) — ✅ COMPLETE (reviewed & passed)

**Goal:** Turn the module backend into the JobSync foundation so every later phase reuses one
auth, one Gemini runner, one error envelope. Zero user-visible change.

**Backend**

1. Create `src/shared/`:
   - `shared/auth/` — move `models/User.js`, `middleware/auth.js`, `utils/jwt.js` here;
     old paths re-export from the new location so nothing else changes yet.
   - `shared/gemini.js` — extract the **duplicated** fallback loop from `geminiService.js`
     and `structuredParser.js` into one `runGemini({ models, buildRequest, zodSchema, label })`
     returning `{ data, model }`. Both existing services refactor to call it; their prompts,
     schemas, and outputs stay byte-identical.
   - `shared/events.js` — a plain `EventEmitter` singleton (no broker) with named events:
     `resume.analyzed`, `resume.rewriteApplied`, `roadmap.itemCompleted`,
     `readiness.recomputeRequested`. Emit the first two at the tail of the existing analyze /
     rewrite handlers (no listeners yet — the wiring comes in Phase 11).
2. Namespace the existing routers under `/api/resumes`, `/api/dashboard`, `/api/insights`,
   `/api/versions`, `/api/history` (they already are `/api/*` — confirm + freeze the paths).
3. Delete nothing user-facing. `scripts/seed.js` stub created (real seed comes in Phase 2).

**Frontend:** none required (URLs unchanged).

**Acceptance**

- [ ] Health, register, login, upload, analyze, rewrite, diff, dashboard, export all work exactly as before.
- [ ] `grep` shows no duplicated fallback logic — one `shared/gemini.js` powers both pipelines.
- [ ] Both dev servers boot clean; light/dark themes unchanged.

---

### PHASE 2 — Colleges, Roles & College-Code Registration — 🟡 BUILT, PENDING REVIEW

**Goal:** Multi-college tenancy: `role` + `collegeId` on users, college codes, and the
scoping invariant.

**Data model**

```
College  { _id, name, code (unique, indexed, format e.g. "GNIOT-7F2K"), isActive, createdAt }
User     + role: "student" | "recruiter" | "placement_cell" | "admin"  (default "student")
         + collegeId: ObjectId → College   // required for student & placement_cell, null otherwise
         + consent: { shownToRecruiters: Boolean, at: Date }   // used in Phase 12
```

**Backend**

1. `routes/colleges.js`: admin-only `POST /api/colleges` (create college + auto-generate
   `nanoid`-based code), `POST /api/colleges/:id/rotate-code` (old registrations keep their
   `collegeId`), `GET /api/colleges/me` for placement cells.
2. Extend register: body `{ name, email, password, role, collegeCode? }`.
   - `student` / `placement_cell` → `collegeCode` required, resolves to an active College,
     stamps `collegeId` at signup permanently. Registration rate limit per IP tightened
     (codes must not be brute-forceable).
   - `recruiter` → no code; `collegeId` stays null.
   - Existing accounts default to `role: "student"`, `collegeId: null` → they keep working
     (resume module is single-user-scoped and unaffected).
3. `shared/collegeScope.js`:
   - `scopeQueryToCollege(user, baseFilter)` → merges `{ collegeId: user.collegeId }`.
   - `requireCollegeScope` middleware → rejects placement_cell requests with no `collegeId`.
4. `requireRole(...roles)` middleware beside `requireAuth`.
5. `scripts/seed.js` — seeds one test college + one placement-cell + one recruiter +
   one student with a known code.

**Frontend**

1. `Register.jsx` gains a segmented role picker (same pill/segmented styling as existing
   `Tabs`), a **College Code** input for students/placement cells (with inline validation
   state), and — for recruiters — no code field. Error toasts on invalid code.
2. `Sidebar` becomes role-aware: nav items grouped under small serif section labels
   ("Resume", "Career", "Placement", "Recruiter"); each group renders only if
   `useAuth().user.role` permits. Groups animate in with the existing stagger pattern.
3. New `RoleGate` UI component (`components/ui/RoleGate.jsx`) for inline role-conditional
   rendering.
4. `Settings.jsx` shows role + college name (read-only) alongside existing profile/password
   cards.

**Acceptance**

- [ ] Student can register with a college code; recruiter without one; placement cell with one.
- [ ] **Invariant test:** a placement_cell token for college A requesting a college-B-scoped
      collection returns empty/403 even with a hand-crafted request.
- [ ] Existing resume flows still work for a legacy account.

---

### PHASE 3 — JD Upload & AI Parsing — 🟡 BUILT, PENDING REVIEW

**Goal:** Recruiters (and students, for exploration) paste/upload a job description; Gemini
parses it into structured required skills.

**Data model**

```
JobDescription {
  _id, ownerUserId → User (indexed),
  collegeId (null for student-uploaded exploratory JDs; stamped for recruiter JDs),
  title, company, location, experienceLevel: "internship|entry|mid|senior|lead",
  rawText,
  parsed: {
    requiredSkills: [{ name, importance: "must|nice" }],
    responsibilities: [String],
    keywords: [String]
  },
  status: "draft|active|closed",
  contentHash,                 // for AI caching (Phase 12 hardening reuses it)
  createdAt, updatedAt
}
```

**Backend**

1. `services/jdParser.js` — same pattern as `structuredParser.js`: shared `runGemini`
   fallback, `temperature 0.2`, JSON schema + Zod validation, fence stripping, skill-name
   sanitization (trim, ≤ 60 chars, ≤ 40 skills, dedupe case-insensitively).
2. `services/normalizeSkills.js` + `models/SkillAlias.js` — a tiny canonical map
   (seeded with ~120 common variants: `reactjs/react.js/react` → `react`,
   `nodejs/node` → `node.js`, etc.). One `normalizeSkillName(s)` used everywhere a skill
   string enters the system (JD parse, resume parse post-processing, match engine) — this is
   scope §11.4 done early because the match engine depends on it.
3. `routes/jd.js`: `POST /api/jd` (paste text or reuse the resume multer pipeline for a
   `.txt/.pdf` JD file, ≤ 2 MB), `GET /api/jd` (own list), `GET /api/jd/:id`,
   `PATCH /api/jd/:id` (title/status), `DELETE /api/jd/:id`. Student-owned JDs are private
   to the student; recruiter JDs later feed the gatekeeping pool.
4. Post-process the existing resume parser output through `normalizeSkills` so resume
   `skills[]` and JD `requiredSkills[].name` live in the same namespace.

**Frontend**

1. `pages/JobDescriptions.jsx` + `components/jd/`:
   - **JDDropzone** — reuses the existing `UploadDropzone` component pattern (same drag
     styling, dashed `--border`, hover accent glow) accepting `.pdf/.txt`, plus a paste
     textarea mode.
   - JD cards showing title, company, experience-level `Badge`, skill chips
     (must-skills = `accent` badge, nice-skills = `outline` badge) — identical chip styling
     to `KeywordChips.jsx`.
   - Parsed-skills reveal: staggered fade-up chips after parse completes; `Skeleton` chips
     while loading.
2. Add "Job Descriptions" to the student sidebar group and (later) recruiter group.
3. Hook: `useJobDescriptions.js`.

**Acceptance**

- [ ] Paste a real JD → structured skills + responsibilities render.
- [ ] Invalid/empty JD → `ApiError.badRequest` surfaced through the normal toast.
- [ ] Skills are normalized (`ReactJS` on a resume matches `React` in a JD) — verified by
      parsing one resume + one JD and eyeballing the shared namespace.

---

### PHASE 4 — Semantic Skill Match & Composite Readiness Score — 🟡 BUILT, PENDING REVIEW

**Goal:** The analytical core: resume × JD → skill match % → composite Readiness Score.

**Data model**

```
ReadinessScore {
  _id, userId, resumeVersionId → ResumeVersion, jdId → JobDescription,
  skillMatch: { percent, matched: [String], missing: [{ name, importance }],
                extra: [String] },          // extra = resume skills JD doesn't need
  projectRelevance: { percent, rationale },
  experienceRelevance: { percent, rationale },
  atsSubscore,                       // pulled from the version's latest Analysis
  composite: Number,                 // 0–100, formula below
  breakdown: [{ label, weight, value, contribution }],   // drives a donut/stack chart
  model, promptTokens, responseTokens,
  createdAt                          // history kept; latest per (user, jd) surfaced
}
```

**Backend**

1. `services/skillMatch.js` — **one Gemini call** that receives
   `{ resumeSkills (normalized), jdRequiredSkills, resumeSummary, projects[], experience[] }`
   and returns semantic matches (synonym/related-technology aware, e.g. "Express" ↔
   "Node.js backend frameworks"), missing skills with importance, and extras. Zod-validated;
   fallback chain reused. Deterministic fallback if AI is down: exact+alias matching with a
   clear `degraded: true` flag on the result.
2. `services/readinessScore.js` — pure function, no AI:
   `composite = 0.45·skillMatch + 0.20·projectRelevance + 0.15·experienceRelevance + 0.20·ats`
   Weights live in one exported constant object so they're tunable in one place. Project and
   experience relevance are heuristic v1 (keyword overlap of project tech/description and
   experience bullets against JD required skills), refined later.
3. `routes/readiness.js`: `POST /api/readiness/compute { resumeId, versionId?, jdId }`
   (runs/refreshes one score), `GET /api/readiness?jdId=` (score history for that JD),
   `GET /api/readiness/latest` (for dashboard). Analyze limiter pattern reused
   (5/min/user); results cached by `(versionId, jdId, versionUpdatedAt)` so re-computing an
   unchanged pair doesn't spend AI quota (scope §9 caching, done here for free).
4. Fold a JD match percentage into the ATS analyze response when a `jdId` is passed
   (scope §11.2) — the analyze route accepts the optional `jdId` and attaches the latest
   ReadinessScore summary.

**Frontend**

1. `pages/Readiness.jsx` — the flagship page:
   - **ReadinessRing**: animated SVG arc (the `AtsGauge` pattern, larger) counting up to the
     composite score with the four weighted sub-rows beneath, each a labeled mini-bar that
     fills in sequence (stagger 100ms).
   - **Skill match panel**: two-column "Matched ✓ / Missing ✗" with `Badge`s — matched in
     `--accent-soft`, missing in `--danger`-tinted outline; extra skills collapsed under a
     "Also on your resume" expander.
   - JD selector across the top (existing `Tabs`-style pills of the user's JDs).
2. `Dashboard.jsx` gains a fifth KPI tile: **Readiness** (latest composite + delta +
   sparkline) — same tile component, same sparkline styling.
3. Hook: `useReadiness.js`; API: `api/readiness.js`.

**Acceptance**

- [ ] Compute against a resume + JD → ring, sub-bars, matched/missing chips render and animate.
- [ ] Same compute twice doesn't call Gemini twice (cache hit logged server-side).
- [ ] Composite is reproducible by hand from the four sub-scores and weights.

---

### PHASE 5 — Roadmap (Missing Skill → Resource → Milestone) — 🟡 BUILT, PENDING REVIEW

**Goal:** Turn missing skills into a trackable plan that feeds back into the loop.

**Data model**

```
RoadmapItem {
  _id, userId, jdId, skill (normalized), importance,
  title,               // e.g. "Learn Docker fundamentals"
  description, resource: { label, url },   // free resource only (docs, freeCodeCamp, YouTube)
  milestone,           // the concrete "done" statement
  status: "not_started|in_progress|done",
  order, createdAt, updatedAt
}
```

**Backend**

1. `services/roadmapGen.js` — one Gemini call per batch (all missing skills in a single
   request, not one call per skill — free-tier discipline): for each missing skill return
   `{ title, description, resourceLabel, resourceUrl, milestone }`. Zod-validate; **strip any
   URL whose host is not in an allow-list** of known-free domains (developer.mozilla.org,
   roadmaps.sh, freeCodeCamp, YouTube, official docs) — hallucinated links never render.
2. `routes/roadmap.js`: `POST /api/roadmap/generate { jdId }` (idempotent — regenerating
   replaces `not_started` items, never touches `in_progress/done`), `GET /api/roadmap?jdId=`,
   `PATCH /api/roadmap/:item/status`. Status change to `done` **emits
   `roadmap.itemCompleted`** (no direct pipeline call — the listener arrives in Phase 11).
3. Rate limit generation (2/min/user).

**Frontend**

1. `pages/Roadmap.jsx` — vertical timeline: accent connector line, each item a `Card` with a
   status `Checkbox`/pill triad (`not_started` muted → `in_progress` accent pulse dot →
   `done` checked, strike-through title with a satisfying 0.3s transition). Resource opens
   in a new tab (small external-link icon). Progress header: "3 of 7 milestones" with a thin
   accent progress bar animating on change.
2. Filter by status (pill tabs); empty state reuses `EmptyState` with a "Generate roadmap"
   `accent` button.
3. Hook `useRoadmap.js` with optimistic status updates (toast on failure + rollback).

**Acceptance**

- [ ] Generate from a scored JD → items appear animated, statuses cycle, progress bar updates.
- [ ] Regenerating preserves completed items.
- [ ] Only allow-listed resource URLs render as links.

---

### PHASE 6 — Placement-Cell Cohort Table & Status Tagging (Gatekeeping concept, end-to-end) — 🟡 BUILT, PENDING REVIEW

**Goal:** The placement cell sees only its own college's students with live readiness, and
can tag statuses with an audit trail.

**Data model**

```
PlacementStatus {
  _id, studentUserId → User, collegeId (indexed, denormalized for cheap scoping),
  status: "not_reviewed|referred|shortlisted|hired|needs_improvement|critical",
  trainingTags: [String],
  auditLog: [{ by: userId, from, to, at, note? }],   // append-only
  updatedAt
}
```

**Backend**

1. `routes/placementCell.js` — every route: `requireRole("placement_cell")` +
   `requireCollegeScope`, every query through `scopeQueryToCollege`:
   - `GET /api/placement-cell/cohort` — students of own college with:
     latest ReadinessScore composite, latest ATS score, resume last-updated, current status,
     missing-skill tags (top 3), training tags. Paginated (`?page&limit`, default 25).
   - `PATCH /api/placement-cell/students/:id/status { status, note? }` — appends to
     `auditLog`, never overwrites history. Ownership re-checked against `collegeId`.
   - `GET /api/placement-cell/students/:id` — full drill-down (Phase 8 builds its page).
   - `GET /api/placement-cell/analytics` — readiness distribution (buckets),
     common skill gaps (aggregated missing skills), training-needs counts, status counts.
     _(Basic version now; charts polished in Phase 8.)_
2. Bulk endpoints intentionally **deferred to Phase 8** with the smart filters — build the
   table working end-to-end first (scope Prompt 6).
3. Limiter: normal read limits; status writes 60/min/user.

**Frontend**

1. `pages/PlacementCohort.jsx` (role-gated): a dense but breathing table using existing
   tokens — sticky header, row hover `--surface-2`, score cells as mini `AtsGauge`-style
   rings, status as colored `Badge` pills
   (`not_reviewed` muted / `referred` accent-soft / `shortlisted` accent / `hired` success /
   `needs_improvement` warning / `critical` danger).
2. Status change: a small `Modal` (new `ui/Modal.jsx` built with the card tokens + a
   0.2s scale/fade `AnimatePresence` transition) with optional note; optimistic update,
   audit-toast on success.
3. Row click → `PlacementStudent` drill-down page (readiness ring, ATS history chart,
   missing skills, status timeline rendered from `auditLog`).
4. Sidebar "Placement" group appears for placement_cell users.

**Acceptance**

- [ ] Cohort table lists only own-college students (verified with two seeded colleges).
- [ ] Status change persists + audit timeline renders.
- [ ] All placement queries hit `scopeQueryToCollege` (code review + manual curl test).

---

### PHASE 7 — Recruiter Gatekeeping (the novel edge) — 🟡 BUILT, PENDING REVIEW

**Goal:** A recruiter sees candidates for a JD **only** if the placement cell explicitly
passed them — with a visible college tag.

**Data model**

```
RecruiterPass { _id, jdId → JobDescription, studentUserId, collegeId,
                passedBy: placementCellUserId, note?, createdAt }   // unique (jdId, studentUserId)
```

**Backend**

1. `PATCH /api/placement-cell/students/:id/pass { jdId, note? }` (also available on the bulk
   endpoint later) → upserts a `RecruiterPass`. Withdrawing = delete the pass (audit-logged
   on `PlacementStatus`).
2. `routes/recruiter.js` — `requireRole("recruiter")`:
   - `GET /api/recruiter/jds` (own), `POST /api/recruiter/jds` (create via the Phase-3 parser,
     auto `status: "active"`), `PATCH` close/reopen.
   - `GET /api/recruiter/jds/:id/candidates` — inner-join `RecruiterPass` on this JD →
     students, each enriched with: **collegeTag** (College.name), latest ReadinessScore for
     _this_ JD, matched/missing skills, ATS score, consent check (Phase 12 hardens; until
     then consent defaults true for seeded data). **Ranked by composite desc** server-side.
   - `PATCH /api/recruiter/candidates/:id/decision { decision: "shortlisted"|"rejected", jdId }`
     — writes to `PlacementStatus.status` _only in the recruiter-visibility sense_: rejected
     hides the candidate from this JD's feed; shortlisted highlights them. True status
     authority remains with the placement cell (audit both actions to the student's log).
3. **Invariant test:** a student with no `RecruiterPass` for JD X never appears in any
   recruiter response for JD X, regardless of score.

**Frontend**

1. `pages/RecruiterJobs.jsx` — JD cards (from the Phase-3 JD components) with candidate
   counts + average match score.
2. `pages/RecruiterCandidates.jsx` — ranked candidate list: rank number (display serif),
   readiness ring, matched/missing chip previews, **college tag badge** (always visible,
   `--ink-muted` outline), shortlist/reject icon buttons with instant state animation.
3. `pages/CandidateDetail.jsx` — full profile: parsed resume sections (read-only reuse of
   existing parsed-section renderers), readiness breakdown, contact details **only when
   shortlisted** (privacy-by-design, scope §12.4), "Message placement cell" and
   "Message student" buttons (wired to notifications in Phase 9 — disabled with a tooltip
   until then).

**Acceptance**

- [ ] Placement cell passes 2 of 4 students to a JD → recruiter sees exactly those 2, ranked.
- [ ] Every candidate card shows its college tag.
- [ ] Un-passed high-scoring student never leaks (test).

---

### PHASE 8 — Smart Filters, Bulk Actions & Placement Analytics — 🟡 BUILT, PENDING REVIEW

**Goal:** The placement cell becomes genuinely usable at cohort scale.

**Backend**

1. Extend `GET /cohort` with combinable query filters (all Zod-validated, all composed into
   the college-scoped query): readiness min/max, missing-skill tag, training tag, status,
   branch/batch (optional `branchTag` on User — schema-ready per scope §6.3), and
   "resume updated within N days".
2. `POST /api/placement-cell/bulk { studentIds[], action }` where `action ∈
{ setStatus, assignTrainingTag, passToJd }` — loops with per-student audit entries;
   wrapped in a small in-process queue (`p-queue`, concurrency 2) so bulk operations never
   spike shared resources; returns a per-student success/failure summary.
3. Polish `GET /analytics`: readiness distribution buckets, top-10 common missing skills,
   training-tag frequency, status pie data, week-over-week readiness delta.

**Frontend**

1. **Filter bar** above the cohort table: pill-styled multi-select dropdowns (new
   `ui/Select.jsx` + `ui/DateRangePill`), active filters as removable `Badge`s, result count
   animating on change. All client-cached via TanStack Query keys that include filters.
2. **Bulk mode**: checkbox column → floating action bar (bottom-center, slides up with the
   app's spring) showing "N selected · Assign tag · Pass to JD · Set status". Applies with a
   single request; per-row success/failure toasts; table rows animate confirmation.
3. `PlacementAnalytics` section (below the table or its own page): Recharts — distribution
   histogram (accent bars), missing-skills horizontal bar chart, status donut. Same chart
   theme as `ScoreEvolutionChart`.

**Acceptance**

- [ ] Filters compose (e.g. score ≥ 60 × missing "docker" × not_reviewed) and stay fast.
- [ ] Bulk pass-to-JD for 10 students → all appear in the recruiter feed with college tags.
- [ ] Analytics charts render in both themes.

---

### PHASE 9 — Notifications, Meetings (.ics), Messaging — 🟡 BUILT, PENDING REVIEW

**Goal:** The communication layer, all free-tier.

**Data models**

```
Notification { _id, toUserId? , toCollegeId? + toRole?,   // two addressing modes (scope §6.1)
               type: "status_change|training_assigned|meeting_invite|meeting_confirmed|
                     message|jd_decision|system",
               title, body, meta (resumeId/jdId/meetingId/…), read: Boolean, createdAt }
Meeting     { _id, createdBy, participantUserIds[], jdId?, collegeId,
              proposedSlots: [{ start, end }], confirmedSlot?, status: "proposed|confirmed|
              declined|cancelled", agenda, icsUid, createdAt }
Message     { _id, fromUserId, toUserId?, toCollegeId?+toRole?, jdId?, studentUserId?,
              body, readAt?, createdAt }   // stored as Notification subtype or own collection
```

**Backend**

1. `services/emailService.js` — `nodemailer` against a free provider (Brevo/Resend SMTP or
   Gmail SMTP). `EMAIL_PROVIDER`, `EMAIL_FROM`, SMTP creds in `.env`. **Daily-send cap**
   counter (in-memory + DB checkpoint), graceful `ApiError.tooMany` when hit; every email
   send also writes the in-app `Notification` regardless, so the product never breaks when
   email quota dies. Retry-once-then-queue on transient SMTP failure.
2. `routes/notifications.js`: `GET /api/notifications` (own inbox, paginated, unread count),
   `PATCH /:id/read`, `PATCH /read-all`. Placement-cell inbox additionally resolves
   `toCollegeId + role:"placement_cell"` messages (recruiter→cell channel).
3. `routes/meetings.js`: propose 2–3 slots → student confirms one → `icsService` (the `ics`
   npm package) generates the invite **attached to the confirmation email** — no calendar
   API, no OAuth. Cancel/decline flows included.
4. Messaging: `POST /api/messages` (recruiter→student, recruiter→placement cell,
   placement cell→student) — routed through the notification pipeline, addressed by
   `toUserId` or `toCollegeId+role` exactly as scope §6.1 specifies.
5. Rate limits: bulk-notify endpoint exists but is capped hard (5 sends/day/cell) — full
   enforcement final pass in Phase 12.

**Frontend**

1. **Notification bell** in `Topbar`: unread count badge, dropdown listing notifications
   (staggered fade-in, accent dot on unread), "mark all read". Real-time-ish via a 30s
   TanStack Query refetch (no websockets — free tier).
2. `pages/Messages.jsx` — conversation-style list (sender avatar via existing `Avatar`,
   message `Card`s, input row with `accent` send button).
3. Meeting UI on `CandidateDetail` (recruiter) and student's `Readiness`/Dashboard side:
   slot picker as selectable pill cards; confirmation screen with a "Add to calendar"
   `.ics` download link.

**Acceptance**

- [ ] Status change → student's bell badge increments; email arrives (when provider configured).
- [ ] Meeting propose → confirm → `.ics` downloads and email attachment present.
- [ ] Recruiter→placement-cell message lands in the cell's inbox.

---

### PHASE 10 — AI Mock Interview (text-only) + Integrity Monitor — 🟡 BUILT, PENDING REVIEW

**Goal:** Role-specific written interview with AI feedback, with flag-don't-fail integrity
signals built in the same phase (scope Prompt 10).

**Data model**

```
InterviewSession {
  _id, userId, jdId?, targetRole, status: "active|completed|abandoned",
  questions: [{ id, text, askedAt }],           // shuffled subset of a generated pool (8 → ask 5)
  answers: [{ questionId, text, timeToFirstKeystrokeMs, totalMs, pasteEvents: [{ at, chars }],
              feedback: { score 0–10, strengths[], improvements[], modelAnswer } }],
  integrityFlags: [{ type: "tab_blur|fullscreen_exit|large_paste|fast_long_answer|
                            duplicate_session|similar_to_peer",
                     at, detail }],            // informational only — never affects score
  sessionToken, invalidatedByNewerSession: Boolean,
  startedAt, completedAt, overallSummary?, model, tokens
}
```

**Backend**

1. `services/interviewService.js` — generate a pool of 8 role-specific questions (from the
   JD's parsed skills + responsibilities when present, else the target role string), shuffle,
   ask 5. After submission, one Gemini call scores all answers (per-answer score/strengths/
   improvements/model answer) + one overall summary. Same fallback + Zod machinery.
   Answer-similarity check: the same call flags near-duplicate phrasing across a college's
   recent sessions for the same question (`similar_to_peer` flag, detail only).
2. `routes/interviews.js`: `POST /api/interviews/start { jdId?|targetRole }` — **invalidates
   any other active session** for the user (single-session lock), returns questions +
   `sessionToken`. `POST /api/interviews/:id/answer { questionId, text, telemetry }` —
   server re-validates telemetry sanity (e.g. `timeToFirstKeystroke` < 1500ms for a 400+
   char answer ⇒ `fast_long_answer` flag) so client flags can't be silently suppressed.
   `POST /api/interviews/:id/complete` → feedback. `GET /api/interviews/:id` (own), and a
   placement-cell read route for transcripts + flags (college-scoped).
3. Limiter: 2 active interviews/hour/user.

**Frontend — `pages/MockInterview.jsx` + `components/interview/`**

1. Pre-flight screen: role/JD picker, **mandatory academic-integrity acknowledgment**
   checkbox, and a visible notice that "tab switches and paste events are logged" —
   transparency as a deterrent (scope §8.2).
2. Interview screen enters **Fullscreen API**; per-question card with a soft countdown ring
   (accent arc depleting), the existing focus-ring input styling scaled up as a textarea,
   auto-save drafts locally.
3. Integrity listeners (all passive, all logged, **never blocking**):
   - `visibilitychange` / window `blur` → count + timestamps → flag payload.
   - `fullscreenchange` exit → flag.
   - `paste` event → if > 120 chars inserted, log `{ at, chars }` (server cross-checks time).
4. Results screen: per-answer cards (score ring, strengths/improvements in the issue/strength
   card style already used by the ATS analysis — visual sibling by design), overall summary,
   "Return to roadmap" CTA linking relevant roadmap items to weak answers.
5. Placement-cell view: transcript + a quiet `Badge` list of integrity flags under a
   "Review" header that explicitly states _"Flags are informational — you decide."_

**Acceptance**

- [ ] Full loop: start → 5 answers → feedback with per-answer scores.
- [ ] Alt-Tab twice and paste a paragraph → 3 flags appear for the placement cell, score unaffected.
- [ ] Starting a second session on another device invalidates the first.

---

### PHASE 11 — Full System Loop — 🟡 BUILT, PENDING REVIEW

**Goal:** One connected pipeline — any update re-triggers parsing/scoring and refreshes every
dashboard (scope gap L2).

**Backend**

1. Wire the Phase-1 emitter listeners:
   - `resume.analyzed` / `resume.rewriteApplied` → if the user has an active JD
     (latest JD they scored against), **re-run the ReadinessScore computation** for that
     (latestVersion, jdId) pair and refresh aggregates.
   - `roadmap.itemCompleted` → same recompute (skill acquisition can change match) + write a
     `Notification` ("Milestone complete — readiness updated").
   - All listeners are **fire-and-forget with error logging** — a loop failure must never
     fail the user's original request.
2. Idempotency: recompute skips if `(versionId, jdId, contentHash)` unchanged (cache from
   Phase 4). Concurrency guard: one in-flight recompute per user (in-memory lock map).
3. A `GET /api/dashboard` extension surfaces loop freshness: "Readiness updated 2m ago ·
   auto-refreshed after your rewrite".

**Frontend**

1. Dashboard: readiness tile shows an "auto-updated" pulse dot when the loop refreshed it
   since the user's last visit.
2. After "Apply rewrites", the success toast copy becomes:
   _"New version created — score, match and roadmap are updating."_ — and the Readiness page
   refetches via query invalidation keyed off the rewrite mutation's `onSuccess`.

**Acceptance**

- [ ] Upload → analyze → (auto) readiness appears without manual recompute.
- [ ] Apply rewrites → within seconds the readiness tile delta updates itself.
- [ ] Complete a roadmap item → readiness shifts if the skill moved from missing→matched.

---

### PHASE 12 — Hardening & Free-Tier Finishing Pass — 🟡 BUILT, PENDING REVIEW

**Goal:** Scope §12's threat model, plus the polish that makes it demo-ready.

**Backend**

1. **Email verification** (free): signed token → verification link via the existing email
   service; unverified accounts can log in but hit a soft-gate (readiness/placement features
   disabled) rather than a hard lock.
2. **Consent capture**: signup checkbox "I consent to my profile being shown to recruiters";
   stored with timestamp; **withdraw consent in Settings → immediately removed from every
   recruiter query** (`RecruiterPass` joins filter on `consent.shownToRecruiters !== false`),
   independent of placement status.
3. **Duplicate-resume detection**: content hash on upload; same hash under a different
   account in the same college ⇒ allow but flag for placement-cell review (non-punitive).
4. **JD moderation**: sanity checks on JD upload (min length, no obvious spam) before it can
   be passed to students.
5. Bulk-notify daily cap enforced at the route (5/day/cell) + analyze cache from content hash.
6. Analysis **caching by content hash** completed platform-wide (resume analyze + JD parse +
   skill match) — re-running identical input costs zero AI quota.
7. Logging: structured `morgan` → JSON in production; per-AI-call latency + model + token
   cost logged; a `/api/health` extension reporting DB + Gemini reachability + email-queue depth.

**Frontend**

1. Verification / consent banners styled as the existing `accent-soft` notice cards.
2. Settings: consent toggle with a confirmation `Modal`; "Resend verification email".
3. Final design sweep: every new page re-checked against §0.1 — tokens only, both themes,
   skeletons + empty states present, motion timings consistent (`0.25s` pages, `0.2s` micro,
   `cubic-bezier(0.16,1,0.3,1)` everywhere), Ctrl+K palette includes all new destinations.

**Acceptance**

- [ ] Withdrawn-consent student vanishes from recruiter feeds instantly (test).
- [ ] Re-analyzing an unchanged resume is a cache hit (no Gemini call logged).
- [ ] Full golden path green: student registers with a college code → uploads resume →
      analyzes → applies rewrites → picks a JD → readiness + roadmap → mock interview →
      placement cell reviews, filters, passes → recruiter sees ranked, college-tagged candidates →
      shortlists → meeting proposed → confirmed → `.ics` + notifications everywhere.

---

## 4. Execution Order at a Glance

```
P1 Shell ─► P2 Colleges/Roles ─► P3 JD Parse ─► P4 Skill Match + Readiness ─► P5 Roadmap
                                                                    │
        P12 Hardening ◄─ P11 System Loop ◄─ P10 Interviews ◄─ P9 Notify/Meetings ◄─┘
                                                        ▲                      │
                              P8 Filters/Bulk ◄─ P7 Gatekeeping ◄─ P6 Cohort ─┘
```

Front-loading P6–P7 (the college-scoped gatekeeping pipeline) is deliberate — it is the
novel contribution named in scope §13; everything after it is additive.

## 4b. Live API surface (built so far)

| Namespace | Routes |
| --- | --- |
| `/api/auth` | register (role + college code, or college name for a cell), login, logout, me, profile, **email**, password |
| `/api/colleges` | `validate/:code` (public), `directory` (recruiters), `join` (student self-link), `me`, admin create / rotate-code |
| `/api/placement-cell` | `students` (cohort, filters, pagination), `students/:id` (drill-down), `students/:id/status`, `students/:id/training-tags`, **`students/:id/pass`**, `analytics` |
| `/api/resumes` | upload, list, get, version, analyze, rewrite, diff, delete *(unchanged from Phase 1)* |
| `/api/jd` | create (paste), upload, list, get, patch, re-parse, delete — all student-private |
| `/api/readiness` | `compute` (cached), `latest`, history |
| `/api/roadmap` | `generate` (2/min), list, `:itemId/status`, delete |
| `/api/recruiter` | `jds` (create to a college, list, patch), **`jds/:id/candidates`** (the gated feed), `candidates/:id/decision` |

## 5. New Dependencies (all free/open-source)

| Package                              | Phase | For                                                  |
| ------------------------------------ | ----- | ---------------------------------------------------- |
| `nanoid`                             | 2     | College codes                                        |
| `p-queue`                            | 8     | In-process bulk queue                                |
| `nodemailer`                         | 9     | Email via free SMTP tier                             |
| `ics`                                | 9     | Calendar file generation                             |
| _(no new frontend libraries — ever)_ | —     | Everything reuses Framer Motion / Recharts / the kit |

> **No new frontend dependency has been added in any phase.** The roadmap timeline,
> the cohort table, the modal system, the skill-match panel and every chart reuse the
> existing kit plus Framer Motion.

## 6. New Environment Variables (backend/.env)

```env
# Phase 9
EMAIL_PROVIDER=brevo            # brevo | resend | gmail-smtp
EMAIL_API_KEY=...
EMAIL_FROM="JobSync <no-reply@jobsync.app>"
EMAIL_DAILY_CAP=300

# Phase 12 (optional but recommended)
TURNSTILE_SECRET_KEY=...        # only if bot protection is added to registration
```

Everything else (`MONGO_URI`, `JWT_SECRET`, `GEMINI_*`, `CLIENT_ORIGIN`, `PORT`) is unchanged
from the current module.

---

_This plan keeps the Resume Intelligence module untouched at its core and grows JobSync
around it — one shared shell, one design language, one AI pipeline pattern, one college
scoping rule — until all seven literature gaps from `scope.md` §4 are closed in code._
