import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, ChevronDown, Sparkles } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

/**
 * SkillMatchPanel — matched vs missing, side by side.
 *
 * The single most useful thing on the page for a student: "here is what you
 * have, here is what this role wants and you don't have". Missing must-haves
 * are visually separated from missing nice-to-haves, because a student with
 * limited time should fix the musts first.
 */
export function SkillMatchPanel({ skillMatch }) {
  const [showExtra, setShowExtra] = useState(false);

  const matched = skillMatch?.matched || [];
  const missing = skillMatch?.missing || [];
  const extra = skillMatch?.extra || [];

  const missingMust = missing.filter((m) => m.importance !== "nice");
  const missingNice = missing.filter((m) => m.importance === "nice");

  return (
    <Card padding="lg" className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Skill match</CardTitle>
            <CardDescription className="mt-1">
              {matched.length} matched · {missing.length} missing
            </CardDescription>
          </div>
          <Badge
            tone={
              skillMatch?.percent >= 65
                ? "success"
                : skillMatch?.percent >= 40
                  ? "warning"
                  : "danger"
            }
          >
            {skillMatch?.percent ?? 0}%
          </Badge>
        </div>
      </CardHeader>

      {skillMatch?.degraded && (
        <div className="mb-4 rounded-2xl bg-[#FBF1E2] px-4 py-2.5 text-[11px] text-[var(--warning)] leading-relaxed">
          AI matching was unavailable — this is exact skill-name matching only,
          so it may under-count skills you genuinely have under a different
          name. Try again shortly.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* MATCHED */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="h-5 w-5 rounded-full bg-[var(--accent-soft)] text-[var(--success)] flex items-center justify-center">
              <Check size={11} strokeWidth={3} />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
              You have
            </span>
          </div>

          {matched.length === 0 ? (
            <p className="text-xs text-[var(--ink-muted)]">
              None of the required skills matched.
            </p>
          ) : (
            <ul className="space-y-2">
              {matched.map((m, i) => (
                <motion.li
                  key={`${m.jdSkill}-${i}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.4) }}
                  className="flex items-start gap-2"
                >
                  <span className="text-[var(--success)] mt-0.5 shrink-0">
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm text-[var(--ink)] flex items-center gap-1.5 flex-wrap">
                      {m.jdSkill}
                      {m.strength === "transferable" && (
                        <Badge tone="neutral" className="text-[9px] py-0">
                          via related tech
                        </Badge>
                      )}
                    </div>
                    {m.evidence && (
                      <div className="text-[11px] text-[var(--ink-muted)] mt-0.5 leading-snug line-clamp-2">
                        {m.evidence}
                      </div>
                    )}
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </div>

        {/* MISSING */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="h-5 w-5 rounded-full bg-[#F8E3E0] text-[var(--danger)] flex items-center justify-center">
              <X size={11} strokeWidth={3} />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
              Gaps to close
            </span>
          </div>

          {missing.length === 0 ? (
            <p className="text-xs text-[var(--success)] font-medium">
              You cover every required skill. 🎯
            </p>
          ) : (
            <div className="space-y-4">
              {missingMust.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--danger)] font-semibold mb-1.5">
                    Required ({missingMust.length})
                  </div>
                  <ul className="space-y-1.5">
                    {missingMust.map((m, i) => (
                      <motion.li
                        key={`must-${m.jdSkill}-${i}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.2,
                          delay: Math.min(i * 0.03, 0.4),
                        }}
                        className="text-sm text-[var(--ink)] flex items-center gap-2"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--danger)] shrink-0" />
                        {m.jdSkill}
                      </motion.li>
                    ))}
                  </ul>
                </div>
              )}

              {missingNice.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold mb-1.5">
                    Nice to have ({missingNice.length})
                  </div>
                  <ul className="space-y-1.5">
                    {missingNice.map((m, i) => (
                      <motion.li
                        key={`nice-${m.jdSkill}-${i}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.2,
                          delay: Math.min(i * 0.03, 0.4),
                        }}
                        className="text-sm text-[var(--ink-muted)] flex items-center gap-2"
                      >
                        <span className="h-1.5 w-1.5 rounded-full border border-[var(--ink-muted)] shrink-0" />
                        {m.jdSkill}
                      </motion.li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Extras — collapsed by default, they don't affect the score */}
      {extra.length > 0 && (
        <div className="mt-5 pt-4 border-t border-[var(--border)]">
          <button
            onClick={() => setShowExtra((v) => !v)}
            className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors inline-flex items-center gap-1"
          >
            <ChevronDown
              size={11}
              className={cn("transition-transform", showExtra && "rotate-180")}
            />
            Also on your resume ({extra.length}) — not needed for this role
          </button>
          <AnimatePresence>
            {showExtra && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap gap-1.5 pt-3">
                  {extra.map((s, i) => (
                    <Badge key={i} tone="neutral" className="text-[10px]">
                      {s}
                    </Badge>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {skillMatch?.summary && (
        <div className="mt-5 pt-4 border-t border-[var(--border)]">
          <div className="flex items-start gap-2">
            <Sparkles
              size={13}
              className="text-[var(--accent-strong)] mt-0.5 shrink-0"
            />
            <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
              {skillMatch.summary}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

export default SkillMatchPanel;
