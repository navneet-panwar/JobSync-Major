import { Tag } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * StudentTagChips — the one place training tags are rendered.
 *
 * Tags must read the same everywhere (cohort row, student detail, training
 * page, role lists), so this is a single component rather than four copies of
 * the same chip markup drifting apart.
 */
export function StudentTagChips({
  tags = [],
  max,
  size = "sm",
  className,
  emptyText = null,
}) {
  const shown = max ? tags.slice(0, max) : tags;
  const overflow = max ? Math.max(0, tags.length - max) : 0;

  if (!tags.length) {
    if (!emptyText) return null;
    return (
      <span className={cn("text-[11px] text-[var(--ink-muted)]", className)}>
        {emptyText}
      </span>
    );
  }

  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)}>
      {shown.map((t) => (
        <span
          key={t}
          className={cn(
            "inline-flex items-center gap-1 rounded-full bg-[#FBF1E2] text-[var(--warning)] font-medium",
            size === "sm"
              ? "text-[10px] px-2 py-0.5"
              : "text-[11px] px-2.5 py-1",
          )}
        >
          <Tag size={size === "sm" ? 8 : 9} />
          {t}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="text-[10px] text-[var(--ink-muted)] tabular"
          title={tags.slice(shown.length).join(", ")}
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}

export default StudentTagChips;
