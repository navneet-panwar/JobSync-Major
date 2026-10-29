import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Target,
  Route,
  Mic,
  Briefcase,
  ShieldCheck,
  FileText,
  Users,
  GraduationCap,
  Building2,
} from "lucide-react";

/**
 * The platform, told as three audiences rather than eight feature cards.
 *
 * Eight cards each carrying a dense mockup was a wall, not a story: a visitor
 * could not tell whose problem any of it solved. Each audience now gets ONE
 * focused panel — the student journey, the placement cell's controls, the
 * recruiter's gated pool — and the panels swap with an animated tab.
 */
const AUDIENCES = [
  {
    key: "students",
    tab: "For students",
    icon: GraduationCap,
    headline: "Know exactly how ready you are",
    blurb:
      "Not a vague resume score — a readiness number for a real role, the gaps behind it, and the plan to close them.",
    points: [
      {
        icon: Target,
        title: "Readiness Score",
        desc: "Skill fit, project and experience relevance, and resume quality in one weighted number.",
      },
      {
        icon: Route,
        title: "Personal Roadmap",
        desc: "Every missing skill becomes a milestone with a free resource and a clear 'done when'.",
      },
      {
        icon: Mic,
        title: "Mock Interview",
        desc: "Questions built from your own resume, with written feedback on every answer.",
      },
    ],
    visual: "readiness",
  },
  {
    key: "cells",
    tab: "For placement cells",
    icon: Building2,
    headline: "Your whole cohort, one honest view",
    blurb:
      "Live readiness across every student you registered, with the tags and analytics to act on it — and a hard boundary around your college.",
    points: [
      {
        icon: Users,
        title: "Cohort Dashboard",
        desc: "Readiness, status tags and training groups for every student in your college.",
      },
      {
        icon: ShieldCheck,
        title: "Gatekeeping",
        desc: "You decide which students a recruiter may see, for which role. Nobody skips the gate.",
      },
      {
        icon: Building2,
        title: "College-Scoped",
        desc: "Another college's students are unreachable — enforced in the database, not the UI.",
      },
    ],
    visual: "cohort",
  },
  {
    key: "recruiters",
    tab: "For recruiters",
    icon: Briefcase,
    headline: "Only vetted, ranked candidates",
    blurb:
      "Post a role to a campus and receive the students its placement cell has approved — already ranked by readiness for that exact role.",
    points: [
      {
        icon: Briefcase,
        title: "Post to a Campus",
        desc: "Drop a job description, pick the college, and the AI extracts the required skills.",
      },
      {
        icon: Users,
        title: "Ranked Shortlist",
        desc: "Every approved candidate scored and ordered for this role — no unvetted pool to sift.",
      },
      {
        icon: FileText,
        title: "Full Context",
        desc: "Matched and missing skills, readiness breakdown, and the college tag on every profile.",
      },
    ],
    visual: "pipeline",
  },
];

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="relative px-3 sm:px-6 mt-18 sm:mt-36"
      style={{ maxWidth: 1240, marginLeft: "auto", marginRight: "auto" }}
    >
      {/* Atmospheric sage glow behind the section header */}
      <div
        aria-hidden
        className="absolute -top-20 left-1/2 -translate-x-1/2 w-[900px] h-[480px] pointer-events-none -z-10"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(143,179,156,0.18) 0%, rgba(143,179,156,0.06) 35%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <SectionHeader
        eyebrow="The platform"
        title={
          <>
            One system for students,
            <br className="hidden sm:block" /> placement cells and{" "}
            <span
              style={{
                backgroundImage:
                  "linear-gradient(120deg, #5B7C6A 0%, #2F4A3A 60%, #5B7C6A 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                color: "transparent",
              }}
            >
              recruiters.
            </span>
          </>
        }
        sub="JobSync runs the whole loop: measure readiness, close the gaps, prove it in an interview, and get seen by the right recruiter — through your placement cell."
      />

      <AudienceSwitcher />
    </section>
  );
}

/**
 * The audience switcher — three tabs, one animated panel.
 *
 * A tab rather than three stacked sections: the visitor reads ONE audience's
 * story at a time, and the shared mockup column keeps the page from growing
 * into a scroll marathon. The panel cross-fades and the visual slides in from
 * the side it logically belongs to, so switching feels like turning a page.
 */
