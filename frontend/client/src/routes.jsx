import { Navigate, createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Landing from "@/pages/Landing";
import { Placeholder } from "@/pages/Placeholder";
import Resumes from "@/pages/Resumes";
import ResumeDetail from "@/pages/ResumeDetail";
import ExportPage from "@/pages/Export";
import Insights from "@/pages/Insights";
import Versions from "@/pages/Versions";
import History from "@/pages/History";
import Settings from "@/pages/Settings";
import PlacementCellHome from "@/pages/PlacementCellHome";
import RecruiterHome from "@/pages/RecruiterHome";
import PlacementStudents from "@/pages/PlacementStudents";
import PlacementTraining from "@/pages/PlacementTraining";
import PlacementRoles from "@/pages/PlacementRoles";
import PlacementPlacements from "@/pages/PlacementPlacements";
import StudentRoles from "@/pages/StudentRoles";
import JobDescriptions from "@/pages/JobDescriptions";
import Readiness from "@/pages/Readiness";
import Roadmap from "@/pages/Roadmap";
import PlacementStudentDetail from "@/pages/PlacementStudentDetail";
import RecruiterJobs from "@/pages/RecruiterJobs";
import RecruiterCandidates from "@/pages/RecruiterCandidates";
import MockInterview from "@/pages/MockInterview";
import Meetings from "@/pages/Meetings";
import { useAuth } from "@/context/AuthContext";

/**
 * RoleHome — the role-aware landing page at /dashboard.
 *
 * A placement cell has no resumes and no student KPIs, so showing it the
 * student dashboard produced an empty, meaningless page. Each role now lands
 * on a workspace that actually applies to it. The student dashboard remains
 * the default for students (and legacy accounts).
 */
function RoleHome() {
  const { user } = useAuth();

  if (user?.role === "placement_cell" || user?.role === "admin") {
    return <PlacementCellHome />;
  }
  if (user?.role === "recruiter") {
    return <RecruiterHome />;
  }
  return <Dashboard />;
}

function ProtectedShell() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--ink-muted)] text-sm">
        Loading...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell />;
}

export const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },
  {
    path: "/",
    element: <ProtectedShell />,
    children: [
      { path: "dashboard", element: <RoleHome /> },
      { path: "resumes", element: <Resumes /> },
      { path: "resumes/:id", element: <ResumeDetail /> },
      { path: "resumes/:id/export", element: <ExportPage /> },
      { path: "jobs", element: <JobDescriptions /> },
      { path: "readiness", element: <Readiness /> },
      { path: "roadmap", element: <Roadmap /> },
      { path: "interview", element: <MockInterview /> },
      { path: "meetings", element: <Meetings /> },
      { path: "insights", element: <Insights /> },
      { path: "versions", element: <Versions /> },
      { path: "history", element: <History /> },
      { path: "placement/students", element: <PlacementStudents /> },
      { path: "placement/students/:id", element: <PlacementStudentDetail /> },
      { path: "placement/roles", element: <PlacementRoles /> },
      { path: "placement/roles/:roleKey", element: <PlacementRoles /> },
      { path: "placement/placements", element: <PlacementPlacements /> },
      { path: "placement/training", element: <PlacementTraining /> },
      { path: "roles", element: <StudentRoles /> },
      { path: "recruiter/jobs", element: <RecruiterJobs /> },
      { path: "candidates", element: <RecruiterCandidates /> },
      { path: "settings", element: <Settings /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
