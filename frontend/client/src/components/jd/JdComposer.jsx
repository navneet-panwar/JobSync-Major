import { useState } from "react";
import { motion } from "framer-motion";
import { UploadCloud, FileText, Link2, Loader2, Sparkles } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useCreateJd, useUploadJd } from "@/hooks/useJobDescriptions";

const SAMPLE = `Backend Engineer (Mid level)

Requirements:
- 3+ years with Node.js and Express
- Strong SQL and PostgreSQL
- Docker and CI/CD experience
- Bonus: Kubernetes, TypeScript`;

/**
 * JdComposer — paste text or drop a .pdf/.txt job description.
 *
 * Deliberately mirrors UploadDropzone's look (dashed border, accent glow on
 * hover, same button/size vocabulary) so the two ingestion flows feel like one
 * product rather than two features.
 */
export function JdComposer() {
  const [mode, setMode] = useState("paste"); // paste | file
  const [rawText, setRawText] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const create = useCreateJd();
  const upload = useUploadJd();
  const busy = create.isPending || upload.isPending;

  const tooShort = rawText.trim().length > 0 && rawText.trim().length < 40;

  function onPick(files) {
    const f = files?.[0];
    if (!f) return;
    if (!/\.(pdf|txt)$/i.test(f.name)) {
      setFile(null);
      return;
    }
    setFile(f);
  }

  function submitPaste(e) {
    e.preventDefault();
    if (rawText.trim().length < 40) return;
    create.mutate(
      { rawText: rawText.trim(), title: title.trim() || undefined },
      {
        onSuccess: () => {
          setRawText("");
          setTitle("");
        },
      },
    );
  }

  function submitFile() {
    if (!file) return;
    upload.mutate(
      { file, title: title.trim() || undefined },
      {
        onSuccess: () => {
          setFile(null);
          setTitle("");
        },
      },
    );
  }

  return (
    <Card padding="lg">
      <CardHeader>
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--accent-strong)]" />
            Add a job description
          </CardTitle>
          <CardDescription className="mt-1">
            AI extracts the required skills, responsibilities and experience
            level — then scores your resume against it.
          </CardDescription>
        </div>
      </CardHeader>

      {/* Mode switch — pill segmented control, same language as Tabs */}
      <div className="inline-flex rounded-full bg-[var(--surface-2)] border border-[var(--border)] p-0.5 mb-4">
        {[
          { key: "paste", label: "Paste text", icon: FileText },
          { key: "file", label: "Upload file", icon: UploadCloud },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={cn(
              "inline-flex items-center gap-2 h-8 px-3.5 rounded-full text-xs font-medium transition-all duration-200",
              mode === key
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-card"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <Input
          placeholder="Role title (optional — AI fills it from the posting)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
        />

        {mode === "paste" ? (
          <form onSubmit={submitPaste} className="space-y-3">
            <div className="relative">
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                maxLength={20000}
                rows={8}
                placeholder="Paste the full job posting here…"
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]/60 outline-none transition-all duration-200 focus:border-[var(--accent)]/40 focus:ring-4 focus:ring-[var(--accent)]/10 resize-y leading-relaxed"
              />
              <div className="absolute bottom-2.5 right-3 text-[10px] tabular text-[var(--ink-muted)]">
                {rawText.length.toLocaleString()} / 20,000
              </div>
            </div>

            {tooShort && (
              <p className="text-[11px] font-medium text-[var(--warning)]">
                That's a bit short — paste the whole posting so the skills parse
                correctly.
              </p>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setRawText(SAMPLE)}
                className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--accent-strong)] transition-colors"
              >
                Try a sample posting
              </button>
              <Button
                type="submit"
                variant="accent"
                disabled={busy || rawText.trim().length < 40}
              >
                {create.isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Parsing…
                  </>
                ) : (
                  "Parse job description"
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                onPick(e.dataTransfer.files);
              }}
              className={cn(
                "block rounded-2xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-all duration-200",
                dragOver
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent-soft)]/40",
              )}
            >
              <input
                type="file"
                accept=".pdf,.txt,application/pdf,text/plain"
                className="hidden"
                onChange={(e) => onPick(e.target.files)}
              />
              {file ? (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center gap-2 text-sm text-[var(--ink)]"
                >
                  <FileText size={15} className="text-[var(--accent-strong)]" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-[var(--ink-muted)] text-xs">
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                </motion.div>
              ) : (
                <>
                  <UploadCloud
                    size={22}
                    className="mx-auto text-[var(--ink-muted)]"
                  />
                  <div className="text-sm font-medium text-[var(--ink)] mt-3">
                    Drop a .pdf or .txt job description
                  </div>
                  <div className="text-xs text-[var(--ink-muted)] mt-1">
                    or click to browse
                  </div>
                </>
              )}
            </label>

            <div className="flex justify-end">
              <Button
                variant="accent"
                onClick={submitFile}
                disabled={!file || busy}
              >
                {upload.isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Parsing…
                  </>
                ) : (
                  "Parse file"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default JdComposer;