function AudienceSwitcher() {
  const [active, setActive] = useState("students");
  const current = AUDIENCES.find((a) => a.key === active) || AUDIENCES[0];

  return (
    <div className="mt-14">
      {/* Tabs */}
      <div className="flex justify-center">
        <div className="inline-flex flex-wrap justify-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-card">
          {AUDIENCES.map((a) => {
            const Icon = a.icon;
            const isActive = a.key === active;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => setActive(a.key)}
                className={`relative inline-flex items-center gap-2 h-10 px-4 sm:px-5 rounded-full text-[13px] font-medium transition-colors duration-200 ${
                  isActive
                    ? "text-[var(--bg)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="audience-pill"
                    className="absolute inset-0 rounded-full bg-[var(--ink)] shadow-card"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon size={14} className="relative" />
                <span className="relative">{a.tab}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* The panel */}
      <div className="mt-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center"
          >
            {/* Copy column */}
            <div>
              <h3 className="font-display text-[26px] sm:text-[32px] leading-tight tracking-tight text-[var(--ink)]">
                {current.headline}
              </h3>
              <p className="text-[15px] text-[var(--ink-muted)] mt-3 leading-relaxed max-w-[520px]">
                {current.blurb}
              </p>

              <ul className="mt-8 space-y-5">
                {current.points.map((p, i) => {
                  const Icon = p.icon;
                  return (
                    <motion.li
                      key={p.title}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        duration: 0.35,
                        delay: 0.1 + i * 0.08,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className="flex items-start gap-3.5"
                    >
                      <span
                        className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 text-[var(--accent-strong)]"
                        style={{
                          background:
                            "linear-gradient(135deg, #EEF5EF 0%, #D9E7DD 100%)",
                          boxShadow:
                            "inset 0 1px 0 0 rgba(255,255,255,0.7), 0 1px 2px rgba(47,74,58,0.06)",
                        }}
                      >
                        <Icon size={15} strokeWidth={2.25} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-semibold text-[var(--ink)]">
                          {p.title}
                        </span>
                        <span className="block text-[13px] text-[var(--ink-muted)] mt-0.5 leading-relaxed">
                          {p.desc}
                        </span>
                      </span>
                    </motion.li>
                  );
                })}
              </ul>
            </div>

            {/* Visual column — the one mockup for this audience */}
            <motion.div
              initial={{ opacity: 0, x: 16, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="relative"
            >
              {/* Soft sage glow behind the mockup */}
              <div
                aria-hidden
                className="absolute -inset-6 rounded-[40px] pointer-events-none -z-10"
                style={{
                  background:
                    "radial-gradient(ellipse at center, rgba(143,179,156,0.20) 0%, rgba(143,179,156,0.05) 45%, transparent 72%)",
                  filter: "blur(28px)",
                }}
              />
              <div
                className="rounded-[26px] border border-[var(--border)] shadow-hover p-5 sm:p-6"
                style={{
                  background:
                    "linear-gradient(180deg, #FFFFFF 0%, #FBFBF7 100%)",
                }}
              >
                <AudienceVisual kind={current.visual} />
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Route the panel's visual to the right mockup. */
function AudienceVisual({ kind }) {
  if (kind === "cohort") {
    return (
      <div className="space-y-4">
        <CohortPreview />
        <IsolationPreview />
      </div>
    );
  }
  if (kind === "pipeline") {
    return (
      <div className="space-y-4">
        <PipelinePreview />
        <GatePreview />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <ReadinessPreview />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <RoadmapPreview />
        <InterviewPreview />
      </div>
    </div>
  );
}

export function SectionHeader({ eyebrow, title, sub, center = true }) {
  return (
    <div className={center ? "text-center max-w-3xl mx-auto" : "max-w-3xl"}>
      {eyebrow && (
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] text-[11px] font-semibold uppercase tracking-[0.12em]">
          {eyebrow}
        </div>
      )}
      <h2 className="font-display text-[34px] sm:text-[44px] lg:text-[52px] leading-[1.05] tracking-tight text-[var(--ink)] mt-4">
        {title}
      </h2>
      {sub && (
        <p className="text-[15px] sm:text-base text-[var(--ink-muted)] mt-4 leading-relaxed">
          {sub}
        </p>
      )}
    </div>
  );
}

/* ---------------- mini previews ---------------- */
/* ---------------- mini previews ----------------
 *
 * Each preview shows the REAL shape of the product, not a generic mockup:
 * the readiness ring and its four weighted contributors, a roadmap milestone,
 * an interview question, the cohort table, the isolation rule, the gate, and
 * the recruiter pipeline. The landing page should teach the product.
 */

function ReadinessPreview() {
  const bars = [
    { label: "Skill match", weight: "45%", value: 78 },
    { label: "Project relevance", weight: "20%", value: 64 },
    { label: "Experience relevance", weight: "15%", value: 55 },
    { label: "Resume quality", weight: "20%", value: 86 },
  ];
  return (
    <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-4">
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--ink-muted)] font-semibold">
            Readiness · Backend Engineer
          </div>
          <div className="font-display tabular text-[26px] font-semibold tracking-tight">
            71<span className="text-sm text-[var(--ink-muted)]">/100</span>
          </div>
        </div>
        <div className="text-[10px] text-[var(--success)] bg-[var(--accent-soft)] px-2 py-0.5 rounded-full font-semibold tabular">
          +12 this month
        </div>
      </div>
      <div className="space-y-2.5">
        {bars.map((b, i) => (
          <div key={b.label}>
            <div className="flex justify-between text-[11px] text-[var(--ink-muted)] mb-1">
              <span>
                {b.label}
                <span className="ml-1 text-[9px] opacity-70">{b.weight}</span>
              </span>
              <span className="tabular text-[var(--ink)] font-semibold">
                {b.value}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--surface)] overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${b.value}%` }}
                viewport={{ once: true }}
                transition={{
                  duration: 0.9,
                  delay: 0.1 + i * 0.08,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong)]"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoadmapPreview() {
  const items = [
    { skill: "Docker", state: "done" },
    { skill: "System design", state: "active" },
    { skill: "Redis", state: "todo" },
  ];
  return (
    <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wide text-[var(--ink-muted)] font-semibold">
          Roadmap · 2 of 5 done
        </div>
        <div className="text-[10px] tabular text-[var(--accent-strong)] font-semibold">
          40%
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface)] overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: "40%" }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="h-full rounded-full bg-[var(--accent)]"
        />
      </div>
      <div className="space-y-2">
        {items.map((it) => (
          <div
            key={it.skill}
            className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 ${
              it.state === "active"
                ? "bg-[var(--accent-soft)]"
                : "bg-[var(--surface)] border border-[var(--border)]"
            }`}
          >
            <span
              className={`h-3.5 w-3.5 rounded-full flex items-center justify-center shrink-0 ${
                it.state === "done"
                  ? "bg-[var(--accent)] text-white"
                  : it.state === "active"
                    ? "border-2 border-[var(--accent)]"
                    : "border border-[var(--border)]"
              }`}
            >
              {it.state === "done" && (
                <svg viewBox="0 0 10 10" className="h-2 w-2">
                  <path
                    d="M1 5 L4 8 L9 2"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </span>
            <span
              className={`text-[11px] ${
                it.state === "done"
                  ? "text-[var(--ink-muted)] line-through"
                  : "text-[var(--ink)] font-medium"
              }`}
            >
              {it.skill}
            </span>
            {it.state === "active" && (
              <span className="ml-auto text-[9px] uppercase tracking-wide text-[var(--accent-strong)] font-semibold">
                in progress
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function InterviewPreview() {
  return (
    <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-4 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] flex items-center justify-center shrink-0">
          <Mic size={10} />
        </div>
        <span className="text-[10px] uppercase tracking-wide text-[var(--ink-muted)] font-semibold">
          Question 2 of 5
        </span>
      </div>
      <div className="text-[12px] text-[var(--ink)] leading-snug font-medium">
        Your payments API handled 4M requests a day — how did you find and fix the
        slow endpoint?
      </div>
      <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-2.5">
        <div className="text-[9px] uppercase tracking-wide text-[var(--accent-strong)] font-semibold mb-1">
          Feedback
        </div>
        <div className="text-[11px] text-[var(--ink-muted)] leading-snug">
          Good structure. Add the actual p99 numbers you measured.
        </div>
      </div>
    </div>
  );
}

function CohortPreview() {
  const rows = [
    { name: "A. Sharma", score: 82, status: "Referred" },
    { name: "R. Iyer", score: 74, status: "Not reviewed" },
    { name: "K. Bose", score: 61, status: "Needs improvement" },
  ];
  return (
    <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wide text-[var(--ink-muted)] font-semibold">
          GNIOT Greater Noida · 214 students
        </div>
        <div className="text-[9px] px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] font-semibold">
          scoped to your college
        </div>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.name}
            className="flex items-center gap-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2"
          >
            <span className="h-6 w-6 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] text-[9px] font-semibold flex items-center justify-center shrink-0">
              {r.name[0]}
            </span>
            <span className="text-[11px] text-[var(--ink)] font-medium">
              {r.name}
            </span>
            <span className="ml-auto tabular text-[11px] font-semibold text-[var(--ink)]">
              {r.score}%
            </span>
            <span className="text-[9px] text-[var(--ink-muted)] w-[92px] text-right">
              {r.status}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-2.5 border-t border-[var(--border)] flex flex-wrap gap-1">
        {["DSA bootcamp", "Aptitude"].map((t) => (
          <span
            key={t}
            className="text-[9px] px-2 py-0.5 rounded-full bg-[#FBF1E2] text-[var(--warning)] font-medium"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function IsolationPreview() {
  return (
    <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-4">
      <div className="space-y-2">
        <div className="rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 px-3 py-2">
          <div className="text-[9px] uppercase tracking-wide text-[var(--accent-strong)] font-semibold">
            Your college
          </div>
          <div className="text-[11px] text-[var(--ink)] font-medium mt-0.5">
            GNIOT Greater Noida · 214 students
          </div>
        </div>
        <div className="rounded-xl bg-[var(--surface)] border border-dashed border-[var(--border)] px-3 py-2 opacity-60">
          <div className="text-[9px] uppercase tracking-wide text-[var(--ink-muted)] font-semibold">
            Another college
          </div>
          <div className="text-[11px] text-[var(--ink-muted)] mt-0.5 flex items-center gap-1.5">
            <ShieldCheck size={10} /> 0 students visible
          </div>
        </div>
      </div>
      <div className="mt-3 text-[10px] text-[var(--ink-muted)] leading-snug">
        Enforced in the database query — not just hidden in the interface.
      </div>
    </div>
  );
}

function GatePreview() {
  return (
    <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-wide text-[var(--ink-muted)] font-semibold">
            Student
          </div>
          <div className="text-[11px] text-[var(--ink)] font-medium mt-0.5">
            71% ready
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-center gap-1">
          <div className="h-7 w-7 rounded-full bg-[var(--accent)] text-white flex items-center justify-center">
            <ShieldCheck size={13} />
          </div>
          <span className="text-[8px] uppercase tracking-wide text-[var(--accent-strong)] font-semibold">
            gate
          </span>
        </div>

        <div className="flex-1 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-wide text-[var(--accent-strong)] font-semibold">
            Recruiter sees
          </div>
          <div className="text-[11px] text-[var(--ink)] font-medium mt-0.5">
            Only passed
          </div>
        </div>
      </div>
      <div className="mt-3 text-[10px] text-[var(--ink-muted)] leading-snug">
        A high score alone never reaches a recruiter — your placement cell
        decides.
      </div>
    </div>
  );
}

function PipelinePreview() {
  const rows = [
    { name: "A. Sharma", rank: 1, decision: "Shortlisted" },
    { name: "R. Iyer", rank: 2, decision: "Pending" },
  ];
  return (
    <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wide text-[var(--ink-muted)] font-semibold">
          Backend Engineer · ranked
        </div>
        <div className="text-[9px] px-2 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--ink-muted)] font-semibold">
          2 approved
        </div>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.name}
            className="flex items-center gap-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-3 py-2"
          >
            <span className="font-serif italic text-[15px] text-[var(--ink-muted)] tabular w-4">
              {r.rank}
            </span>
            <span className="text-[11px] text-[var(--ink)] font-medium">
              {r.name}
            </span>
            <span
              className={`ml-auto text-[9px] px-2 py-0.5 rounded-full font-semibold ${
                r.decision === "Shortlisted"
                  ? "bg-[var(--accent-soft)] text-[var(--success)]"
                  : "bg-[#FBF1E2] text-[var(--warning)]"
              }`}
            >
              {r.decision}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResumePreview() {
  return (
    <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-4 space-y-2">
      <div className="rounded-xl bg-[var(--surface)] border border-[var(--border)] p-2.5">
        <div className="text-[9px] uppercase tracking-wide text-[var(--ink-muted)] font-semibold mb-1">
          Before
        </div>
        <div className="text-[11px] text-[var(--ink-muted)] leading-snug line-through">
          Worked on backend stuff
        </div>
      </div>
      <div className="rounded-xl bg-[var(--accent-soft)] p-2.5">
        <div className="text-[9px] uppercase tracking-wide text-[var(--accent-strong)] font-semibold mb-1">
          After
        </div>
        <div className="text-[11px] text-[var(--ink)] leading-snug">
          Built 6 Node services handling 4.2M req/day at p99 &lt;120ms.
        </div>
      </div>
      <div className="flex items-center gap-1.5 pt-1">
        {["V1 62", "V2 78", "V3 86"].map((v, i) => (
          <span
            key={v}
            className={`flex-1 text-center text-[9px] py-1 rounded-lg tabular font-semibold ${
              i === 2
                ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                : "bg-[var(--surface)] border border-[var(--border)] text-[var(--ink-muted)]"
            }`}
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}