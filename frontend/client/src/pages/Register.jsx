import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, User, Mail, Lock, Building2, Briefcase, GraduationCap, Check, X } from "lucide-react";
import {
  AuthShell,
  AuthField,
  AuthPrimaryButton,
  AuthErrorBanner,
} from "@/components/auth/AuthShell";
import AILogo from "@/components/layout/AILogo";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/UIContext";

// Role picker — segmented pill control in the module's design language.
const ROLES = [
  { value: "student", label: "Student", icon: GraduationCap, hint: "I want to improve my resume" },
  { value: "recruiter", label: "Recruiter", icon: Briefcase, hint: "I hire candidates" },
  { value: "placement_cell", label: "Placement Cell", icon: Building2, hint: "I manage a college's students" },
];

const NEEDS_COLLEGE = ["student", "placement_cell"];

export default function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "student", collegeCode: "", collegeName: "" });
  const [codeState, setCodeState] = useState("idle"); // idle | checking | valid | invalid
  const [collegeName, setCollegeName] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const needsCollege = form.role === "student";        // student joins via code
  const createsCollege = form.role === "placement_cell"; // cell creates its college

  // Inline college-code validation against the public /colleges/validate
  // endpoint — instant feedback as the user types, debounced.
  function onCodeChange(value) {
    const code = value.toUpperCase().trim();
    setForm((f) => ({ ...f, collegeCode: code }));
    setCollegeName("");
    if (!code) { setCodeState("idle"); return; }
    setCodeState("checking");
    clearTimeout(window.__codeTimer);
    window.__codeTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/colleges/validate/${encodeURIComponent(code)}`);
        const data = await res.json();
        if (data.valid) { setCodeState("valid"); setCollegeName(data.college.name); }
        else setCodeState("invalid");
      } catch {
        setCodeState("idle");
      }
    }, 400);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const payload = { name: form.name, email: form.email, password: form.password, role: form.role };
      if (needsCollege) payload.collegeCode = form.collegeCode;
      if (createsCollege) payload.collegeName = form.collegeName;
      const result = await register(payload);
      // Placement cell just created its college — show the code immediately
      // and copy it to the clipboard.
      if (result?.college?.code) {
        try { await navigator.clipboard.writeText(result.college.code); } catch {}
        toast.success(
          `Your college code is ${result.college.code}`,
          "Copied to clipboard — share it with your students.",
          { duration: 10000 }
        );
      }
      nav("/dashboard");
    } catch (e) {
      setErr(e.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      headline={
        <>
          Your resume,
          <br />
          <em style={{ fontStyle: "italic" }}>intelligently sharpened.</em>
        </>
      }
      subhead="Drop your PDF, get an ATS score, fix what's weak, and land interviews — powered by AI."
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="mb-12">
          <AILogo size={48} />
        </div>

        <h1 className="font-display text-[34px] font-semibold tracking-tight text-[var(--ink)] leading-[1.05]">
          Get started
        </h1>
        <p className="text-[var(--ink-muted)] mt-2 text-[15px]">
          Free to start. No credit card required.
        </p>

        <form onSubmit={onSubmit} className="mt-9 space-y-4">
          {/* Role picker — segmented pills, same shape language as Tabs */}
          <div>
            <label className="block text-xs font-medium text-[var(--ink-muted)] mb-2">I am a…</label>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map((r) => {
                const Icon = r.icon;
                const active = form.role === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    title={r.hint}
                    onClick={() => setForm({ ...form, role: r.value })}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-medium transition-all duration-200 active:scale-[0.97] ${
                      active
                        ? "bg-[var(--ink)] text-[var(--bg)] border-transparent shadow-card"
                        : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <Icon size={16} />
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          <AuthField
            label="Full name"
            autoComplete="name"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            placeholder="Ada Lovelace"
            icon={User}
          />

          {needsCollege && (
            <div>
              <AuthField
                label="College code"
                value={form.collegeCode}
                onChange={onCodeChange}
                placeholder="e.g. GNIOT-7F2K — from your placement cell"
                icon={Building2}
                autoComplete="off"
                className="uppercase tracking-wider"
              />
              {codeState === "checking" && (
                <p className="text-[11px] text-[var(--ink-muted)] mt-1">Checking code…</p>
              )}
              {codeState === "valid" && (
                <p className="text-[11px] font-medium text-[var(--success)] mt-1 flex items-center gap-1">
                  <Check size={11} /> {collegeName}
                </p>
              )}
              {codeState === "invalid" && (
                <p className="text-[11px] font-medium text-[var(--danger)] mt-1 flex items-center gap-1">
                  <X size={11} /> Invalid or inactive code — check with your placement cell
                </p>
              )}
            </div>
          )}

          {createsCollege && (
            <div>
              <AuthField
                label="Your college's name"
                value={form.collegeName}
                onChange={(v) => setForm({ ...form, collegeName: v })}
                placeholder="e.g. GNIOT Greater Noida"
                icon={Building2}
                autoComplete="off"
              />
              <p className="text-[11px] text-[var(--ink-muted)] mt-1 leading-relaxed">
                We'll generate a unique registration code for your college — you'll share it
                with your students so they can join.
              </p>
            </div>
          )}

          <AuthField
            label="Email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
            placeholder="you@example.com"
            icon={Mail}
 />

          <AuthField
            label="Password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(v) => setForm({ ...form, password: v })}
            placeholder="At least 8 characters"
            minLength={8}
            icon={Lock}
          />

          <AuthErrorBanner>{err}</AuthErrorBanner>

          <div className="pt-1">
            <AuthPrimaryButton type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Create account <ArrowRight size={15} />
                </>
              )}
            </AuthPrimaryButton>
          </div>
        </form>

        <div className="text-sm text-[var(--ink-muted)] text-center mt-8">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-[var(--accent-strong)] font-semibold hover:underline"
          >
            Sign in
          </Link>
        </div>

        <p className="text-[11px] text-[var(--ink-muted)]/80 text-center mt-6 leading-relaxed">
          By creating an account you agree to our terms.
          <br />
          We never share your resume data with third parties.
        </p>
      </motion.div>
    </AuthShell>
  );
}
