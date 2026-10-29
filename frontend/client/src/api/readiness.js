import apiClient from "./client";

export const readinessApi = {
  // Runs (or refreshes) the composite score for one resume version × JD.
  compute: ({ resumeId, versionId, jdId }) =>
    apiClient
      .post("/readiness/compute", { resumeId, versionId, jdId })
      .then((r) => r.data),

  latest: (jdId) =>
    apiClient
      .get("/readiness/latest", { params: jdId ? { jdId } : {} })
      .then((r) => r.data.readiness),

  history: (jdId) =>
    apiClient
      .get("/readiness", { params: jdId ? { jdId } : {} })
      .then((r) => r.data),
};
