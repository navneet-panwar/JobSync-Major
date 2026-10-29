import { FileText, Layers } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { useResumeVersions } from "@/api/versions";
import { cn } from "@/lib/utils";

/**
 * ResumeVersionPicker — choose which resume version to work from.
 *
 * Used by both the mock interview and the roadmap, because both need the same
 * thing: "which of my resumes should this be built from?" Sharing one component
 * keeps the two flows consistent and means a student learns the control once.
 *
 * `value` is a version id; "" means "my latest" (the server's default), which is
 * offered explicitly so the common case is one glance rather than a decision.
 */
export function ResumeVersionPicker({
  value,
  onChange,
  label = "Resume version",
  hint,
  allowLatest = true,
  className,
}) {
  const { data, isLoading } = useResumeVersions();
  const versions = data?.versions || [];

  // Nothing uploaded — say so plainly rather than rendering an empty control.
  if (!isLoading && versions.length === 0) {
    return (
      <div
        className={cn("rounded-2xl bg-[var(--surface-2)] px-4 py-3", className)}
      >
        <div className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
          <FileText size={13} />
          No resume versions yet — upload a resume to get version-specific
          questions and a roadmap built from your own gaps.
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-2">
        {label}
      </div>

      {hint && (
        <p className="text-[11px] text-[var(--ink-muted)] mb-2 leading-relaxed">
          {hint}
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {allowLatest && (
            <button
              type="button"
              onClick={() => onChange("")}
              className={cn(
                "h-9 px-3.5 rounded-2xl text-xs font-medium border transition-all duration-200 active:scale-[0.98] text-left",
                value === ""
                  ? "bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent)]/40"
                  : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--border)] hover:text-[var(--ink)]",
              )}
            >
              Latest version
              <span className="block text-[10px] opacity-70 font-normal">
                whatever is most recent
              </span>
            </button>
          )}

          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onChange(v.id)}
              className={cn(
                "h-9 px-3.5 rounded-2xl text-xs font-medium border transition-all duration-200 active:scale-[0.98] text-left max-w-[220px]",
                value === v.id
                  ? "bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent)]/40"
                  : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--border)] hover:text-[var(--ink)]",
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                <Layers size={10} />
                <span className="truncate">
                  {v.resumeTitle} · V{v.versionNumber}
                </span>
              </span>
              <span className="block text-[10px] opacity-70 font-normal truncate">
                {v.label}
                {v.score != null ? ` · ATS ${v.score}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ResumeVersionPicker;
