import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Map as MapIcon,
  Loader2,
  Check,
  Circle,
  PlayCircle,
  ExternalLink,
  Sparkles,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useJobDescriptions } from "@/hooks/useJobDescriptions";
import { ResumeVersionPicker } from "@/components/student/ResumeVersionPicker";
import {
  useRoadmap,
  useGenerateRoadmap,
  useRoadmapStatus,
} from "@/hooks/useRoadmap";
import { useLatestReadiness } from "@/hooks/useReadiness";
import { roadmapApi } from "@/api/roadmap";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/context/UIContext";
import { cn } from "@/lib/utils";

const STATUS_META = {
  not_started: { label: "Not started", tone: "neutral", icon: Circle },
  in_progress: { label: "In progress", tone: "accent", icon: PlayCircle },
  done: { label: "Done", tone: "success", icon: Check },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "not_started", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "done", label: "Done" },
];

function RoadmapItemCard({ item, onStatus, onDelete, index }) {
  const meta = STATUS_META[item.status] || STATUS_META.not_started;
  const isDone = item.status === "done";

  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        delay: Math.min(index * 0.05, 0.4),
        ease: [0.16, 1, 0.3, 1],
      }}
      className="relative"
    >
      {/* Timeline node */}
      <span
        className={cn(
          "absolute -left-[34px] top-5 h-7 w-7 rounded-full flex items-center justify-center ring-4 ring-[var(--bg)] transition-colors duration-300",
          isDone
            ? "bg-[var(--accent)] text-white"
            : item.status === "in_progress"
              ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
              : "bg-[var(--surface-2)] text-[var(--ink-muted)] border border-[var(--border)]",
        )}
      >
        {isDone ? (
          <Check size={13} strokeWidth={3} />
        ) : item.status === "in_progress" ? (
          <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
        ) : (
          <Circle size={9} />
        )}
      </span>

      <Card padding="lg" className="ml-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                tone={item.importance === "must" ? "accent" : "neutral"}
                className="text-[10px]"
              >
                {item.skillLabel || item.skill}
              </Badge>
              <Badge tone={meta.tone} className="text-[10px]">
                {meta.label}
              </Badge>
              {item.importance === "must" && (
                <span className="text-[10px] uppercase tracking-wider text-[var(--danger)] font-semibold">
                  required by role
                </span>
              )}
            </div>

            <h3
              className={cn(
                "font-display text-[15px] font-semibold mt-2.5 leading-snug transition-all duration-300",
                isDone
                  ? "text-[var(--ink-muted)] line-through"
                  : "text-[var(--ink)]",
              )}
            >
              {item.title}
            </h3>

            {item.description && !isDone && (
              <p className="text-xs text-[var(--ink-muted)] mt-1.5 leading-relaxed">
                {item.description}
              </p>
            )}

            {item.milestone && (
              <div className="mt-3 flex items-start gap-2 rounded-2xl bg-[var(--surface-2)] px-3.5 py-2.5">
                <Sparkles
                  size={12}
                  className="text-[var(--accent-strong)] mt-0.5 shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
                    Done when
                  </div>
                  <div className="text-xs text-[var(--ink)] mt-0.5 leading-relaxed">
                    {item.milestone}
                  </div>
                </div>
              </div>
            )}

            {item.resource?.url && (
              <a
                href={item.resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-[var(--accent-strong)] font-medium mt-3 hover:underline"
              >
                {item.resource.label || "Open resource"}
                <ExternalLink size={11} />
              </a>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              title="Delete milestone"
              onClick={() => onDelete(item)}
              className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:bg-[#F8E3E0] hover:text-[var(--danger)] transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Status control — three pills, one click each */}
        <div className="flex items-center gap-1.5 mt-4 pt-4 border-t border-[var(--border)]">
          {["not_started", "in_progress", "done"].map((s) => {
            const m = STATUS_META[s];
            const Icon = m.icon;
            const active = item.status === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => !active && onStatus(item, s)}
                className={cn(
                  "inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-medium transition-all duration-200 active:scale-[0.97]",
                  active
                    ? s === "done"
                      ? "bg-[var(--accent)] text-white"
                      : s === "in_progress"
                        ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                        : "bg-[var(--surface-2)] text-[var(--ink)] border border-[var(--border)]"
                    : "text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]",
                )}
              >
                <Icon size={12} />
                {m.label}
              </button>
            );
          })}
        </div>
      </Card>
    </motion.li>
  );
}

