# JobSync — Viva / Demo Q&A

**Team:** Navneet · Prince · Preet · Praful
**One-liner:** JobSync is a placement-readiness platform. A student uploads a resume, pastes a job
description, and gets a **Readiness Score** out of 100 — plus a roadmap for the gap and interview
practice. Colleges and recruiters see the same score.

---

## 0. The 30-second pitch (say this first)

> "Recruiters reject students not because they're weak, but because nobody tells them _how far they
> are_ from a specific job. JobSync answers that with one number. We extract the resume text, parse
> it into structured sections with Gemini, parse the JD into required skills, match the two
> semantically, blend in the resume's ATS quality, and output a weighted Readiness Score —
> then generate a learning roadmap from the missing skills and track the score as it improves."

---

## 1. "How is the PDF parsed?"

**Answer: 3 steps — extract → structure → normalize.**

1. **Extract (deterministic, no AI).** `pdf-parse` (`pdfService.js`) reads the uploaded buffer and
   returns raw text. We reject anything under **50 characters** — that catches scanned/image-only
   PDFs and gives a clear error instead of creating a blank resume. The parser is always destroyed
   in a `finally` block so memory doesn't leak. Upload itself is Multer **in-memory**, PDF-only,
   **≤ 5 MB**, exactly one file.

2. **Structure (AI).** The raw text is **jumbled** — a PDF has no concept of "Experience" or
   "Skills"; a two-column layout interleaves lines. So Gemini is given a strict **JSON response
   schema** and asked to return `basics / summary / experience / education / skills / projects /
certifications / languages / interests`. We use:
   - `temperature: 0.1` — extraction, not creativity
   - `responseMimeType: "application/json"` + `responseSchema` — output is structurally constrained
   - a **conservative prompt**: _"Do not invent or paraphrase — extract verbatim"_
   - **Zod validation** before anything is saved — a malformed model reply can never reach MongoDB

3. **Normalize.** Every skill is pushed through `normalizeSkills.js` — a seeded alias map
   (`"ReactJS"`, `"react.js"`, `"react js"` → `react`). **This is the step that makes matching
   possible.** Without it, a resume saying "ReactJS" would show a false gap against a JD saying
   "React" — and every student would be penalised.

**If they ask "what if the AI fails?"** → The parse **fails loudly with a 503**, it does not silently
return empty sections. Returning `EMPTY` would create a blank resume while telling the user it
succeeded. The user gets a retryable error instead.

---

## 2. "How is the Readiness Score calculated?"

**Answer: it's pure math, not AI — 4 weighted sub-scores.**

```
Readiness = 0.45 × Skill Match
          + 0.20 × Project Relevance
          + 0.15 × Experience Relevance
          + 0.20 × ATS Score
```

| Sub-score                | Weight | How it's measured                                                  |
| ------------------------ | ------ | ------------------------------------------------------------------ |
| **Skill match**          | 45%    | Deterministic weighted formula over the AI's matched/missing lists |
| **Project relevance**    | 20%    | AI judges _substance_ of projects vs the JD (0–100)                |
| **Experience relevance** | 15%    | AI judges domain + seniority fit (0–100)                           |
| **ATS score**            | 20%    | The Gemini ATS "roast" score for that resume version               |

**Why skill match dominates:** that's literally what a recruiter screens on. ATS is 20% because
presentation gates whether a human ever _sees_ the resume — but it must not outweigh actual fit.

### The skill-match formula (this is the one they'll probe)

```
must skill  → weight 2
nice skill  → weight 1
direct match        → credit 1.0
transferable match  → credit 0.8

Skill Match % = Σ(weight × credit) / Σ(weight) × 100
```

- A missing **must** skill hurts **twice** as much as a missing nice skill.
- A **transferable** match gets 80% — Express genuinely covers "Node.js backend", but it isn't the
  same as having it directly.
