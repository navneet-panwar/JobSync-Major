import { motion } from "framer-motion";
import { Check, Sparkles, Target, ArrowRight, TrendingUp } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";

function scoreTone(score) {
  if (score == null) return "neutral";
  if (score >= 8) return "success";
  if (score >= 6) return "accent";
  if (score >= 4) return "warning";
  return "danger";
}

function scoreLabel(score) {
  if (score == null) return "Not scored";
  if (score >= 8) return "Strong";
  if (score >= 6) return "Solid";
  if (score >= 4) return "Developing";
  return "Needs work";
}

/**
 * InterviewResults — per-answer feedback.
 *
 * Deliberately modelled on the ATS analysis layout (issues/strengths cards) so
 * "feedback" looks the same everywhere in JobSync, rather than being a second
 * visual language the student has to learn.
 *
 * The student is NOT shown their integrity flags here — see the note in the
 * interview page. They cannot correct what they cannot see, and surfacing them
 * mid-course only teaches evasion.
 */
export function InterviewResults({ session, onDone }) {
  const answers = session.answers || [];
  const scored = answers.filter((a) => a.feedback?.score != null);
  const average = scored.length
    ? Math.round(
        (scored.reduce((s, a) => s + a.feedback.score, 0) / scored.length) * 10,
      ) / 10
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interview feedback"
        description={
          session.targetRole
            ? `Your answers for ${session.targetRole}, with specific feedback on each.`
            : "Your answers, with specific feedback on each."
        }
      />

      {/* Summary */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        <Card padding="lg">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex-1 min-w-[260px]">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles size={16} className="text-[var(--accent-strong)]" />
                Overall
              </CardTitle>
              <p className="text-sm text-[var(--ink-muted)] mt-3 leading-relaxed">
                {session.overallSummary || "No overall summary was generated."}
              </p>
            </div>

            {average != null && (
              <div className="text-center shrink-0">
                <div className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
                  Average score
                </div>
                <div className="font-display tabular text-4xl font-semibold text-[var(--ink)] mt-1">
                  {average}
                  <span className="text-lg text-[var(--ink-muted)]">/10</span>
                </div>
                <Badge tone={scoreTone(average)} className="mt-2">
                  {scoreLabel(average)}
                </Badge>
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Per-answer cards */}
      <div className="space-y-4">
        {answers.map((a, i) => {
          const question = session.questions?.[i];
          const fb = a.feedback || {};
          return (
            <motion.div
              key={a.questionId || i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.25,
                delay: Math.min(i * 0.06, 0.4),
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <Card padding="lg">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
                      Question {i + 1}
                      {question?.focus ? ` · ${question.focus}` : ""}
                    </div>
                    <h3 className="font-display text-[15px] font-semibold text-[var(--ink)] mt-1.5 leading-snug">
                      {question?.text || "Question"}
                    </h3>
                  </div>
                  {fb.score != null && (
                    <div className="text-center shrink-0">
                      <div className="font-display tabular text-2xl font-semibold text-[var(--ink)]">
                        {fb.score}
                        <span className="text-sm text-[var(--ink-muted)]">
                          /10
                        </span>
                      </div>
                      <Badge
                        tone={scoreTone(fb.score)}
                        className="mt-1 text-[10px]"
                      >
                        {scoreLabel(fb.score)}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* The candidate's own answer, quoted back */}
                <div className="mt-4 rounded-2xl bg-[var(--surface-2)] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold mb-1.5">
                    Your answer
                  </div>
                  <p className="text-xs text-[var(--ink)] leading-relaxed whitespace-pre-wrap">
                    {a.text?.trim() || "(no answer given)"}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                  {/* Strengths */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="h-5 w-5 rounded-full bg-[var(--accent-soft)] text-[var(--success)] flex items-center justify-center">
                        <Check size={11} strokeWidth={3} />
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                        What worked
                      </span>
                    </div>
                    {fb.strengths?.length ? (
                      <ul className="space-y-1.5">
                        {fb.strengths.map((s, j) => (
                          <li
                            key={j}
                            className="text-xs text-[var(--ink-muted)] flex gap-2 leading-relaxed"
                          >
                            <span className="text-[var(--accent)] shrink-0">
                              •
                            </span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-[var(--ink-muted)]">
                        Nothing specific noted.
                      </p>
                    )}
                  </div>

                  {/* Improvements */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="h-5 w-5 rounded-full bg-[#FBEFD9] text-[var(--warning)] flex items-center justify-center">
                        <TrendingUp size={11} strokeWidth={2.5} />
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                        What to improve
                      </span>
                    </div>
                    {fb.improvements?.length ? (
                      <ul className="space-y-1.5">
                        {fb.improvements.map((s, j) => (
                          <li
                            key={j}
                            className="text-xs text-[var(--ink-muted)] flex gap-2 leading-relaxed"
                          >
                            <span className="text-[var(--warning)] shrink-0">
                              •
                            </span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-[var(--ink-muted)]">
                        Nothing specific noted.
                      </p>
                    )}
                  </div>
                </div>

                {fb.modelAnswer && (
                  <div className="mt-5 pt-4 border-t border-[var(--border)]">
                    <div className="flex items-center gap-2 mb-2">
                      <Target
                        size={12}
                        className="text-[var(--accent-strong)]"
                      />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                        A strong answer would
                      </span>
                    </div>
                    <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
                      {fb.modelAnswer}
                    </p>
                  </div>
                )}
              </Card>
            </motion.div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-[11px] text-[var(--ink-muted)] max-w-lg leading-relaxed">
          Feedback is generated automatically and is a starting point, not a
          verdict. Your placement cell can see this transcript if they choose to
          review it.
        </p>
        <Button variant="accent" onClick={onDone}>
          Work on these <ArrowRight size={14} />
        </Button>
      </div>
    </div>
  );
}

export default InterviewResults;
