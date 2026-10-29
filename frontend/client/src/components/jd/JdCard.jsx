import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  MapPin,
  ChevronDown,
  RefreshCw,
  Trash2,
  Target,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SkillChips, SkillLegend } from "./SkillChips";
import { cn } from "@/lib/utils";
import { useReparseJd, useDeleteJd } from "@/hooks/useJobDescriptions";

const LEVEL_LABEL = {
  internship: "Internship",
  entry: "Entry level",
  mid: "Mid level",
  senior: "Senior",
  lead: "Lead / Staff",
  unspecified: "Level not stated",
};

const STATUS_TONE = {
  active: "accent",
  draft: "neutral",
  closed: "neutral",
};

export function JdCard({ jd, onScore, scoring }) {
  const [open, setOpen] = useState(false);
  const reparse = useReparseJd();
  const remove = useDeleteJd();

  const must =
    jd.parsed?.requiredSkills?.filter((s) => s.importance === "must") || [];
  const nice =
    jd.parsed?.requiredSkills?.filter((s) => s.importance === "nice") || [];

  return (
    <Card padding="lg" className="flex flex-col">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-display text-[15px] font-semibold text-[var(--ink)] truncate">
            {jd.title}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-[var(--ink-muted)]">
            {jd.company && (
              <span className="flex items-center gap-1.5">
                <Building2 size={12} /> {jd.company}
              </span>
            )}
            {jd.location && (
              <span className="flex items-center gap-1.5">
                <MapPin size={12} /> {jd.location}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Badge
            tone={STATUS_TONE[jd.status] || "neutral"}
            className="text-[10px]"
          >
            {jd.status}
          </Badge>
          <button
            type="button"
            title="Re-parse with AI"
            onClick={() => reparse.mutate(jd._id)}
            disabled={reparse.isPending}
            className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)] transition-colors disabled:opacity-50"
          >
            {reparse.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
          </button>
          <button
            type="button"
            title="Delete"
            onClick={() => remove.mutate(jd._id)}
            disabled={remove.isPending}
            className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:bg-[#F8E3E0] hover:text-[var(--danger)] transition-colors disabled:opacity-50"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <Badge tone="neutral" className="text-[10px]">
          {LEVEL_LABEL[jd.experienceLevel] || jd.experienceLevel}
        </Badge>
        <Badge tone="accent" className="text-[10px]">
          {jd.parsed?.requiredSkills?.length || 0} skills
        </Badge>
      </div>

      {jd.parsed?.summary && (
        <p className="text-xs text-[var(--ink-muted)] mt-3 leading-relaxed line-clamp-2">
          {jd.parsed.summary}
        </p>
      )}

      {/* Required skills — the ones that actually drive the score */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
            Required skills
          </span>
          <SkillLegend />
        </div>
        <SkillChips
          skills={[...must, ...nice].slice(0, open ? undefined : 8)}
        />
        {!open && must.length + nice.length > 8 && (
          <button
            onClick={() => setOpen(true)}
            className="text-[11px] text-[var(--accent-strong)] font-medium mt-2 hover:underline inline-flex items-center gap-1"
          >
            <ChevronDown size={11} /> {must.length + nice.length - 8} more
          </button>
        )}
      </div>

      <AnimatePresence>
        {open && jd.parsed?.responsibilities?.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Responsibilities
              </span>
              <ul className="mt-2 space-y-1.5">
                {jd.parsed.responsibilities.map((r, i) => (
                  <li
                    key={i}
                    className="text-xs text-[var(--ink-muted)] flex gap-2"
                  >
                    <span className="text-[var(--accent-strong)] shrink-0">
                      •
                    </span>
                    <span className="leading-relaxed">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center justify-between gap-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors inline-flex items-center gap-1",
          )}
        >
          <ChevronDown
            size={11}
            className={cn("transition-transform", open && "rotate-180")}
          />
          {open ? "Show less" : "Show details"}
        </button>

        {onScore && (
          <Button
            variant="accent"
            size="sm"
            onClick={() => onScore(jd)}
            disabled={scoring}
          >
            {scoring ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Scoring…
              </>
            ) : (
              <>
                <Target size={13} /> Check my readiness
              </>
            )}
          </Button>
        )}
      </div>
    </Card>
  );
}

export default JdCard;
