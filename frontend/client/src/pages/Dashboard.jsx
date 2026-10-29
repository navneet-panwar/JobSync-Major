import { useNavigate } from "react-router-dom";
import {
  Gauge,
  Layers,
  Lightbulb,
  KeyRound,
  UploadCloud,
  Sparkles,
  Target,
  ArrowRight,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { ScoreEvolutionChart } from "@/components/dashboard/ScoreEvolutionChart";
import { AtsGauge } from "@/components/dashboard/AtsGauge";
import { ProfileCard } from "@/components/dashboard/ProfileCard";
import { VersionStack } from "@/components/dashboard/VersionStack";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { ReadinessRing } from "@/components/readiness/ReadinessRing";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { useAuth } from "@/context/AuthContext";
import { useDashboard } from "@/hooks/useDashboard";
import { useLatestReadiness } from "@/hooks/useReadiness";
import { useJobDescriptions } from "@/hooks/useJobDescriptions";

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data, isLoading, error } = useDashboard();

  // Readiness is the headline number in JobSync — the ATS score is one input to
  // it, not the goal. The dashboard therefore leads with readiness and shows the
  // ATS score beneath it as a contributor.
  const { data: readinessData } = useLatestReadiness();
  const readiness = readinessData?.readiness || null;
  const { data: jdData } = useJobDescriptions();
  const jds = jdData?.jds || [];

  if (isLoading) return <DashboardSkeleton />;

  if (error) {
    return (
      <EmptyState
        icon={Gauge}
        title="Couldn't load your dashboard"
        description={error.message}
      />
    );
  }

  const { totals, latestResume, scoreSeries, versionStack, kpi, activity } =
    data || {};

  if (!totals?.resumes) {
    return (
      <EmptyState
        icon={UploadCloud}
        title="Welcome — let's find your readiness"
        description="Upload a resume to get it parsed and ATS-scored, then measure your readiness against a real role and get a plan for the gaps."
        action={
          <Button variant="accent" size="lg" onClick={() => nav("/resumes")}>
            Upload your first resume
          </Button>
        }
      />
    );
  }

  const profileStats = [
    { label: "Resumes", value: totals.resumes },
    { label: "Rewrites", value: totals.rewrites },
    { label: "Analyses", value: totals.analyses },
  ];

  const current = kpi?.atsScore?.value;
  const first = scoreSeries?.[0]?.score;
  const evolutionDelta = current != null && first != null ? current - first : 0;

  return (
    <div className="space-y-6">
      {/* THE headline: readiness against a real role. Everything else on this
          page exists to explain or improve this number. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7">
          {readiness ? (
            <ReadinessRing readiness={readiness} />
          ) : (
            <Card padding="lg" className="h-full flex flex-col items-center justify-center text-center min-h-[320px]">
              <div className="h-14 w-14 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)] flex items-center justify-center mb-3">
                <Target size={22} />
              </div>
              <div className="font-display text-base font-semibold tracking-tight">
                No readiness score yet
              </div>
              <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-sm">
                {jds.length
                  ? "Pick one of your job descriptions and measure how ready you actually are for it."
                  : "Add a job description for a role you're targeting, then measure your readiness against it."}
              </p>
              <Button
                variant="accent"
                size="md"
                className="mt-4"
                onClick={() => nav(jds.length ? "/readiness" : "/jobs")}
              >
                <Target size={14} />
                {jds.length ? "Check readiness" : "Add a job description"}
              </Button>
            </Card>
          )}
        </div>

        {/* The ATS score, demoted to what it is: one contributor to readiness. */}
        <div className="lg:col-span-3">
          {current != null ? (
            <div className="space-y-3">
              <AtsGauge score={current} delta={kpi?.atsScore?.delta ?? 0} />
              <p className="text-[11px] text-[var(--ink-muted)] leading-relaxed px-1">
                Resume quality is <strong>20%</strong> of your readiness score —
                it matters, but skill fit matters more.
              </p>
            </div>
          ) : (
            <Card className="h-full flex items-center justify-center text-center">
              <div className="font-display text-sm font-semibold mb-1">
                No ATS score yet
              </div>
              <div className="text-xs text-[var(--ink-muted)]">
                Run analysis to populate
              </div>
            </Card>
          )}
        </div>
        <div className="lg:col-span-2">
          <ProfileCard user={user} stats={profileStats} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          label="Resume quality"
          value={kpi?.atsScore?.value ?? "—"}
          suffix={kpi?.atsScore?.value != null ? "/ 100" : null}
          delta={kpi?.atsScore?.delta}
          chart="bars"
          data={kpi?.atsScore?.spark || []}
          icon={Gauge}
        />
        <StatCard
          label="Versions"
          value={kpi?.versions?.value ?? totals.resumes}
          chart="line"
          data={kpi?.versions?.spark || []}
          icon={Layers}
        />
        <StatCard
          label="Issues identified"
          value={kpi?.issuesIdentified?.value ?? "—"}
          delta={kpi?.issuesIdentified?.delta}
          chart="line"
          data={kpi?.issuesIdentified?.spark || []}
          icon={Lightbulb}
        />
        <StatCard
          label="Keywords matched"
          value={kpi?.keywordsMatched?.value ?? "—"}
          suffix={
            kpi?.keywordsMatched?.total
              ? `/ ${kpi.keywordsMatched.total}`
              : null
          }
          delta={kpi?.keywordsMatched?.delta}
          chart="line"
          data={kpi?.keywordsMatched?.spark || []}
          icon={KeyRound}
          accent
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6">
          {scoreSeries?.length ? (
            <ScoreEvolutionChart
              data={scoreSeries}
              currentScore={current}
              delta={evolutionDelta}
            />
          ) : (
            <NoAnalysisCard
              onAction={() =>
                latestResume?._id && nav(`/resumes/${latestResume._id}`)
              }
            />
          )}
        </div>
        <div className="lg:col-span-6">
          {versionStack?.length ? (
            <VersionStack
              versions={versionStack}
              resumeId={latestResume?._id}
              resumeTitle={latestResume?.title}
            />
          ) : (
            <Card className="h-full flex items-center justify-center text-center min-h-[200px]">
              <div className="font-display text-sm font-semibold mb-1">
                No versions yet
              </div>
              <div className="text-xs text-[var(--ink-muted)]">
                Versions appear after you analyze and rewrite
              </div>
            </Card>
          )}
        </div>
      </div>

      {activity?.length > 0 && <ActivityFeed items={activity} />}
    </div>
  );
}

