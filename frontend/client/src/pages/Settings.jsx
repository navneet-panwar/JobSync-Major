import { useState, useEffect } from "react";
import { Sun, Moon, Check, Copy, Building2, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/UIContext";
import { authApi } from "@/api/auth";
import { collegeApi } from "@/api/colleges";
import { cn } from "@/lib/utils";

/**
 * StudentCollegeSection — lets a student attach themselves to a college using
 * the code their placement cell issued.
 *
 * Until this is done the student belongs to no college, so they cannot appear
 * in any college-scoped view (cohort table, gatekeeping, analytics). Membership
 * is permanent once set: a placement cell moves students, not the students
 * themselves — otherwise a student could re-home to dodge a status decision.
 */
function StudentCollegeSection() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [state, setState] = useState("idle"); // idle | checking | valid | invalid
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);

  const linked = Boolean(user?.college?.name);

  function onCodeChange(value) {
    const next = value.toUpperCase().trim();
    setCode(next);
    setPreview("");
    if (!next) { setState("idle"); return; }
    setState("checking");
    clearTimeout(window.__joinCodeTimer);
    window.__joinCodeTimer = setTimeout(async () => {
      try {
        const data = await collegeApi.validate(next);
        if (data.valid) { setState("valid"); setPreview(data.college.name); }
        else setState("invalid");
      } catch {
        setState("idle");
      }
    }, 400);
  }

  async function onJoin(e) {
    e.preventDefault();
    if (!code) return;
    setSaving(true);
    try {
      const data = await collegeApi.join(code);
      await refresh();
      toast.success(
        `You've joined ${data.college.name}`,
        "Your placement cell can now see your readiness profile."
      );
    } catch (err) {
      toast.error("Couldn't join that college", err?.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="lg" className="max-w-2xl">
      <CardHeader>
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 size={16} className="text-[var(--accent-strong)]" />
            College
          </CardTitle>
          <CardDescription className="mt-1">
            {linked
              ? "Your placement cell can see your readiness profile."
              : "Enter the code your placement cell gave you to join your college."}
          </CardDescription>
        </div>
      </CardHeader>

      {linked ? (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--accent-soft)] px-5 py-4">
          <CheckCircle2 size={18} className="text-[var(--accent-strong)] shrink-0" />
          <div>
            <div className="font-display text-sm font-semibold text-[var(--ink)]">
              {user.college.name}
            </div>
            <p className="text-xs text-[var(--ink-muted)] mt-0.5">
              Membership is permanent. Ask your placement cell if it needs changing.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={onJoin} className="space-y-3">
          <div>
            <FieldLabel>College code</FieldLabel>
            <Input
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              placeholder="e.g. GNIOT-7F2K"
              className="uppercase tracking-widest"
              autoComplete="off"
            />
            {state === "checking" && (
              <p className="text-[11px] text-[var(--ink-muted)] mt-1.5">Checking code…</p>
            )}
            {state === "valid" && (
              <p className="text-[11px] font-medium text-[var(--success)] mt-1.5 flex items-center gap-1">
                <Check size={11} /> {preview}
              </p>
            )}
            {state === "invalid" && (
              <p className="text-[11px] font-medium text-[var(--danger)] mt-1.5">
                Invalid or inactive code — check with your placement cell
              </p>
            )}
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="accent" disabled={!code || saving || state === "invalid"}>
              {saving ? "Joining…" : "Join college"}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function FieldLabel({ children }) {
  return (
    <label className="text-xs font-medium text-[var(--ink-muted)] mb-1.5 block">
      {children}
    </label>
  );
}

function ProfileSection() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);

  const dirty = name.trim() !== (user?.name || "") && name.trim().length > 0;

  async function onSave(e) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    try {
      await updateProfile({ name: name.trim() });
      toast.success("Profile updated");
    } catch (err) {
      toast.error("Couldn't update profile", err?.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="lg" className="max-w-2xl">
      <CardHeader>
        <div>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription className="mt-1">
            Your display name appears on the dashboard greeting and on your resumes.
          </CardDescription>
        </div>
      </CardHeader>

      <form onSubmit={onSave} className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] font-semibold flex items-center justify-center text-lg ring-2 ring-[var(--surface)] shrink-0">
            {(user?.name?.[0] || "?").toUpperCase()}
          </div>
          <div className="text-xs text-[var(--ink-muted)]">
            Avatar is generated from your initial.
          </div>
        </div>

        {/* Account type (read-only) — role + college, stamped at registration */}
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center h-7 px-3 rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] text-xs font-medium capitalize">
            {user?.role || "student"}
          </span>
          {user?.college?.name && (
            <span className="inline-flex items-center h-7 px-3 rounded-full border border-[var(--border)] text-[var(--ink-muted)] text-xs">
              {user.college.name}
            </span>
          )}
        </div>

        <div>
          <FieldLabel>Full name</FieldLabel>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Your name"
          />
        </div>

        <div>
          <FieldLabel>Email</FieldLabel>
          <Input value={user?.email || ""} disabled />
          <p className="text-[11px] text-[var(--ink-muted)] mt-1.5">
            Change your email from the <strong>Email</strong> tab — it needs your password.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={!dirty || saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ThemeOption({ value, label, icon: Icon, current, onSelect }) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        "relative flex-1 flex flex-col items-start gap-3 p-4 rounded-2xl border text-left transition-all",
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
          : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
      )}
    >
      <div
        className={cn(
          "h-9 w-9 rounded-xl flex items-center justify-center",
          active
            ? "bg-[var(--accent-strong)] text-white"
            : "bg-[var(--surface-2)] text-[var(--ink-muted)]"
        )}
      >
        <Icon size={16} />
      </div>
      <div>
        <div className="text-sm font-semibold text-[var(--ink)]">{label}</div>
        <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">
          {value === "light" ? "Soft, airy, sage tones" : "Calm, low-glare night"}
        </div>
      </div>
      {active && (
        <span className="absolute top-3 right-3 h-5 w-5 rounded-full bg-[var(--accent-strong)] text-white flex items-center justify-center">
          <Check size={12} />
        </span>
      )}
    </button>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <Card padding="lg" className="max-w-2xl">
      <CardHeader>
        <div>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription className="mt-1">
            Pick a theme. Your choice is remembered on this device.
          </CardDescription>
        </div>
      </CardHeader>

      <div className="flex gap-3">
        <ThemeOption
          value="light"
          label="Light"
          icon={Sun}
          current={theme}
          onSelect={setTheme}
        />
        <ThemeOption
          value="dark"
          label="Dark"
          icon={Moon}
          current={theme}
          onSelect={setTheme}
        />
      </div>
    </Card>
  );
}

