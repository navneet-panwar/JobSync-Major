import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Target, Loader2, Info } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { ReadinessRing } from "@/components/readiness/ReadinessRing";
import { SkillMatchPanel } from "@/components/readiness/SkillMatchPanel";
import { useJobDescriptions } from "@/hooks/useJobDescriptions";
import { useResumesList } from "@/hooks/useResumes";
import { useLatestReadiness, useComputeReadiness } from "@/hooks/useReadiness";
import { cn } from "@/lib/utils";

export default function Readiness() {
  const [params, setParams] = useSearchParams();
  const [jdId, setJdId] = useState(params.get("jdId") || "");
  const [resumeId, setResumeId] = useState("");

  const { data: jdData, isLoading: jdLoading } = useJobDescriptions();
  const { data: resumes, isLoading: resumesLoading } = useResumesList();
  const { data: readiness, isLoading: readinessLoading } = useLatestReadiness(
    jdId || undefined,
  );
  const compute = useComputeReadiness();

  const jds = jdData?.jds || [];

  // Default selection: open on the role that has ALREADY been scored, else the
  // first role, else "" — which is the "My resume" baseline. A student with no
  // job descriptions at all used to hit a dead-end page; now the baseline is
  // the opening view and a JD is an upgrade, not a prerequisite.
  useEffect(() => {
    if (jdId || !jds.length) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/readiness", { credentials: "include" });
        const data = await res.json();
        const scoredIds = new Set((data.scores || []).map((s) => s.jdId));
        if (cancelled) return;
        const scored = jds.find((j) => scoredIds.has(j._id));
        setJdId((scored || jds[0])._id);
      } catch {
        if (!cancelled) setJdId(jds[0]._id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jds, jdId]);

  const isBaseline = !jdId;

  useEffect(() => {
    if (!resumeId && resumes?.length) setResumeId(resumes[0]._id);
  }, [resumes, resumeId]);

  // Keep the URL in step so a link like /readiness?jdId=… is shareable and
  // survives a refresh.
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (jdId) next.set("jdId", jdId);
    else next.delete("jdId");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jdId]);

  const selectedJd = jds.find((j) => j._id === jdId);
  const selectedResume = (resumes || []).find((r) => r._id === resumeId);

  function runScore() {
    if (!resumeId) return;
    compute.mutate({ resumeId, ...(jdId ? { jdId } : {}) });
  }

  if (jdLoading || resumesLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Readiness"
          description="How well your resume fits a specific role."
        />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Skeleton className="lg:col-span-5 h-[520px]" />
          <Skeleton className="lg:col-span-7 h-[520px]" />
        </div>
      </div>
    );
  }

  // Only a resume is truly required — without one there is nothing to measure.
  if (!resumes?.length) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Readiness"
          description="How well your resume fits a specific role."
        />
        <EmptyState
          icon={Target}
          title="Upload a resume first"
          description="Readiness scores your resume — against a job description, or against the role your resume implies."
        />
      </div>
    );
  }

  const isStale =
    readiness &&
    selectedResume &&
    readiness.resumeVersionId !== selectedResume.currentVersionId;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Readiness"
        description="A weighted score combining skill fit, project relevance, experience relevance and resume quality."
      />

      {/* Target selector — "My resume" is the baseline when no role is picked */}
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

      {/* Resume selector + action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--ink-muted)] mr-1">Resume:</span>
          {(resumes || []).length === 1 ? (
            <Badge tone="neutral" className="h-8 px-3.5 text-xs">
              {resumes[0].title} · V{resumes[0].latestVersionNumber}
            </Badge>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(resumes || []).map((r) => (
                <button
                  key={r._id}
                  onClick={() => setResumeId(r._id)}
                  className={cn(
                    "h-8 px-3.5 rounded-full text-xs font-medium border transition-all duration-200 active:scale-[0.98]",
                    resumeId === r._id
                      ? "bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent)]/30"
                      : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--border)] hover:text-[var(--ink)]",
                  )}
                >
                  {r.title} · V{r.latestVersionNumber}
                </button>
              ))}
            </div>
          )}
        </div>

        <Button
          variant="accent"
          onClick={runScore}
          disabled={compute.isPending || !resumeId}
        >
          {compute.isPending ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Scoring…
            </>
          ) : (
            <>
              <Target size={14} />
              {readiness ? "Re-check readiness" : "Check readiness"}
            </>
          )}
        </Button>
      </div>

      {readinessLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Skeleton className="lg:col-span-5 h-[520px]" />
          <Skeleton className="lg:col-span-7 h-[520px]" />
        </div>
      ) : readiness ? (
        <>
          {isStale && !isBaseline && (
            <div className="rounded-2xl bg-[#FBF1E2] px-5 py-3 text-xs text-[var(--warning)] leading-relaxed">
              This score was computed against an older version of “
              {selectedResume.title}”. You've since created a newer version —
              re-check to see your current fit.
            </div>
          )}

          {/* A baseline is not a posting score — say so before the number lands. */}
          {isBaseline && (
            <div className="rounded-2xl bg-[var(--surface-2)] px-5 py-3.5 flex items-start gap-2.5">
              <Info size={14} className="text-[var(--accent-strong)] mt-0.5 shrink-0" />
              <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
                No job description selected, so this measures your resume against
                the role it most resembles
                {readiness.target?.title ? (
                  <>
                    {" "}
                    (<span className="font-medium text-[var(--ink)]">{readiness.target.title}</span>)
                  </>
                ) : null}
                {`. Pick a role above to score against a real posting.`}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-5">
              <ReadinessRing readiness={readiness} isBaseline={isBaseline} />
            </div>
            <div className="lg:col-span-7">
              <SkillMatchPanel skillMatch={readiness.skillMatch} />
            </div>
          </div>

          {/* Relevance rationales — the "why" behind the two judged sub-scores */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Card padding="lg">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-sm">Project relevance</CardTitle>
                  <Badge
                    tone={
                      readiness.projectRelevance?.percent >= 65
                        ? "success"
                        : readiness.projectRelevance?.percent >= 40
                          ? "warning"
                          : "danger"
                    }
                  >
                    {readiness.projectRelevance?.percent ?? 0}%
                  </Badge>
                </div>
              </CardHeader>
              <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
                {readiness.projectRelevance?.rationale ||
                  "No rationale provided."}
              </p>
            </Card>

            <Card padding="lg">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-sm">
                    Experience relevance
                  </CardTitle>
                  <Badge
                    tone={
                      readiness.experienceRelevance?.percent >= 65
                        ? "success"
                        : readiness.experienceRelevance?.percent >= 40
                          ? "warning"
                          : "danger"
                    }
                  >
                    {readiness.experienceRelevance?.percent ?? 0}%
                  </Badge>
                </div>
              </CardHeader>
              <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
                {readiness.experienceRelevance?.rationale ||
                  "No rationale provided."}
              </p>
            </Card>
          </div>

          {readiness.model && (
            <p className="text-[10px] text-[var(--ink-muted)]">
              Scored by {readiness.model} ·{" "}
              {new Date(readiness.createdAt).toLocaleString()}
            </p>
          )}
        </>
      ) : (
        <EmptyState
          icon={Target}
          title={isBaseline ? "No baseline yet" : "No score yet for this role"}
          description={
            isBaseline
              ? `Run a check to see how “${selectedResume?.title}” stands against the engineering role it most resembles.`
              : `Run a readiness check to compare “${selectedResume?.title}” against “${selectedJd?.title}”.`
          }
          action={
            <Button
              variant="accent"
              onClick={runScore}
              disabled={compute.isPending}
            >
              {compute.isPending ? "Scoring…" : "Check readiness"}
            </Button>
          }
        />
      )}
    </div>
  );
}