function NoAnalysisCard({ onAction }) {
  return (
    <Card className="h-full flex flex-col items-center justify-center text-center min-h-[300px]">
      <div className="h-14 w-14 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)] flex items-center justify-center mb-3">
        <Sparkles size={22} />
      </div>
      <div className="font-display text-base font-semibold tracking-tight">
        Ready when you are
      </div>
      <p className="text-sm text-[var(--ink-muted)] mt-1 max-w-sm">
        You've uploaded a resume — run analysis to score its quality, then check
        your readiness against a role you're targeting.
      </p>
      {onAction && (
        <Button variant="accent" size="md" className="mt-4" onClick={onAction}>
          <Sparkles size={14} /> Analyze now
        </Button>
      )}
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[130px] rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Skeleton className="lg:col-span-7 h-[300px] rounded-3xl" />
        <Skeleton className="lg:col-span-3 h-[300px] rounded-3xl" />
        <Skeleton className="lg:col-span-2 h-[300px] rounded-3xl" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Skeleton className="lg:col-span-7 h-[260px] rounded-3xl" />
        <Skeleton className="lg:col-span-3 h-[260px] rounded-3xl" />
        <Skeleton className="lg:col-span-2 h-[260px] rounded-3xl" />
      </div>
    </div>
  );
}
