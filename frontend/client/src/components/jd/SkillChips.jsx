import { motion } from "framer-motion";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

/**
 * SkillChip — one parsed skill, styled identically to the analysis
 * KeywordChips so a skill looks the same everywhere in JobSync.
 *
 * `importance` controls the visual weight: a must-have reads as an accent
 * badge, a nice-to-have as an outline, so a student can see at a glance what
 * actually matters for the role.
 */
export function SkillChip({
  label,
  importance = "must",
  className,
  index = 0,
}) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.2,
        delay: Math.min(index * 0.02, 0.4),
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <Badge
        tone={importance === "must" ? "accent" : "neutral"}
        className={cn("text-[11px] font-medium", className)}
      >
        {label}
      </Badge>
    </motion.span>
  );
}

/** A row of skill chips with an optional legend. */
export function SkillChips({ skills = [], empty = "No skills parsed" }) {
  if (!skills.length) {
    return <span className="text-xs text-[var(--ink-muted)]">{empty}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map((s, i) => (
        <SkillChip
          key={`${s.name || s}-${i}`}
          label={s.label || s.name || s}
          importance={s.importance || "must"}
          index={i}
        />
      ))}
    </div>
  );
}

/** Small legend explaining the two chip weights. */
export function SkillLegend({ className }) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 text-[11px] text-[var(--ink-muted)]",
        className,
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> Required
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full border border-[var(--border)] bg-[var(--surface)]" />
        Nice to have
      </span>
    </div>
  );
}

export default SkillChips;
