import { motion } from "framer-motion";
import { FileText, Target, Route, ShieldCheck, ArrowRight, Check } from "lucide-react";
import { SectionHeader } from "./FeaturesSection";

function UploadVisual() {
  return (
    <div className="relative rounded-2xl bg-gradient-to-br from-[var(--surface-2)]/60 to-[var(--surface)] border border-[var(--border)] p-4">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="absolute -inset-1 rounded-2xl bg-[var(--accent-soft)] blur-md opacity-70" />
          <div className="relative h-11 w-11 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-card flex items-center justify-center">
            <div
              className="h-7 w-7 rounded-lg flex items-center justify-center text-white"
              style={{
                background:
                  "linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)",
              }}
            >
              <FileText size={13} strokeWidth={2.4} />
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[12px] font-semibold text-[var(--ink)] truncate">
            resume_v3.pdf
          </div>
          <div className="text-[10px] text-[var(--ink-muted)] mt-0.5 tabular-nums">
            412 KB · parsing…
          </div>
        </div>
        <div className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] text-[9px] font-semibold">
          <span className="h-1 w-1 rounded-full bg-[var(--accent)] animate-pulse" />
          live
        </div>
      </div>
      <div className="mt-3 h-1 w-full rounded-full bg-[var(--surface-2)] overflow-hidden">
        <motion.div
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
          className="h-full w-1/2 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, var(--accent) 50%, transparent 100%)",
          }}
        />
      </div>
    </div>
  );
}

function AnalyzeVisual() {
  const items = [
    { label: "Resume parsed & scored", done: true },
    { label: "Role skills compared", done: true },
    { label: "Gaps mapped to a plan…", done: false },
  ];
  return (
    <div className="relative rounded-2xl bg-gradient-to-br from-[var(--surface-2)]/60 to-[var(--surface)] border border-[var(--border)] p-4">
      <div className="flex items-center gap-2 mb-3">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          className="h-4 w-4 rounded-full border-2 border-[var(--accent)] border-r-transparent"
        />
        <div className="text-[11px] font-semibold text-[var(--ink)]">
          Measuring readiness
        </div>
        <div className="ml-auto inline-flex items-center gap-1 h-5 px-2 rounded-full bg-[var(--surface-2)] text-[var(--ink-muted)] text-[9px] font-semibold tabular-nums">
          8 / 12
        </div>
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, x: -6 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.2 + i * 0.1 }}
            className="flex items-center gap-2"
          >
            <div
              className={`h-4 w-4 rounded-full flex items-center justify-center ${
                item.done
                  ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : "border border-[var(--accent)]/40"
              }`}
            >
              {item.done && <Check size={9} strokeWidth={3.5} />}
            </div>
            <div className="text-[11px] text-[var(--ink-muted)]">
              {item.label}
            </div>
          </motion.div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center justify-between">
        <div className="text-[10px] text-[var(--ink-muted)]">
          Readiness for this role
        </div>
        <div className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent-strong)] tabular-nums">
          <Target size={10} strokeWidth={2.5} />
          71 / 100
        </div>
      </div>
    </div>
  );
}

