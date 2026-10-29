import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Search, Sparkles, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * RoleCombobox — pick an existing role or create a new one, in one control.
 *
 * Recruiters post the same handful of roles repeatedly (Backend Engineer,
 * Data Analyst…), so a free-text box means the same role gets typed five ways
 * and never groups. But a pure dropdown is worse: it cannot express a role that
 * does not exist yet, which is exactly what a new posting often is.
 *
 * So: type to filter the known roles, and when nothing matches, the top row
 * becomes "Create «what you typed»". The value is the free text either way —
 * the backend normalises it to a canonical key, so "SDE" and "Software
 * Engineer" land in the same bucket.
 */
export function RoleCombobox({
  value,
  onChange,
  suggestions = [],
  label = "Role",
  hint,
  placeholder = "e.g. Backend Engineer",
  error,
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const trimmed = value.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!trimmed) return suggestions.slice(0, 8);
    return suggestions
      .filter((s) => s.label.toLowerCase().includes(trimmed))
      .slice(0, 8);
  }, [suggestions, trimmed]);

  // A role the college has never seen is the common case for a new posting, so
  // "create" is offered rather than being an error state.
  const exact = matches.some((m) => m.label.toLowerCase() === trimmed);
  const canCreate = trimmed.length >= 2 && !exact;

  return (
    <div ref={boxRef} className="relative">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-2">
        {label}
      </div>

      {hint && (
        <p className="text-[11px] text-[var(--ink-muted)] mb-2 leading-relaxed">
          {hint}
        </p>
      )}

      <div className="relative">
        <Tag
          size={14}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none"
        />
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          maxLength={80}
          className={cn(
            "w-full h-11 rounded-2xl border bg-[var(--surface)] pl-10 pr-4 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]/60 outline-none transition-all duration-200",
            error
              ? "border-[var(--danger)]/50 focus:border-[var(--danger)] focus:ring-4 focus:ring-[var(--danger)]/10"
              : "border-[var(--border)] focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10",
          )}
        />
      </div>

      {open && (matches.length > 0 || canCreate) && (
        <div className="absolute z-50 mt-2 w-full max-h-56 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-hover">
          {canCreate && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]/70 transition-colors"
            >
              <span className="h-7 w-7 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shrink-0">
                <Plus size={13} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[var(--accent-strong)] truncate">
                  Create “{value.trim()}”
                </span>
                <span className="block text-[10px] text-[var(--accent-strong)]/80">
                  New role — students who opt in will be grouped under it
                </span>
              </span>
            </button>
          )}

          {matches.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => {
                onChange(m.label);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[var(--surface-2)] transition-colors"
            >
              <span className="h-7 w-7 rounded-full bg-[var(--surface-2)] text-[var(--ink-muted)] flex items-center justify-center shrink-0">
                <Sparkles size={12} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-[var(--ink)] truncate">
                  {m.label}
                </span>
                <span className="block text-[10px] text-[var(--ink-muted)]">
                  {(m.resumeCount || 0) + (m.interestedCount || 0)} student
                  {(m.resumeCount || 0) + (m.interestedCount || 0) === 1
                    ? ""
                    : "s"}{" "}
                  already
                </span>
              </span>
              {m.label.toLowerCase() === trimmed && (
                <Check
                  size={13}
                  className="text-[var(--accent-strong)] shrink-0"
                />
              )}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="text-[11px] text-[var(--danger)] mt-1.5">{error}</p>
      )}
    </div>
  );
}

export default RoleCombobox;
