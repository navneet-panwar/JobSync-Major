import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, Loader2, Search, X } from "lucide-react";
import { collegeDirectoryApi } from "@/api/recruiter";
import { cn } from "@/lib/utils";

/**
 * CollegePicker — a searchable college selector.
 *
 * The previous version rendered every college as a pill in a scroll box, which
 * becomes unusable past a handful of campuses and gives no way to confirm what
 * you picked. This is a proper combobox: type to filter, click to choose, and
 * the selection is shown as a single removable chip.
 *
 * Search is server-side (`?q=`) with a short debounce, so it stays correct as
 * the platform's college list grows rather than filtering a pre-fetched array.
 */
export function CollegePicker({ value, onChange, error }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const boxRef = useRef(null);

  // Debounce so typing "gnio" is one request, not four.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: colleges = [], isLoading } = useQuery({
    queryKey: ["college-directory", debounced],
    queryFn: () => collegeDirectoryApi.list(debounced || undefined),
    staleTime: 60_000,
  });

  // Close on an outside click — a dropdown that only closes via its own button
  // traps the user.
  useEffect(() => {
    function onDown(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const selected = useMemo(
    () => colleges.find((c) => c._id === value) || null,
    [colleges, value],
  );

  // The chosen college may not be in the current (filtered) result set, so keep
  // its name from when it was picked rather than losing the label on re-search.
  const [selectedName, setSelectedName] = useState("");
  useEffect(() => {
    if (selected) setSelectedName(selected.name);
  }, [selected]);

  if (value) {
    return (
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-2">
          College
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-4 py-3">
          <span className="flex items-center gap-2 min-w-0">
            <Building2
              size={14}
              className="text-[var(--accent-strong)] shrink-0"
            />
            <span className="text-sm font-medium text-[var(--accent-strong)] truncate">
              {selectedName || "Selected college"}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange("");
              setSelectedName("");
              setQuery("");
            }}
            className="h-7 w-7 rounded-full flex items-center justify-center text-[var(--accent-strong)] hover:bg-white/40 transition-colors shrink-0"
            aria-label="Change college"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-2">
        College
      </div>

      <div className="relative">
        <Search
          size={15}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none"
        />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search colleges by name…"
          className={cn(
            "w-full h-11 rounded-2xl border bg-[var(--surface)] pl-10 pr-4 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]/60 outline-none transition-all duration-200",
            error
              ? "border-[var(--danger)]/50 focus:border-[var(--danger)] focus:ring-4 focus:ring-[var(--danger)]/10"
              : "border-[var(--border)] focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10",
          )}
        />
      </div>

      {open && (
        <div className="absolute z-50 mt-2 w-full max-h-64 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-hover">
          {isLoading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-[var(--ink-muted)]">
              <Loader2 size={13} className="animate-spin" /> Searching…
            </div>
          ) : colleges.length === 0 ? (
            <div className="px-4 py-3 text-xs text-[var(--ink-muted)]">
              {debounced
                ? `No college matches "${debounced}".`
                : "No colleges are registered on JobSync yet."}
            </div>
          ) : (
            colleges.map((c) => (
              <button
                key={c._id}
                type="button"
                onClick={() => {
                  onChange(c._id);
                  setSelectedName(c.name);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[var(--surface-2)] transition-colors"
              >
                <span className="h-7 w-7 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] flex items-center justify-center shrink-0">
                  <Building2 size={12} />
                </span>
                <span className="text-sm text-[var(--ink)] truncate">
                  {c.name}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {error && (
        <p className="text-[11px] text-[var(--danger)] mt-1.5">{error}</p>
      )}
    </div>
  );
}

export default CollegePicker;
