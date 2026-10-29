import { useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Heart,
  X,
  Megaphone,
  FileText,
  MapPin,
  Building2,
  Check,
  Loader2,
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
import { useMyRolePostings, useRespondToRole } from "@/hooks/useRoles";
import { cn } from "@/lib/utils";

function relativeDays(iso) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

/**
 * StudentRoles — the student's side of a placement-cell role posting.
 *
 * Shows the two things a student needs: what their resume currently says they
 * target (so they can see why they were shortlisted), and the roles their
 * college has posted, each with an Interested / Not interested answer.
 */
export default function StudentRoles() {
  const { data, isLoading, error } = useMyRolePostings();
  const respond = useRespondToRole();
  const [pendingId, setPendingId] = useState(null);

  const postings = data?.postings || [];
  const myRoles = data?.myRoles || { resumeRoles: [], interestedRoles: [] };

  function answer(postingId, response) {
    setPendingId(postingId);
    respond.mutate(
      { postingId, response },
      { onSettled: () => setPendingId(null) },
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={Megaphone}
        title="Couldn't load posted roles"
        description={error.message}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Posted roles"
        description="Roles your placement cell has posted to your college. Tell them whether you're interested."
      />

      {/* Your resume's read — so a student understands their own placement picture */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card padding="lg">
          <CardHeader>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText size={15} className="text-[var(--accent-strong)]" />
                What your resume points at
              </CardTitle>
              <CardDescription className="mt-1">
                Inferred from your resume when it was last analysed — not
                something you set.
              </CardDescription>
            </div>
          </CardHeader>
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : myRoles.resumeRoles.length ? (
            <div className="flex flex-wrap gap-2">
              {myRoles.resumeRoles.map((r) => (
                <span
                  key={r.key}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] text-xs font-medium px-3 py-1.5"
                >
                  {r.label}
                  {r.confidence != null && (
                    <span className="tabular text-[10px] opacity-70">
                      {r.confidence}%
                    </span>
                  )}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
              Nothing yet — upload a resume and let it be analysed. Your roles
              refresh automatically each time.
            </p>
          )}
        </Card>

        <Card padding="lg">
          <CardHeader>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Heart size={15} className="text-[var(--accent-strong)]" />
                Roles you're interested in
              </CardTitle>
              <CardDescription className="mt-1">
                What you told your placement cell you want.
              </CardDescription>
            </div>
          </CardHeader>
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : myRoles.interestedRoles.length ? (
            <div className="flex flex-wrap gap-2">
              {myRoles.interestedRoles.map((r) => (
                <span
                  key={`${r.key}-${r.postingId || "x"}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] text-[var(--ink)] text-xs font-medium px-3 py-1.5"
                >
                  <Heart size={10} className="text-[var(--accent-strong)]" />
                  {r.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--ink-muted)]">
              You haven't opted into any posted role yet.
            </p>
          )}
        </Card>
      </div>

      {/* Open postings */}
      {isLoading ? (
        <Card padding="lg">
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        </Card>
      ) : postings.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No roles posted right now"
          description="When your placement cell posts an opening, it appears here and you'll get a notification."
        />
      ) : (
        <div className="space-y-3">
          {postings.map((p, i) => {
            const answered = p.myResponse;
            const busy = pendingId === p._id && respond.isPending;

            return (
              <motion.div
                key={p._id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.25,
                  delay: Math.min(i * 0.04, 0.3),
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <Card padding="lg">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display text-base font-semibold text-[var(--ink)]">
                          {p.title}
                        </span>
                        <Badge tone="accent" className="text-[10px]">
                          <Sparkles size={9} /> {p.roleLabel}
                        </Badge>
                        {answered === "interested" && (
                          <Badge tone="success" className="text-[10px]">
                            <Check size={9} /> You're interested
                          </Badge>
                        )}
                        {answered === "not_interested" && (
                          <Badge tone="neutral" className="text-[10px]">
                            <X size={9} /> Not interested
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-[var(--ink-muted)]">
                        {p.company && (
                          <span className="inline-flex items-center gap-1">
                            <Building2 size={11} /> {p.company}
                          </span>
                        )}
                        {p.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={11} /> {p.location}
                          </span>
                        )}
                        <span>posted {relativeDays(p.createdAt)}</span>
                      </div>

                      {p.description && (
                        <p className="text-xs text-[var(--ink-muted)] mt-2 leading-relaxed line-clamp-3">
                          {p.description}
                        </p>
                      )}

                      {p.skills?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {p.skills.slice(0, 8).map((s) => (
                            <span
                              key={s}
                              className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--ink-muted)]"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant={
                          answered === "interested" ? "accent" : "outline"
                        }
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          answer(
                            p._id,
                            answered === "interested"
                              ? "not_interested"
                              : "interested",
                          )
                        }
                      >
                        {busy ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Heart size={13} />
                        )}
                        {answered === "interested"
                          ? "Interested"
                          : "I'm interested"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => answer(p._id, "not_interested")}
                        className={cn(
                          answered === "not_interested"
                            ? "text-[var(--ink)]"
                            : "text-[var(--ink-muted)]",
                        )}
                      >
                        <X size={13} />
                        Not for me
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
