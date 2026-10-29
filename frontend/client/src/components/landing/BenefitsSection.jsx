import { motion } from "framer-motion";
import {
  Target,
  ShieldCheck,
  Route,
  Building2,
  Mic,
} from "lucide-react";
import { SectionHeader } from "./FeaturesSection";

const BENEFITS = [
  {
    icon: Target,
    title: "One number that means something",
    desc: "Not a black-box ATS score. Readiness is skill fit, project relevance, experience relevance and resume quality — weighted, explained, and reproducible by hand.",
  },
  {
    icon: Route,
    title: "A plan, not just a diagnosis",
    desc: "Every missing skill becomes a milestone with a free resource and a concrete 'done when'. Finish them and your readiness moves.",
  },
  {
    icon: ShieldCheck,
    title: "Your institution stays in control",
    desc: "A recruiter only ever sees students their placement cell has reviewed and passed for that specific role.",
  },
  {
    icon: Building2,
    title: "Private by construction",
    desc: "College scoping is enforced in the database query, so one institution can never reach another's students.",
  },
  {
    icon: Mic,
    title: "Practice before it counts",
    desc: "Mock interviews built from your own resume, with written feedback — so the real one isn't your first attempt.",
  },
];

export function BenefitsSection() {
  return (
    <section
      className="px-3 sm:px-6 mt-28 sm:mt-36"
      style={{ maxWidth: 1240, marginLeft: "auto", marginRight: "auto" }}
    >
      <SectionHeader
        eyebrow="Outcomes"
        title={<>Readiness you can act on, not just read.</>}
        sub="Know what to fix, why it matters, and who gets to see you when you're ready."
      />

      <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 sm:gap-5">
        {BENEFITS.map((b, i) => (
          <motion.div
            key={b.title}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: i * 0.05 }}
            className={`rounded-[22px] bg-[var(--surface)] border border-[var(--border)] shadow-card hover:shadow-hover transition-all p-5 sm:p-6 ${
              i === 0 ? "lg:col-span-3" : i === 1 ? "lg:col-span-3" : "lg:col-span-2"
            }`}
          >
            <div className="h-10 w-10 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)] flex items-center justify-center mb-4">
              <b.icon size={16} strokeWidth={2.25} />
            </div>
            <h3 className="font-display text-[17px] font-semibold tracking-tight text-[var(--ink)]">
              {b.title}
            </h3>
            <p className="text-[13px] text-[var(--ink-muted)] mt-1.5 leading-relaxed">
              {b.desc}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
