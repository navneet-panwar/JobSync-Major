import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import { motion } from "framer-motion";
import {
  Plus,
  Loader2,
  Users,
  Target,
  Briefcase,
  Building2,
  Lock,
  RefreshCw,
  UploadCloud,
  FileText,
  X,
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
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { SkillChips } from "@/components/jd/SkillChips";
import { CollegePicker } from "@/components/recruiter/CollegePicker";
import { RoleCombobox } from "@/components/recruiter/RoleCombobox";
import { recruiterApi, collegeDirectoryApi } from "@/api/recruiter";
import { useToast } from "@/context/UIContext";
import { cn } from "@/lib/utils";

const SAMPLE_JD = `Backend Engineer (Mid level)

Requirements:
- 3+ years with Node.js and Express
- Strong SQL and PostgreSQL
- Docker and CI/CD experience
- Bonus: Kubernetes, TypeScript

Responsibilities:
- Design and build REST APIs
- Work with Redis for caching`;

// ---------------------------------------------------------------------------
// Post a JD modal — paste OR drop a file, pick a college, name the role
// ---------------------------------------------------------------------------
function PostJdModal({ open, onClose, onPosted }) {
  const toast = useToast();
  const [mode, setMode] = useState("paste"); // paste | file
  const [rawText, setRawText] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("");
  const [collegeId, setCollegeId] = useState("");
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});

  // Role names from the recruiter's OWN postings. Not the placement-cell role
  // index — that endpoint is college-scoped and returns 403 for a recruiter.
  const { data: roleSuggestions = [] } = useQuery({
    queryKey: ["recruiter-role-suggestions"],
    queryFn: recruiterApi.roleSuggestions,
    enabled: open,
  });

  const onDropAccepted = useCallback((files) => {
    setFile(files[0]);
    setErrors((e) => ({ ...e, file: undefined }));
    if (!title) setTitle(files[0].name.replace(/\.(pdf|txt)$/i, ""));
  }, [title]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    accept: {
      "application/pdf": [".pdf"],
      "text/plain": [".txt"],
    },
    maxFiles: 1,
    maxSize: 2 * 1024 * 1024,
    multiple: false,
    noClick: false,
    onDropAccepted,
    onDropRejected: (rejections) => {
      const reason = rejections?.[0]?.errors?.[0]?.message || "File rejected";
      setErrors((e) => ({ ...e, file: reason }));
    },
  });

  const mutation = useMutation({
    mutationFn: () => {
      const payloadTitle = title.trim() || role.trim() || undefined;
      if (mode === "file") {
        return recruiterApi.uploadJd({ file, title: payloadTitle, collegeId });
      }
      return recruiterApi.createJd({ rawText, title: payloadTitle, collegeId });
    },
    onSuccess: (jd) => {
      toast.success(
        `Posted "${jd.title}"`,
        "The placement cell can now pass students to this role.",
      );
      onPosted?.();
      reset();
      onClose();
    },
    onError: (err) => toast.error("Couldn't post that role", err?.message),
  });

  function reset() {
    setRawText("");
    setTitle("");
    setRole("");
    setFile(null);
    setErrors({});
  }

  function validateAndPost() {
    const next = {};
    if (!collegeId) next.college = "Choose the college this role is for.";
    if (mode === "paste" && rawText.trim().length < 40) {
      next.text = "A job description needs at least a few lines.";
    }
    if (mode === "file" && !file) next.file = "Drop a PDF or TXT file first.";
    setErrors(next);
    if (Object.keys(next).length) return;
    mutation.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      className="max-w-2xl"
      title="Post a role to a college"
      description="AI extracts the required skills. The college's placement cell then decides which students you can see — you never browse an unvetted pool."
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={validateAndPost}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Parsing…
              </>
            ) : (
              "Parse & post"
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Searchable college picker — the old pill wall did not scale. */}
        <CollegePicker
          value={collegeId}
          onChange={(id) => {
            setCollegeId(id);
            setErrors((e) => ({ ...e, college: undefined }));
          }}
          error={errors.college}
        />

        {/* Role: pick a known one or create a new one */}
        <RoleCombobox
          value={role}
          onChange={(v) => {
            setRole(v);
            // Keep the posting title in step while the recruiter has not typed
            // one of their own — the role is the title's natural default.
            if (!title || title === role) setTitle(v);
          }}
          suggestions={roleSuggestions}
          hint="Choose an existing role so students group together, or type a new one — it is created automatically."
        />

        {/* Paste or drop */}
        <div>
          <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1 w-fit mb-3">
            {[
              { key: "paste", label: "Paste text" },
              { key: "file", label: "Drop a file" },
            ].map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={cn(
                  "h-8 px-3.5 rounded-full text-xs font-medium transition-all duration-200",
                  mode === m.key
                    ? "bg-[var(--ink)] text-[var(--bg)] shadow-card"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === "paste" ? (
            <div className="relative">
              <textarea
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value);
                  setErrors((x) => ({ ...x, text: undefined }));
                }}
                maxLength={20000}
                rows={9}
                placeholder="Paste the job description…"
                className={cn(
                  "w-full rounded-2xl border bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]/60 outline-none transition-all duration-200 resize-y leading-relaxed",
                  errors.text
                    ? "border-[var(--danger)]/50 focus:border-[var(--danger)]"
                    : "border-[var(--border)] focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10",
                )}
              />
              <button
                type="button"
                onClick={() => setRawText(SAMPLE_JD)}
                className="absolute bottom-2.5 right-3 text-[10px] text-[var(--ink-muted)] hover:text-[var(--accent-strong)] transition-colors"
              >
                Try a sample
              </button>
            </div>
          ) : (
            <div>
              {!file ? (
                <div
                  {...getRootProps()}
                  className={cn(
                    "rounded-3xl border border-dashed cursor-pointer transition-all duration-200 outline-none p-8",
                    isDragActive
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)]/40",
                    isDragReject && "border-[var(--danger)] bg-[#F8E3E0]",
                  )}
                >
                  <input {...getInputProps()} />
                  <div className="flex flex-col items-center text-center">
                    <motion.div
                      animate={isDragActive ? { y: -4 } : { y: 0 }}
                      className={cn(
                        "h-14 w-14 rounded-2xl flex items-center justify-center mb-3",
                        isDragActive
                          ? "bg-[var(--accent)] text-white"
                          : "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
                      )}
                    >
                      <UploadCloud size={22} />
                    </motion.div>
                    <div className="font-display text-base font-semibold tracking-tight">
                      {isDragActive ? "Drop it here" : "Drop the job description"}
                    </div>
                    <div className="text-xs text-[var(--ink-muted)] mt-1">
                      or click to browse · PDF or TXT · max 2 MB
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent-strong)] shrink-0">
                    <FileText size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{file.name}</div>
                    <div className="text-xs text-[var(--ink-muted)]">
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="h-8 w-8 rounded-full hover:bg-[var(--surface-2)] flex items-center justify-center text-[var(--ink-muted)]"
                    disabled={mutation.isPending}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {errors.file && (
                <p className="text-[11px] text-[var(--danger)] mt-1.5">{errors.file}</p>
              )}
            </div>
          )}
          {errors.text && (
            <p className="text-[11px] text-[var(--danger)] mt-1.5">{errors.text}</p>
          )}
        </div>

        <Input
          placeholder="Posting title (optional — defaults to the role)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Recruiter job list
