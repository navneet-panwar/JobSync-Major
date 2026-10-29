JobSync
AI-Powered Job Readiness & Career Gap Analyzer
Master Project Report — Scope, Multi-College Architecture, Integrity Safeguards & Literature
Grounding
Group 35 — Department of CSE, GNIOT Greater Noida
Praful Kr. Singh · Preet Verma · Navneet Panwar · Prince Barnwal
Supervisor: Ms. Akansha Sharma
Prepared for internal handover and as source material for the accompanying research paper.
Table of Contents
1. Why JobSync
2. Project Status at a Glance
3. The Problem: Literature Grounding
4. The Seven Consolidated Gaps and JobSync's Fix
5. Complete Feature List
6. Multi-College Tenancy: The College Code System
7. System Architecture
8. Interview Integrity & Anti-Cheat Safeguards
9. Free-Tier Engineering Approach
10. Tech Stack
11. Suggested Changes to the Built Resume Intelligence Module
12. Other Edge Cases & Features Worth Considering
13. Suggested Build Order
14. Step-by-Step Build Prompts for Your AI Coding Agent
15. Zero-Budget Deployment Guide
16. Feature Comparison Against Existing Systems
17. References
1. Why JobSync
Career prep today is guesswork — generic resume tips, one-off aptitude tests, and ATS keyword hacks that
don't tell a student where they actually stand. JobSync replaces that guesswork with a measurable,
continuous readiness score, a personalized roadmap, and data-driven dashboards for three stakeholders:
students, recruiters, and placement cells.
What makes JobSync different from a generic AI resume tool is a placement cell acting as a gatekeeper: a
student is only surfaced to a recruiter for a given role after the placement cell has reviewed and passed
them through. No system reviewed in the literature search (Section 3) combines semantic AI scoring,
institution-governed gatekeeping, and all three stakeholder views in one closed loop.
1.1 Current build status
One module is built and running today: the Resume Intelligence module (“AI Resume Roaster”) — upload, AI
parsing, ATS scoring, rewrite suggestions, versioning, diffing, and PDF export. Everything else in this report is
the designed parent system, JobSync, that this module will be folded into. Every feature below is tagged so a
reader always knows what is real today versus planned:
● [BUILT] exists in code today, in the Resume Intelligence module.
● [WIRING] exists in the module but needs a small change to plug into JobSync.
● [PLANNED] designed, not yet built.
● [ADAPTED] deliberately scoped down or differently so it survives on a free-tier budget — this is a
stated engineering decision, not a forgotten limitation.
2. Project Status at a Glance
Module Status Owns
Resume Intelligence Built Upload, AI parse, ATS score, rewrite,
versioning, diff, export, its own
dashboard/insights
Student Core Profile &
Auth
Planned One shared account used across every module
JD Parsing + Semantic Skill
Match
Planned Structures a JD; compares it against a parsed
resume
Readiness Score Engine Planned Composite score: skill match %, project
relevance %, experience relevance %, with the
ATS score as one input
Roadmap / Milestones Planned Missing-skill → resource → milestone →
status
AI Mock Interview Planned (text-only, free tier) Role-specific Q&A with AI feedback
Recruiter Dashboard Planned JD upload, AI-ranked candidate pool,
shortlist/reject
Placement Cell Dashboard Planned Cohort table, status tags, smart filters,
gatekeeping, group actions, training tags,
referrals
Notifications Planned (email only) Status changes, training assigned, meeting
invites
Meeting Scheduling Planned (in-app slots + .ics,
no calendar API)
Placement cell / recruiter ↔ student
meetings
Multi-College Tenancy
(College Code)
Planned Scopes every student/placement-cell account
to one college; tags every candidate for
recruiters
Interview Integrity
Monitor
Planned Flags likely cheating in the AI mock interview
for human review, never auto-rejects
Full System Loop Planned Any update re-triggers parsing + scoring across
all dashboards
3. The Problem: Literature Grounding
A targeted search of freely available research (2024–2026) was carried out across three separate literatures.
The same blind spot repeats in each — but a different one each time — which is the actual evidence for
JobSync's design.
3.1 Cluster A — AI resume / JD matching systems
Strong on NLP/LLM semantic matching; scoped only to the individual job seeker. No institution layer, no
gatekeeping, no cohort analytics.
● Alavala et al., AI-Driven Resume Parsing and Ranking System (2025), EAI/ICITSM —
https://eudl.eu/doi/10.4108/eai.28-4-2025.2357764
● Dangeti et al., AI-Powered Resume Parsing and Candidate Scoring (2025), Springer ICTIS —
https://link.springer.com/chapter/10.1007/978-981-96-8399-4_7
● Layout-Aware Parsing Meets Efficient LLMs (2025), arXiv — https://arxiv.org/pdf/2510.09722
● Resspar: AI-Driven Resume Parsing and Recruitment System using NLP and Generative AI —
https://www.researchgate.net/publication/384650051
● Resume Parser Using NLP, IJARCCE (2024) —
https://ijarcce.com/wp-content/uploads/2024/09/IJARCCE.2024.13905.pdf
● AI-Powered Resume Analyzer (2025), IRE Journals — https://www.irejournals.com/paper-details/1714127
● TalentCLEF 2025 Overview (skill/job-title matching benchmark) — https://arxiv.org/pdf/2507.13275
● TalentCLEF 2026 Overview (skill/job-title matching benchmark) — https://arxiv.org/pdf/2606.31692
3.2 Cluster B — Campus placement management systems
These are exactly the placement-cell side of JobSync — but every system found is a plain CRUD job portal:
logins, profile storage, job postings, application tracking. None does AI skill matching, readiness scoring, or
semantic gap analysis. This is the strongest, cleanest citable gap for the placement-cell half of the paper.
● Campus Placement Management System for Recruiters and Students (2025) —
https://www.researchgate.net/publication/392702796
● Sunny, Felix et al., Placement Management System for Campus Recruitment (2020), IJISRT —
https://ijisrt.com/assets/upload/files/IJISRT20MAY826.pdf
● A Comprehensive Campus Recruitment and Placement System for Optimizing the Hiring Process —
https://www.ijraset.com/research-paper/comprehensive-campus-recruitment-and-placement-system
● Campus Recruitment Management System, IJNRD (2024) — notes existing systems lack analytics and
customizable filtering — https://www.ijnrd.org/papers/IJNRD2409288.pdf
● A Research on Placement Management System, IJRASET —
https://www.ijraset.com/research-paper/placement-management-system
● PlaceMe: An Integrated Campus Recruitment Platform (closest existing system — NLP parsing + Random
Forest placement prediction, still no readiness score, roadmap, or gatekeeping) —
https://www.ijraset.com/research-paper/placeme-an-integrated-campus-recruitment-platform
3.3 Cluster C — AI mock interview systems
A mature, active research area — but every system is a standalone practice tool, never wired into a
resume/JD/readiness pipeline or a placement cell's workflow.
● Review: AI-Powered Mock Interview Preparation (2025) —
https://www.researchgate.net/publication/390353415
● Conversate: Supporting Reflective Learning in Interview Practice (2024), arXiv —
https://arxiv.org/pdf/2410.05570
● Elevating Performance Through AI-Driven Mock Interviews (2024) —
https://www.researchgate.net/publication/381845144
● AI MockPrep — An AI-Driven Interview Simulation & Resume Optimization System, IJERT —
https://www.ijert.org/ai-mockprep-an-ai-driven-interview-simulation-resume-optimization-systemijertv15is010560
● Revolutionizing Interview Preparation: An AI-Driven Mock Interview System, IJRASET —
https://www.ijraset.com/research-paper/an-ai-driven-mock-interview-system-for-skill-assessment
● Prepmania: An AI-Powered Mock Interview Platform — https://www.ijraset.com/best-journal/prepmania-anaipowered-mock-interview-platform-for-skill-evaluation-and-performance-feedback
3.4 Synthesized gap statement
Cluster A solves matching but ignores institutions. Cluster B solves institutional workflow but ignores AI
matching entirely. Cluster C solves interview readiness but is disconnected from both. No reviewed system
unifies AI-driven semantic scoring, a placement-cell-governed candidate pipeline, and interview readiness in
one closed loop. This three-source triangulation is a stronger, more defensible contribution than a singleliterature comparison.
4. The Seven Consolidated Gaps and JobSync's Fix
# Gap Seen in JobSync's fix
L1 Disconnected, single-stage
tools
SkillRec, CareerSet, AceTrac,
single-stage AI career tools
One continuous pipeline: parsing,
matching, scoring, roadmap all run as
one connected backend
L2 Static, one-time snapshot
scoring
AceTrac, rule-based
analyzers
Full System Loop — any resume
update or milestone re-triggers
parsing and re-scoring
L3 Shallow keyword/rule-based
matching
CareerSet, rule-based
analyzers
AI-based semantic skill extraction
(Gemini), synonym-aware matching
against role-based frameworks
L4 Generic, non-personalized
feedback
SkillRec, CareerSet Weighted composite readiness score
per individual project/experience
history
L5 No stakeholderdifferentiated views
SkillRec, CareerSet,
explainable frameworks,
transformer analyzers
Three dashboards, one shared data
model: student, recruiter, placement
cell
L6 No actionable link from
diagnosis to improvement
AceTrac, CareerSet,
explainable frameworks
Personalized, trackable roadmap with
milestones feeding back into the
scoring loop
L7 No institution-governed
gatekeeping between AI
scoring and recruiter visibility
Not found in any cluster
reviewed
Placement cell must review and pass
a student before a recruiter can see
them for a given role
5. Complete Feature List
5.1 Student-Facing
● [BUILT] Register / login (module-local today; see Section 11 for making it shared and college-scoped)
● [BUILT] Resume upload (PDF, ≤ 5 MB, drag-and-drop)
● [BUILT] AI structural parsing: basics, summary, experience, education, skills, projects, certifications,
languages, interests
● [BUILT] ATS score (0–100) with a 4-way breakdown: keywords, formatting, impact, clarity
● [BUILT] 5 prioritized issues with severity and a concrete fix
● [BUILT] 5 standout strengths with quoted evidence
● [BUILT] 0–8 bullet rewrite suggestions with rationale
● [BUILT] Apply selected rewrites → new immutable version
● [BUILT] Version diff (word/line level) with add/remove stats
● [BUILT] Version stack with score-delta view
● [BUILT] Export a clean, styled PDF from parsed sections
● [BUILT] Personal dashboard: KPI tiles, sparklines, activity feed
● [BUILT] Cross-resume insights: trend, top issues, top keywords, per-resume improvement
● [BUILT] Chronological history/timeline of upload, analyze and rewrite events
● [PLANNED] Target-JD selection (today only a free-text target-role string is supported)
● [PLANNED] JD-specific semantic skill match percentage, separate from the generic ATS score
● [PLANNED] Composite Readiness Score (0–100%): skill match + project relevance + experience
relevance + ATS sub-score
● [PLANNED] Missing-skill → roadmap item mapping with resource link, milestone and status
● [ADAPTED] AI mock interview — timed text-based,audio Q&A and written feedback only; no video /emotion
analysis on a free tier
● [PLANNED] Job-fit suggestions based on currently parsed skills
● [ADAPTED] Notification center — in-app list plus email only, via a free transactional-email tier
● [PLANNED] Read-only view of the status the placement cell has set (referred, shortlisted, etc.)
● [PLANNED] Register with a college code issued by the student's own placement cell (see Section 6)
● [PLANNED] See own integrity flags, if any, and a way to explain/appeal before a placement cell
reviews them
5.2 Recruiter-Facing
● [PLANNED] Drag-and-drop JD upload (reuses the existing dropzone component already built for
resumes)
● [PLANNED] AI JD parsing: required skills, experience level, responsibilities
● [PLANNED] Candidate feed scoped to only placement-cell-approved students for that JD
● [PLANNED] AI-ranked list within the approved pool
● [PLANNED] Candidate detail view: matched/missing skills, readiness breakdown, and a visible college
tag
● [PLANNED] Shortlist / reject actions
● [PLANNED] Recruiter dashboard: JDs posted, candidate counts, average match score per JD
● [ADAPTED] Propose a meeting with a candidate or group — in-app slot picker, not a paid calendar API
● [PLANNED] Message a student's placement cell, or the student directly, from the candidate's profile
(see Section 6)
5.3 Placement-Cell-Facing
● [PLANNED] Cohort table with live readiness scores, filterable to updated resumes only
● [PLANNED] Status tagging: Not Reviewed / Referred / Shortlisted / Hired / Needs Improvement /
Critical
● [PLANNED] Smart filter builder: score range × missing-skill tag × training tag × status × branch/batch ×
recently updated
● [PLANNED] Bulk/group select → assign a training tag, send a notification, or pass the group to a
recruiter's JD pool
● [PLANNED] Custom training-tag authoring
● [PLANNED] Gatekeeping: approve/pass a student into a specific recruiter's JD candidate feed
● [PLANNED] “Refer elsewhere” — log an external referral outside JobSync with status tracking
● [PLANNED] Meeting scheduler for individuals or groups
● [PLANNED] Batch-level analytics: average readiness, distribution chart, common skill gaps, trainingneeds report
● [PLANNED] Student drill-down: any individual's full readiness profile
● [PLANNED] Audit log per student: who changed which status or tag, and when
● [PLANNED] College Code management: generate, rotate and share the code students register with
(see Section 6)
● [PLANNED] Cohort table is automatically scoped to the placement cell's own college — no crosscollege visibility
● [PLANNED] Review interview-integrity flags on a student's profile before making a status decision (see
Section 8)
● [PLANNED] Inbox for messages recruiters send about a specific student
5.4 Core AI / System-Wide
● [BUILT] Multi-model Gemini fallback cascade on transient errors
● [BUILT] Zod-validated, JSON-schema-constrained AI responses
● [BUILT] Output sanitization that caps/strips hallucinated tag lists
● [BUILT] Token and model accounting persisted per analysis
● [PLANNED] Shared skill taxonomy so spelling variants of the same skill collapse into one entry
platform-wide
● [PLANNED] Full System Loop: an update anywhere re-triggers re-parsing, re-scoring, and refreshes
every dashboard
● [ADAPTED] Analysis caching by content hash, so re-analyzing unchanged text does not spend AI quota
twice
● [PLANNED] Interview integrity monitor: tab/window-switch detection, paste-vs-typed heuristics,
fullscreen enforcement, single-session lock (see Section 8)
6. Multi-College Tenancy: The College Code System
A single placement cell must never be able to see, manage, or message a student from another institution —
JobSync is meant to be used by many colleges at once, not just one. This is enforced with a College Code,
not just a UI filter, so the isolation holds even if someone calls the API directly.
6.1 How it works
● Every college using JobSync gets one short, unique College Code (e.g. GNIOT2026) when its
placement cell account is set up.
● A student can only register by entering their college's code. The code resolves to a collegeId that is
stamped onto the student's account permanently at signup.
● A placement-cell account is itself created against exactly one collegeId. Every query the placementcell dashboard runs — the cohort table, smart filters, bulk actions, analytics — is filtered by
req.user.collegeId at the database-query layer, not only hidden in the UI. This is the one rule that
must never be bypassable: even a manually crafted API request from a placement-cell account
cannot return another college's students.
● A recruiter account is not tied to any one college. A recruiter can see candidates passed to them by
any placement cell (once gated — Section 7), and every candidate card carries a visible college tag
(e.g. “GNIOT Greater Noida”) so the recruiter always knows which institution a student belongs to.
● A recruiter can message either the student directly or that student's placement cell, straight from
the candidate profile — both routes go through the same Notification pipeline (Section 9), just
addressed differently (toUserId vs. toCollegeId + role:"placement_cell").
6.2 Data model addition
One new collection, plus one new field on the existing User model:
College { _id, name, code (unique, indexed), createdAt, isActive }
User (extended) { ...existing fields..., role: "student|recruiter|placement_cell|admin",
 collegeId // required for student & placement_cell, null for recruiter/admin }
6.3 Security and edge cases specific to the code system
● Codes should not be easy to guess — use a short random suffix (e.g. GNIOT-7F2K), not just the
college's initials, and rate-limit registration attempts per IP so a code cannot be brute-forced.
● A placement cell can rotate its code at any time (e.g. if it leaks to the wrong audience). Rotating only
affects future registrations — already-registered students keep their existing collegeId.
● New colleges should be onboarded through a light manual-approval step (even just an internal
script/admin route run by the JobSync team) rather than a fully open self-serve form, so a bad actor
cannot spin up a fake “college” to harvest resumes or impersonate an institution to recruiters. This
does not need a built admin panel on a zero budget — a one-off seed script is enough for a studentproject deployment.
● A college with multiple campuses/branches can be modeled as one College document with one
code for the MVP; supporting separate codes per branch is a clean v2 addition (an optional
branchTag field on User) and should be named explicitly as future work rather than built now.
7. System Architecture
One Express backend with route namespaces (/api/resume, /api/jd, /api/placement-cell, /api/recruiter,
/api/notifications, /api/meetings) sitting in front of one shared MongoDB Atlas connection, rather than one
microservice per module. On free-tier hosting, running N separate services means N cold-sleeping free
instances and N separate connections against one shared 512 MB cluster — a single backend avoids
multiplying that cold-start latency. Every request that touches student or placement-cell data passes
through a college-scoping check, as described in Section 6.
7.1 Architecture Diagram
Figure 1 — JobSync system architecture: clients, API gateway, service layer, free-tier external services, and the shared data layer,
with the College Registry shown as a cross-cutting scoping boundary.
7.2 End-to-End Flow Diagram
Figure 2 — Swimlane flow across Student, AI Engine, Placement Cell, and Recruiter, with the college-code registration edge, the
gatekeeping edge, the integrity-monitor checkpoint, and the Full System Loop all marked explicitly.
7.3 Student Journey
● Register using the college code issued by their placement cell, and log in through the shared JobSync
auth.
● Upload a resume — AI-parsed and ATS-scored by the built Resume Intelligence module.
● Apply suggested rewrites and get an improved, versioned resume.
● Select a target role or JD; the JD is AI-parsed into required skills.
● A semantic match is run between resume skills and JD skills.
● A composite Readiness Score is computed, folding in the ATS score as a presentation-quality subfactor.
● Missing skills are mapped to a roadmap of resources and milestones.
● An optional AI mock interview can be taken for the target role, with an integrity monitor running
quietly in the background (Section 8).
● Completing a milestone or re-uploading a resume re-triggers the whole pipeline (Full System Loop).
7.4 Placement-Cell Journey (the gatekeeping layer)
● View a cohort table scoped automatically to their own college — students from other colleges never
appear, even in a raw API response.
● Apply a smart filter: readiness range × missing-skill tag × training tag × status × branch/batch ×
recency.
● Tag a student or a selected group with a status and, optionally, a training need.
● Review any interview-integrity flags on a student before making a status decision — a flag is a
prompt to look closer, never an automatic rejection.
● Pass a student or group onto a specific recruiter's JD pool — the gate a student must clear before a
recruiter can see them for that role.
● Log an external referral, send a notification, or propose a meeting.
● Review aggregate cohort analytics: readiness distribution, common skill gaps, training-needs report.
7.5 Recruiter Journey
● Drag-and-drop a JD; it is AI-parsed into required skills and experience level.
● See only the students the placement cell has passed through for that JD, each carrying a visible
college tag.
● Review an AI-ranked list within that approved pool, shortlist or reject, and propose a meeting.
● Message the student's placement cell, or the student directly, at any point from the candidate
profile.
8. Interview Integrity & Anti-Cheat Safeguards
An AI mock interview that can be trivially cheated (a second screen with ChatGPT open, answers pasted
from a friend, someone else sitting the interview) teaches a student nothing and gives a placement cell false
confidence. The safeguards below are chosen because every one of them is implementable with plain
browser APIs and server-side heuristics — no paid proctoring SDK, no webcam/video AI, which would break
the zero-budget constraint and raise real privacy questions for a student project.
8.1 Design principle: flag, never auto-fail
Every signal below produces a flag stored on the InterviewSession, visible to the placement cell alongside
the interview transcript. None of them silently lowers a score or blocks a result on their own — automated
proctoring has a well-documented false-positive problem (a slow typist, a screen reader user, a shared
family computer), and a wrongly accused student is a worse outcome than a missed cheater. A human at
the placement cell always makes the final call.
8.2 Safeguards to build
● Tab-switch / window-blur detection — the Page Visibility API logs every time the interview tab loses
focus, with a running count and total away-time shown to the placement cell, not to the student
mid-interview.
● Fullscreen enforcement — the interview starts in the Fullscreen API and logs (does not block) every
exit.
● Copy-paste heuristics on the answer box — a paste event that inserts a large block of text in under
the time it would take to type it is flagged; typing the same content in normally is not.
● Per-question soft time limits — a generous but bounded window per question (long enough for
genuine thinking, short enough to discourage searching for an answer elsewhere) with the time-tofirst-keystroke and total time both logged.
● Randomized question order and a larger question pool per role — two students interviewing for the
same role should rarely see the questions in the same order, which limits the value of shared
“leaked” answers.
● Single active session enforcement — starting a new interview session for the same user invalidates
any other session token, so an interview cannot be answered from two devices at once (e.g. a friend
on a second laptop).
● Answer-similarity check — the AI layer can flag when one student's answers are suspiciously close
(near-duplicate phrasing) to another student's answers for the same question, using the same
Gemini call already used for scoring, at negligible extra cost.
● A short, mandatory academic-integrity acknowledgment before the interview starts, and a visible
notice that tab-switches and paste events are logged — transparency is itself a deterrent, and
hidden monitoring raises fairness and privacy concerns this project does not need to take on.
8.3 Explicitly out of scope for the free-tier build
● Webcam/video proctoring, face verification, or gaze tracking — needs paid vision APIs or heavy selfhosted models, plus meaningful consent and data-retention obligations that are disproportionate
for a placement-prep tool. State this as a deliberate scope boundary in the paper, not an oversight.
● Voice/audio analysis for stress or deception detection — unreliable even in commercial proctoring
products and not worth building at all, on any budget.
● Device fingerprinting beyond the single-session-token check above — diminishing returns for a
student-facing prep tool; the single-session lock already blocks the most common cheating pattern
(two people, two devices, one interview).
9. Free-Tier Engineering Approach
Every feature above is designed to run on ₹0 infrastructure. This is stated explicitly in the paper as a set of
engineering decisions, not as omissions.
Concern Free resource used Design response
LLM calls Gemini API free tier Multi-model fallback (built); cache analyses by
content hash; queue bulk placement-cell calls
instead of firing them simultaneously; keep peruser rate limits on every AI-backed route.
Database MongoDB Atlas M0 (~512 MB,
shared)
Keep full raw text only on current + previous
version; treat parsedSections as the source of
truth for scoring/export.
Backend hosting Render / Railway free web
service
Free instances cold-sleep after inactivity;
document the resulting 30–60s first-request
latency explicitly rather than let it look like a bug.
Frontend hosting Vercel / Netlify free tier No real constraint — static SPA hosting is
generous.
Email notifications A free transactional-email tier
(e.g. Brevo, Resend, or Gmail
SMTP for low volume)
Pick one provider, document its daily cap, fail
gracefully with a retry queue if the cap is hit.
Meeting scheduling No paid calendar API In-app slot picker + generated .ics file attached to
the confirmation email — no OAuth consent
screen needed.
File storage Local disk / in-memory upload
(already built)
Uploaded PDFs are never persisted, only
extracted text and structured data — no storage
bill.
Auth Self-rolled JWT + bcrypt (already
built)
No cost; make it shared across modules instead of
duplicated per module.
10. Tech Stack
10.1 Already in use (Resume Intelligence module)
Node.js ≥20, Express 5, MongoDB Atlas with Mongoose, the Gemini SDK (@google/genai), pdf-parse,
Multer, JWT with bcryptjs, Zod, express-rate-limit, diff, React 19, Vite, React Router, TanStack Query, Axios,
Tailwind CSS 4, Framer Motion, Recharts, @react-pdf/renderer, react-dropzone.
10.2 To add for the rest of JobSync (all free / open-source)
Need Suggested tool Why
Shared auth across modules Reuse the existing JWT/bcrypt
setup, mounted once
No new dependency
JD parsing + skill match Same Gemini pipeline pattern as the
existing parser, new prompt/schema
Reuses the proven fallback and
validation pattern
Email sending nodemailer, or a provider SDK
(Brevo / Resend)
Free-tier friendly, well documented
Calendar file generation ics (npm package) Pure JS, no external API, no OAuth
Queued bulk operations bullmq with a free Redis (Upstash),
or p-queue for an in-process queue
Prevents bulk placement-cell actions
from spiking Gemini calls
Placement-cell analytics
charts
Recharts (already in use) No new dependency
College code generation nanoid (npm package) Short, collision-resistant codes, no
external service
Interview integrity signals Browser Page Visibility API +
Fullscreen API + paste-event
listeners (frontend), a small serverside flag scorer (backend)
No paid proctoring SDK needed
11. Suggested Changes to the Built Resume Intelligence Module
The module's internal scope — parse, score, rewrite, version, diff, export — is correct as-is and should not
be changed. The following are the integration edits needed to plug it into the rest of JobSync, in priority
order.
11.1 Replace module-local auth with shared, college-aware JobSync auth
Keep the module's existing User schema (bcrypt hashing, httpOnly JWT cookie, password hash excluded
from serialization) as the platform's single canonical auth, add the collegeId and role fields from Section 6,
and mount every other module's routes behind the same requireAuth middleware, instead of building a
second auth system.
11.2 Add an optional target-JD id alongside the existing free-text target role
Let the analyze endpoint accept a jdId, pull that JD's parsed required skills, and fold a JD-specific match
percentage into the analysis response. Keep the existing free-text path working for exploratory use before a
role is chosen.
11.3 Emit a lightweight event after every successful analysis or applied rewrite
A simple internal event (or a small Events collection write) at the end of the existing analyze and rewrite
handlers is what the Full System Loop hooks into later — no message broker required on a free budget.
11.4 Normalize extracted skills before they are used elsewhere
A small post-processing step (lowercase, trim, collapse obvious synonyms such as ReactJS / React.js / React)
keeps the placement cell's skill-gap aggregation and the recruiter's ranking from fragmenting on spelling
variants.
11.5 Give bulk, staff-triggered re-analysis its own rate limiter
The current per-user limiter is correctly scoped to a student analyzing their own resume. Once a placementcell user can trigger re-scoring for a group of students, that is a different access pattern and needs a queuebacked limiter rather than reusing the same per-user limit.
12. Other Edge Cases & Features Worth Considering
The feature list in Section 5 is a strong MVP scope, not a claim that nothing else could matter. These are
edge cases and abuse patterns worth naming now — even if most are v2, a reviewer or a placement cell will
ask about them, and it is better to have an explicit answer than to look like they were never considered.
12.1 Identity & account integrity
● Email verification at signup, so a placement cell's readiness statistics cannot be inflated by fake or
duplicate student accounts.
● Duplicate-resume detection across accounts within a college (same content hash under two
different emails) — a cheap check to add alongside the existing content-hash caching in Section 9.
● Bot signup protection on the registration form (a free CAPTCHA such as Cloudflare Turnstile) —
relevant once a college code is semi-public knowledge within a cohort.
12.2 Content integrity
● A lightweight check for resume bullets copied verbatim from common template sites, surfaced as a
strength/issue note rather than a punitive flag — reuses the existing ATS-analysis Gemini call, no
new infrastructure.
● JD moderation — a recruiter-uploaded JD should also pass basic sanity checks (not empty, not
spam) before it reaches a placement cell's queue, the same way a resume upload is already
validated.
12.3 Access & scale abuse
● Session/device limits per account (already proposed for interviews in Section 8, worth applying
platform-wide) to stop simple credential sharing.
● A placement cell should not be able to bulk-message an entire cohort more than a small number of
times per day — protects both the free email quota (Section 9) and students from notification spam.
12.4 Data privacy & consent
● Explicit consent capture at signup for a student's resume/profile being shown to recruiters — store
the consent timestamp; a student who withdraws consent should immediately stop appearing in
any recruiter feed, independent of their placement-cell status.
● A recruiter should only retain contact details for candidates they've actually shortlisted, not the full
passed pool — worth stating explicitly in the paper's system-design section as a privacy-by-design
choice.
12.5 What this means for the paper
Frame Section 12 as “threat model and future hardening” rather than missing features — it strengthens a
systems paper to show the design was stress-tested against misuse, even where the MVP only implements a
subset.
13. Suggested Build Order
Twelve phases. Section 14 gives one AI-agent prompt per phase, in this exact order — finish and test one
before starting the next.
1. Merge the Resume module's auth into a shared backend shell — the foundation everything else logs in
through.
2. Add the College model and college-code registration/scoping for students and placement-cell accounts.
3. JD upload and AI parsing, reusing the existing structured-parser pattern with a new prompt.
4. Skill match engine (resume skills vs JD skills) and the composite Readiness Score.
5. Roadmap generation from missing skills.
6. Placement-cell cohort table (college-scoped) and manual status tagging — get the gatekeeping concept
working end to end before adding filters.
7. Gatekeeping: a recruiter's feed filtered to placement-cell-passed students only, each carrying a college
tag.
8. Smart filters and bulk/group actions on top of the now-working cohort table.
9. Notifications (email), the meeting scheduler (.ics generation), and recruiter-to-placement-cell /
recruiter-to-student messaging.
10. AI mock interview (text-only) together with its integrity-monitor signals (Section 8) — build them in
the same phase, not as an afterthought.
11. Full System Loop wiring, once there is more than one dashboard for an update to actually refresh.
12. Edge-case hardening pass from Section 12: consent capture, duplicate-account checks, rate limits on
bulk messaging.
This order front-loads the piece that is genuinely novel for the paper — the college-scoped gatekeeping
pipeline, steps 6–7 — instead of leaving it for last.
14. Step-by-Step Build Prompts for Your AI Coding Agent
One prompt per phase from Section 13, meant to be given to a coding agent (e.g. Claude Code) one at a
time, in order. Each is scoped to a single phase on purpose — a smaller, well-bounded prompt gets a more
reliable result than one giant “build everything” prompt, and you can review/test after each one before
moving on. Paste each prompt as-is; the agent already has the built Resume Intelligence module's code to
read for patterns (auth, Gemini calls, Zod schemas, rate limiting) and should reuse them rather than
inventing new ones.
Prompt 1 — Shared backend shell
Take the existing Resume Intelligence backend and restructure it into the foundation
for a larger app called JobSync. Keep every existing route and model working exactly
as they do now, but mount them under an /api/resume namespace instead of the root.
Move the User model, auth middleware, and JWT/bcrypt logic into a shared location so
other feature modules I build later can import and reuse them without duplicating
auth. Do not change any existing behavior — this is a reorganization, not a rewrite.
Show me the new folder structure before making changes.
Prompt 2 — College model and college-code scoping
Add a new College model (name, unique code, isActive, createdAt) and extend the User
model with role (student | recruiter | placement_cell | admin) and collegeId
(required for student and placement_cell, null otherwise). Add a registration flow
where a student or placement_cell must supply a valid college code, which resolves
to a collegeId stored on their account. Add a small script I can run once to seed
one test college with a known code. Critically: add a reusable middleware or query
helper that automatically scopes any placement-cell database query to
req.user.collegeId, and write one test proving a placement-cell account cannot fetch
another college's data even with a manually crafted request.
Prompt 3 — JD upload and AI parsing
Add a JobDescription model and a /api/jd module: an endpoint to upload/paste a job
description, and an AI parsing step that extracts required skills, experience level,
and responsibilities as structured JSON. Follow the exact same pattern as the
existing structuredParser.js in the Resume Intelligence module — same multi-model
Gemini fallback list, same Zod schema validation, same JSON-fence stripping. Store
the parsed result on the JobDescription document.
Prompt 4 — Skill match engine and Readiness Score
Add a scoring module that takes a resume version's parsed skills and a
JobDescription's parsed required skills, and computes a skill match percentage using
semantic comparison (not exact string matching) via the same Gemini pattern already
in use. Combine that with a project-relevance and experience-relevance sub-score
(you can start with a simple heuristic for these two, we'll refine later) and the
existing ATS score into one composite Readiness Score (0–100). Store this as a
ReadinessScore document linked to the user, resume version, and JD.
Prompt 5 — Roadmap generation
Add a Roadmap model and generation step: given the missing-skills list from a
ReadinessScore, generate one roadmap item per missing skill with a short resource
suggestion and a status field (not_started | in_progress | done). Add an endpoint
for a student to update an item's status, and make completing an item emit the same
lightweight internal event used elsewhere (see Prompt 11) rather than calling the
scoring pipeline directly.
Prompt 6 — Placement-cell cohort table
Add a placement-cell-only endpoint that lists every student in the caller's own
college (using the scoping helper from Prompt 2) with their latest Readiness Score,
resume-last-updated date, and current status. Add a PlacementStatus model (status
enum: not_reviewed | referred | shortlisted | hired | needs_improvement | critical,
plus trainingTags array and an auditLog array of {by, from, to, at}). Add an
endpoint for a placement-cell user to change one student's status, appending to the
audit log rather than overwriting it. No filters yet — just the table and status
changes, working end to end.
Prompt 7 — Recruiter gatekeeping
Add a recruiter-facing endpoint that lists candidates for a given JD, but only
students whose PlacementStatus for that JD has been explicitly marked as
passed/approved by their placement cell. Add a 'pass to recruiter' action on the
placement-cell side that sets this. Every candidate returned to a recruiter must
include a collegeTag (the college's name) so it's always visible whose student this
is. Write one test proving a student who has not been passed never appears in any
recruiter response, even if their Readiness Score is high.
Prompt 8 — Smart filters and bulk actions
Extend the placement-cell cohort endpoint from Prompt 6 to accept combinable
filters: readiness score range, missing-skill tag, training tag, status,
branch/batch, and 'resume updated in the last N days'. Then add a bulk-action
endpoint that accepts a list of student IDs and one action (assign a training tag,
or pass them to a specific JD) and applies it to all of them in one request, logging
each change to that student's audit log.
Prompt 9 — Notifications, scheduling, and messaging
Add a Notification model and an email-sending service using nodemailer (or the
Brevo/Resend SDK if I've given you an API key), with a daily-send cap and graceful
failure if the cap is hit. Add a Meeting model and endpoints: propose 2–3 time slots
to a student or group, let the student confirm one, and generate a .ics file (using
the ics npm package) attached to the confirmation email — no calendar API, no OAuth.
Add a simple messaging endpoint so a recruiter can send a message either to a
specific student or to that student's placement cell, both stored as Notifications
with a toUserId or toCollegeId+role.
Prompt 10 — AI mock interview with integrity monitor
Add an InterviewSession model and endpoints: generate 5 role-specific questions from
a JD (same Gemini pattern as before) in randomized order from a slightly larger
pool, accept typed answers, and return written AI feedback per answer plus an
overall summary. On the frontend, add integrity signal tracking: Page Visibility API
to log tab-switches with timestamps, Fullscreen API entry/exit logging, and a pasteevent listener that flags a paste inserting more than N characters in under a
threshold time. Store all of these as an integrityFlags array on the
InterviewSession — do not use them to change the score or block submission, just
store them for the placement cell to review later alongside the transcript.
Prompt 11 — Full System Loop
Add a small internal event emitter (a simple EventEmitter or a written-to Events
collection is fine, no message broker) that fires after: a resume is re-analyzed,
rewrites are applied, or a roadmap item's status changes to done. Wire a listener
that re-runs the Readiness Score calculation (Prompt 4) whenever this event fires
for a user who has an active JD selected, so their score and roadmap stay current
without the student manually re-triggering anything.
Prompt 12 — Edge-case hardening pass
Add these safeguards across the app: (1) require email verification before a new
account can be used, (2) on resume upload, check for an existing resume with the
same content hash under a different account in the same college and flag it for
placement-cell review instead of silently allowing it, (3) rate-limit the placementcell bulk-notify endpoint to a small number of sends per day, (4) add an explicit
consent checkbox at student signup for being shown to recruiters, and make sure
withdrawing consent immediately removes the student from any recruiter-facing query,
regardless of their PlacementStatus.
If a prompt's result needs a follow-up fix, keep the follow-up scoped to that same phase before moving to
the next prompt — don't let issues compound across phases.
15. Zero-Budget Deployment Guide
Once the phases in Section 13 are built and working locally, this is the concrete path to a live, shareable
website with no hosting cost.
15.1 What goes where
Piece Free service Notes
Database MongoDB Atlas, M0 cluster 512 MB shared cluster, no card required for the
free tier at the time of writing — verify current
terms before relying on this.
Backend (Express API) Render, free Web Service Deploys straight from the GitHub repo; sleeps
after ~15 minutes of inactivity and takes 30–60s
to wake on the next request — expected
behavior, not a bug.
Frontend (React SPA) Vercel or Netlify, free tier Deploys straight from the GitHub repo on every
push; generous free bandwidth for a project of
this size.
Subdomain The free *.onrender.com and
*.vercel.app subdomains
No cost. A custom domain (jobsync.com) is
optional and not free — skip it unless there is
budget later.
Keep-alive (optional) UptimeRobot free monitor,
pinged every 5 minutes
Free, and a common, legitimate way to reduce
how often a Render free service goes to sleep.
Do not rely on this for correctness — the app
must still work correctly on a cold start.
15.2 Deployment steps
1. Create a free MongoDB Atlas account, create an M0 cluster, add a database user, and allow network
access from anywhere (0.0.0.0/0) since Render's outbound IP isn't fixed on the free tier. Copy the
connection string.
2. Push the backend to a GitHub repository. On Render, create a new free Web Service pointed at that
repo, set the build/start commands, and add the environment variables from Section 15.3.
3. Push the frontend to a GitHub repository (or the same repo, different folder). On Vercel, import the
repo, set the build command and output directory for the Vite build, and add the one frontend
environment variable pointing at the Render backend's URL.
4. Update CLIENT_ORIGIN on the backend to the deployed Vercel URL, and the frontend's API base URL to
the deployed Render URL, then redeploy both.
5. Create free accounts for whichever email provider was chosen in Section 9 and add its API key/SMTP
credentials as backend environment variables.
6. Optional: set up a free UptimeRobot monitor pinging the backend's /api/health endpoint every 5
minutes to reduce cold starts during a live demo.
15.3 Environment variables to set on the host (not committed to git)
MONGO_URI=... # from Atlas
JWT_SECRET=...
CLIENT_ORIGIN=https://<your-app>.vercel.app
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.6-flash
GEMINI_FALLBACK_MODELS=gemini-3.5-flash,gemini-3.5-flash-lite
EMAIL_PROVIDER=brevo # or resend / gmail-smtp
EMAIL_API_KEY=...
EMAIL_FROM=no-reply@jobsync.app
Nothing above requires a credit card once you've confirmed each provider's current free-tier terms — check
them at signup, since free-tier policies do change.
16. Feature Comparison Against Existing Systems
Capability SkillRec CareerSe
t
AceTrac Rule-based
(2025)
Transformer
analyzer
JobSync
(2025)
Semantic (non-keyword) skill
matching
Partial No No No Yes Yes
Continuous, recomputable
readiness score
No No No
(snapsho
t)
Partial No Yes
Personalized, milestonebased roadmap
No No No Partial
(static)
No Yes
Student-facing view Yes Yes Yes Yes Yes Yes
Recruiter-facing ranked
candidates
No Partial
(integrati
on only)
No No No Yes
Placement-cell / institution
analytics
No No Yes
(standard
ized only)
No No Yes
Institution-governed
gatekeeping before recruiter
visibility
No No No No No Yes
Multi-college tenancy with a
college tag visible to
recruiters
No No No No No Yes
AI-interview integrity
safeguards
No No No No No Yes
Progress tracking over time No No No No No Yes
No single reviewed system — old prototype or 2025–2026 published work — combines semantic matching, a
continuous score, a trackable roadmap, all three stakeholder views, and institution-governed gatekeeping.
This combination is what JobSync is built to deliver.
17. References
All sources below are freely accessible at the time of writing. Verify links before submission, as
preprint/venue URLs can change.
● Alavala, V. K. R. et al. (2025). AI-Driven Resume Parsing and Ranking System: Leveraging NLP and Machine
Learning for Efficient Recruitment. ICITSM 2025. — https://eudl.eu/doi/10.4108/eai.28-4-2025.2357764
● Dangeti, S. R. et al. (2025). AI-Powered Resume Parsing and Candidate Scoring for Efficient Hiring Workflows.
ICTIS 2025, Springer. — https://link.springer.com/chapter/10.1007/978-981-96-8399-4_7
● Layout-Aware Parsing Meets Efficient LLMs: A Unified, Scalable Framework for Resume Information Extraction
and Evaluation (2025). — https://arxiv.org/pdf/2510.09722
● Resspar: AI-Driven Resume Parsing and Recruitment System using NLP and Generative AI. —
https://www.researchgate.net/publication/384650051
● Resume Parser Using NLP. IJARCCE, 13(9), 2024. —
https://ijarcce.com/wp-content/uploads/2024/09/IJARCCE.2024.13905.pdf
● AI-Powered Resume Analyzer. IRE Journals, 2025. — https://www.irejournals.com/paper-details/1714127
● Overview of the TalentCLEF 2025: Skill and Job Title Intelligence for Human Capital Management. —
https://arxiv.org/pdf/2507.13275
● Overview of the TalentCLEF 2026: Skill and Job Title Intelligence for Human Capital Management. —
https://arxiv.org/pdf/2606.31692
● Campus Placement Management System for Recruiters and Students (2025). —
https://www.researchgate.net/publication/392702796
● Sunny, A., Felix, A. et al. (2020). Placement Management System for Campus Recruitment. IJISRT, 5(5). —
https://ijisrt.com/assets/upload/files/IJISRT20MAY826.pdf
● A Comprehensive Campus Recruitment and Placement System for Optimizing the Hiring Process. —
https://www.ijraset.com/research-paper/comprehensive-campus-recruitment-and-placement-system
● Campus Recruitment Management System. IJNRD, 2024. — https://www.ijnrd.org/papers/IJNRD2409288.pdf
● A Research on Placement Management System. IJRASET. —
https://www.ijraset.com/research-paper/placement-management-system
● PlaceMe: An Integrated Campus Recruitment Platform. IJRASET. —
https://www.ijraset.com/research-paper/placeme-an-integrated-campus-recruitment-platform
● AI-Powered Mock Interview Preparation — review paper (2025). —
https://www.researchgate.net/publication/390353415
● Conversate: Supporting Reflective Learning in Interview Practice Through Interactive Simulation and Dialogic
Feedback (2024). — https://arxiv.org/pdf/2410.05570
● Elevating Performance Through AI-Driven Mock Interviews (2024). —
https://www.researchgate.net/publication/381845144
● AI MockPrep — An AI-Driven Interview Simulation & Resume Optimization System. IJERT. —
https://www.ijert.org/ai-mockprep-an-ai-driven-interview-simulation-resume-optimization-systemijertv15is010560
● Revolutionizing Interview Preparation: An AI-Driven Mock Interview System for Skill Assessment. IJRASET. —
https://www.ijraset.com/research-paper/an-ai-driven-mock-interview-system-for-skill-assessment
● Prepmania: An AI-Powered Mock Interview Platform for Skill Evaluation and Performance Feedback. IJRASET.
— https://www.ijraset.com/best-journal/prepmania-an-aipowered-mock-interview-platform-for-skillevaluation-and-performance-feedback