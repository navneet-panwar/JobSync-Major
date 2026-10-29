import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase,
  Lock,
  Users,
  ChevronDown,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  MapPin,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { placementCellApi } from "@/api/placementCell";
import { cn } from "@/lib/utils";

/**
 * PlacementPlacements — the recruitment pipeline, role by role.
 *
 * The Students page answers "who is in my college"; this answers "what is
 * actually happening with each opening". A placement cell's real question is
 * "which of our drives have candidates in flight, and where is each one stuck?"
 *
 * Each role card shows the honest funnel — passed → shortlisted / rejected —
 * and expands to the students themselves, so a cell can see who is waiting on a
 * recruiter decision without leaving the page.
 */
function RolePipelineCard({ role, index, onOpenStudent }) {
  const [expanded, setExpanded] = useState(false);

  const shortlisted = role.shortlisted || 0;
  const rejected = role.rejected || 0;
  const passed = role.passedCount || 0;
  const pending = Math.max(0, passed - shortlisted - rejected);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        delay: Math.min(index * 0.04, 0.3),
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <Card padding="lg">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-display text-[15px] font-semibold text-[var(--ink)] truncate">
              {role.title}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-[var(--ink-muted)]">
              {role.company && (
                <span className="inline-flex items-center gap-1">
                  <Building2 size={11} /> {role.company}
                </span>
              )}
              {role.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={11} /> {role.location}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Users size={11} /> {role.recruiter || "Recruiter"}
              </span>
            </div>
          </div>

          <Badge
            tone={role.status === "active" ? "accent" : "neutral"}
            className="text-[10px] shrink-0"
          >
            {role.status === "active" ? "Open" : role.status || "open"}
          </Badge>
        </div>

        {/* The funnel — the honest numbers */}
        <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-[var(--border)]">
          {[
            { label: "Passed", value: passed, tone: "text-[var(--ink)]" },
            { label: "Pending", value: pending, tone: "text-[var(--warning)]" },
            {
              label: "Shortlisted",
              value: shortlisted,
              tone: "text-[var(--success)]",
            },
            {
              label: "Rejected",
              value: rejected,
              tone: "text-[var(--ink-muted)]",
            },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
                {s.label}
              </div>
              <div
                className={cn(
                  "font-display tabular text-lg font-semibold",
                  s.tone,
                )}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Skill chips — what this role actually asks for */}
        {role.requiredSkills?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-4">
            {role.requiredSkills.slice(0, 6).map((s) => (
              <span
                key={s}
                className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)]"
              >
                {s}
              </span>
            ))}
            {role.requiredSkills.length > 6 && (
              <span className="text-[10px] text-[var(--ink-muted)] pt-0.5">
                +{role.requiredSkills.length - 6} more
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-[var(--border)]">
          <p className="text-[11px] text-[var(--ink-muted)] leading-relaxed">
            {passed === 0 ? (
              <>
                <Lock size={10} className="inline mr-1" />
                No students passed yet — the recruiter cannot see anyone until
                you approve them.
              </>
            ) : pending > 0 ? (
              <>
                <Clock size={10} className="inline mr-1" />
                {pending} waiting on a recruiter decision.
              </>
            ) : (
              <>
                <CheckCircle2 size={10} className="inline mr-1" />
                Every passed student has a decision.
              </>
            )}
          </p>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            disabled={passed === 0}
          >
            <Users size={13} /> Candidates
            <ChevronDown
              size={12}
              className={cn("transition-transform", expanded && "rotate-180")}
            />
          </Button>
        </div>

        {/* The students behind the numbers */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-1.5">
                <RoleCandidates
                  roleId={role._id}
                  onOpenStudent={onOpenStudent}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

/** The passed students for one role, with the recruiter's decision on each. */
function RoleCandidates({ roleId, onOpenStudent }) {
  const { data, isLoading } = useQuery({
    queryKey: ["placement-pipeline-candidates", roleId],
    queryFn: () => placementCellApi.pipelineCandidates(roleId),
  });

  if (isLoading) return <Skeleton className="h-16 w-full" />;

  const candidates = data?.candidates || [];
  if (!candidates.length) {
    return (
      <p className="text-[11px] text-[var(--ink-muted)]">
        No students passed into this role yet.
      </p>
    );
  }

  const DECISION = {
    shortlisted: { label: "Shortlisted", tone: "success", icon: CheckCircle2 },
    rejected: { label: "Rejected", tone: "danger", icon: XCircle },
    none: { label: "Awaiting decision", tone: "warning", icon: Clock },
  };

  return (
    <>
      {candidates.map((c) => {
        const d = DECISION[c.decision] || DECISION.none;
        const Icon = d.icon;
        return (
          <button
            key={c._id}
            onClick={() => onOpenStudent(c._id)}
            className="w-full flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-left hover:bg-[var(--surface)] transition-colors"
          >
            <span className="h-8 w-8 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] font-semibold flex items-center justify-center text-[11px] shrink-0">
              {(c.name?.[0] || "?").toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-[var(--ink)] truncate">
                {c.name}
              </span>
              <span className="block text-[10px] text-[var(--ink-muted)] truncate">
                {c.readiness != null ? `${c.readiness}% ready` : "not scored"}
                {c.consent?.shownToRecruiters === false
                  ? " · consent withdrawn"
                  : ""}
              </span>
            </span>
            <Badge tone={d.tone} className="text-[10px] shrink-0">
              <Icon size={9} /> {d.label}
            </Badge>
          </button>
        );
      })}
    </>
  );
}

export default function PlacementPlacements() {
  const nav = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["placement-pipeline"],
    queryFn: placementCellApi.pipeline,
  });

  const roles = data?.jds || [];

  if (error) {
    return (
      <EmptyState
        icon={Briefcase}
        title="Couldn't load the placement pipeline"
        description={error.message}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Placements"
        description="Every role recruiters have opened to your college, and where each one stands."
      />

      {/* The gate, restated where it matters */}
      <div className="flex items-start gap-2.5 rounded-2xl bg-[var(--accent-soft)] px-4 py-3">
        <Lock
          size={15}
          className="text-[var(--accent-strong)] shrink-0 mt-0.5"
        />
        <p className="text-xs text-[var(--accent-strong)] leading-relaxed">
          A recruiter sees <strong>only</strong> the students you pass. Nothing
          moves into their view without a decision here — that is the gate, and
          it is why these numbers are the honest ones.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : roles.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No roles open to your college"
          description="When a recruiter posts a job description to your college, it appears here and you can start passing students into it."
          action={
            <Button variant="accent" onClick={() => nav("/placement/students")}>
              <Send size={13} /> Go to Students
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {roles.map((role, i) => (
            <RolePipelineCard
              key={role._id}
              role={role}
              index={i}
              onOpenStudent={(id) => nav(`/placement/students/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
