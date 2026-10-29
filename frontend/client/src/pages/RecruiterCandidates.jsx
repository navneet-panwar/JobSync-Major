import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Lock,
  Check,
  X,
  Loader2,
  ShieldCheck,
  ChevronDown,
  EyeOff,
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
import { readinessTone } from "@/components/placement/placementStatus";
import { recruiterApi } from "@/api/recruiter";
import { useToast } from "@/context/UIContext";
import { cn } from "@/lib/utils";

function CandidateRow({ candidate, onDecide, deciding }) {
  const [expanded, setExpanded] = useState(false);
  const decided = candidate.decision;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "px-6 py-4 transition-colors",
        decided === "rejected" ? "opacity-50" : "hover:bg-[var(--surface-2)]",
      )}
    >
      <div className="flex items-start gap-4">
        {/* Rank — display serif, the one editorial flourish */}
        <span className="font-serif italic text-2xl text-[var(--ink-muted)] tabular w-8 shrink-0 leading-none pt-1">
          {candidate.rank}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[var(--ink)]">
              {candidate.name}
            </span>

            {/* THE college tag — always visible, never optional */}
            <Badge tone="neutral" className="text-[10px]">
              <Lock size={9} /> {candidate.collegeTag}
            </Badge>

            {candidate.readiness != null && (
              <Badge
                tone={readinessTone(candidate.readiness)}
                className="tabular text-[10px]"
              >
                {candidate.readiness}% ready
              </Badge>
            )}

            {decided === "shortlisted" && (
              <Badge tone="success" className="text-[10px]">
                <Check size={9} /> Shortlisted
              </Badge>
            )}
            {decided === "rejected" && (
              <Badge tone="danger" className="text-[10px]">
                <X size={9} /> Rejected
              </Badge>
            )}
          </div>

          {/* Skill preview */}
          <div className="flex flex-wrap gap-1 mt-2">
            {candidate.matchedSkills?.slice(0, 5).map((s) => (
              <span
                key={s}
                className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)]"
              >
                {s}
              </span>
            ))}
            {candidate.missingSkills?.slice(0, 3).map((s) => (
              <span
                key={s}
                className="text-[10px] px-2 py-0.5 rounded-full bg-[#F8E3E0] text-[var(--danger)]"
              >
                {s}
              </span>
            ))}
          </div>

          {candidate.passNote && (
            <div className="mt-2 flex items-start gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2">
              <ShieldCheck
                size={11}
                className="text-[var(--accent-strong)] mt-0.5 shrink-0"
              />
              <p className="text-[11px] text-[var(--ink-muted)] leading-relaxed">
                <span className="font-medium text-[var(--ink)]">
                  Placement cell note:
                </span>{" "}
                {candidate.passNote}
              </p>
            </div>
          )}

          <AnimatePresence>
            {expanded && candidate.readinessSummary && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <p className="text-xs text-[var(--ink-muted)] mt-2 leading-relaxed">
                  {candidate.readinessSummary}
                </p>
                {candidate.trainingTags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {candidate.trainingTags.map((t) => (
                      <Badge key={t} tone="warning" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-[var(--ink-muted)] mt-2">
                  Passed {new Date(candidate.passedAt).toLocaleDateString()} ·{" "}
                  {candidate.email}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronDown
              size={13}
              className={cn("transition-transform", expanded && "rotate-180")}
            />
          </Button>
          <Button
            variant={decided === "shortlisted" ? "accent" : "outline"}
            size="sm"
            onClick={() =>
              onDecide(
                candidate,
                decided === "shortlisted" ? "none" : "shortlisted",
              )
            }
            disabled={deciding}
          >
            {deciding ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Check size={13} />
            )}
            {decided === "shortlisted" ? "Undo" : "Shortlist"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onDecide(candidate, decided === "rejected" ? "none" : "rejected")
            }
            disabled={deciding}
            className={decided === "rejected" ? "" : "text-[var(--ink-muted)]"}
          >
            <X size={13} />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export default function RecruiterCandidates() {
  const [params, setParams] = useSearchParams();
  const [jdId, setJdId] = useState(params.get("jdId") || "");
  const qc = useQueryClient();
  const toast = useToast();

  const { data: jdsData } = useQuery({
    queryKey: ["recruiter-jds"],
    queryFn: recruiterApi.jds,
  });
  const jds = jdsData?.jds || [];

  useEffect(() => {
    if (!jdId && jds.length) setJdId(jds[0]._id);
  }, [jds, jdId]);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (jdId) next.set("jdId", jdId);
    else next.delete("jdId");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jdId]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["recruiter-candidates", jdId],
    queryFn: () => recruiterApi.candidates(jdId),
    enabled: !!jdId,
  });

  const decide = useMutation({
    mutationFn: ({ studentId, decision }) =>
      recruiterApi.decide(studentId, { jdId, decision }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["recruiter-candidates", jdId] });
      qc.invalidateQueries({ queryKey: ["recruiter-jds"] });
      const who = data?.candidates?.find((c) => c._id === vars.studentId);
      toast.success(
        vars.decision === "none"
          ? `${who?.name} restored`
          : `${who?.name} ${vars.decision}`,
      );
    },
    onError: (err) =>
      toast.error("Couldn't record that decision", err?.message),
  });

  if (!jds.length) {
    return (
      <div className="space-y-6">
        <PageHeader title="Candidates" />
        <EmptyState
          icon={Users}
          title="No roles posted yet"
          description="Post a job description to a college first — its placement cell then decides who you can see."
        />
      </div>
    );
  }

  const candidates = data?.candidates || [];
  const active = candidates.filter((c) => c.decision !== "rejected");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Candidates"
        description="Only students their placement cell has approved for this role appear here — ranked by readiness."
      />

      {/* Role selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-[var(--ink-muted)] mr-1">Role:</span>
        <div className="flex flex-wrap gap-1.5">
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
              <span className="ml-1.5 tabular opacity-70">
                {j.candidateCounts?.passed ?? 0}
              </span>
            </button>
          ))}
        </div>
        {isFetching && !isLoading && (
          <span className="text-xs text-[var(--ink-muted)] ml-auto">
            Updating…
          </span>
        )}
      </div>

      {isLoading ? (
        <Card padding="lg">
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </Card>
      ) : candidates.length === 0 ? (
        <EmptyState
          icon={Lock}
          title="No candidates passed through yet"
          description={`${data?.jd?.collegeTag || "The college"}'s placement cell hasn't approved any students for this role. That's the gate working as intended — you'll be notified as soon as they do.`}
        />
      ) : (
        <>
          {/* The gate, explained honestly to the recruiter */}
          <div className="flex items-center gap-2.5 rounded-2xl bg-[var(--accent-soft)] px-4 py-3">
            <ShieldCheck
              size={15}
              className="text-[var(--accent-strong)] shrink-0"
            />
            <p className="text-xs text-[var(--accent-strong)] leading-relaxed">
              <strong>{active.length}</strong> candidate
              {active.length === 1 ? "" : "s"} approved by{" "}
              {data?.jd?.collegeTag || "a placement cell"} for{" "}
              <strong>{data?.jd?.title}</strong>. Every candidate here was
              reviewed by their institution before reaching you.
            </p>
          </div>

          {(data?.withheldForConsent ?? 0) > 0 && (
            <div className="flex items-center gap-2.5 rounded-2xl bg-[#FBF1E2] px-4 py-3">
              <EyeOff size={14} className="text-[var(--warning)] shrink-0" />
              <p className="text-xs text-[var(--warning)] leading-relaxed">
                {data.withheldForConsent} approved student
                {data.withheldForConsent === 1 ? "" : "s"} withdrew consent to
                be shown to recruiters and{" "}
                {data.withheldForConsent === 1 ? "is" : "are"} hidden.
              </p>
            </div>
          )}

          <Card padding="none" className="overflow-hidden">
            <CardHeader className="px-6 pt-6">
              <div>
                <CardTitle className="text-base">Ranked by readiness</CardTitle>
                <CardDescription className="mt-1">
                  Rank is computed server-side from each student's composite
                  readiness for this exact role.
                </CardDescription>
              </div>
            </CardHeader>

            <div className="divide-y divide-[var(--border)] mt-2">
              {candidates.map((c) => (
                <CandidateRow
                  key={c._id}
                  candidate={c}
                  deciding={decide.isPending}
                  onDecide={(cand, decision) =>
                    decide.mutate({ studentId: cand._id, decision })
                  }
                />
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
