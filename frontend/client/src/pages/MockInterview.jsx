import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Maximize,
  Send,
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
import { Checkbox } from "@/components/ui/Checkbox";
import { InterviewResults } from "@/components/interview/InterviewResults";
import { ResumeVersionPicker } from "@/components/student/ResumeVersionPicker";
import { useJobDescriptions } from "@/hooks/useJobDescriptions";
import { interviewApi } from "@/api/interviews";
import { useToast } from "@/context/UIContext";
import { cn } from "@/lib/utils";

/**
 * MockInterview — a text-only interview with integrity signals.
 *
 * The integrity design (scope §8) shows up in three places in this file, and all
 * three are deliberate:
 *
 *  1. The pre-flight screen makes the monitoring EXPLICIT. Hidden monitoring
 *     raises fairness and privacy problems and teaches nothing; a visible notice
 *     is itself a deterrent.
 *  2. Listeners are PASSIVE — they log and never block. No modal interrupts an
 *     answer, because interrupting a candidate who has tabbed away to check
 *     something legitimate is worse than missing a cheat.
 *  3. The STUDENT is never shown their own flags. They cannot correct what they
 *     cannot see, and showing them mid-course only teaches evasion. The
 *     placement cell sees them, with the caveat that human judgement decides.
 */
export default function MockInterview() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();

  const { data: jdData, isLoading: jdLoading } = useJobDescriptions();
  const jds = jdData?.jds || [];

  const [phase, setPhase] = useState("preflight"); // preflight | interview | results
  const [jdId, setJdId] = useState(params.get("jdId") || "");
  // Which resume version the questions are built from. "" = latest, resolved
  // server-side. An explicit choice makes the interview probe what THIS resume
  // actually claims.
  const [versionId, setVersionId] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [starting, setStarting] = useState(false);

  const [session, setSession] = useState(null);
  const [answers, setAnswers] = useState({});
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  // Telemetry accumulators. Refs so a keystroke handler does not re-render.
  const telemetry = useRef({
    blurCount: 0,
    fullscreenExits: 0,
    pasteEvents: [],
    questionStartedAt: null,
    firstKeystrokeAt: null,
  });

  useEffect(() => {
    if (!jdId && jds.length) setJdId(jds[0]._id);
  }, [jds, jdId]);

  // ---- Integrity listeners: active only during the interview phase ----
  useEffect(() => {
    if (phase !== "interview") return;

    function onVisibility() {
      if (document.hidden) telemetry.current.blurCount += 1;
    }
    function onBlur() {
      telemetry.current.blurCount += 1;
    }
    function onFullscreen() {
      if (!document.fullscreenElement) telemetry.current.fullscreenExits += 1;
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreen);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [phase]);

  // Draft autosave — a lost answer because of a refresh is a real harm, and
  // localStorage costs nothing.
  useEffect(() => {
    if (phase !== "interview" || !session) return;
    const key = `jobsync-interview-${session._id}`;
    try {
      localStorage.setItem(key, JSON.stringify(answers));
    } catch {
      /* quota — non-critical */
    }
  }, [answers, phase, session]);

  async function start() {
    setStarting(true);
    try {
      const data = await interviewApi.start({
        jdId: jdId || undefined,
        targetRole: targetRole.trim() || undefined,
        versionId: versionId || undefined,
        integrityAcknowledged: true,
      });

      if (data.invalidatedPrevious > 0) {
        toast.info(
          "Previous session closed",
          "Only one interview can be active at a time.",
        );
      }
      if (data.degraded) {
        toast.info(
          "Question generation was limited",
          "Using a standard question set.",
        );
      }

      setSession(data.session);
      setPhase("interview");
      telemetry.current = {
        blurCount: 0,
        fullscreenExits: 0,
        pasteEvents: [],
        questionStartedAt: Date.now(),
        firstKeystrokeAt: null,
      };

      // Best-effort fullscreen. A rejection is not an error — some browsers and
      // managed devices refuse it, and the interview must proceed regardless.
      try {
        await document.documentElement.requestFullscreen?.();
      } catch {
        /* ignored by design */
      }
    } catch (err) {
      toast.error("Couldn't start the interview", err?.message);
    } finally {
      setStarting(false);
    }
  }

  function onAnswerChange(value) {
    if (!telemetry.current.firstKeystrokeAt && value.length > 0) {
      telemetry.current.firstKeystrokeAt = Date.now();
    }
    setAnswers((a) => ({ ...a, [session.questions[current].id]: value }));
  }

  function onPaste(e) {
    const pasted = e.clipboardData?.getData("text") || "";
    if (pasted.length > 120) {
      telemetry.current.pasteEvents.push({
        at: new Date().toISOString(),
        chars: pasted.length,
      });
    }
  }

  async function submitAnswer() {
    const q = session.questions[current];
    const text = answers[q.id] || "";
    setSubmitting(true);

    const started = telemetry.current.questionStartedAt || Date.now();
    const firstKey = telemetry.current.firstKeystrokeAt;

    try {
      await interviewApi.answer({
        sessionId: session._id,
        sessionToken: session.sessionToken,
        questionId: q.id,
        text,
        telemetry: {
          timeToFirstKeystrokeMs: firstKey ? firstKey - started : null,
          totalMs: Date.now() - started,
          answerLength: text.length,
          blurCount: telemetry.current.blurCount,
          fullscreenExits: telemetry.current.fullscreenExits,
          pasteEvents: telemetry.current.pasteEvents,
        },
      });

      // Reset per-question telemetry; blur/paste accumulate across the session
      // and are diffed server-side.
      telemetry.current.questionStartedAt = Date.now();
      telemetry.current.firstKeystrokeAt = null;

      if (current + 1 < session.questions.length) {
        setCurrent((c) => c + 1);
      } else {
        await finish();
      }
    } catch (err) {
      toast.error("Couldn't submit that answer", err?.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function finish() {
    try {
      const data = await interviewApi.complete({
        sessionId: session._id,
        sessionToken: session.sessionToken,
      });
      setResult(data.session);
      setPhase("results");
      try {
        localStorage.removeItem(`jobsync-interview-${session._id}`);
      } catch {
        /* non-critical */
      }
      if (document.fullscreenElement) document.exitFullscreen?.();
    } catch (err) {
      toast.error("Couldn't finish the interview", err?.message);
    }
  }

  // ---------------------------------------------------------------- preflight
  if (phase === "preflight") {
    if (jdLoading) {
      return (
        <div className="space-y-6">
          <PageHeader title="Mock interview" />
          <Skeleton className="h-64 w-full" />
        </div>
      );
    }

    if (!jds.length && !targetRole.trim()) {
      return (
        <div className="space-y-6">
          <PageHeader
            title="Mock interview"
            description="Practise role-specific questions and get written feedback."
          />
          <EmptyState
            icon={Mic}
            title="Add a job description first"
            description="A mock interview is built from a role. Paste a posting on the Job descriptions page, or type a target role below."
          />
          <Card padding="lg">
            <CardHeader>
              <div>
                <CardTitle className="text-base">
                  Or practise without a posting
                </CardTitle>
                <CardDescription className="mt-1">
                  Type a role and the questions will be tuned to it.
                </CardDescription>
              </div>
            </CardHeader>
            <div className="flex gap-2">
              <input
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g. Backend Engineer"
                className="h-11 flex-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10"
              />
              <Button
                variant="accent"
                disabled={!targetRole.trim() || !acknowledged || starting}
                onClick={start}
              >
                {starting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  "Begin"
                )}
              </Button>
            </div>
            <AcknowledgmentRow
              acknowledged={acknowledged}
              setAcknowledged={setAcknowledged}
            />
          </Card>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <PageHeader
          title="Mock interview"
          description="Five role-specific questions, written answers, and specific feedback on each."
        />

        <Card padding="lg">
          <CardHeader>
            <div>
              <CardTitle className="text-base">Before you start</CardTitle>
              <CardDescription className="mt-1">
                The interview takes about 15 minutes. You can't pause once it
                begins.
              </CardDescription>
            </div>
          </CardHeader>

          {jds.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mb-2">
                Role
              </div>
              <div className="flex flex-wrap gap-1.5">
                {jds.map((j) => (
                  <button
                    key={j._id}
                    onClick={() => setJdId(j._id)}
                    className={cn(
                      "h-8 px-3.5 rounded-full text-xs font-medium border transition-all duration-200 active:scale-[0.98]",
                      jdId === j._id
                        ? "bg-[var(--ink)] text-[var(--bg)] border-transparent shadow-card"
                        : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--border)] hover:text-[var(--ink)]",
                    )}
                  >
                    {j.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-4">
            <ResumeVersionPicker
              value={versionId}
              onChange={setVersionId}
              hint="Questions are built from this resume plus the role — so they can probe your own projects instead of asking generics."
            />
          </div>

          <div className="rounded-2xl bg-[var(--accent-soft)] px-5 py-4 mb-4">
            <div className="flex items-start gap-3">
              <ShieldCheck
                size={16}
                className="text-[var(--accent-strong)] mt-0.5 shrink-0"
              />
              <div>
                <div className="text-xs font-semibold text-[var(--accent-strong)]">
                  This session is monitored
                </div>
                <p className="text-[11px] text-[var(--accent-strong)]/85 mt-1 leading-relaxed">
                  Leaving the interview tab, exiting fullscreen, and pasting
                  large blocks of text are recorded and shared with your
                  placement cell alongside your transcript. They never change
                  your score and never fail you automatically — a person reviews
                  them. We tell you this openly so the decision is yours.
                </p>
              </div>
            </div>
          </div>

          <AcknowledgmentRow
            acknowledged={acknowledged}
            setAcknowledged={setAcknowledged}
          />

          <div className="flex justify-end mt-4">
            <Button
              variant="accent"
              onClick={start}
              disabled={!acknowledged || starting}
            >
              {starting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Preparing
                  questions…
                </>
              ) : (
                <>
                  <Mic size={14} /> Begin interview
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------- interview
  if (phase === "interview" && session) {
    const q = session.questions[current];
    const value = answers[q.id] || "";
    const isLast = current + 1 === session.questions.length;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Badge tone="accent">
              Question {current + 1} of {session.questions.length}
            </Badge>
            {q.focus && <Badge tone="neutral">{q.focus}</Badge>}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[var(--ink-muted)]">
            <Maximize size={12} />
            {document.fullscreenElement ? "Fullscreen" : "Not fullscreen"}
          </div>
        </div>

        {/* Progress */}
        <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-[var(--accent)]"
            animate={{
              width: `${((current + 1) / session.questions.length) * 100}%`,
            }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={q.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <Card padding="lg">
              <h2 className="font-display text-lg font-semibold text-[var(--ink)] leading-snug">
                {q.text}
              </h2>

              <textarea
                value={value}
                onChange={(e) => onAnswerChange(e.target.value)}
                onPaste={onPaste}
                rows={10}
                placeholder="Type your answer…"
                className="w-full mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]/60 outline-none transition-all duration-200 focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10 resize-y leading-relaxed"
              />

              <div className="flex items-center justify-between gap-4 mt-4">
                <span className="text-[11px] text-[var(--ink-muted)] tabular">
                  {value.length} characters
                </span>
                <Button
                  variant="accent"
                  onClick={submitAnswer}
                  disabled={submitting || !value.trim()}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Submitting…
                    </>
                  ) : isLast ? (
                    <>
                      <CheckCircle2 size={14} /> Finish & get feedback
                    </>
                  ) : (
                    <>
                      <Send size={14} /> Next question
                    </>
                  )}
                </Button>
              </div>
            </Card>
          </motion.div>
        </AnimatePresence>

        <p className="text-[11px] text-[var(--ink-muted)]">
          Your answers are saved automatically as you type. Skipping a question
          is allowed — submit an empty answer to move on.
        </p>
      </div>
    );
  }

  // ------------------------------------------------------------------ results
  if (phase === "results" && result) {
    return <InterviewResults session={result} onDone={() => nav("/roadmap")} />;
  }

  return null;
}

function AcknowledgmentRow({ acknowledged, setAcknowledged }) {
  return (
    <div className="flex items-start gap-3 mt-4">
      <Checkbox
        checked={acknowledged}
        onChange={setAcknowledged}
        className="mt-0.5"
      />
      <span className="text-xs text-[var(--ink)] leading-relaxed">
        I understand this is a practice interview that may be reviewed by my
        placement cell, and I agree to answer the questions myself.
      </span>
    </div>
  );
}
