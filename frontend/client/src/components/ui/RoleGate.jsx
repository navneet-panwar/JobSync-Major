import { useAuth } from "@/context/AuthContext";

/**
 * RoleGate — inline role-conditional rendering.
 *
 *   <RoleGate roles={["placement_cell"]}>…placement-only UI…</RoleGate>
 *   <RoleGate roles={["recruiter"]} fallback={<LockedNotice />}>…</RoleGate>
 *
 * Purely presentational access control (the real enforcement is server-side
 * requireRole/collegeScope) — it just keeps role-specific UI out of other
 * users' faces.
 */
export function RoleGate({ roles = [], fallback = null, children }) {
  const { user } = useAuth();
  if (!user) return fallback;
  if (roles.length === 0 || roles.includes(user.role)) return children;
  return fallback;
}

export default RoleGate;