// ---------------------------------------------------------------------------
export default function RecruiterJobs() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [postOpen, setPostOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["recruiter-jds"],
    queryFn: recruiterApi.jds,
  });

  const jds = data?.jds || [];

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }) => recruiterApi.updateJd(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recruiter-jds"] });
      toast.success("Updated");
    },
    onError: (err) => toast.error("Couldn't update", err?.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job descriptions"
        description="Roles you've opened to a college. Candidates appear only after that college's placement cell approves them."
        actions={
          <Button variant="accent" onClick={() => setPostOpen(true)}>
            <Plus size={14} /> Post a role
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={Briefcase}
          title="Couldn't load your roles"
          description={error.message}
        />
      ) : jds.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No roles posted yet"
          description="Post a job description to a college. Its placement cell reviews students and passes the strong ones through to you."
          action={
            <Button variant="accent" onClick={() => setPostOpen(true)}>
              <Plus size={14} /> Post your first role
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {jds.map((jd, i) => (
            <motion.div
              key={jd._id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.25,
                delay: Math.min(i * 0.04, 0.3),
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <Card padding="lg" className="flex flex-col h-full">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-display text-[15px] font-semibold text-[var(--ink)] truncate">
                      {jd.title}
                    </div>
                    {jd.company && (
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-[var(--ink-muted)]">
                        <Building2 size={12} /> {jd.company}
                      </div>
                    )}
                  </div>
                  <Badge
                    tone={jd.status === "active" ? "accent" : "neutral"}
                    className="text-[10px]"
                  >
                    {jd.status}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {jd.collegeTag && (
                    <Badge tone="neutral" className="text-[10px]">
                      <Lock size={9} /> {jd.collegeTag}
                    </Badge>
                  )}
                  <Badge tone="neutral" className="text-[10px]">
                    {jd.parsed?.requiredSkills?.length || 0} skills
                  </Badge>
                </div>

                <div className="mt-4">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold mb-2">
                    Required skills
                  </div>
                  <SkillChips
                    skills={(jd.parsed?.requiredSkills || []).slice(0, 6)}
                  />
                </div>

                {/* The gated-pool numbers — the honest count for a recruiter */}
                <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-[var(--border)]">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
                      Passed
                    </div>
                    <div className="font-display tabular text-lg font-semibold text-[var(--ink)]">
                      {jd.candidateCounts?.passed ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
                      Shortlisted
                    </div>
                    <div className="font-display tabular text-lg font-semibold text-[var(--ink)]">
                      {jd.candidateCounts?.shortlisted ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--ink-muted)] font-semibold">
                      Avg readiness
                    </div>
                    <div className="font-display tabular text-lg font-semibold text-[var(--ink)]">
                      {jd.averageReadiness != null
                        ? `${jd.averageReadiness}%`
                        : "—"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-[var(--border)]">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      toggleStatus.mutate({
                        id: jd._id,
                        status: jd.status === "active" ? "closed" : "active",
                      })
                    }
                    disabled={toggleStatus.isPending}
                  >
                    {toggleStatus.isPending ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <RefreshCw size={13} />
                    )}
                    {jd.status === "active" ? "Close role" : "Reopen"}
                  </Button>
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => nav(`/candidates?jdId=${jd._id}`)}
                  >
                    <Users size={13} /> View candidates
                  </Button>
                </div>

                {(jd.candidateCounts?.passed ?? 0) === 0 && (
                  <p className="text-[11px] text-[var(--ink-muted)] mt-3 leading-relaxed">
                    <Lock size={10} className="inline mr-1" />
                    Waiting on {jd.collegeTag || "the college"}'s placement cell
                    to pass students.
                  </p>
                )}
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <PostJdModal
        open={postOpen}
        onClose={() => setPostOpen(false)}
        onPosted={() => qc.invalidateQueries({ queryKey: ["recruiter-jds"] })}
      />
    </div>
  );
}
