import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Search,
  UserX,
  ArrowUpDown,
  Send,
  Loader2,
  CircleSlash,
  X,
  Tag,
  CheckSquare,
  Square,
  AlertTriangle,
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
import { CohortAnalytics } from "@/components/placement/CohortAnalytics";
import { StudentTagChips } from "@/components/placement/StudentTagChips";
import {
  PLACEMENT_STATUSES,
  PlacementStatusBadge,
  readinessTone,
} from "@/components/placement/placementStatus";
import { placementCellApi } from "@/api/placementCell";
import { useRoleIndex } from "@/hooks/useRoles";
import { useToast } from "@/context/UIContext";
import { cn } from "@/lib/utils";

function relativeDays(iso) {
  if (!iso) return "no resume";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ---------------------------------------------------------------------------
// Status modal
// ---------------------------------------------------------------------------
function StatusModal({ student, open, onClose, onSaved }) {
  const toast = useToast();
  const [status, setStatus] = useState(student?.status || "not_reviewed");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: () => placementCellApi.setStatus(student._id, { status, note }),
    onSuccess: () => {
      toast.success(`${student.name} → ${status.replace(/_/g, " ")}`);
      onSaved?.();
      onClose();
    },
    onError: (err) => toast.error("Couldn't update status", err?.message),
  });

  if (!student) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Set status — ${student.name}`}
      description="Every change is appended to this student's audit log, so the record of who decided what stays intact."
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || status === student.status}
          >
            {mutation.isPending ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Saving…
              </>
            ) : (
              "Save status"
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-2">
            Status
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PLACEMENT_STATUSES.map((s) => {
              const active = status === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatus(s.value)}
                  className={cn(
                    "h-8 px-3.5 rounded-full text-xs font-medium border transition-all duration-200 active:scale-[0.97]",
                    active
                      ? "bg-[var(--ink)] text-[var(--bg)] border-transparent shadow-card"
                      : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--border)] hover:text-[var(--ink)]",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-1.5 block">
            Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={400}
            rows={3}
            placeholder="Why this decision — e.g. 'Strong backend, weak on system design'"
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]/60 outline-none transition-all duration-200 focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10 resize-y"
          />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Gatekeeping modal — pass a student to a recruiter's JD
// ---------------------------------------------------------------------------
function PassModal({ student, open, onClose, onSaved }) {
  const toast = useToast();
  // The roles a cell can pass into are the RECRUITER JDs posted to its own
  // college — not the caller's own JDs. Reading the student-side /api/jd list
  // returned nothing here, which is why this modal used to claim no roles were
  // open even when a recruiter had plainly posted one.
  const { data: pipelineData, isLoading } = useQuery({
    queryKey: ["placement-pipeline"],
    queryFn: placementCellApi.pipeline,
    enabled: open,
  });
  const [jdId, setJdId] = useState("");
  const [note, setNote] = useState("");

  const eligible = pipelineData?.jds || [];

  const mutation = useMutation({
    mutationFn: () =>
      placementCellApi.setPass(student._id, { jdId, note, pass: true }),
    onSuccess: (data) => {
      toast.success(
        `Passed ${student.name} to "${data.jd.title}"`,
        "The recruiter can now see them for this role only.",
      );
      onSaved?.();
      onClose();
    },
    onError: (err) => toast.error("Couldn't pass this student", err?.message),
  });

  if (!student) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Pass ${student.name} to a recruiter`}
      description="Gatekeeping: a recruiter only ever sees students their placement cell has approved for that specific role."
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !jdId}
          >
            {mutation.isPending ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Passing…
              </>
            ) : (
              <>
                <Send size={13} /> Pass to recruiter
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : eligible.length === 0 ? (
          <div className="rounded-2xl bg-[#FBF1E2] px-4 py-3 text-xs text-[var(--warning)] leading-relaxed">
            No recruiter roles are open to your college yet — a recruiter must
            post a job description to your college first, and that posting then
            appears here.
          </div>
        ) : (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-2">
              Role
            </div>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {eligible.map((j) => (
                <button
                  key={j._id}
                  type="button"
                  onClick={() => setJdId(j._id)}
                  className={cn(
                    "w-full text-left rounded-2xl border px-4 py-3 transition-all duration-200",
                    jdId === j._id
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]",
                  )}
                >
                  <div className="text-sm font-medium text-[var(--ink)]">
                    {j.title}
                  </div>
                  <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                    {j.company || "Unnamed company"} · {j.recruiter || "Recruiter"}
                    {j.passedCount > 0 && (
                      <span className="ml-1">· {j.passedCount} already passed</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {eligible.length > 0 && (
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-1.5 block">
              Note to recruiter (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={400}
              rows={2}
              placeholder="Context the recruiter should know"
              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]/60 outline-none transition-all duration-200 focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10 resize-y"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Cohort page
// ---------------------------------------------------------------------------
export default function PlacementStudents() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [minReadiness, setMinReadiness] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [roleSource, setRoleSource] = useState("both");
  const [page, setPage] = useState(1);
  const [statusTarget, setStatusTarget] = useState(null);
  const [passTarget, setPassTarget] = useState(null);

  // Phase 8: bulk selection across the current page.
  const [selected, setSelected] = useState(new Set());
  const [bulkAction, setBulkAction] = useState(null); // 'setStatus' | 'assignTrainingTag' | 'passToJd'
  const [bulkStatus, setBulkStatus] = useState("referred");
  const [bulkTags, setBulkTags] = useState("");
  const [bulkJdId, setBulkJdId] = useState("");
  const [bulkNote, setBulkNote] = useState("");
  const [bulkResult, setBulkResult] = useState(null);

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: [
      "placement-students",
      page,
      q,
      status,
      minReadiness,
      tagFilter,
      roleFilter,
      roleSource,
    ],
    queryFn: () =>
      placementCellApi.students({
        page,
        limit: 25,
        q: q || undefined,
        status: status || undefined,
        minReadiness: minReadiness === "" ? undefined : Number(minReadiness),
        tags: tagFilter || undefined,
        roleKey: roleFilter || undefined,
        roleSource: roleFilter ? roleSource : undefined,
      }),
    keepPreviousData: true,
  });

  // The role index powers the role filter — same data the Roles page uses, so
  // the two views always agree on what roles exist.
  const { data: roleIndexData } = useRoleIndex();
  const roleOptions = roleIndexData?.roles || [];

  const { data: pipelineData } = useQuery({
    queryKey: ["placement-pipeline"],
    queryFn: placementCellApi.pipeline,
  });
  // Roles a recruiter has posted to THIS college — the only ones a cell can
  // pass students into. (The student-side JD list is a different thing.)
  const eligibleJds = pipelineData?.jds || [];

  // Runs one bulk action across every selected student. The server reports a
  // PER-STUDENT outcome, so partial failures are visible rather than hidden.
  const bulk = useMutation({
    mutationFn: () =>
      placementCellApi.bulk({
        studentIds: [...selected],
        action: bulkAction,
        status: bulkAction === "setStatus" ? bulkStatus : undefined,
        tags:
          bulkAction === "assignTrainingTag"
            ? bulkTags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : undefined,
        jdId: bulkAction === "passToJd" ? bulkJdId : undefined,
        note: bulkNote || undefined,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["placement-students"] });
      qc.invalidateQueries({ queryKey: ["placement-analytics"] });
      setBulkResult(data);
      // Keep the failures selected so the cell can retry just those.
      const failedIds = (data.results || [])
        .filter((r) => !r.ok)
        .map((r) => r.studentId);
      setSelected(new Set(failedIds));
      toast.success(
        `Applied to ${data.succeeded} student${data.succeeded === 1 ? "" : "s"}`,
        data.failed ? `${data.failed} failed — see the summary.` : undefined,
      );
    },
    onError: (err) => toast.error("Bulk action failed", err?.message),
  });

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === students.length
        ? new Set()
        : new Set(students.map((s) => s._id)),
    );
  }

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["placement-students"] });
    qc.invalidateQueries({ queryKey: ["placement-analytics"] });
  };

  function showPasses(student) {
    // Withdrawing per-role passes is done from the detail page where each role
    // is listed individually — here we just point them there.
    toast.info(
      `${student.name} is passed to ${student.passedCount} role${student.passedCount === 1 ? "" : "s"}`,
      "Open their profile to manage individual passes.",
    );
    nav(`/placement/students/${student._id}`);
  }

  if (error) {
    return (
      <EmptyState
        icon={UserX}
        title="Couldn't load your students"
        description={error.message}
      />
    );
  }

  const students = data?.students || [];
  const availableTags = data?.availableTags || [];
  const hasFilters =
    Boolean(q) ||
    Boolean(status) ||
    minReadiness !== "" ||
    Boolean(tagFilter) ||
    Boolean(roleFilter);
  const allSelected = students.length > 0 && selected.size === students.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description={
          data?.college
            ? `${data.college.name} · ${data.total} student${data.total === 1 ? "" : "s"} joined with your code`
            : "Students who joined your college"
        }
      />

      {/* Phase 8: the batch-level view, charts and training-needs report */}
      <CohortAnalytics />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          leftIcon={<Search size={15} />}
          placeholder="Search by name or email…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="w-full sm:w-72"
        />

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="h-11 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]/40 focus:ring-2 focus:ring-[var(--accent)]/15"
        >
          <option value="">All statuses</option>
          {PLACEMENT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          value={minReadiness}
          onChange={(e) => {
            setMinReadiness(e.target.value);
            setPage(1);
          }}
          className="h-11 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]/40 focus:ring-2 focus:ring-[var(--accent)]/15"
        >
          <option value="">Any readiness</option>
          <option value="40">40%+</option>
          <option value="60">60%+</option>
          <option value="75">75%+</option>
          <option value="85">85%+</option>
        </select>

        {/* Tag filter — same standing as status and readiness */}
        <select
          value={tagFilter}
          onChange={(e) => {
            setTagFilter(e.target.value);
            setPage(1);
          }}
          title="Filter by training tag"
          className="h-11 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]/40 focus:ring-2 focus:ring-[var(--accent)]/15"
        >
          <option value="">Any training tag</option>
          {availableTags.map((t) => (
            <option key={t.tag} value={t.tag}>
              {t.tag} ({t.count})
            </option>
          ))}
        </select>

        {/* Role filter — by resume, by opt-in, or either */}
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          title="Filter by role"
          className="h-11 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]/40 focus:ring-2 focus:ring-[var(--accent)]/15"
        >
          <option value="">Any role</option>
          {roleOptions.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label} ({r.resumeCount + r.interestedCount})
            </option>
          ))}
        </select>

        {roleFilter && (
          <select
            value={roleSource}
            onChange={(e) => {
              setRoleSource(e.target.value);
              setPage(1);
            }}
            title="Which role signal"
            className="h-11 rounded-full border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-4 text-xs text-[var(--accent-strong)] outline-none focus:ring-2 focus:ring-[var(--accent)]/15"
          >
            <option value="both">Resume + interested</option>
            <option value="resume">Resume only</option>
            <option value="interested">Interested only</option>
          </select>
        )}

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              setStatus("");
              setMinReadiness("");
              setTagFilter("");
              setRoleFilter("");
              setRoleSource("both");
              setPage(1);
            }}
          >
            <CircleSlash size={13} /> Clear
          </Button>
        )}

        {isFetching && !isLoading && (
          <span className="text-xs text-[var(--ink-muted)] ml-auto">
            Updating…
          </span>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <Card padding="lg">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </Card>
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            hasFilters
              ? "No students match these filters"
              : "No students have joined yet"
          }
          description={
            hasFilters
              ? "Try widening the filters."
              : "Share your college code from the Overview page — students appear here as soon as they join with it."
          }
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="hidden lg:grid grid-cols-12 gap-4 px-6 py-3 border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
            <div className="col-span-1 flex items-center">
              <button
                type="button"
                onClick={toggleAll}
                title={
                  allSelected ? "Clear selection" : "Select all on this page"
                }
                className="text-[var(--ink-muted)] hover:text-[var(--accent-strong)] transition-colors"
              >
                {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
              </button>
            </div>
            <div className="col-span-3">Student</div>
            <div className="col-span-2 flex items-center gap-1">
              Readiness <ArrowUpDown size={10} />
            </div>
            <div className="col-span-3">Top gaps</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          <div className="divide-y divide-[var(--border)]">
            {students.map((s, i) => (
              <motion.div
                key={s._id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-4 px-6 py-4 hover:bg-[var(--surface-2)] transition-colors items-center"
              >
                {/* Selection */}
                <div className="lg:col-span-1 flex items-center">
                  <button
                    type="button"
                    onClick={() => toggleOne(s._id)}
                    className={cn(
                      "transition-colors",
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
                </div>

                {/* Student */}
                <button
                  onClick={() => nav(`/placement/students/${s._id}`)}
                  className="lg:col-span-3 flex items-center gap-3 min-w-0 text-left"
                >
                  <span className="h-9 w-9 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] font-semibold flex items-center justify-center text-xs shrink-0">
                    {(s.name?.[0] || "?").toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--ink)] truncate">
                      {s.name}
                    </span>
                    <span className="block text-[11px] text-[var(--ink-muted)] truncate">
                      {s.resume
                        ? `${s.resume.title} · ${relativeDays(s.resumeUpdatedAt)}`
                        : "no resume"}
                    </span>
                    {/* Tags sit with the profile, not hidden in a tooltip or a
                        separate page — a cell should read them at a glance. */}
                    {s.tags?.length > 0 && (
                      <span className="block mt-1">
                        <StudentTagChips tags={s.tags} max={3} />
                      </span>
                    )}
                  </span>
                </button>

                {/* Readiness */}
                <div className="lg:col-span-2">
                  {s.readiness == null ? (
                    <span className="text-xs text-[var(--ink-muted)]">
                      Not scored
                    </span>
                  ) : (
                    <Badge
                      tone={readinessTone(s.readiness)}
                      className="tabular"
                    >
                      {s.readiness}%
                    </Badge>
                  )}
                </div>

                {/* Gaps */}
                <div className="lg:col-span-3 flex flex-wrap gap-1">
                  {s.missingSkills.length === 0 ? (
                    <span className="text-[11px] text-[var(--success)]">
                      none 🎯
                    </span>
                  ) : (
                    s.missingSkills.map((m) => (
                      <span
                        key={m}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-[#F8E3E0] text-[var(--danger)]"
                      >
                        {m}
                      </span>
                    ))
                  )}
                </div>

                {/* Status */}
                <div className="lg:col-span-2">
                  <PlacementStatusBadge status={s.status} />
                </div>

                {/* Actions */}
                <div className="lg:col-span-2 flex lg:justify-end gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStatusTarget(s)}
                  >
                    Status
                  </Button>
                  <Button
                    variant={s.passedCount > 0 ? "soft" : "accent"}
                    size="sm"
                    onClick={() =>
                      s.passedCount > 0 ? showPasses(s) : setPassTarget(s)
                    }
                  >
                    {s.passedCount > 0 ? (
                      <span className="tabular">{s.passedCount} passed</span>
                    ) : (
                      "Pass"
                    )}
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--ink-muted)]">
            Page {data.page} of {data.totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Floating bulk action bar — appears only when rows are selected, and
          slides up with the app's spring so it reads as part of the table. */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="flex items-center gap-2 rounded-full bg-[var(--ink)] text-[var(--bg)] pl-5 pr-1.5 py-1.5 shadow-hover">
              <span className="text-xs font-semibold tabular whitespace-nowrap">
                {selected.size} selected
              </span>
              <span className="w-px h-5 bg-[var(--bg)]/20" />
              <button
                onClick={() => setBulkAction("setStatus")}
                className="h-8 px-3 rounded-full text-xs font-medium hover:bg-white/10 transition-colors"
              >
                Set status
              </button>
              <button
                onClick={() => setBulkAction("assignTrainingTag")}
                className="h-8 px-3 rounded-full text-xs font-medium hover:bg-white/10 transition-colors"
              >
                <Tag size={11} className="inline mr-1" />
                Training tag
              </button>
              <button
                onClick={() => setBulkAction("passToJd")}
                className="h-8 px-3 rounded-full text-xs font-medium hover:bg-white/10 transition-colors"
              >
                <Send size={11} className="inline mr-1" />
                Pass to recruiter
              </button>
              <button
                onClick={() => setSelected(new Set())}
                title="Clear selection"
                className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <StatusModal
        student={statusTarget}
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        onSaved={refresh}
      />
      <PassModal
        student={passTarget}
        open={!!passTarget}
        onClose={() => setPassTarget(null)}
        onSaved={refresh}
      />

      {/* Bulk action modal — one request, per-student outcome */}
      <Modal
        open={!!bulkAction}
        onClose={() => {
          setBulkAction(null);
          setBulkResult(null);
        }}
        title={
          bulkAction === "setStatus"
            ? `Set status for ${selected.size} student(s)`
            : bulkAction === "assignTrainingTag"
              ? `Add training tags for ${selected.size} student(s)`
              : `Pass ${selected.size} student(s) to a recruiter`
        }
        description="Each student's audit log records this individually, marked as a bulk action."
        footer={
          bulkResult ? (
            <Button
              variant="accent"
              onClick={() => {
                setBulkAction(null);
                setBulkResult(null);
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => setBulkAction(null)}
                disabled={bulk.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="accent"
                onClick={() => bulk.mutate()}
                disabled={
                  bulk.isPending ||
                  (bulkAction === "passToJd" && !bulkJdId) ||
                  (bulkAction === "assignTrainingTag" && !bulkTags.trim())
                }
              >
                {bulk.isPending ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Applying…
                  </>
                ) : (
                  `Apply to ${selected.size}`
                )}
              </Button>
            </>
          )
        }
      >
        {bulkResult ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="font-display tabular text-2xl font-semibold text-[var(--ink)]">
                {bulkResult.succeeded}
              </span>
              <span className="text-xs text-[var(--ink-muted)]">
                succeeded of {bulkResult.requested}
              </span>
            </div>
            {bulkResult.failed > 0 && (
              <div className="rounded-2xl bg-[#F8E3E0] px-4 py-3">
                <div className="text-[11px] font-semibold text-[var(--danger)] mb-1.5">
                  {bulkResult.failed} failed
                </div>
                <ul className="space-y-1">
                  {bulkResult.results
                    .filter((r) => !r.ok)
                    .map((r) => (
                      <li
                        key={r.studentId}
                        className="text-[11px] text-[var(--danger)]"
                      >
                        {r.name || r.studentId}: {r.reason}
                      </li>
                    ))}
                </ul>
                <p className="text-[10px] text-[var(--danger)]/80 mt-2">
                  The failed students are still selected — retry once the cause
                  is fixed.
                </p>
              </div>
            )}
          </div>
        ) : bulkAction === "setStatus" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {PLACEMENT_STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setBulkStatus(s.value)}
                  className={cn(
                    "h-8 px-3.5 rounded-full text-xs font-medium border transition-all duration-200 active:scale-[0.97]",
                    bulkStatus === s.value
                      ? "bg-[var(--ink)] text-[var(--bg)] border-transparent shadow-card"
                      : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--border)] hover:text-[var(--ink)]",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <textarea
              value={bulkNote}
              onChange={(e) => setBulkNote(e.target.value)}
              maxLength={400}
              rows={2}
              placeholder="Note (optional) — recorded on every selected student"
              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]/60 outline-none transition-all duration-200 focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10 resize-y"
            />
          </div>
        ) : bulkAction === "assignTrainingTag" ? (
          <div className="space-y-3">
            <input
              value={bulkTags}
              onChange={(e) => setBulkTags(e.target.value)}
              placeholder="e.g. DSA bootcamp, Aptitude training (comma separated)"
              className="w-full h-11 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]/60 outline-none transition-all duration-200 focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10"
            />
            {bulkTags.trim() && (
              <div className="flex flex-wrap gap-1.5">
                {bulkTags
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
        ) : (
          <div className="space-y-3">
            {eligibleJds.length === 0 ? (
              <div className="rounded-2xl bg-[#FBF1E2] px-4 py-3 text-xs text-[var(--warning)] leading-relaxed">
                No recruiter roles are open to your college yet — a recruiter
                must post a job description to your college first.
              </div>
            ) : (
              eligibleJds.map((j) => (
                <button
                  key={j._id}
                  type="button"
                  onClick={() => setBulkJdId(j._id)}
                  className={cn(
                    "w-full text-left rounded-2xl border px-4 py-3 transition-all duration-200",
                    bulkJdId === j._id
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]",
                  )}
                >
                  <div className="text-sm font-medium text-[var(--ink)]">
                    {j.title}
                  </div>
                  <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                    {j.company || "Unnamed company"} · {j.recruiter || "Recruiter"}
                    {j.passedCount > 0 && (
                      <span className="ml-1">· {j.passedCount} already passed</span>
                    )}
                  </div>
                </button>
              ))
            )}
            {eligibleJds.length > 0 && (
              <textarea
                value={bulkNote}
                onChange={(e) => setBulkNote(e.target.value)}
                maxLength={400}
                rows={2}
                placeholder="Note to the recruiter (optional)"
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]/60 outline-none transition-all duration-200 focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10 resize-y"
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
