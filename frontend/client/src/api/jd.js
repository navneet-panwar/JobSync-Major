import apiClient from "./client";

export const jdApi = {
  list: () => apiClient.get("/jd").then((r) => r.data),

  get: (id) => apiClient.get(`/jd/${id}`).then((r) => r.data.jd),

  // Paste mode — the primary path.
  create: ({ rawText, title }) =>
    apiClient.post("/jd", { rawText, title }).then((r) => ({ jd: r.data.jd, reused: r.data.reused })),

  // File mode (.pdf / .txt), reusing the same multipart pipeline as resumes.
  upload: ({ file, title }) => {
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    return apiClient
      .post("/jd/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data.jd);
  },

  update: (id, patch) => apiClient.patch(`/jd/${id}`, patch).then((r) => r.data.jd),

  reparse: (id) => apiClient.post(`/jd/${id}/reparse`).then((r) => r.data.jd),

  remove: (id) => apiClient.delete(`/jd/${id}`).then((r) => r.data),
};
