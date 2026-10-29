import apiClient from "./client";

export const roadmapApi = {
  list: (jdId) =>
    apiClient
      .get("/roadmap", { params: jdId ? { jdId } : {} })
      .then((r) => r.data),

  // Builds (or rebuilds) the plan from the latest readiness result. Completed
  // and in-progress items are preserved server-side.
  //
  // `versionId` (optional) builds from a SPECIFIC resume version's readiness —
  // so a student who picks an older version gets a plan for that version's gaps,
  // not for whichever one happened to be scored last.
  // Omitting `jdId` builds the plan from the RESUME BASELINE — the gaps between
  // the resume and the role its content implies — so a student with no postings
  // still gets a roadmap.
  generate: (jdId, versionId) =>
    apiClient
      .post("/roadmap/generate", {
        ...(jdId ? { jdId } : {}),
        ...(versionId ? { versionId } : {}),
      })
      .then((r) => r.data),

  setStatus: (itemId, status) =>
    apiClient.patch(`/roadmap/${itemId}/status`, { status }).then((r) => r.data.item),

  remove: (itemId) => apiClient.delete(`/roadmap/${itemId}`).then((r) => r.data),
};