export default function Roadmap() {
  const [params, setParams] = useSearchParams();
  const [jdId, setJdId] = useState(params.get("jdId") || "");
  const [versionId, setVersionId] = useState("");
  const [filter, setFilter] = useState("all");
  const qc = useQueryClient();
  const toast = useToast();

  const { data: jdData, isLoading: jdLoading } = useJobDescriptions();
  const jds = jdData?.jds || [];

  // No auto-pick of the first JD: "" is a real choice — the resume baseline —
  // and is the only view available before any posting exists.
  const isBaseline = !jdId;

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (jdId) next.set("jdId", jdId);
    else next.delete("jdId");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jdId]);

  const { data, isLoading } = useRoadmap(jdId);
  // Undefined jdId = the baseline readiness the plan was built from.
  const { data: readiness } = useLatestReadiness(jdId || undefined);
  const generate = useGenerateRoadmap();
  const setStatus = useRoadmapStatus(jdId);

  const items = data?.items || [];
  const progress = data?.progress || { total: 0, done: 0, percent: 0 };

  const visible =
    filter === "all" ? items : items.filter((i) => i.status === filter);

  async function onDelete(item) {
    try {
      await roadmapApi.remove(item._id);
      qc.invalidateQueries({ queryKey: ["roadmap"] });
      toast.success("Milestone removed");
    } catch (err) {
      toast.error("Couldn't remove it", err?.message);
    }
  }

  if (jdLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Roadmap"
          description="What to learn next, in order."
        />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const nothingMissing =
    readiness && readiness.skillMatch?.missing?.length === 0 && !items.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roadmap"
        description="One milestone per missing skill, ordered prerequisites-first. Tick them off as you go."
      />

      {/* Role selector — "My resume" builds the plan from the resume's own gaps */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[var(--ink-muted)] mr-1">Role:</span>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setJdId("")}
            className={cn(
              "h-8 px-3.5 rounded-full text-xs font-medium border transition-all duration-200 active:scale-[0.98]",
              isBaseline
                ? "bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent)]/40"
                : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--border)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]",
            )}
          >
            My resume
          </button>
          {jds.map((j) => (
            <button
              key={j._id}
              onClick={() => setJdId(j._id)}
              className={cn(
                "h-8 px-3.5 rounded-full text-xs font-medium border transition-all duration-200 active:scale-[0.98]",
                jdId === j._id
                  ? "bg-[var(--ink)] text-[var(--bg)] border-transparent shadow-card"
                  : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--border)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]",
              )}
            >
              {j.title}
            </button>
          ))}
        </div>
      </div>

      {/* Version picker — a roadmap is built from ONE version's gaps, so the
          student must be able to say which. */}
      <Card padding="lg">
        <ResumeVersionPicker
          value={versionId}
          onChange={setVersionId}
          label="Build this plan from"
          hint="The roadmap grows from the missing skills found when this version was scored against the role. Completed milestones are always preserved."
        />
      </Card>

      {/* Progress header */}
      {progress.total > 0 && (
        <Card padding="lg">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="font-display text-sm font-semibold text-[var(--ink)]">
                {progress.done} of {progress.total} milestones complete
              </div>
              <div className="text-xs text-[var(--ink-muted)] mt-0.5">
                {progress.inProgress > 0
                  ? `${progress.inProgress} in progress · `
                  : ""}
                {progress.notStarted} not started
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-display tabular text-2xl font-semibold text-[var(--ink)]">
                {progress.percent}%
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => generate.mutate({ jdId: jdId || undefined, versionId: versionId || undefined })}
                disabled={generate.isPending}
              >
                {generate.isPending ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Building…
                  </>
                ) : (
                  "Rebuild plan"
                )}
              </Button>
            </div>
          </div>

          <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden mt-4">
            <motion.div
              className="h-full rounded-full bg-[var(--accent)]"
              initial={{ width: 0 }}
              animate={{ width: `${progress.percent}%` }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </Card>
      )}

      {/* Filter pills */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const count =
              f.key === "all"
                ? items.length
                : items.filter((i) => i.status === f.key).length;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "h-8 px-3.5 rounded-full text-xs font-medium border transition-all duration-200",
                  filter === f.key
                    ? "bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent)]/30"
                    : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--border)] hover:text-[var(--ink)]",
                )}
              >
                {f.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* The timeline */}
      {isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={MapIcon}
          title={
            nothingMissing
              ? "You already cover every required skill"
              : "No roadmap yet for this role"
          }
          description={
            nothingMissing
              ? isBaseline
                ? "Your resume already covers the core skills for its target role — pick a posting above to plan against a specific gap."
                : "Nothing to learn for this posting — try a more demanding role, or rebuild to double-check."
              : readiness
                ? isBaseline
                  ? `Build a plan from the ${readiness.skillMatch?.missing?.length || 0} core skills your resume does not show yet for ${readiness.target?.title || "your target role"}.`
                  : `Build a plan from your ${readiness.skillMatch?.missing?.length || 0} missing skills for this role.`
                : isBaseline
                  ? "Upload a resume and we'll build a plan from what it does not cover yet."
                  : "Run a readiness check for this role first — the roadmap grows from your missing skills."
          }
          action={
            <Button
              variant="accent"
              onClick={() => generate.mutate({ jdId: jdId || undefined, versionId: versionId || undefined })}
              disabled={generate.isPending || !readiness}
            >
              {generate.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Building…
                </>
              ) : (
                "Generate roadmap"
              )}
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={MapIcon}
          title="Nothing in this filter"
          description="Try a different status filter."
        />
      ) : (
        <div className="relative pl-10">
          {/* The connecting spine */}
          <span
            aria-hidden
            className="absolute left-[13px] top-6 bottom-6 w-px bg-[var(--border)]"
          />
          <ul className="space-y-4">
            <AnimatePresence initial={false}>
              {visible.map((item, i) => (
                <RoadmapItemCard
                  key={item._id}
                  item={item}
                  index={i}
                  onStatus={(it, s) =>
                    setStatus.mutate({ itemId: it._id, status: s })
                  }
                  onDelete={onDelete}
                />
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}
    </div>
  );
}
