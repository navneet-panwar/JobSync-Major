import apiClient from "./client";

export const recruiterApi = {
  // Own postings, with the size of each gated pool.
  jds: () => apiClient.get("/recruiter/jds").then((r) => r.data),

  createJd: ({ rawText, title, collegeId }) =>
    apiClient.post("/recruiter/jds", { rawText, title, collegeId }).then((r) => r.data.jd),

  // Drop a JD as a PDF/TXT — the same in-memory pipeline resumes use.
  uploadJd: ({ file, title, collegeId }) => {
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    if (collegeId) form.append("collegeId", collegeId);
    return apiClient
      .post("/recruiter/jds/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data.jd);
  },

  updateJd: (id, patch) => apiClient.patch(`/recruiter/jds/${id}`, patch).then((r) => r.data.jd),

  // THE gated feed: only placement-cell-approved students for this JD.
  candidates: (jdId) => apiClient.get(`/recruiter/jds/${jdId}/candidates`).then((r) => r.data),

  decide: (studentId, { jdId, decision }) =>
    apiClient
      .patch(`/recruiter/candidates/${studentId}/decision`, { jdId, decision })
      .then((r) => r.data),

  // The full candidate profile — resume, readiness for the role, matched and
  // missing skills. Gated: only a student passed to this recruiter is readable.
  candidateProfile: (studentId, jdId) =>
    apiClient
      .get(`/recruiter/candidates/${studentId}/profile`, {
        params: jdId ? { jdId } : {},
      })
      .then((r) => r.data),

  // Who a recruiter may propose a meeting to, grouped by role. Only students a
  // placement cell has passed — the same gate as the candidate feed.
  meetingOptions: () => apiClient.get("/recruiter/meeting-options").then((r) => r.data),

  // Role names from the recruiter's OWN previous postings, for the combobox.
  // (The placement-cell role index is college-scoped and 403s for a recruiter.)
  roleSuggestions: () => apiClient.get("/recruiter/role-suggestions").then((r) => r.data.roles),
};

export const collegeDirectoryApi = {
  // `q` searches by name server-side, so the picker stays usable as the
  // platform's college list grows.
  list: (q) =>
    apiClient
      .get("/colleges/directory", { params: q ? { q } : {} })
      .then((r) => r.data.colleges),
};
