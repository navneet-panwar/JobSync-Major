import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Target,
  Search,
  Plus,
  Users,
  Sparkles,
  FileText,
  Heart,
  X,
  Check,
  Loader2,
  ChevronRight,
  Megaphone,
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
import { useQuery } from "@tanstack/react-query";
import {
  useRoleIndex,
  useRoleStudents,
  useRolePostings,
  useCreateRolePosting,
  useSetPostingStatus,
} from "@/hooks/useRoles";
import { placementCellApi } from "@/api/placementCell";
import { readinessTone } from "@/components/placement/placementStatus";
import { StudentTagChips } from "@/components/placement/StudentTagChips";
import { cn } from "@/lib/utils";

// The three views a cell can switch between. Kept as an explicit segmented
// control rather than a checkbox so the difference is impossible to miss —
// merging these two lists is exactly what this feature exists to avoid.
const SOURCES = [
  {
    value: "both",
    label: "Everyone",
    hint: "Both signals, each row labelled",
  },
  {
    value: "resume",
    label: "By resume",
    hint: "Roles their resume points at",
  },
  {
    value: "interested",
    label: "Interested",
    hint: "Students who opted in to a posted role",
  },
];

// ---------------------------------------------------------------------------
// Post-a-role modal
//
// Two ways in, because a cell genuinely needs both:
//   · pick a JD a RECRUITER already posted to this college — searchable, so the
//     list stays usable when a season has fifty postings
//   · fill it in manually for an opening nobody has posted yet
//
// The search behaves like a normal search box: every posting is listed until
// you type, then the list narrows. That is what a cell expects, and hiding the
// full list behind an empty query makes the picker feel broken.
// ---------------------------------------------------------------------------
function PostRoleModal({ open, onClose }) {
  const create = useCreateRolePosting();

  // The JDs a recruiter posted to THIS college. Not /api/jd — a placement cell
  // owns no JDs, so that list was always empty and this picker never appeared.
  const { data: pipelineData, isLoading: pipelineLoading } = useQuery({
    queryKey: ["placement-pipeline"],
    queryFn: placementCellApi.pipeline,
    enabled: open,
  });
  const pipeline = pipelineData?.jds || [];

  const [mode, setMode] = useState("pipeline"); // pipeline | manual
  const [search, setSearch] = useState("");
  const [jdId, setJdId] = useState("");

  const [title, setTitle] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  // Search across the fields a cell would actually remember — title, company
  // and the required skills — so "node" finds the backend posting even when the
  // title does not contain it.
  const q = search.trim().toLowerCase();
  const visible = q
    ? pipeline.filter((j) =>
        [j.title, j.company, ...(j.requiredSkills || [])]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
      )
    : pipeline;

  // Picking a JD fills the form from what the parser already extracted — the
  // cell should not retype what the system knows.
  function applyJd(jd) {
    setJdId(jd._id);
    setTitle(jd.title || "");
    setRole(jd.title || "");
    setCompany(jd.company || "");
    setLocation(jd.location || "");
    setDescription(
      [jd.company, jd.location, (jd.requiredSkills || []).join(", ")]
        .filter(Boolean)
        .join(" · "),
    );
  }

  function reset() {
    setMode("pipeline");
    setSearch("");
    setJdId("");
    setTitle("");
    setRole("");
    setCompany("");
    setLocation("");
    setDescription("");
  }

  const canSubmit = mode === "pipeline" ? Boolean(jdId) : Boolean(title.trim());

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      className="max-w-2xl"
      title="Post a role to your college"
      description="Students are notified and answer interested or not. Anyone interested appears under that role's Interested list. A role that doesn't exist yet is created automatically."
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={() =>
              create.mutate(
                {
                  title: title.trim() || role.trim(),
                  role: role.trim() || title.trim(),
                  company,
                  location,
                  description,
                  jdId: jdId || undefined,
                },
                {
                  onSuccess: () => {
                    reset();
                    onClose();
                  },
                },
              )
            }
            disabled={create.isPending || !canSubmit}
          >
            {create.isPending ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Posting…
              </>
            ) : (
              <>
                <Megaphone size={13} /> Post &amp; notify
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Source picker */}
        <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1 w-fit">
          {[
            {
              key: "pipeline",
              label: "From a posted job",
              count: pipeline.length,
            },
            { key: "manual", label: "Enter manually" },
          ].map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={cn(
                "h-8 px-3.5 rounded-full text-xs font-medium transition-all duration-200",
                mode === m.key
                  ? "bg-[var(--ink)] text-[var(--bg)] shadow-card"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
              )}
            >
              {m.label}
              {m.count > 0 && (
                <span className="ml-1.5 tabular opacity-70">{m.count}</span>
              )}
            </button>
          ))}
        </div>

        {mode === "pipeline" ? (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-2">
              Jobs posted to your college
            </div>

            {pipelineLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : pipeline.length === 0 ? (
              <div className="rounded-2xl bg-[#FBF1E2] px-4 py-3 text-xs text-[var(--warning)] leading-relaxed">
                No recruiter has posted a job to your college yet. Switch to
                <strong> Enter manually</strong> to post an opening yourself.
              </div>
            ) : (
              <>
                {/* Search — all jobs listed until you type, then narrowed */}
                <div className="relative mb-2">
                  <Search
                    size={15}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none"
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by role, company or skill…"
                    className="w-full h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface)] pl-10 pr-10 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]/60 outline-none transition-all duration-200 focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:bg-[var(--surface-2)]"
                      aria-label="Clear search"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="text-[11px] text-[var(--ink-muted)] mb-2">
                  {q
                    ? `${visible.length} of ${pipeline.length} match “${search.trim()}”`
                    : `${pipeline.length} job${pipeline.length === 1 ? "" : "s"} posted to your college`}
                </div>

                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                  {visible.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-6 text-center">
                      <p className="text-xs text-[var(--ink-muted)]">
                        No posted job matches “{search.trim()}”.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => {
                          setMode("manual");
                          setTitle(search.trim());
                          setRole(search.trim());
                        }}
                      >
                        <Plus size={12} /> Post “{search.trim()}” manually
                      </Button>
                    </div>
                  ) : (
                    visible.map((j) => {
                      const active = jdId === j._id;
                      return (
                        <button
                          key={j._id}
                          type="button"
                          onClick={() => (active ? setJdId("") : applyJd(j))}
                          className={cn(
                            "w-full text-left rounded-2xl border px-4 py-3 transition-all duration-200",
                            active
                              ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                              : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[var(--ink)] truncate">
                              {j.title}
                            </span>
                            {active && (
                              <Check
                                size={13}
                                className="text-[var(--accent-strong)] shrink-0"
                              />
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--ink-muted)] mt-0.5 truncate">
                            {j.company || "Unnamed company"}
                            {j.location ? ` · ${j.location}` : ""}
                            {j.recruiter ? ` · ${j.recruiter}` : ""}
                            {j.passedCount > 0
                              ? ` · ${j.passedCount} already passed`
                              : ""}
                          </div>
                          {j.requiredSkills?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {j.requiredSkills.slice(0, 5).map((s) => (
                                <span
                                  key={s}
                                  className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--ink-muted)]"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {[
              {
                label: "Role / job title *",
                value: title,
                set: setTitle,
                ph: "e.g. Backend Engineer — Infosys drive",
              },
              {
                label: "Role name (for grouping)",
                value: role,
                set: setRole,
                ph: "e.g. Backend Engineer — leave blank to use the title",
              },
              {
                label: "Company",
                value: company,
                set: setCompany,
                ph: "e.g. Infosys",
              },
              {
                label: "Location",
                value: location,
                set: setLocation,
                ph: "e.g. Bengaluru",
              },
            ].map((f) => (
              <div key={f.label}>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-1.5 block">
                  {f.label}
                </label>
                <input
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  placeholder={f.ph}
                  className="w-full h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]/60 outline-none transition-all duration-200 focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10"
                />
              </div>
            ))}
          </div>
        )}

        {/* Details — shared by both modes so the cell can always add context */}
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-1.5 block">
            Details (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="What students should know — package, eligibility, deadline…"
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]/60 outline-none transition-all duration-200 focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10 resize-y"
          />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// One student row
// ---------------------------------------------------------------------------
function RoleStudentRow({ student, onOpen }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-3 px-6 py-3.5 hover:bg-[var(--surface-2)] transition-colors"
    >
      <button
        onClick={() => onOpen(student._id)}
        className="flex items-center gap-3 min-w-0 flex-1 text-left"
      >
        <span className="h-9 w-9 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] font-semibold flex items-center justify-center text-xs shrink-0">
          {(student.name?.[0] || "?").toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[var(--ink)] truncate">
            {student.name}
          </span>
          <span className="block text-[11px] text-[var(--ink-muted)] truncate">
            {student.email}
          </span>
        </span>
      </button>

      {/* WHICH signal put this student here — never ambiguous. */}
      <div className="hidden sm:flex items-center gap-1 shrink-0">
        {student.fromResume && (
          <Badge
            tone="neutral"
            className="text-[10px]"
            title={student.resumeEvidence}
          >
            <FileText size={9} /> Resume
            {student.resumeConfidence != null && (
              <span className="tabular ml-0.5 opacity-70">
                {student.resumeConfidence}%
              </span>
            )}
          </Badge>
        )}
        {student.interested && (
          <Badge tone="accent" className="text-[10px]">
            <Heart size={9} /> Interested
          </Badge>
        )}
      </div>

      <StudentTagChips
        tags={student.tags}
        max={2}
        className="hidden lg:flex max-w-[160px]"
      />

      {student.readiness != null && (
        <Badge
          tone={readinessTone(student.readiness)}
          className="tabular text-[10px] shrink-0"
        >
          {student.readiness}%
        </Badge>
      )}

      <ChevronRight size={14} className="text-[var(--ink-muted)] shrink-0" />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function PlacementRoles() {
  const { roleKey: paramRole } = useParams();
  const nav = useNavigate();

  const [selectedRole, setSelectedRole] = useState(paramRole || null);
  const [source, setSource] = useState("both");
  const [q, setQ] = useState("");
  const [postOpen, setPostOpen] = useState(false);
  const [postingsOpen, setPostingsOpen] = useState(false);

  const { data: indexData, isLoading: indexLoading } = useRoleIndex();
  const roles = indexData?.roles || [];

  const { data, isLoading, isFetching } = useRoleStudents(selectedRole, source);
  const { data: postingsData } = useRolePostings();
  const setPostingStatus = useSetPostingStatus();

  const postings = postingsData?.postings || [];

  // Land on the busiest role when nothing is selected — a cell opening this
  // page should see students, not an empty prompt.
  useEffect(() => {
    if (!selectedRole && roles.length) setSelectedRole(roles[0].key);
  }, [roles, selectedRole]);

  useEffect(() => {
    if (selectedRole && selectedRole !== paramRole) {
      nav(`/placement/roles/${encodeURIComponent(selectedRole)}`, {
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole]);

  const students = data?.students || [];
  const filtered = q
    ? students.filter(
        (s) =>
          s.name.toLowerCase().includes(q.toLowerCase()) ||
          s.email.toLowerCase().includes(q.toLowerCase()),
      )
    : students;

  const counts = data?.counts || { resume: 0, interested: 0, total: 0 };
  const activeRole = roles.find((r) => r.key === selectedRole);

  if (indexLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-56" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Skeleton className="lg:col-span-4 h-96" />
          <Skeleton className="lg:col-span-8 h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles"
        description="Students grouped by the roles they target — from their resume, and from the roles they opted into. Kept separate on purpose."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPostingsOpen(true)}
            >
              <Megaphone size={13} /> Postings
              {postings.length > 0 && (
                <span className="tabular ml-1 opacity-70">
                  {postings.length}
                </span>
              )}
            </Button>
            <Button
              variant="accent"
              size="sm"
              onClick={() => setPostOpen(true)}
            >
              <Plus size={13} /> Post a role
            </Button>
          </div>
        }
      />

      {/* Explain the two lists up front — the whole feature hinges on this. */}
      <div className="flex items-start gap-2.5 rounded-2xl bg-[var(--accent-soft)] px-4 py-3">
        <Sparkles
          size={15}
          className="text-[var(--accent-strong)] shrink-0 mt-0.5"
        />
        <p className="text-xs text-[var(--accent-strong)] leading-relaxed">
          <strong>By resume</strong> is what a student's resume points at —
          inferred, not a preference. <strong>Interested</strong> is a student
          who tapped Interested on a role you posted. The two are never merged:
          every row says which one it is.
        </p>
      </div>

      {roles.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No roles yet"
          description="Roles appear once students upload a resume (which is parsed for target roles) or once you post a role and students opt in. Post a role to get started."
          action={
            <Button
              variant="accent"
              size="sm"
              onClick={() => setPostOpen(true)}
            >
              <Plus size={13} /> Post a role
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Role rail */}
          <div className="lg:col-span-4">
            <Card padding="lg">
              <CardHeader>
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target size={15} className="text-[var(--accent-strong)]" />
                    All roles
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Resume counts and opt-in counts, side by side.
                  </CardDescription>
                </div>
              </CardHeader>

              <div className="space-y-1.5">
                {roles.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setSelectedRole(r.key)}
                    className={cn(
                      "w-full rounded-2xl border px-4 py-3 text-left transition-all duration-200",
                      selectedRole === r.key
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--border)] hover:bg-[var(--surface-2)]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-[var(--ink)] truncate">
                        {r.label}
                      </span>
                      <span className="tabular text-xs text-[var(--ink-muted)] shrink-0">
                        {r.resumeCount + r.interestedCount}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--ink-muted)]">
                      <span className="inline-flex items-center gap-1">
                        <FileText size={9} /> {r.resumeCount} by resume
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Heart size={9} /> {r.interestedCount} interested
                      </span>
                    </div>
                    {r.postings.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-[var(--accent-strong)]">
                        <Megaphone size={9} />
                        {r.postings.length} posting
                        {r.postings.length === 1 ? "" : "s"}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Students for the selected role */}
          <div className="lg:col-span-8 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                leftIcon={<Search size={15} />}
                placeholder="Search students…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full sm:w-64"
              />

              {/* Segmented source control — the two lists, switchable */}
              <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1">
                {SOURCES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSource(s.value)}
                    title={s.hint}
                    className={cn(
                      "h-8 px-3.5 rounded-full text-xs font-medium transition-all duration-200",
                      source === s.value
                        ? "bg-[var(--ink)] text-[var(--bg)] shadow-card"
                        : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {isFetching && !isLoading && (
                <span className="text-xs text-[var(--ink-muted)] ml-auto">
                  Updating…
                </span>
              )}
            </div>

            {selectedRole && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-muted)]">
                <span className="font-display text-base font-semibold text-[var(--ink)]">
                  {activeRole?.label || data?.role?.label}
                </span>
                <Badge tone="neutral" className="text-[10px]">
                  <FileText size={9} /> {counts.resume} by resume
                </Badge>
                <Badge tone="accent" className="text-[10px]">
                  <Heart size={9} /> {counts.interested} interested
                </Badge>
                {source !== "both" && (
                  <span className="text-[11px]">
                    showing {source === "resume" ? "resume-derived" : "opt-in"}{" "}
                    only
                  </span>
                )}
              </div>
            )}

            {isLoading ? (
              <Card padding="lg">
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              </Card>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Users}
                title={
                  source === "interested"
                    ? "Nobody has opted in to this role yet"
                    : source === "resume"
                      ? "No resume points at this role yet"
                      : "No students for this role yet"
                }
                description={
                  source === "interested"
                    ? "Post this role to your college — students who tap Interested appear here."
                    : "A student's resume roles refresh automatically when they re-upload or apply rewrites."
                }
                action={
                  source !== "resume" ? (
                    <Button
                      variant="accent"
                      size="sm"
                      onClick={() => setPostOpen(true)}
                    >
                      <Plus size={13} /> Post this role
                    </Button>
                  ) : null
                }
              />
            ) : (
              <Card padding="none" className="overflow-hidden">
                <div className="divide-y divide-[var(--border)]">
                  <AnimatePresence initial={false}>
                    {filtered.map((s) => (
                      <RoleStudentRow
                        key={s._id}
                        student={s}
                        onOpen={(id) => nav(`/placement/students/${id}`)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      <PostRoleModal open={postOpen} onClose={() => setPostOpen(false)} />

      {/* Postings drawer */}
      <Modal
        open={postingsOpen}
        onClose={() => setPostingsOpen(false)}
        title="Your role postings"
        description="Who you notified, and how many students opted in."
      >
        {postings.length === 0 ? (
          <p className="text-xs text-[var(--ink-muted)]">
            No roles posted yet. Use <strong>Post a role</strong> to notify your
            college about an opening.
          </p>
        ) : (
          <div className="space-y-2">
            {postings.map((p) => (
              <div
                key={p._id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--ink)] truncate">
                      {p.title}
                    </div>
                    <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                      {p.roleLabel} · {p.company || "—"} · notified{" "}
                      {p.notifiedCount}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge tone="accent" className="text-[10px]">
                        <Heart size={9} /> {p.interested} interested
                      </Badge>
                      {p.declined > 0 && (
                        <Badge tone="neutral" className="text-[10px]">
                          <X size={9} /> {p.declined} declined
                        </Badge>
                      )}
                      {p.roleIsNew && (
                        <Badge tone="warning" className="text-[10px]">
                          new role
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPostingStatus.mutate({
                        id: p._id,
                        status: p.status === "open" ? "closed" : "open",
                      })
                    }
                    disabled={setPostingStatus.isPending}
                  >
                    {p.status === "open" ? "Close" : "Reopen"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
