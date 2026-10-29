import { motion } from "framer-motion";
import { Briefcase, FileSearch, Send, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { useAuth } from "@/context/AuthContext";

/**
 * RecruiterHome — landing workspace for a recruiter account.
 * Phase 7 replaces this with the real JD + gated-candidate pipeline.
 */
export default function RecruiterHome() {
  const { user } = useAuth();

  const steps = [
    {
      icon: FileSearch,
      title: "Post a job description",
      body: "Paste or upload a JD — AI extracts the required skills.",
    },
    {
      icon: Briefcase,
      title: "See only approved candidates",
      body: "A placement cell must pass a student to your JD before they appear.",
    },
    {
      icon: Send,
      title: "Shortlist and reach out",
      body: "Rank by readiness, shortlist, and message the placement cell.",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${user?.name?.split(" ")[0] || "there"}`}
        description="Your recruiting workspace — built on candidates approved by their college placement cells."
      />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        <Card padding="lg">
          <CardHeader>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles size={16} className="text-[var(--accent-strong)]" />
                How JobSync recruiting works
              </CardTitle>
              <CardDescription className="mt-1">
                Unlike a plain job board, every candidate you see has been
                vetted by their institution.
              </CardDescription>
            </div>
          </CardHeader>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {steps.map(({ icon: Icon, title, body }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.25,
                  delay: i * 0.06,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4"
              >
                <span className="h-8 w-8 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] flex items-center justify-center">
                  <Icon size={15} />
                </span>
                <div className="font-display text-sm font-semibold mt-3">
                  {title}
                </div>
                <p className="text-xs text-[var(--ink-muted)] mt-1 leading-relaxed">
                  {body}
                </p>
              </motion.div>
            ))}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