- If the JD has zero required skills → 0 (we don't guess).

### Two important design decisions to defend

- **No ATS score yet → counts as 0, not "ignored."** Otherwise a student could look "ready" simply
  by never being scored. The breakdown _shows_ the zero so it's obvious why.
- **Bands:** ≥80 **Interview-ready** · ≥65 **Strong** · ≥45 **Developing** · <45 **Early**.
  Same vocabulary in the ring colour, the placement-cell chart, and the recruiter view.

### "Does readiness work without a JD?"

Yes — **Resume Baseline**. With no JD, we synthesize an _implicit_ target role: we vote on which
role the resume most resembles (frontend / backend / fullstack / data / ml / mobile / devops /
testing / general — 9 entries, each with must & nice skills), then score against that.
It is tagged `source: "resume_baseline"` and **never** returned by a per-JD query — so a student can
never believe they were scored for a real posting they weren't.

---

## 3. "Why not just compare skill keywords with a string match?"

Because it's wrong in both directions:

- **False gaps:** "ReactJS" vs "React", "Node js" vs "Node.js"
- **False credit:** "Java" vs "JavaScript" — these must **never** be merged. Over-crediting inflates
  a student's readiness, which is far more damaging than missing a synonym. Our alias seed is
  deliberately conservative for exactly this reason.

So there are **three layers**:

1. Alias normalization (fast, deterministic, in-process — zero DB round-trips)
2. **Semantic AI match** — and critically, the AI sees the _whole resume context_ (projects,
   experience bullets), not just the skills array. A resume listing "Express" whose project says
   _"built a Node.js REST API"_ genuinely covers the JD's Node.js requirement.
3. **Deterministic fallback** if AI is down — exact + alias matching, flagged `degraded: true` so the
   UI says "approximate" instead of presenting a guess as an assessment.

**Guard against a lazy model:** if the AI forgets to mention a JD skill entirely, we **re-add it as
missing**. A model that silently drops skills would inflate the match rate.

---

## 4. "What's the roadmap feature?"

Missing skills from the readiness score → a **trackable learning plan**. Each item has a specific
title (not "Learn Docker" but what you'll be able to _do_), a **concrete self-verifiable milestone**
("A Dockerfile in your project builds and runs locally"), and a resource.

**Safety detail worth mentioning:** the AI is told to return an **empty string** rather than guess a
URL, and every URL is checked against an **allow-list of hosts** — a hallucinated link is worse than
no link. There's also a deterministic fallback roadmap using official docs (react.dev, nodejs.org,
docs.docker.com…).

**The feedback loop:** marking a roadmap item `done` fires an event → readiness is **recomputed
automatically**. That's the "system loop" — the app closes the gap between _diagnosis_ and _action_.

---

## 5. "How do you stop the AI from being slow / flaky / expensive?"

- **Multi-model fallback** (`runGemini.js` — one shared runner for _every_ AI pipeline):
  `gemini-3.6-flash → gemini-3.5-flash → gemini-3.5-flash-lite`, 2 retries per model with backoff,
  then move on. A "high demand" 503 on one model is invisible to the user.
- **Content-hash caching.** Readiness caches on `sha256(versionId + updatedAt + jdId + updatedAt +
rawText length)`. If neither the resume nor the JD changed, **no AI call at all** — the previous
  score is returned. Readiness runs most often (every rewrite, every milestone), so this is where
  caching matters.
- **Rate limiting:** analyze/readiness **5/min per user**, auth **30/15min per IP**.
- **Token accounting:** model name + prompt/response tokens are stored on every analysis, so cost per
  student is auditable.

---

## 6. "What's the data model?"

`User` → `Resume` → `ResumeVersion` (immutable snapshots) → `Analysis` (ATS score)
Plus: `JobDescription`, `ReadinessScore`, `RoadmapItem`, `StudentRoleProfile`, `InterviewSession`,
`PlacementStatus`, `Notification`, `Meeting`, `IntegrityFlag`.

**Why versions are immutable:** every score is attributable to an exact resume text. V1 upload →
V2 rewrite → V3 rewrite, each with `parentVersionId`. The dashboard shows score deltas per step.

---

## 7. Quick-fire answers

| Question                                | Answer                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which AI model?                         | Gemini via `@google/genai`, with a 3-model fallback cascade                                                                                       |
| Is the score AI-generated?              | No — the **formula** is deterministic; AI supplies 3 inputs                                                                                       |
| Where is the score shown?               | Student dashboard, recruiter view, placement-cell distribution chart                                                                              |
| Auth?                                   | JWT in an **httpOnly** cookie (never in JS/localStorage), bcrypt 12 rounds                                                                        |
| Who can see a student's data?           | Every resume/score query is scoped to `req.user._id`; recruiters only see students **passed** to their JD                                         |
| Why MongoDB?                            | Resume sections are deeply nested & variable — a document fits better than rigid tables                                                           |
| Your biggest limitation?                | No OCR (scanned PDFs rejected); AI relevance is a judgement, not ground truth                                                                     |
| How would you prove the score is right? | It's reproducible by hand from the 4 sub-scores; weights are exposed via `GET /api/readiness` (`weights` field) so they can be defended and tuned |

---

## 8. Who does what (fill in before the viva)

| Member      | Area | Key files |
| ----------- | ---- | --------- |
| **Navneet** |      |           |
| **Prince**  |      |           |
| **Preet**   |      |           |
| **Praful**  |      |           |

**Suggested split — adjust to what you actually built:**

- **Resume intelligence** — upload, PDF parse, structured parse, ATS analysis, rewrite, diff, export
  → `pdfService.js`, `structuredParser.js`, `geminiService.js`, `routes/resumes.js`
- **Readiness + matching** — skill normalization, semantic match, weighted score, baseline
  → `normalizeSkills.js`, `skillMatch.js`, `readinessScore.js`, `resumeBaseline.js`, `routes/readiness.js`
- **Roadmap + interviews** — generation, URL allow-list, milestones, question generation, scoring
  → `roadmapGen.js`, `interviewService.js`, `routes/roadmap.js`, `routes/interviews.js`
- **Platform** — auth, colleges, placement cell, recruiter, notifications, frontend
  → `shared/auth/*`, `routes/placementCell.js`, `routes/recruiter.js`, `frontend/client/src`

---

## 9. Three soundbites to memorise

1. **On parsing:** "PDF text is not structured, so we extract deterministically and structure with a
   schema-constrained AI call that we validate with Zod before saving."
2. **On scoring:** "The score is arithmetic, not a model's opinion — 45% skill match, 20% projects,
   15% experience, 20% ATS, with must-have skills counting double."
3. **On honesty:** "Every AI feature has a deterministic fallback and a visible 'degraded' flag — we
   would rather tell a student the result is approximate than dress up a guess as an assessment."
