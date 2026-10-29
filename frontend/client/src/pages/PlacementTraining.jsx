import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ClipboardList,
  Search,
  Users,
  Tag,
  UserPlus,
  CheckSquare,
  Square,
  X,
  Loader2,
  Send,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchInput } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { placementCellApi } from "@/api/placementCell";
import { useToast } from "@/context/UIContext";
import { readinessTone } from "@/components/placement/placementStatus";
import { cn } from "@/lib/utils";

/**
 * PlacementTraining — the placement cell's Training workspace.
 *
 * Answers three questions in one screen, which is why it is one page rather
 * than three:
 *   · What training is this college actually running?   → the tag vocabulary
 *   · Who is in each training group?                    → per-tag cohort
 *   · Who has no training assigned at all?              → the actionable gap
 *
 * Assigning tags here uses the SAME bulk endpoint as the cohort table, so a
 * tag applied from either place lands identically in the audit log.
 */
export default function PlacementTraining() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const [activeTag, setActiveTag] = useState(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [newTags, setNewTags] = useState("");
  const [assigning, setAssigning] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["placement-training"],
    queryFn: placementCellApi.training,
  });

  const bulk = {
    mutate: async () => {
      try {
        setAssigning(true);
        const tags = newTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        if (!tags.length) return;

        const res = await placementCellApi.bulk({
          studentIds: [...selected],
          action: "assignTrainingTag",
          tags,
        });

        qc.invalidateQueries({ queryKey: ["placement-training"] });
        qc.invalidateQueries({ queryKey: ["placement-students"] });
        qc.invalidateQueries({ queryKey: ["placement-analytics"] });

        toast.success(
          `Tagged ${res.succeeded} student${res.succeeded === 1 ? "" : "s"}`,
          res.failed ? `${res.failed} failed.` : tags.join(", "),
        );
        setSelected(new Set());
        setNewTags("");
        setAssignOpen(false);
      } catch (err) {
        toast.error("Couldn't assign tags", err?.message);
      } finally {
        setAssigning(false);
      }
    },
    isPending: assigning,
  };

  if (error) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Couldn't load the training workspace"
        description={error.message}
      />
    );
  }

  const tags = data?.tags || [];
  const students = data?.students || [];
  const untagged = data?.untagged || [];

  // The list under the tag rail: either one tag's cohort, or everyone.
  const visible = activeTag
    ? students.filter((s) => s.tags.includes(activeTag))
    : students;

  const filtered = q
    ? visible.filter(
        (s) =>
          s.name.toLowerCase().includes(q.toLowerCase()) ||
          s.email.toLowerCase().includes(q.toLowerCase()),
      )
    : visible;

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training"
        description="Training groups across your college — who is enrolled in what, and who still needs a plan."
      />

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Students", value: data?.totals?.students ?? "—" },
          { label: "Training groups", value: data?.totals?.tags ?? "—" },
          { label: "Tagged students", value: data?.totals?.tagged ?? "—" },
          { label: "Awaiting training", value: untagged.length },
        ].map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.25,
              delay: i * 0.04,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <Card padding="lg" className="h-full">
              <div className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
                {k.label}
              </div>
              <div className="font-display tabular text-2xl font-semibold text-[var(--ink)] mt-1">
                {isLoading ? <Skeleton className="h-7 w-12" /> : k.value}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Tag rail */}
        <div className="lg:col-span-4">
          <Card padding="lg">
            <CardHeader>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Tag size={15} className="text-[var(--accent-strong)]" />
                  Training groups
                </CardTitle>
                <CardDescription className="mt-1">
                  Every tag in use, with its cohort size.
                </CardDescription>
              </div>
            </CardHeader>

            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : tags.length === 0 ? (
              <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
                No training tags yet. Assign one from the student list below, or
                from the cohort table's bulk actions.
              </p>
            ) : (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTag(null)}
                  className={cn(
                    "w-full flex items-center justify-between rounded-2xl border px-4 py-2.5 text-left transition-all duration-200",
                    activeTag === null
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border)] hover:bg-[var(--surface-2)]",
                  )}
                >
                  <span className="text-sm font-medium text-[var(--ink)]">
                    All students
                  </span>
                  <span className="tabular text-xs text-[var(--ink-muted)]">
                    {students.length}
                  </span>
                </button>

                {tags.map((t) => (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => setActiveTag(t.tag)}
                    className={cn(
                      "w-full flex items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 text-left transition-all duration-200",
                      activeTag === t.tag
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--border)] hover:bg-[var(--surface-2)]",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[var(--ink)] truncate">
                        {t.tag}
                      </span>
                      {t.avgReadiness != null && (
                        <span className="block text-[11px] text-[var(--ink-muted)]">
                          avg readiness {t.avgReadiness}%
                        </span>
                      )}
                    </span>
                    <span className="tabular text-xs text-[var(--ink-muted)] shrink-0">
                      {t.count}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* The actionable gap */}
            {!isLoading && untagged.length > 0 && (
              <div className="mt-5 pt-4 border-t border-[var(--border)]">
                <div className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold mb-2 flex items-center gap-1.5">
                  <UserPlus size={11} /> Awaiting training
                </div>
                <div className="flex flex-wrap gap-1">
                  {untagged.slice(0, 12).map((s) => (
                    <button
                      key={s._id}
                      onClick={() => nav(`/placement/students/${s._id}`)}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
                    >
                      {s.name}
                    </button>
                  ))}
                  {untagged.length > 12 && (
                    <span className="text-[10px] text-[var(--ink-muted)] pt-0.5">
                      +{untagged.length - 12} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Student list */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              leftIcon={<Search size={15} />}
              placeholder="Search students…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full sm:w-72"
            />
            {activeTag && (
              <Badge tone="warning" className="text-[11px]">
                <Tag size={9} /> {activeTag}
                <button
                  onClick={() => setActiveTag(null)}
                  className="ml-1.5 hover:opacity-70"
                  aria-label="Clear tag filter"
                >
                  <X size={10} />
                </button>
              </Badge>
            )}
            {selected.size > 0 && (
              <Button
                variant="accent"
                size="sm"
                onClick={() => setAssignOpen(true)}
                className="ml-auto"
              >
                <Tag size={13} /> Assign training tag ({selected.size})
              </Button>
            )}
          </div>

          {isLoading ? (
            <Card padding="lg">
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            </Card>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title={
                activeTag ? `Nobody tagged "${activeTag}"` : "No students yet"
              }
              description={
                activeTag
                  ? "Assign this tag from the student list or the cohort table."
                  : "Students appear here as soon as they join with your college code."
              }
            />
          ) : (
            <Card padding="none" className="overflow-hidden">
              <div className="divide-y divide-[var(--border)]">
                {filtered.map((s, i) => (
                  <motion.div
                    key={s._id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      duration: 0.2,
                      delay: Math.min(i * 0.02, 0.3),
                    }}
                    className="flex items-center gap-3 px-6 py-3.5 hover:bg-[var(--surface-2)] transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => toggleOne(s._id)}
                      className={cn(
                        "shrink-0 transition-colors",
                        selected.has(s._id)
                          ? "text-[var(--accent-strong)]"
                          : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
                      )}
                      aria-label={selected.has(s._id) ? "Deselect" : "Select"}
                    >
                      {selected.has(s._id) ? (
                        <CheckSquare size={15} />
                      ) : (
                        <Square size={15} />
                      )}
                    </button>

                    <button
                      onClick={() => nav(`/placement/students/${s._id}`)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    >
                      <span className="h-9 w-9 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] font-semibold flex items-center justify-center text-xs shrink-0">
                        {(s.name?.[0] || "?").toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[var(--ink)] truncate">
                          {s.name}
                        </span>
                        <span className="block text-[11px] text-[var(--ink-muted)] truncate">
                          {s.email}
                        </span>
                      </span>
                    </button>

                    {s.readiness != null && (
                      <Badge
                        tone={readinessTone(s.readiness)}
                        className="tabular text-[10px]"
                      >
                        {s.readiness}%
                      </Badge>
                    )}

                    {/* The tags themselves, alongside the profile */}
                    <div className="hidden sm:block">
                      {s.tags.length ? (
                        <div className="flex flex-wrap gap-1 justify-end max-w-[220px]">
                          {s.tags.map((t) => (
                            <span
                              key={t}
                              className="text-[10px] px-2 py-0.5 rounded-full bg-[#FBF1E2] text-[var(--warning)]"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-[var(--ink-muted)]">
                          no training
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Assign tags modal */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={`Assign training tags to ${selected.size} student(s)`}
        description="Recorded on each student's audit log. Existing tags are kept — this adds to them."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="accent"
              onClick={() => bulk.mutate()}
              disabled={!newTags.trim() || assigning}
            >
              {assigning ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Assigning…
                </>
              ) : (
                <>
                  <Send size={13} /> Assign
                </>
              )}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <input
            value={newTags}
            onChange={(e) => setNewTags(e.target.value)}
            placeholder="e.g. DSA bootcamp, Aptitude training (comma separated)"
            className="w-full h-11 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]/60 outline-none transition-all duration-200 focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10"
          />
          {newTags.trim() && (
            <div className="flex flex-wrap gap-1.5">
              {newTags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
                .map((t) => (
                  <Badge key={t} tone="warning" className="text-[10px]">
                    {t}
                  </Badge>
                ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
