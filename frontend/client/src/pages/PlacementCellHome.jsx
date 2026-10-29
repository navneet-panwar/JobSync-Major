import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Building2,
  Briefcase,
  Copy,
  GraduationCap,
  Sparkles,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/UIContext";
import { authApi } from "@/api/auth";

/**
 * PlacementCellHome — the landing workspace for a placement-cell account.
 * Students and recruiters never see this; their own homes are separate.
 *
 * Phase 6 will extend this page with the live cohort table. Today it shows
 * the college identity + the registration code the cell shares with students,
 * so a brand-new cell account has something real to do immediately.
 */
export default function PlacementCellHome() {
  const { user } = useAuth();
  const toast = useToast();
  const [college, setCollege] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    authApi
      .myCollege()
      .then((d) => alive && setCollege(d.college))
      .catch(() => alive && setCollege(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(college.code);
      toast.success("Code copied — share it with your students");
    } catch {
      toast.error(`Copy failed — your code is ${college.code}`);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${user?.name?.split(" ")[0] || "there"}`}
        description="Your placement-cell workspace — share your college code so students can join JobSync."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* College code card — the cell's primary action today */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-7"
        >
          <Card padding="lg" className="h-full">
            <CardHeader>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2
                    size={16}
                    className="text-[var(--accent-strong)]"
                  />
                  {college?.name || (loading ? "Loading college…" : "College")}
                </CardTitle>
                <CardDescription className="mt-1">
                  Students register with this code to join your college on
                  JobSync.
                </CardDescription>
              </div>
            </CardHeader>

            {loading ? (
              <Skeleton className="h-14 w-full" />
            ) : college ? (
              <>
                <button
                  type="button"
                  onClick={copyCode}
                  className="group w-full h-16 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--accent-soft)] transition-colors duration-200 flex items-center justify-between px-5"
                >
                  <code className="tabular text-2xl font-semibold tracking-[0.25em] text-[var(--ink)]">
                    {college.code}
                  </code>
                  <span className="flex items-center gap-2 text-xs font-medium text-[var(--ink-muted)] group-hover:text-[var(--accent-strong)]">
                    <Copy size={14} /> Copy
                  </span>
                </button>
                <p className="text-xs text-[var(--ink-muted)] mt-3 leading-relaxed">
                  Rotating this code later only affects <em>future</em>{" "}
                  registrations — students who already joined keep their
                  college.
                </p>
              </>
            ) : (
              <p className="text-sm text-[var(--ink-muted)]">
                Couldn't load your college details. Try refreshing.
              </p>
            )}
          </Card>
        </motion.div>

        {/* What's next — honest about what ships in later phases */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-5"
        >
          <Card padding="lg" className="h-full">
            <CardHeader>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles size={16} className="text-[var(--accent-strong)]" />
                  Coming to your workspace
                </CardTitle>
                <CardDescription className="mt-1">
                  The cohort tools are being built phase by phase.
                </CardDescription>
              </div>
            </CardHeader>
            <ul className="space-y-3 text-sm">
              {[
                {
                  icon: Users,
                  label: "College student roster",
                  to: "/placement/students",
                },
                {
                  icon: GraduationCap,
                  label: "Status tagging & training needs",
                },
                {
                  icon: Briefcase,
                  label: "Gatekeeping — pass students to recruiters",
                },
              ].map(({ icon: Icon, label, to }) =>
                to ? (
                  <li key={label}>
                    <Link
                      to={to}
                      className="flex items-start gap-3 text-[var(--ink)] hover:text-[var(--accent-strong)] transition-colors"
                    >
                      <span className="h-7 w-7 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] flex items-center justify-center shrink-0">
                        <Icon size={13} />
                      </span>
                      <span className="pt-1">
                        {label}
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--accent-strong)] font-semibold">
                          live
                        </span>
                      </span>
                    </Link>
                  </li>
                ) : (
                  <li
                    key={label}
                    className="flex items-start gap-3 text-[var(--ink-muted)]"
                  >
                    <span className="h-7 w-7 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] flex items-center justify-center shrink-0">
                      <Icon size={13} />
                    </span>
                    <span className="pt-1">{label}</span>
                  </li>
                ),
              )}
            </ul>
          </Card>
        </motion.div>
      </div>

      <p className="text-xs text-[var(--ink-muted)]">
        Next up in your workspace: the cohort table, status tagging and
        gatekeeping. Until then, students who join with your code appear here
        automatically.
      </p>
    </div>
  );
}
