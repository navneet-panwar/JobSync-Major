import apiClient from "./client";

export const placementCellApi = {
  // College-scoped cohort. Scope is enforced server-side in the query filter,
  // so this can never return another college's students.
  students: ({ page = 1, limit = 25, q, status, minReadiness, maxReadiness, tags, roleKey, roleSource } = {}) =>
    apiClient
      .get("/placement-cell/students", {
        params: {
          page,
          limit,
          ...(q ? { q } : {}),
          ...(status ? { status } : {}),
          ...(minReadiness != null ? { minReadiness } : {}),
          ...(maxReadiness != null ? { maxReadiness } : {}),
          ...(tags ? { tags } : {}),
          ...(roleKey ? { roleKey } : {}),
          ...(roleSource ? { roleSource } : {}),
        },
      })
      .then((r) => r.data),

  student: (id) => apiClient.get(`/placement-cell/students/${id}`).then((r) => r.data),

  setStatus: (id, { status, note }) =>
    apiClient
      .patch(`/placement-cell/students/${id}/status`, { status, note })
      .then((r) => r.data),

  setTrainingTags: (id, tags) =>
    apiClient
      .post(`/placement-cell/students/${id}/training-tags`, { tags })
      .then((r) => r.data),

  // Gatekeeping: approve (or withdraw) a student for a specific recruiter JD.
  setPass: (id, { jdId, note, pass = true }) =>
    apiClient
      .patch(`/placement-cell/students/${id}/pass`, { jdId, note, pass })
      .then((r) => r.data),

  analytics: () => apiClient.get("/placement-cell/analytics").then((r) => r.data),

  // Roles RECRUITERS have posted to this college — what a cell can pass
  // students into. Deliberately not /api/jd, which returns the caller's own JDs
  // (a cell owns none, so that list was always empty).
  pipeline: () => apiClient.get("/placement-cell/pipeline").then((r) => r.data),

  // Who this cell has passed into ONE role, with the recruiter's decision.
  pipelineCandidates: (jdId) =>
    apiClient.get(`/placement-cell/pipeline/${jdId}/candidates`).then((r) => r.data),

  // Everything needed BEFORE passing a student: the resume, readiness for the
  // role being considered, and an explicit list of warnings.
  reviewStudent: (id, jdId) =>
    apiClient
      .get(`/placement-cell/students/${id}/review`, { params: jdId ? { jdId } : {} })
      .then((r) => r.data),

  // The Training workspace: tag vocabulary, who carries each tag, and the
  // students with no training assignment yet.
  training: () => apiClient.get("/placement-cell/training").then((r) => r.data),

  // Bulk actions run through a server-side queue and report a PER-STUDENT
  // outcome, so a partial failure is visible rather than silently partial.
  bulk: ({ studentIds, action, status, tags, jdId, note }) =>
    apiClient
      .post("/placement-cell/bulk", { studentIds, action, status, tags, jdId, note })
      .then((r) => r.data),

  // Non-punitive signals for review (duplicate resumes, interview flags).
  integrityFlags: () => apiClient.get("/placement-cell/integrity-flags").then((r) => r.data),

  acknowledgeFlag: (id) =>
    apiClient.patch(`/placement-cell/integrity-flags/${id}/acknowledge`).then((r) => r.data),
};
