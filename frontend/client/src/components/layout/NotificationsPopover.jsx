import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Upload,
  Sparkles,
  PenLine,
  History as HistoryIcon,
  Mail,
  CalendarClock,
  ShieldCheck,
  Target,
  CheckCheck,
  Loader2,
} from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useHistory } from "@/hooks/useAnalytics";
import { useNotifications, useMarkAllRead, useMarkNotificationRead } from "@/hooks/useNotifications";
import { cn, relativeTime } from "@/lib/utils";

const ICONS = {
  upload: Upload,
  analyze: Sparkles,
  rewrite: PenLine,
  // Real notification types (Phase 9)
  message: Mail,
  meeting_invite: CalendarClock,
  meeting_confirmed: CalendarClock,
  meeting_cancelled: CalendarClock,
  status_change: Target,
  training_assigned: Target,
  jd_decision: ShieldCheck,
  candidate_passed: ShieldCheck,
  milestone_complete: Target,
  system: Bell,
};

const ICON_TONE = {
  upload: "bg-[var(--surface-2)] text-[var(--ink-muted)]",
  analyze: "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
  rewrite: "bg-[#FBEFD9] text-[var(--warning)]",
  message: "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
  meeting_invite: "bg-[#FBEFD9] text-[var(--warning)]",
  meeting_confirmed: "bg-[var(--accent-soft)] text-[var(--success)]",
  meeting_cancelled: "bg-[#F8E3E0] text-[var(--danger)]",
  status_change: "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
  training_assigned: "bg-[#FBEFD9] text-[var(--warning)]",
  jd_decision: "bg-[var(--accent-soft)] text-[var(--success)]",
  candidate_passed: "bg-[var(--accent-soft)] text-[var(--success)]",
  milestone_complete: "bg-[var(--accent-soft)] text-[var(--success)]",
  system: "bg-[var(--surface-2)] text-[var(--ink-muted)]",
};

const LAST_SEEN_KEY = "arr-notif-last-seen";
const MAX_ITEMS = 10;

function readLastSeen() {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(LAST_SEEN_KEY);
  return raw ? Number(raw) || 0 : 0;
}