function DownloadVisual() {
  const steps = [
    { label: "Docker · done", done: true },
    { label: "System design · in progress", done: false },
  ];
  return (
    <div className="relative rounded-2xl bg-gradient-to-br from-[var(--surface-2)]/60 to-[var(--surface)] border border-[var(--border)] p-4">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)",
            }}
          >
            <ShieldCheck size={16} />
          </div>
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[12px] font-semibold text-[var(--ink)]">
            Passed to the recruiter
          </div>
          <div className="text-[10px] text-[var(--ink-muted)] mt-0.5">
            Backend Engineer · approved by your cell
          </div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-1.5">
        {steps.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <div
              className={`h-3.5 w-3.5 rounded-full flex items-center justify-center shrink-0 ${
                s.done
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--accent)]/40"
              }`}
            >
              {s.done && <Check size={8} strokeWidth={3.5} />}
            </div>
            <span className="text-[10px] text-[var(--ink-muted)]">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const STEPS = [
  {
    n: "01",
    icon: FileText,
    title: "Upload your resume",
    desc: "Drop a PDF. We parse the structure, score its quality, and pick out the roles your resume actually points at.",
    Visual: UploadVisual,
  },
  {
    n: "02",
    icon: Target,
    title: "Measure your readiness",
    desc: "Pick a real role. We compare it against your resume — skills, projects and experience — and give you one honest number with the gaps behind it.",
    Visual: AnalyzeVisual,
  },
  {
    n: "03",
    icon: Route,
    title: "Close the gaps and get seen",
    desc: "Work the roadmap, prove it in a mock interview, and when you're ready your placement cell passes you to the recruiter for that role.",
    Visual: DownloadVisual,
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative px-3 sm:px-6 mt-28 sm:mt-36"
      style={{ maxWidth: 1240, marginLeft: "auto", marginRight: "auto" }}
    >
      <SectionHeader
        eyebrow="How it works"
        title={<>From upload to recruiter-ready in&nbsp;3 steps.</>}
        sub="No prompt engineering. No ten-step funnels. Measure, improve, get passed through."
      />

      <div className="mt-16 relative grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Flowing dashed sage line behind the cards on desktop */}
        <svg
          className="hidden lg:block absolute top-[100px] left-0 right-0 w-full pointer-events-none -z-0"
          height="40"
          viewBox="0 0 1200 40"
          preserveAspectRatio="none"
          aria-hidden
        >
          <motion.path
            d="M 80 20 C 280 -20 420 60 600 20 S 920 -20 1120 20"
            fill="none"
            stroke="var(--accent)"
            strokeOpacity="0.35"
            strokeWidth="1.25"
            strokeDasharray="4 6"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>

        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const Visual = s.Visual;
          return (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{
                duration: 0.65,
                delay: i * 0.12,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="group relative"
            >
              {/* Card */}
              <div
                className="relative rounded-[28px] bg-[var(--surface)] border border-[var(--border)] shadow-card hover:shadow-hover transition-all duration-300 hover:-translate-y-1 p-7 overflow-hidden"
                style={{ minHeight: 420 }}
              >
                {/* Top accent line */}
                <div
                  className="absolute top-0 inset-x-7 h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, var(--accent) 50%, transparent)",
                    opacity: 0.5,
                  }}
                />

                {/* Massive ghost number */}
                <div
                  className="absolute -top-2 right-3 font-display text-[140px] font-bold leading-none tracking-tighter select-none pointer-events-none"
                  style={{
                    backgroundImage:
                      "linear-gradient(180deg, var(--accent-soft) 0%, transparent 75%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                    WebkitTextFillColor: "transparent",
                  }}
                  aria-hidden
                >
                  {s.n}
                </div>

                {/* Step pill */}
                <div className="relative inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] text-[10px] font-semibold uppercase tracking-wider">
                  Step {s.n}
                </div>

                {/* Icon with soft glow */}
                <div className="relative mt-6 inline-block">
                  <div className="absolute -inset-2 rounded-3xl bg-[var(--accent-soft)] blur-lg opacity-70" />
                  <div
                    className="relative h-14 w-14 rounded-2xl flex items-center justify-center text-white shadow-card"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)",
                    }}
                  >
                    <Icon size={22} strokeWidth={2} />
                  </div>
                </div>

                {/* Title */}
                <h3 className="relative font-display text-[22px] font-semibold tracking-tight text-[var(--ink)] mt-6 leading-tight">
                  {s.title}
                </h3>

                {/* Description */}
                <p className="relative text-[13.5px] text-[var(--ink-muted)] mt-2.5 leading-relaxed">
                  {s.desc}
                </p>

                {/* Visual mockup */}
                <div className="relative mt-7">
                  <Visual />
                </div>
              </div>

              {/* Arrow between cards on desktop */}
              {i < STEPS.length - 1 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.4, delay: 0.5 + i * 0.12 }}
                  className="hidden lg:flex absolute top-[112px] -right-[14px] z-10 h-7 w-7 rounded-full items-center justify-center text-white shadow-card"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)",
                  }}
                  aria-hidden
                >
                  <ArrowRight size={12} strokeWidth={2.5} />
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
