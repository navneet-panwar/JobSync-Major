import apiClient from "./client";

/**
 * roles API — the role-based student view, split by SOURCE.
 *
 * The placement-cell side (under /cell) and the student side (under /me) are
 * separate prefixes because they carry different role gates server-side.
 */
export const rolesApi = {
  // ---- Placement cell -----------------------------------------------------

  /** The college's role index: every role, with resume vs interest counts. */
  index: () => apiClient.get("/roles/cell/roles").then((r) => r.data),

  /**
   * Students for a role.
   * @param {string} roleKey
   * @param {"resume"|"interested"|"both"} source — which bucket to show. The
   *   two are never merged; `both` labels every row with its source.
   */
  studentsForRole: (roleKey, source = "both") =>
    apiClient
      .get(`/roles/cell/roles/${encodeURIComponent(roleKey)}/students`, {
        params: { source },
      })
      .then((r) => r.data),

  /** The cell's own role postings, with response tallies. */
  postings: () => apiClient.get("/roles/cell/roles/postings").then((r) => r.data),

  /** Who responded to one posting, and how. */
  posting: (id) => apiClient.get(`/roles/cell/roles/postings/${id}`).then((r) => r.data),

  /**
   * Post a role to the college and notify students.
   * A brand-new role is created automatically — no pre-registration needed.
   */
  createPosting: ({ title, role, company, location, description, jdId, studentIds }) =>
    apiClient
      .post("/roles/cell/roles/postings", {
        title,
        role,
        company,
        location,
        description,
        jdId,
        studentIds,
      })
      .then((r) => r.data),

  setPostingStatus: (id, status) =>
    apiClient.patch(`/roles/cell/roles/postings/${id}`, { status }).then((r) => r.data),

  // ---- Student ------------------------------------------------------------

  /** Open roles for the student's college, with their own answer applied. */
  myPostings: () => apiClient.get("/roles/me/roles/my-postings").then((r) => r.data),

  /** The student's own roles: resume-derived and opt-in, kept separate. */
  myRoles: () => apiClient.get("/roles/me/roles/my-roles").then((r) => r.data),

  /** Answer interested / not_interested for a posting. */
  respond: (postingId, response) =>
    apiClient
      .post(`/roles/me/roles/postings/${postingId}/respond`, { response })
      .then((r) => r.data),

  /** Unread role-interest notifications (nav badge). */
  unreadCount: () => apiClient.get("/roles/unread-count").then((r) => r.data),
};