export function NotificationsPopover() {
  const navigate = useNavigate();
  const { data: historyData } = useHistory();
  const { data: notifData } = useNotifications();
  const markAll = useMarkAllRead();
  const markOne = useMarkNotificationRead();

  // Real notifications (messages, meetings, placements) take priority over the
  // student's own activity timeline — the timeline is ambient, a message from a
  // recruiter is not.
  const notifications = notifData?.notifications || [];
  const activity = (historyData?.events || []).slice(0, MAX_ITEMS);
  const unreadFromServer = notifData?.unread || 0;

  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(readLastSeen);
  const rootRef = useRef(null);

  const unreadActivity = useMemo(() => {
    if (!activity.length) return 0;
    return activity.filter((e) => new Date(e.at).getTime() > lastSeen).length;
  }, [activity, lastSeen]);

  const unreadCount = unreadFromServer + unreadActivity;
  const emailNote = notifData?.email;

  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (!open && activity.length) {
      const newest = new Date(activity[0].at).getTime();
      localStorage.setItem(LAST_SEEN_KEY, String(newest));
      setLastSeen(newest);
    }
    setOpen((v) => !v);
  }

  function openNotification(n) {
    if (!n.read) markOne.mutate(n._id);
    const url = n.meta?.meetingId
      ? "/meetings"
      : n.meta?.jdId
        ? `/readiness?jdId=${n.meta.jdId}`
        : null;
    if (url) navigate(url);
    setOpen(false);
  }

  function goToActivity(e) {
    if (e?.resumeId) navigate(`/resumes/${e.resumeId}`);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        onClick={toggle}
        title="Notifications"
        dot={unreadCount > 0}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} new)` : ""}`}
      >
        <Bell size={16} />
      </IconButton>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-[52px] z-40 w-[400px] rounded-3xl bg-[var(--surface)] border border-[var(--border)] shadow-hover overflow-hidden"
            role="dialog"
            aria-label="Notifications"
          >
            <div className="flex items-center justify-between px-5 h-12 border-b border-[var(--border)]">
              <div className="text-sm font-semibold text-[var(--ink)]">
                Notifications
                {unreadFromServer > 0 && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-white tabular">
                    {unreadFromServer}
                  </span>
                )}
              </div>
              {unreadFromServer > 0 && (
                <button
                  onClick={() => markAll.mutate()}
                  disabled={markAll.isPending}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent-strong)] hover:underline disabled:opacity-50"
                >
                  {markAll.isPending ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <CheckCheck size={11} />
                  )}
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[440px] overflow-y-auto">
              {/* Real notifications first — these are things that need acting on */}
              {notifications.length > 0 && (
                <ul>
                  {notifications.slice(0, MAX_ITEMS).map((n) => {
                    const Icon = ICONS[n.type] || Bell;
                    const tone = ICON_TONE[n.type] || ICON_TONE.system;
                    return (
                      <li key={n._id}>
                        <button
                          onClick={() => openNotification(n)}
                          className={cn(
                            "w-full flex items-start gap-3 px-5 py-3 text-left hover:bg-[var(--surface-2)] transition-colors",
                            !n.read && "bg-[var(--accent-soft)]/30"
                          )}
                        >
                          <div
                            className={cn(
                              "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                              tone
                            )}
                          >
                            <Icon size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-[var(--ink)] leading-snug">
                              {n.title}
                            </div>
                            {n.body && (
                              <div className="text-[11px] text-[var(--ink-muted)] mt-0.5 line-clamp-2 leading-relaxed">
                                {n.body}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-[10px] text-[var(--ink-muted)] tabular-nums">
                              {relativeTime(n.createdAt)}
                            </span>
                            {!n.read && (
                              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Email delivery note — honest about the free tier */}
              {emailNote && !emailNote.configured && notifications.length > 0 && (
                <div className="px-5 py-2.5 border-t border-[var(--border)] bg-[var(--surface-2)]">
                  <p className="text-[10px] text-[var(--ink-muted)] leading-relaxed">
                    Email delivery isn't configured on this server — notifications still arrive
                    here.
                  </p>
                </div>
              )}

              {/* Student activity timeline below */}
              {activity.length > 0 && (
                <>
                  {notifications.length > 0 && (
                    <div className="px-5 py-2 border-t border-[var(--border)] text-[10px] uppercase tracking-wider font-semibold text-[var(--ink-muted)]">
                      Your activity
                    </div>
                  )}
                  <ul>
                    {activity.map((e, idx) => {
                      const Icon = ICONS[e.type] || HistoryIcon;
                      const tone = ICON_TONE[e.type] || ICON_TONE.upload;
                      return (
                        <li key={e.id}>
                          <button
                            onClick={() => goToActivity(e)}
                            className={cn(
                              "w-full flex items-start gap-3 px-5 py-3 text-left hover:bg-[var(--surface-2)] transition-colors",
                              idx > 0 && "border-t border-[var(--border)]"
                            )}
                          >
                            <div
                              className={cn(
                                "h-9 w-9 rounded-xl flex items-center justify-center shrink-0",
                                tone
                              )}
                            >
                              <Icon size={14} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-[var(--ink)] truncate">
                                {e.title}
                              </div>
                              <div className="text-[11px] text-[var(--ink-muted)] mt-0.5 truncate">
                                {e.subtitle}
                              </div>
                            </div>
                            <div className="text-[10px] text-[var(--ink-muted)] shrink-0 tabular-nums mt-0.5">
                              {relativeTime(e.at)}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {notifications.length === 0 && activity.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <div className="h-10 w-10 mx-auto rounded-2xl bg-[var(--surface-2)] flex items-center justify-center text-[var(--ink-muted)] mb-3">
                    <Bell size={16} />
                  </div>
                  <div className="text-sm font-medium text-[var(--ink)]">Nothing here yet</div>
                  <div className="text-xs text-[var(--ink-muted)] mt-1">
                    Messages, meetings and updates will appear here.
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                navigate("/meetings");
                setOpen(false);
              }}
              className="w-full h-11 border-t border-[var(--border)] text-xs font-semibold text-[var(--accent-strong)] hover:bg-[var(--surface-2)] transition-colors"
            >
              View meetings
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
