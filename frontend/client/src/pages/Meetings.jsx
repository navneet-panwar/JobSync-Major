import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarClock,
  Check,
  Download,
  Loader2,
  X,
  Users,
  Clock,
  Plus,
  Trash2,
  Briefcase,
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
import { Modal } from "@/components/ui/Modal";
import {
  useMeetings,
  useConfirmMeeting,
  useCancelMeeting,
  useProposeMeeting,
} from "@/hooks/useNotifications";
import { notificationsApi } from "@/api/notifications";
import { recruiterApi } from "@/api/recruiter";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const STATUS_TONE = {
  proposed: "warning",
  confirmed: "success",
  declined: "neutral",
  cancelled: "danger",
};

function fmtSlot(slot) {
  const start = new Date(slot.start);
  const end = new Date(slot.end);
  return {
    date: start.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    time: `${start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`,
  };
}

function MeetingCard({ meeting, onCancel }) {
  const { user } = useAuth();
  const confirm = useConfirmMeeting();
  const [picked, setPicked] = useState(null);

  const isOrganiser =
    meeting.createdBy === user?._id || meeting.createdBy?._id === user?._id;
  const others = (meeting.participantUserIds || []).filter(
    (p) => (p._id || p) !== user?._id,
  );

  async function onConfirm(idx) {
    setPicked(idx);
    confirm.mutate({ id: meeting._id, slotIndex: idx });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card padding="lg">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display text-[15px] font-semibold text-[var(--ink)]">
                {meeting.title}
              </span>
              <Badge
                tone={STATUS_TONE[meeting.status] || "neutral"}
                className="text-[10px]"
              >
                {meeting.status}
              </Badge>
              {isOrganiser && (
                <Badge tone="neutral" className="text-[10px]">
                  You organised this
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-3 mt-2 text-xs text-[var(--ink-muted)]">
              <span className="flex items-center gap-1.5">
                <Users size={12} />
                {others.length
                  ? others.map((p) => p.name || "Participant").join(", ")
                  : "Only you"}
              </span>
              {meeting.jdId?.title && <span>· {meeting.jdId.title}</span>}
            </div>

            {meeting.agenda && (
              <p className="text-xs text-[var(--ink-muted)] mt-2 leading-relaxed">
                {meeting.agenda}
              </p>
            )}
          </div>

          {meeting.status !== "cancelled" && (
            <Button variant="ghost" size="sm" onClick={() => onCancel(meeting)}>
              <X size={13} /> Cancel
            </Button>
          )}
        </div>

        {/* PROPOSED — the slot picker */}
        {meeting.status === "proposed" && (
          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-2">
              {isOrganiser
                ? "Waiting for a reply — proposed times"
                : "Choose a time"}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {(meeting.proposedSlots || []).map((slot, i) => {
                const f = fmtSlot(slot);
                const loading = confirm.isPending && picked === i;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={isOrganiser || confirm.isPending}
                    onClick={() => !isOrganiser && onConfirm(i)}
                    className={cn(
                      "text-left rounded-2xl border px-4 py-3 transition-all duration-200",
                      isOrganiser
                        ? "border-[var(--border)] bg-[var(--surface-2)] cursor-default"
                        : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] active:scale-[0.98]",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Clock
                        size={12}
                        className="text-[var(--accent-strong)] shrink-0"
                      />
                      <span className="text-xs font-medium text-[var(--ink)]">
                        {f.date}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--ink-muted)] mt-1 tabular">
                      {f.time}
                    </div>
                    {loading && (
                      <div className="text-[10px] text-[var(--accent-strong)] mt-1.5 flex items-center gap-1">
                        <Loader2 size={10} className="animate-spin" />{" "}
                        Confirming…
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* CONFIRMED — the time plus the calendar file */}
        {meeting.status === "confirmed" && meeting.confirmedSlot && (
          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] flex items-center justify-center shrink-0">
                  <Check size={15} strokeWidth={3} />
                </span>
                <div>
                  <div className="text-xs font-semibold text-[var(--ink)]">
                    {fmtSlot(meeting.confirmedSlot).date}
                  </div>
                  <div className="text-[11px] text-[var(--ink-muted)] tabular">
                    {fmtSlot(meeting.confirmedSlot).time}
                  </div>
                </div>
              </div>

              {/* The download always works, email or not — it is generated
                  server-side and needs no provider. */}
              <a
                href={notificationsApi.icsUrl(meeting._id)}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-strong)] transition-colors"
              >
                <Download size={13} /> Add to calendar
              </a>
            </div>
            {meeting.location && (
              <p className="text-[11px] text-[var(--ink-muted)] mt-2">
                Location: {meeting.location}
              </p>
            )}
          </div>
        )}

        {meeting.status === "cancelled" && meeting.responseNote && (
          <p className="text-[11px] text-[var(--danger)] mt-3 leading-relaxed">
            Cancelled — “{meeting.responseNote}”
          </p>
        )}
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Propose a meeting — recruiter (to a passed candidate) or cell (to its students)
// ---------------------------------------------------------------------------
function ProposeMeetingModal({ open, onClose }) {
  const propose = useProposeMeeting();
  const { user } = useAuth();
  const isRecruiter = user?.role === "recruiter";

  const [jdId, setJdId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [title, setTitle] = useState("Interview");
  const [agenda, setAgenda] = useState("");
  const [location, setLocation] = useState("Online");
  const [slots, setSlots] = useState([{ start: "", end: "" }]);

  // Recruiters may only meet students a placement cell has PASSED to them, so
  // the picker is built from that gated pool — grouped by role, because that is
  // how the gate works.
  const { data: options, isLoading } = useQuery({
    queryKey: ["recruiter-meeting-options"],
    queryFn: recruiterApi.meetingOptions,
    enabled: open && isRecruiter,
  });

  const roles = options?.roles || [];
  const activeRole = roles.find((r) => r._id === jdId) || roles[0];
  const candidates = activeRole?.candidates || [];

  function updateSlot(i, key, value) {
    setSlots((s) => s.map((slot, idx) => (idx === i ? { ...slot, [key]: value } : slot)));
  }

  function reset() {
    setJdId("");
    setStudentId("");
    setTitle("Interview");
    setAgenda("");
    setLocation("Online");
    setSlots([{ start: "", end: "" }]);
  }

  const validSlots = slots.filter((s) => s.start && s.end);
  const canSubmit = validSlots.length > 0 && (!isRecruiter || studentId);

  function submit() {
    propose.mutate(
      {
        participantUserIds: [studentId],
        jdId: jdId || undefined,
        studentUserId: studentId || undefined,
        title,
        agenda,
        location,
        // The server validates end > start and that the recruiter has a pass.
        slots: validSlots.map((s) => ({
          start: new Date(s.start).toISOString(),
          end: new Date(s.end).toISOString(),
        })),
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      className="max-w-2xl"
      title="Propose a meeting"
      description="Offer a few time slots — the other party picks one and a calendar invite is generated for both."
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={propose.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={submit}
            disabled={propose.isPending || !canSubmit}
          >
            {propose.isPending ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Sending…
              </>
            ) : (
              "Send proposal"
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isRecruiter && (
          <>
            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : roles.length === 0 ? (
              <div className="rounded-2xl bg-[#FBF1E2] px-4 py-3 text-xs text-[var(--warning)] leading-relaxed">
                You can propose a meeting once a placement cell has passed you a
                student for one of your roles. Approved candidates appear here.
              </div>
            ) : (
              <>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-2">
                    Role
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {roles.map((r) => (
                      <button
                        key={r._id}
                        type="button"
                        onClick={() => {
                          setJdId(r._id);
                          setStudentId("");
                        }}
                        className={cn(
                          "h-9 px-3.5 rounded-2xl text-xs font-medium border transition-all duration-200 text-left",
                          activeRole?._id === r._id
                            ? "bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent)]/40"
                            : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--border)] hover:text-[var(--ink)]",
                        )}
                      >
                        {r.title}
                        <span className="block text-[10px] opacity-70 font-normal">
                          {r.candidates.length} approved
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-2">
                    Candidate
                  </div>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {candidates.map((c) => (
                      <button
                        key={c._id}
                        type="button"
                        onClick={() => setStudentId(c._id)}
                        className={cn(
                          "w-full text-left rounded-2xl border px-4 py-2.5 transition-all duration-200",
                          studentId === c._id
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                            : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]",
                        )}
                      >
                        <div className="text-sm font-medium text-[var(--ink)]">
                          {c.name}
                        </div>
                        <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                          {c.email}
                          {c.collegeTag ? ` · ${c.collegeTag}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {!isRecruiter && (
          <div className="rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-xs text-[var(--accent-strong)] leading-relaxed">
            Meetings are proposed from a student's profile, where you can see
            their readiness and passes in context.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-1.5 block">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              className="w-full h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-1.5 block">
              Location
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={200}
              className="w-full h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-1.5 block">
            Agenda (optional)
          </label>
          <textarea
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="What the meeting covers"
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]/60 outline-none focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10 resize-y"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
              Proposed times
            </label>
            {slots.length < 5 && (
              <button
                type="button"
                onClick={() => setSlots((s) => [...s, { start: "", end: "" }])}
                className="text-[11px] text-[var(--accent-strong)] font-medium hover:underline"
              >
                <Plus size={11} className="inline mr-1" />
                Add another
              </button>
            )}
          </div>

          <div className="space-y-2">
            {slots.map((slot, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={slot.start}
                  onChange={(e) => updateSlot(i, "start", e.target.value)}
                  className="flex-1 h-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]/40"
                />
                <span className="text-[var(--ink-muted)] text-xs">to</span>
                <input
                  type="datetime-local"
                  value={slot.end}
                  onChange={(e) => updateSlot(i, "end", e.target.value)}
                  className="flex-1 h-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--ink)] outline-none focus:border-[var(--accent)]/40"
                />
                {slots.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSlots((s) => s.filter((_, idx) => idx !== i))}
                    className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:bg-[#F8E3E0] hover:text-[var(--danger)] transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
export default function Meetings() {
  const { user } = useAuth();
  const { data: meetings, isLoading } = useMeetings();
  const cancel = useCancelMeeting();
  const [cancelTarget, setCancelTarget] = useState(null);
  const [reason, setReason] = useState("");
  const [proposeOpen, setProposeOpen] = useState(false);

  const canPropose = user?.role === "recruiter";
  const upcoming = (meetings || []).filter((m) => m.status !== "cancelled");
  const past = (meetings || []).filter((m) => m.status === "cancelled");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meetings"
        description={
          canPropose
            ? "Interviews with candidates your placement cells have approved. Propose a few times and they pick one."
            : "Interviews proposed by recruiters or your placement cell. Pick a time and the invite goes into your calendar."
        }
        actions={
          canPropose ? (
            <Button variant="accent" onClick={() => setProposeOpen(true)}>
              <Plus size={14} /> Propose a meeting
            </Button>
          ) : null
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : upcoming.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={canPropose ? "No meetings yet" : "No meetings proposed"}
          description={
            canPropose
              ? "Propose an interview with a candidate your placement cell has approved. You can only meet students in your passed pool."
              : "When a recruiter or your placement cell proposes an interview, it appears here with a few time slots to choose from."
          }
          action={
            canPropose ? (
              <Button variant="accent" onClick={() => setProposeOpen(true)}>
                <Plus size={14} /> Propose a meeting
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-4">
          <AnimatePresence initial={false}>
            {upcoming.map((m) => (
              <MeetingCard
                key={m._id}
                meeting={m}
                onCancel={(meeting) => {
                  setCancelTarget(meeting);
                  setReason("");
                }}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-3">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-[var(--ink-muted)]">
            Cancelled
          </div>
          {past.map((m) => (
            <MeetingCard
              key={m._id}
              meeting={m}
              onCancel={(meeting) => setCancelTarget(meeting)}
            />
          ))}
        </div>
      )}

      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title={`Cancel "${cancelTarget?.title}"?`}
        description="Everyone invited is notified. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>
              Keep it
            </Button>
            <Button
              variant="accent"
              disabled={cancel.isPending}
              onClick={() => {
                cancel.mutate(
                  { id: cancelTarget._id, reason },
                  { onSuccess: () => setCancelTarget(null) },
                );
              }}
            >
              {cancel.isPending ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Cancelling…
                </>
              ) : (
                "Cancel meeting"
              )}
            </Button>
          </>
        }
      >
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={400}
          rows={3}
          placeholder="Reason (optional) — shared with everyone invited"
          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]/60 outline-none transition-all duration-200 focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10 resize-y"
        />
      </Modal>

      <ProposeMeetingModal
        open={proposeOpen}
        onClose={() => setProposeOpen(false)}
      />
    </div>
  );
}