function EmailSection() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrent] = useState("");
  const [saving, setSaving] = useState(false);

  const looksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim());
  const changed = newEmail.trim().toLowerCase() !== (user?.email || "").toLowerCase();
  const canSubmit = looksValid && changed && currentPassword.length > 0 && !saving;

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      await authApi.changeEmail({
        newEmail: newEmail.trim().toLowerCase(),
        currentPassword,
      });
      await refresh();
      toast.success("Email updated", "Use your new address next time you sign in.");
      setNewEmail("");
      setCurrent("");
    } catch (err) {
      toast.error("Couldn't change email", err?.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="lg" className="max-w-2xl">
      <CardHeader>
        <div>
          <CardTitle className="text-base">Email address</CardTitle>
          <CardDescription className="mt-1">
            Your email is how you sign in and where account mail is sent. Changing it requires
            your current password.
          </CardDescription>
        </div>
      </CardHeader>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <FieldLabel>Current email</FieldLabel>
          <Input value={user?.email || ""} disabled />
        </div>

        <div>
          <FieldLabel>New email</FieldLabel>
          <Input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
          {newEmail.length > 0 && !looksValid && (
            <p className="text-[11px] font-medium text-[var(--danger)] mt-1.5">
              That doesn't look like a valid email
            </p>
          )}
        </div>

        <div>
          <FieldLabel>Current password</FieldLabel>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Confirm it's you"
            autoComplete="current-password"
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={!canSubmit}>
            {saving ? "Updating..." : "Update email"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordSection() {
  const toast = useToast();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const newTooShort = newPassword.length > 0 && newPassword.length < 8;
  const mismatch = confirm.length > 0 && confirm !== newPassword;
  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    confirm === newPassword &&
    !saving;

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      toast.success("Password changed");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      toast.error("Couldn't change password", err?.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="lg" className="max-w-2xl">
      <CardHeader>
        <div>
          <CardTitle className="text-base">Password</CardTitle>
          <CardDescription className="mt-1">
            Use at least 8 characters. Mix letters, numbers, and a symbol for a stronger
            password.
          </CardDescription>
        </div>
      </CardHeader>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <FieldLabel>Current password</FieldLabel>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        <div>
          <FieldLabel>New password</FieldLabel>
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
          {newTooShort && (
            <p className="text-[11px] text-[var(--danger)] mt-1.5">
              Needs to be at least 8 characters.
            </p>
          )}
        </div>

        <div>
          <FieldLabel>Confirm new password</FieldLabel>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
          {mismatch && (
            <p className="text-[11px] text-[var(--danger)] mt-1.5">
              Passwords don&apos;t match.
            </p>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={!canSubmit}>
            {saving ? "Updating..." : "Update password"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function CollegeCodeSection() {
  const { user } = useAuth();
  const toast = useToast();
  const [college, setCollege] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    authApi
      .myCollege()
      .then((data) => alive && setCollege(data.college))
      .catch(() => alive && setCollege(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <Card padding="lg" className="max-w-2xl"><Skeleton className="h-24" /></Card>;
  if (!college) return null;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(college.code);
      toast.success("Code copied to clipboard");
    } catch {
      toast.error("Couldn't copy — code is " + college.code);
    }
  }

  return (
    <Card padding="lg" className="max-w-2xl">
      <CardHeader>
        <div>
          <CardTitle className="text-base">College registration code</CardTitle>
          <CardDescription className="mt-1">
            Students register with this code to join {college.name}. Share it with your cohort.
          </CardDescription>
        </div>
      </CardHeader>
      <div className="flex items-center gap-3">
        <code className="tabular flex-1 h-11 px-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] text-sm font-semibold tracking-[0.2em] text-[var(--ink)] flex items-center">
          {college.code}
        </code>
        <Button variant="soft" size="md" onClick={copyCode}>Copy code</Button>
      </div>
    </Card>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState("profile");
  const isPlacementCell = user?.role === "placement_cell" || user?.role === "admin";
  const isStudent = !user?.role || user?.role === "student";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your account, look & feel, and password."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          {isPlacementCell && <TabsTrigger value="college">College</TabsTrigger>}
          {isStudent && <TabsTrigger value="college">College</TabsTrigger>}
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="password">Password</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="profile">
            <ProfileSection />
          </TabsContent>
          <TabsContent value="email">
            <EmailSection />
          </TabsContent>
          {isPlacementCell && (
            <TabsContent value="college">
              <CollegeCodeSection />
            </TabsContent>
          )}
          {isStudent && (
            <TabsContent value="college">
              <StudentCollegeSection />
            </TabsContent>
          )}
          <TabsContent value="appearance">
            <AppearanceSection />
          </TabsContent>
          <TabsContent value="password">
            <PasswordSection />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
