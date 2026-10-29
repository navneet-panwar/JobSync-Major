import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { motion } from "framer-motion";
import { BarChart3, AlertTriangle } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { placementCellApi } from "@/api/placementCell";
import { PLACEMENT_STATUSES, placementStatusMeta } from "./placementStatus";

/**
 * CohortAnalytics — the batch-level view a placement cell reports on.
 *
 * Charts reuse the existing Recharts theme (accent + ink-muted, same axis
 * treatment as ScoreEvolutionChart) so a chart looks identical wherever it
 * appears in JobSync.
 */
export function CohortAnalytics() {
  const { data, isLoading } = useQuery({
    queryKey: ["placement-analytics"],
    queryFn: placementCellApi.analytics,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.empty || !data.totals?.students) return null;

  const distribution = data.distribution || [];
  const topGaps = data.topGaps || [];
  const statusCounts = (data.statusCounts || []).filter((s) => s.count > 0);

  // Status donut colours, taken from the same vocabulary as the badges.
  const STATUS_FILL = {
    not_reviewed: "var(--ink-muted)",
    referred: "var(--accent)",
    shortlisted: "var(--success)",
    hired: "var(--accent-strong)",
    needs_improvement: "var(--warning)",
    critical: "var(--danger)",
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <BarChart3 size={15} className="text-[var(--accent-strong)]" />
        <span className="text-[11px] uppercase tracking-wider font-semibold text-[var(--ink-muted)]">
          Cohort analytics
        </span>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Students", value: data.totals.students },
          {
            label: "Scored",
            value: data.totals.scored,
            hint: `${data.totals.unscored} never checked readiness`,
          },
          {
            label: "Average readiness",
            value: data.totals.averageReadiness
              ? `${data.totals.averageReadiness}%`
              : "—",
            hint: data.totals.medianReadiness
              ? `median ${data.totals.medianReadiness}%`
              : undefined,
          },
          {
            label: "Needs attention",
            value: data.totals.needsAttention ?? 0,
            hint: "marked needs improvement or critical",
          },
        ].map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.25,
              delay: i * 0.05,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <Card padding="lg">
              <div className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
                {k.label}
              </div>
              <div className="font-display tabular text-2xl font-semibold text-[var(--ink)] mt-1">
                {k.value}
              </div>
              {k.hint && (
                <div className="text-[10px] text-[var(--ink-muted)] mt-0.5">
                  {k.hint}
                </div>
              )}
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Readiness distribution */}
        <Card padding="lg">
          <CardHeader>
            <div>
              <CardTitle className="text-sm">Readiness distribution</CardTitle>
              <CardDescription className="mt-1">
                How the cohort spreads across score bands
              </CardDescription>
            </div>
          </CardHeader>
          {data.totals.scored === 0 ? (
            <p className="text-xs text-[var(--ink-muted)]">
              No student has checked readiness yet.
            </p>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={distribution}
                  margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
                >
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "var(--ink)" }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {distribution.map((_, i) => (
                      <Cell
                        key={i}
                        fill={
                          i === 3
                            ? "var(--success)"
                            : i === 2
                              ? "var(--accent)"
                              : i === 1
                                ? "var(--warning)"
                                : "var(--danger)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Status breakdown */}
        <Card padding="lg">
          <CardHeader>
            <div>
              <CardTitle className="text-sm">Status breakdown</CardTitle>
              <CardDescription className="mt-1">
                Where the cohort stands in the process
              </CardDescription>
            </div>
          </CardHeader>
          {statusCounts.length === 0 ? (
            <p className="text-xs text-[var(--ink-muted)]">
              No status set yet.
            </p>
          ) : (
            <>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusCounts}
                      dataKey="count"
                      nameKey="status"
                      innerRadius={38}
                      outerRadius={62}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {statusCounts.map((s, i) => (
                        <Cell
                          key={i}
                          fill={STATUS_FILL[s.status] || "var(--ink-muted)"}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                      formatter={(value, _n, item) => [
                        value,
                        placementStatusMeta(item?.payload?.status).label,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {statusCounts.map((s) => (
                  <Badge
                    key={s.status}
                    tone={placementStatusMeta(s.status).tone}
                    className="text-[10px]"
                  >
                    {placementStatusMeta(s.status).label}: {s.count}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Training needs — the actionable report */}
        <Card padding="lg">
          <CardHeader>
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle size={13} className="text-[var(--warning)]" />
                Common skill gaps
              </CardTitle>
              <CardDescription className="mt-1">
                What this cohort most needs taught
              </CardDescription>
            </div>
          </CardHeader>
          {topGaps.length === 0 ? (
            <p className="text-xs text-[var(--ink-muted)]">
              No gaps recorded — students need a readiness check first.
            </p>
          ) : (
            <ul className="space-y-2">
              {topGaps.slice(0, 7).map((g, i) => {
                const max = topGaps[0].count || 1;
                return (
                  <li key={g.skill}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-[var(--ink)] truncate">
                        {g.skill}
                      </span>
                      <span className="tabular text-[var(--ink-muted)] shrink-0 ml-2">
                        {g.count}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-[var(--warning)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${(g.count / max) * 100}%` }}
                        transition={{
                          duration: 0.5,
                          delay: i * 0.05,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export default CohortAnalytics;
