import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { SectionHeader } from "./FeaturesSection";

const TESTIMONIALS = [
  {
    quote:
      "I applied to eleven companies and heard nothing. JobSync told me my readiness for a backend role was 48% and exactly which four skills were dragging it down. Three months on the roadmap and I cleared the Infosys drive.",
    name: "Priya Raman",
    role: "Final year, CSE",
    company: "GNIOT Greater Noida",
    initials: "PR",
  },
  {
    quote:
      "We used to guess who was ready by looking at resumes. Now we see 214 students' readiness in one table, tag the ones who need a DSA bootcamp, and pass only the strong ones to the recruiter.",
    name: "Anil Deshpande",
    role: "Training & Placement Officer",
    company: "KCC Institute",
    initials: "AD",
  },
  {
    quote:
      "The mock interview pulled a question straight from a project on my own resume. It was uncomfortable in the best way — I fixed the answer before the real interview.",
    name: "Sofia Ruiz",
    role: "Final year, IT",
    company: "GNIOT Greater Noida",
    initials: "SR",
  },
  {
    quote:
      "As a recruiter I usually get a folder of unvetted resumes. Here I get the students the college has actually approved, ranked by how ready they are for my specific role.",
    name: "Marcus Chen",
    role: "Engineering Hiring Lead",
    company: "Campus recruiting",
    initials: "MC",
  },
  {
    quote:
      "The roadmap is what made it click for my students. 'You're missing Docker, here's a free course, here's how you'll know you're done' beats a score with no next step.",
    name: "Aisha Hassan",
    role: "Placement Coordinator",
    company: "GNIOT Greater Noida",
    initials: "AH",
  },
  {
    quote:
      "Knowing our college's data is genuinely separate from every other college's is the reason we could roll this out across departments.",
    name: "Rajesh Menon",
    role: "Head, Career Services",
    company: "KCC Institute",
    initials: "RM",
  },
];

export function TestimonialsSection() {
  return (
    <section
      className="px-3 sm:px-6 mt-28 sm:mt-36"
      style={{ maxWidth: 1240, marginLeft: "auto", marginRight: "auto" }}
    >
      <SectionHeader
        eyebrow="From the campuses"
        title={<>Used by students, cells and recruiters.</>}
        sub="The same loop, seen from all three sides of a placement season."
      />

      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {TESTIMONIALS.map((t, i) => (
          <motion.div
            key={t.name}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: (i % 3) * 0.05 }}
            className="rounded-[22px] bg-[var(--surface)] border border-[var(--border)] shadow-card hover:shadow-hover transition-all p-5 sm:p-6 flex flex-col"
          >
            <div className="flex gap-0.5 text-[var(--accent)] mb-3">
              {Array.from({ length: 5 }).map((_, k) => (
                <Star key={k} size={13} fill="currentColor" strokeWidth={0} />
              ))}
            </div>
            <p className="text-[14px] text-[var(--ink)] leading-relaxed flex-1">
              "{t.quote}"
            </p>
            <div className="flex items-center gap-3 mt-5 pt-4 border-t border-[var(--border)]">
              <div className="h-9 w-9 rounded-full bg-[var(--accent-strong)] text-white flex items-center justify-center font-display text-[12px] font-semibold tabular">
                {t.initials}
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[var(--ink)] truncate">
                  {t.name}
                </div>
                <div className="text-[11px] text-[var(--ink-muted)] truncate">
                  {t.role} · {t.company}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
