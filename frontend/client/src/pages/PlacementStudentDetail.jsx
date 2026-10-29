import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Mail,
  CalendarDays,
  History,
  Send,
  Target,
  Loader2,
  UserX,
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
import { ScoreEvolutionChart } from "@/components/dashboard/ScoreEvolutionChart";
import {
  PlacementStatusBadge,
  readinessTone,
} from "@/components/placement/placementStatus";
import { placementCellApi } from "@/api/placementCell";
import { StudentTagChips } from "@/components/placement/StudentTagChips";
import { cn } from "@/lib/utils";

function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Audit-log entry labels — the vocabulary of what happened to this student. */
const AUDIT_KIND = {
  status: { label: "Status change", tone: "accent" },
  training_tag: { label: "Training", tone: "warning" },
  pass_to_recruiter: { label: "Passed to recruiter", tone: "success" },
  pass_withdrawn: { label: "Pass withdrawn", tone: "neutral" },
  recruiter_decision: { label: "Recruiter decision", tone: "accent" },
};

export default function PlacementStudentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["placement-student", id],
    queryFn: () => placementCellApi.student(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Skeleton className="lg:col-span-7 h-80" />
          <Skeleton className="lg:col-span-5 h-80" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={UserX}
        title="Couldn't load this student"
        description={error.message}
      />
    );
  }

  const s = data.student;
  const series = (data.readinessHistory || []).map((r) => ({
    score: r.composite,
    at: r.createdAt,
  }));
  const latestScore = data.readinessHistory?.length
    ? data.readinessHistory[data.readinessHistory.length - 1].composite
    : null;

  return (
    <div className="space-y-6">
      <button
        onClick={() => nav("/placement/students")}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
      >
        <ArrowLeft size={13} /> All students
      </button>

      <PageHeader
        title={s.name}
        description={s.email}
        actions={
          <div className="flex items-center gap-2">
            <PlacementStatusBadge status={s.status} />
            {s.readiness != null && (
              <Badge tone={readinessTone(s.readiness)} className="tabular">
                {s.readiness}% ready
              </Badge>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Readiness trend */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-7"
        >
          {series.length ? (
            <ScoreEvolutionChart
              data={series}
              currentScore={latestScore}
              delta={0}
            />
          ) : (
            <Card
              padding="lg"
              className="h-full flex items-center justify-center text-center"
            >
              <div>
                <Target size={22} className="mx-auto text-[var(--ink-muted)]" />
                <div className="font-display text-sm font-semibold mt-3">
                  No readiness score yet
                </div>
                <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-xs">
                  This student hasn't checked their readiness against a role.
                  Scores appear here and in the cohort table as soon as they do.
                </p>
              </div>
            </Card>
          )}
        </motion.div>

        {/* Profile facts */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-5"
        >
          <Card padding="lg" className="h-full">
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center gap-2.5 text-[var(--ink-muted)]">
                <Mail size={13} className="shrink-0" />
                <span className="text-[var(--ink)] truncate">{s.email}</span>
              </div>
              <div className="flex items-center gap-2.5 text-[var(--ink-muted)]">
                <CalendarDays size={13} className="shrink-0" />
                <span>Joined {fmtDateTime(s.joinedAt)}</span>
              </div>
              <div className="pt-3 border-t border-[var(--border)]">
                <dt className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold mb-1.5">
                  Resume
                </dt>
                <dd className="text-[var(--ink)]">
                  {s.resume
                    ? `${s.resume.title} · V${s.resume.version}`
                    : "None uploaded"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold mb-1.5">
                  Training tags
                </dt>
                <dd>
                  <StudentTagChips
                    tags={s.tags || []}
                    size="md"
                    emptyText="No training assigned yet"
                  />
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold mb-1.5">
                  Roles from their resume
                </dt>
                <dd>
                  {s.resumeRoles?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {s.resumeRoles.map((r) => (
                        <span
                          key={r.key}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                        >
                          {r.label}
                          {r.confidence != null && (
                            <span className="tabular ml-1 opacity-70">
                              {r.confidence}%
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--ink-muted)]">
                      No resume roles inferred yet
                    </span>
                  )}
                </dd>
              </div>
              {s.interestedRoles?.length > 0 && (
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold mb-1.5">
                    Roles they opted into
                  </dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {s.interestedRoles
                      .filter((r) => r.response === "interested")
                      .map((r) => (
                        <span
                          key={r.key}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--ink)]"
                        >
                          {r.label}
                        </span>
                      ))}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold mb-1.5">
                  Consent to recruiters
                </dt>
                <dd>
                  {s.consent?.shownToRecruiters === false ? (
                    <Badge tone="danger">Withdrawn</Badge>
                  ) : (
                    <Badge tone="success">Granted</Badge>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold mb-1.5">
                  Passed to recruiters
                </dt>
                <dd className="text-[var(--ink)]">
                  {data.passes?.length
                    ? `${data.passes.length} role${data.passes.length === 1 ? "" : "s"}`
                    : "Not yet passed"}
                </dd>
              </div>
            </dl>

            {/* Skill gaps — the actionable part */}
            {s.missingSkills?.length > 0 && (
              <div className="mt-5 pt-4 border-t border-[var(--border)]">
                <div className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold mb-2">
                  Top skill gaps
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {s.missingSkills.map((m) => (
                    <span
                      key={m}
                      className="text-[10px] px-2 py-1 rounded-full bg-[#F8E3E0] text-[var(--danger)]"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </motion.div>
      </div>

      {/* Passes */}
      <Card padding="lg">
        <CardHeader>
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Send size={15} className="text-[var(--accent-strong)]" />
              Recruiter passes
            </CardTitle>
            <CardDescription className="mt-1">
              Roles this student has been approved for. Withdrawing a pass
              removes them from that recruiter's feed only.
            </CardDescription>
          </div>
        </CardHeader>

        {data.passes?.length ? (
          <div className="space-y-2">
            {data.passes.map((p) => (
              <div
                key={p._id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--ink)] truncate">
                    {p.jd?.title || "Deleted role"}
                  </div>
                  <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                    {p.jd?.company || "—"} · passed {fmtDateTime(p.createdAt)}
                    {p.note ? ` · "${p.note}"` : ""}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await placementCellApi.setPass(s._id, {
                      jdId: p.jd._id,
                      pass: false,
                    });
                    qc.invalidateQueries({
                      queryKey: ["placement-student", id],
                    });
                    qc.invalidateQueries({ queryKey: ["placement-students"] });
                  }}
                >
                  Withdraw
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[var(--ink-muted)]">
            This student hasn't been passed to any recruiter yet. Use the cohort
            table's <strong>Pass</strong> action once they're ready.
          </p>
        )}
      </Card>

      {/* Audit trail */}
      <Card padding="lg">
        <CardHeader>
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <History size={15} className="text-[var(--accent-strong)]" />
              Decision history
            </CardTitle>
            <CardDescription className="mt-1">
              Append-only: every status change, tag and pass, with who made it
              and when.
            </CardDescription>
          </div>
        </CardHeader>

        {data.auditLog?.length ? (
          <ul className="relative pl-8">
            <span
              aria-hidden
              className="absolute left-[9px] top-3 bottom-3 w-px bg-[var(--border)]"
            />
            {[...data.auditLog].reverse().map((entry, i) => {
              const meta = AUDIT_KIND[entry.kind] || AUDIT_KIND.status;
              return (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
                  className="relative pb-5 last:pb-0"
                >
                  <span
                    className={cn(
                      "absolute -left-[26px] top-1.5 h-3 w-3 rounded-full ring-4 ring-[var(--surface)]",
                      entry.kind === "pass_to_recruiter"
                        ? "bg-[var(--accent)]"
                        : entry.kind === "pass_withdrawn"
                          ? "bg-[var(--ink-muted)]"
                          : "bg-[var(--accent-soft)] border border-[var(--accent)]",
                    )}
                  />
                  <div className="flex items-flex-start gap-2 flex-wrap">
                    <Badge tone={meta.tone} className="text-[10px]">
                      {meta.label}
                    </Badge>
                    {entry.from && entry.to && (
                      <span className="text-xs text-[var(--ink)]">
                        {entry.from.replace(/_/g, " ")} →{" "}
                        <strong>{entry.to.replace(/_/g, " ")}</strong>
                      </span>
                    )}
                  </div>
                  {entry.note && (
                    <p className="text-xs text-[var(--ink-muted)] mt-1 leading-relaxed">
                      “{entry.note}”
                    </p>
                  )}
                  <div className="text-[10px] text-[var(--ink-muted)] mt-1">
                    {entry.byName || "Placement cell"} · {fmtDateTime(entry.at)}
                  </div>
                </motion.li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-[var(--ink-muted)]">
            No decisions recorded yet for this student.
          </p>
        )}
      </Card>
    </div>
  );
}
