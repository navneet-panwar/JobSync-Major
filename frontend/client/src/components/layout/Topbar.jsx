import { Search, Sun, Moon } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { NotificationsPopover } from "./NotificationsPopover";

export function Topbar({ onOpenPalette }) {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const firstName = user?.name?.split(" ")[0] || "there";

  // The tagline and search hint describe the user's actual workspace — a
  // placement cell reading "sharpen your resume" told them the app was not
  // for them.
  const ROLE_COPY = {
    student: {
      tagline: "Sharpen your resume with calm, focused AI insights.",
      search: "Search resumes, keywords, rewrites…",
    },
    placement_cell: {
      tagline: "Your college's readiness at a glance.",
      search: "Search students, skills, status…",
    },
    admin: {
      tagline: "Platform overview.",
      search: "Search students, colleges…",
    },
    recruiter: {
      tagline: "Candidates approved by their placement cells.",
      search: "Search candidates, skills, job descriptions…",
    },
  };
  const copy = ROLE_COPY[user?.role || "student"] || ROLE_COPY.student;

  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);

  return (
    <header className="flex items-start justify-between gap-6 mb-8">
      <div>
        <h1 className="font-display text-[clamp(28px,3vw,38px)] font-semibold leading-tight text-[var(--ink)]">
          Hello, {firstName}.
        </h1>
        <p className="text-sm text-[var(--ink-muted)] mt-1">{copy.tagline}</p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onOpenPalette}
          className="hidden lg:flex items-center gap-3 h-11 w-[360px] rounded-full bg-[var(--surface)] border border-[var(--border)] pl-5 pr-1.5 shadow-card transition-shadow hover:shadow-hover text-left"
        >
          <Search size={16} className="text-[var(--ink-muted)] shrink-0" />
          <span className="flex-1 text-sm text-[var(--ink-muted)] truncate">
            {copy.search}
          </span>
          <kbd className="inline-flex items-center gap-0.5 text-[10px] px-2 h-7 rounded-full bg-[var(--surface-2)] text-[var(--ink-muted)] border border-[var(--border)] font-semibold">
            {isMac ? "⌘" : "Ctrl"} K
          </kbd>
        </button>

        <IconButton
          onClick={onOpenPalette}
          title="Search"
          className="lg:hidden"
        >
          <Search size={16} />
        </IconButton>

        <IconButton onClick={toggle} title="Toggle theme">
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </IconButton>
        <NotificationsPopover />
      </div>
    </header>
  );
}
