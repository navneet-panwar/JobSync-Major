import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

// Same geometry as the dashboard AtsGauge so the two gauges feel like
// siblings, just larger — this is the page's focal point.
const RADIUS = 118;
const ARC_LENGTH = Math.PI * RADIUS;
const STROKE = 16;

const BANDS = [
  {
    min: 80,
    label: "Interview-ready",
    tone: "success",
    color: "var(--success)",
  },
  { min: 65, label: "Strong", tone: "success", color: "var(--accent)" },
  { min: 45, label: "Developing", tone: "warning", color: "var(--warning)" },
  { min: 0, label: "Early", tone: "danger", color: "var(--danger)" },
];

function bandFor(score) {
  return BANDS.find((b) => score >= b.min) || BANDS[BANDS.length - 1];
}

/** Animated count-up — identical easing to the dashboard gauge. */
function useCountUp(target, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target == null) return;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4); // easeOutQuart
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/**
 * ReadinessRing — the composite score, plus the four weighted contributors as
 * sub-bars that fill in sequence so the number is explainable, not just stated.
 */
export function ReadinessRing({ readiness, isBaseline = false }) {
  const composite = readiness?.composite ?? 0;
  const band = bandFor(composite);
  const animated = useCountUp(composite);
  const targetTitle = readiness?.target?.title;

  const dashLength = ARC_LENGTH * (composite / 100);
  const breakdown = readiness?.breakdown || [];

  return (
    <Card padding="lg" className="h-full flex flex-col">
      <CardHeader>
        <div>
          <CardTitle className="text-base">
            {isBaseline
              ? `Resume baseline${targetTitle ? ` · ${targetTitle}` : ""}`
              : "Readiness for this role"}
          </CardTitle>
          <CardDescription className="mt-1">
            Skill fit, project and experience relevance, and resume quality
            combined
          </CardDescription>
        </div>
      </CardHeader>

      <div className="flex flex-col items-center">
        <div
          className="relative"
          style={{
            width: RADIUS * 2 + STROKE * 2,
            height: RADIUS + STROKE + 8,
          }}
        >
          <svg
            width={RADIUS * 2 + STROKE * 2}
            height={RADIUS + STROKE + 8}
            viewBox={`0 0 ${RADIUS * 2 + STROKE * 2} ${RADIUS + STROKE + 8}`}
          >
            <g transform={`translate(${STROKE}, ${STROKE + 4})`}>
              <path
                d={`M 0 ${RADIUS} A ${RADIUS} ${RADIUS} 0 0 1 ${RADIUS * 2} ${RADIUS}`}
                fill="none"
                stroke="var(--border)"
                strokeWidth={STROKE}
                strokeLinecap="round"
              />
              <motion.path
                d={`M 0 ${RADIUS} A ${RADIUS} ${RADIUS} 0 0 1 ${RADIUS * 2} ${RADIUS}`}
                fill="none"
                stroke={band.color}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${dashLength} ${ARC_LENGTH}`}
                initial={{ strokeDasharray: `0 ${ARC_LENGTH}` }}
                animate={{ strokeDasharray: `${dashLength} ${ARC_LENGTH}` }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              />
            </g>
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
            <div className="font-display tabular text-[52px] font-semibold leading-none text-[var(--ink)]">
              {animated}
              <span className="text-[22px] text-[var(--ink-muted)]">%</span>
            </div>
            <Badge tone={band.tone} className="mt-2 text-[10px]">
              {band.label}
            </Badge>
          </div>
        </div>
      </div>

      {/* The four contributors — the score is arithmetic, so show the arithmetic */}
      <div className="mt-6 space-y-3">
        {breakdown.map((b, i) => (
          <motion.div
            key={b.key}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.25,
              delay: 0.15 + i * 0.1,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-[var(--ink-muted)]">
                {b.label}
                <span className="ml-1.5 text-[10px] opacity-70">
                  {Math.round(b.weight * 100)}%
                </span>
              </span>
              <span className="tabular font-medium text-[var(--ink)]">
                {b.value}
                <span className="text-[10px] text-[var(--ink-muted)] ml-1">
                  → {b.contribution.toFixed(1)}
                </span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
              <motion.div
                className={cn("h-full rounded-full")}
                style={{
                  background:
                    b.value >= 65
                      ? "var(--accent)"
                      : b.value >= 40
                        ? "var(--warning)"
                        : "var(--danger)",
                }}
                initial={{ width: 0 }}
                animate={{ width: `${b.value}%` }}
                transition={{
                  duration: 0.6,
                  delay: 0.3 + i * 0.1,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      <p className="text-[11px] text-[var(--ink-muted)] mt-4 leading-relaxed">
        Weighted sum of the four bars above — a low bar is the fastest way to
        raise the score.
      </p>
    </Card>
  );
}

export { bandFor };
export default ReadinessRing;
