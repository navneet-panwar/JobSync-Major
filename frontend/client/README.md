# JobSync — Web Client (React 19 + Vite)

The single-page app for all four roles (student, placement cell, recruiter, admin). Everything is
driven by the Express API in [`../../backend`](../../backend/README.md); this app holds **no business
logic that matters for security** — the server is the source of truth for ownership, gating and
scoring.

- Dev server: **http://localhost:5173**
- Build target: `dist/` (static files — host on any static host)
- Styling: **Tailwind CSS 4** with a small set of sage/green CSS tokens (`src/index.css`)
- State: **TanStack Query** for all server state, React context only for session / theme / toasts

---

## Contents

1. [Running it](#1-running-it)
2. [Configuration](#2-configuration)
3. [Project structure](#3-project-structure)
4. [Routes & role-based navigation](#4-routes--role-based-navigation)
5. [Data flow](#5-data-flow)
6. [API modules](#6-api-modules)
7. [Feature map](#7-feature-map)
8. [Design system](#8-design-system)
9. [PDF export](#9-pdf-export)
10. [Conventions](#10-conventions)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Running it

```powershell
cd frontend/client
npm install
npm run dev        # http://localhost:5173
```

Requires the backend running on `http://localhost:5000` (see `backend/README.md`). This client also
works via the wrapper: `cd frontend && npm run dev`.

| Script            | Does                                                                             |
| ----------------- | -------------------------------------------------------------------------------- |
| `npm run dev`     | Vite dev server with HMR on port 5173, proxying `/api` → `http://localhost:5000` |
| `npm run build`   | Production bundle into `dist/`                                                   |
| `npm run preview` | Serves the built bundle locally                                                  |
| `npm run lint`    | ESLint (flat config, `eslint.config.js`)                                         |

## 2. Configuration

`vite.config.js` contains the only two things you may need to change:

```js
server: {
  port: 5173,
  proxy: { "/api": { target: "http://localhost:5000", changeOrigin: true } },
},
resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
```

- Change `target` if your API runs on a different host/port.
- `@/…` always resolves to `src/…`.
- There is **no required `.env`** for this client — the axios client uses a relative `baseURL`.
  `VITE_API_URL` exists in a local `.env` but is not read by the code; use the proxy instead, which
  keeps cookies same-origin.
- For a deployed build pointing at a remote API, either keep `/api` on the same origin (reverse
  proxy) or change `baseURL` in `src/api/client.js` and add the SPA origin to the backend's
  `CLIENT_ORIGIN`.

## 3. Project structure

```
client/
├── index.html
├── vite.config.js            port 5173, /api proxy, "@" alias
├── eslint.config.js
└── src/
    ├── main.jsx              React root + providers
    ├── App.jsx               RouterProvider
    ├── routes.jsx            Route table + RoleHome + ProtectedShell
    ├── index.css             Tailwind 4 theme tokens (light + dark), fonts, utilities
    ├── api/                  One module per API prefix (thin axios wrappers)
    │   ├── client.js         axios instance + normalised error interceptor
    │   ├── auth.js resumes.js versions.js jd.js readiness.js roadmap.js
    │   ├── dashboard.js analytics.js roles.js colleges.js
    │   ├── notifications.js interviews.js recruiter.js placementCell.js
    ├── context/
    │   ├── AuthContext.jsx   session bootstrap via GET /api/auth/me
    │   ├── UIContext.jsx     toast queue + lightbox/modal UI state
    │   └── ThemeContext.jsx  light/dark via [data-theme] on <html>
    ├── hooks/                useResumes, useDashboard, useAnalytics,
    │                         useJobDescriptions, useReadiness, useRoadmap,
    │                         useRoles, useNotifications (+ mutations)
    ├── components/
    │   ├── layout/           AppShell, Sidebar (role-scoped nav), Topbar,
    │   │                     CommandPalette, NotificationsPopover, PageHeader, AILogo
    │   ├── ui/               Card, Button, Badge, Checkbox, Input, Modal,
    │   │                     Tabs, Skeleton, EmptyState, Avatar, IconButton, RoleGate
    │   ├── landing/          Hero, Features, HowItWorks, Testimonials, CTA, Footer, Navbar
    │   ├── auth/             AuthShell, BrandCardMarquee
    │   ├── dashboard/        StatCard, AtsGauge, VersionStack, ScoreEvolutionChart,
    │   │                     ActivityFeed, ProfileCard, KeepSharpCard
    │   ├── analysis/         ScoreBreakdown, IssuesList, StrengthsList,
    │   │                     BulletRewrites, KeywordChips
    │   ├── resume/           UploadDropzone, ResumeRow, VersionSwitcher, DiffView
    │   ├── export/           ResumeDocument (react-pdf)
    │   ├── jd/               JdComposer, JdCard, SkillChips
    │   ├── readiness/        ReadinessRing, SkillMatchPanel
    │   ├── placement/        CohortAnalytics, StudentTagChips, placementStatus
    │   ├── recruiter/        CollegePicker, RoleCombobox
    │   ├── interview/        InterviewResults
    │   └── student/          ResumeVersionPicker
    ├── pages/                One component per route (see below)
    ├── lib/utils.js          cn(), formatting helpers
    ├── lib/mock.js, mock/    legacy fixtures — NOT imported by live code (safe to delete)
    └── public/               favicon.svg, icons.svg
```

## 4. Routes & role-based navigation

`src/routes.jsx` — public routes are mounted at the top level; everything else sits inside
`ProtectedShell`, which redirects to `/login` when there is no session.

| Path                                              | Page                                                                     | Visible to             |
| ------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------- |
| `/`                                               | `Landing`                                                                | public                 |
| `/login`, `/register`                             | `Login`, `Register`                                                      | public                 |
| `/dashboard`                                      | `RoleHome` → student `Dashboard` · `PlacementCellHome` · `RecruiterHome` | all (by role)          |
| `/resumes`, `/resumes/:id`, `/resumes/:id/export` | resume library, detail (analysis / rewrites / diff tabs), export         | student                |
| `/jobs`                                           | `JobDescriptions` — paste/upload a JD, score against it                  | student                |
| `/roles`                                          | `StudentRoles` — roles posted to the college, opt in                     | student                |
| `/readiness`                                      | `Readiness` — composite score, breakdown, skill gaps                     | student                |
| `/roadmap`                                        | `Roadmap` — milestones per missing skill                                 | student                |
| `/interview`                                      | `MockInterview`                                                          | student                |
| `/insights`, `/versions`, `/history`              | cross-resume analytics, all versions, timeline                           | student                |
| `/meetings`                                       | `Meetings` — slots, confirm, `.ics`                                      | student + recruiter    |
| `/placement/students`, `/placement/students/:id`  | cohort + student detail                                                  | placement_cell / admin |
| `/placement/roles`, `/placement/roles/:roleKey`   | role index, postings, opt-ins                                            | placement_cell / admin |
| `/placement/placements`                           | pipeline funnel per open role                                            | placement_cell / admin |
| `/placement/training`                             | tag vocabulary, cohorts, untagged students                               | placement_cell / admin |
| `/recruiter/jobs`                                 | JD list / create (paste or PDF)                                          | recruiter              |
| `/candidates`                                     | passed-only ranked candidates                                            | recruiter              |
| `/settings`                                       | profile, email, password, college join                                   | all                    |
| `*`                                               | redirect `/`                                                             | —                      |

**Navigation is role-scoped** (`components/layout/Sidebar.jsx`, `NAV_BY_ROLE`). A placement cell
never sees a "Resumes" link that would open a student page; a recruiter never sees "Insights". This
is presentation only — every route is re-checked server-side.

> `ProtectedShell` is the _authentication_ gate. Role checks that matter for data are done in the
> API (`requireRole`), so hiding a link is never the only protection.

## 5. Data flow

```
Page/Component
   └─ hook (useResumes, useReadiness, …)
        └─ api module (api/resumes.js, …)  → apiClient (axios, /api, withCredentials)
             └─ Express API
   TanStack Query cache  ──invalidate──►  refetch on mutation success
        └─ optimistic UI only where cheap (checkbox selection, read toggles)
```

- **Query keys** are local to each hook (`["resumes"]`, `["readiness", jdId]`, …). A mutation
  invalidates the keys it can affect — e.g. applying rewrites invalidates the resume, its versions
  and readiness.
- **Errors** are normalised once, in `api/client.js`: every rejection is
  `{ status, message, details }`, so components always show a real server message ("PDF exceeds 5MB
  limit") instead of "Request failed with status code 400".
- **Toasts** come from `UIContext` and are fired per mutation; `toast.success(message, options)`
  guards its second argument so an options object is never rendered as a description.
- **Session** is rehydrated on load by `AuthContext` (`GET /api/auth/me`), so a refresh keeps you
  signed in. There is no token in JS — the cookie is httpOnly.

## 6. API modules

Each file in `src/api/` mirrors a backend prefix and contains nothing but typed-ish wrappers:

| Module                                | Backend prefix                                                     |
| ------------------------------------- | ------------------------------------------------------------------ |
| `auth.js`                             | `/api/auth`                                                        |
| `resumes.js`, `versions.js`           | `/api/resumes`, `/api/versions`                                    |
| `jd.js`, `readiness.js`, `roadmap.js` | `/api/jd`, `/api/readiness`, `/api/roadmap`                        |
| `roles.js`, `colleges.js`             | `/api/roles`, `/api/colleges`                                      |
| `placementCell.js`                    | `/api/placement-cell`                                              |
| `recruiter.js`                        | `/api/recruiter`                                                   |
| `notifications.js`, `interviews.js`   | `/api/notifications`, `/api/interviews`                            |
| `dashboard.js`, `analytics.js`        | `/api/dashboard`, `/api/insights`, `/api/history`, `/api/versions` |

When you add an endpoint: add the wrapper here, a hook next to it, then the UI. Do not call
`apiClient` directly from a component.

## 7. Feature map

| Feature                                                          | Where to look                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Upload → AI parse → V1                                           | `pages/Resumes.jsx`, `components/resume/UploadDropzone.jsx`            |
| ATS analysis tabs (score, issues, strengths, rewrites, keywords) | `pages/ResumeDetail.jsx`, `components/analysis/*`                      |
| Apply selected rewrites → new version                            | `components/analysis/BulletRewrites.jsx`                               |
| Version diff                                                     | `components/resume/DiffView.jsx`                                       |
| JD paste/upload + skill chips                                    | `pages/JobDescriptions.jsx`, `components/jd/*`                         |
| Readiness ring + breakdown                                       | `pages/Readiness.jsx`, `components/readiness/*`                        |
| Roadmap milestones                                               | `pages/Roadmap.jsx`                                                    |
| Mock interview + results                                         | `pages/MockInterview.jsx`, `components/interview/InterviewResults.jsx` |
| Placement cohort, filters, bulk, pass                            | `pages/PlacementStudents.jsx`, `components/placement/*`                |
| Role postings & opt-ins                                          | `pages/PlacementRoles.jsx`, `pages/StudentRoles.jsx`                   |
| Placement pipeline funnel                                        | `pages/PlacementPlacements.jsx`                                        |
| Training workspace                                               | `pages/PlacementTraining.jsx`                                          |
| Recruiter JD posting (paste + PDF)                               | `pages/RecruiterJobs.jsx`, `components/recruiter/*`                    |
| Recruiter candidate pool & decisions                             | `pages/RecruiterCandidates.jsx`                                        |
| Meetings & `.ics`                                                | `pages/Meetings.jsx`                                                   |
| Notifications                                                    | `components/layout/NotificationsPopover.jsx`                           |
| Command palette (⌘/Ctrl-K)                                       | `components/layout/CommandPalette.jsx`                                 |
| Settings (profile, email, password, college)                     | `pages/Settings.jsx`                                                   |

## 8. Design system

- **Tokens, not hex codes.** `src/index.css` defines `--bg`, `--surface`, `--surface-2`, `--border`,
  `--ink`, `--ink-muted`, `--accent`, `--accent-strong`, `--accent-soft`, `--success`, `--warning`,
  `--danger`, radii and shadows, then exposes them to Tailwind 4 via `@theme`. Both light and dark
  (`[data-theme="dark"]`) are defined; `ThemeContext` flips the attribute.
- **Typography:** `Inter` (sans), `Geist` (display), `Cormorant Garamond` (serif accents), loaded
  from Google Fonts in `index.css`.
- **Primitives** in `components/ui/`: `Button` (CVA variants incl. `accent` / `outline` / `ghost`),
  `Card`, `Badge`, `Checkbox`, `Input`, `Modal`, `Tabs`, `Skeleton`, `EmptyState`, `Avatar`,
  `IconButton`, `RoleGate`.
- **Use `cn()`** (`lib/utils.js` → `twMerge(clsx(...))`) for conditional class names — never string
  concatenation.
- **States are mandatory:** skeletons while loading, an explicit empty state, and a toast on every
  mutation. A page that can be empty must say why.

## 9. PDF export

`components/export/ResumeDocument.jsx` uses `@react-pdf/renderer` and builds from the version's
**`parsedSections`** (not raw text), so the output is cleanly typeset: A4, styled header with
clickable links, then Summary → Experience → Projects → Education → Skills → Certifications →
Languages/Interests. `wrap={false}` keeps bullets and entries from splitting across pages, and link
labels are shortened (`https://www.x.com/` → `x.com`).

Export is entirely client-side — no server round-trip and no DOCX pipeline.

## 10. Conventions

- **JavaScript, not TypeScript.** No `.d.ts`, no prop-types; keep components small and named.
- **Server state belongs to TanStack Query.** Don't mirror API data in `useState` or context.
- `useEffect` is for subscriptions and DOM side effects — not for fetching.
- Role-specific pages live under `pages/` and are registered in `routes.jsx`; add the nav entry in
  `Sidebar.jsx` under the right role (and mark `soon: true` only if the page genuinely doesn't
  exist yet).
- New shared UI goes in `components/ui/`, not inside a page.
- `npm run lint` before pushing. `src/lib/mock.js` and `src/mock/` are unused leftovers — do not
  import them.
- `qa-two.mjs` in this folder is an ad-hoc browser QA snippet, not part of the build.

## 11. Troubleshooting

| Symptom                               | Cause / fix                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Every request fails with a CORS error | Backend not running, or (in production) this origin missing from `CLIENT_ORIGIN`                                |
| Logged out on every refresh           | Backend unreachable, or cookies blocked — `withCredentials` and the `/api` proxy must both be in play           |
| 401 on everything after login         | Cookie name/domain changed on the backend, or you are hitting the API on a different port than the proxy target |
| PDF upload button returns 400         | Not a PDF, > 5 MB, or a scanned PDF with no extractable text (> 50 chars required)                              |
| Blank white screen after a toast      | A toast call passed an object where a string was expected — see the guard note in §5                            |
| Port 5173 busy                        | Vite picks 5174; the backend dev build accepts any `localhost:*` origin                                         |
