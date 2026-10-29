import apiClient from "./client";

export const interviewApi = {
  // Integrity acknowledgement is required by the server, so it is part of the
  // payload rather than a UI-only check.
  start: ({ jdId, targetRole, versionId, integrityAcknowledged = true }) =>
    apiClient
      .post("/interviews/start", { jdId, targetRole, versionId, integrityAcknowledged })
      .then((r) => r.data),

  answer: ({ sessionId, sessionToken, questionId, text, telemetry }) =>
    apiClient
      .post(`/interviews/${sessionId}/answer`, {
        sessionToken,
        questionId,
        text,
        telemetry,
      })
      .then((r) => r.data),

  complete: ({ sessionId, sessionToken }) =>
    apiClient
      .post(`/interviews/${sessionId}/complete`, { sessionToken })
      .then((r) => r.data),

  list: () => apiClient.get("/interviews").then((r) => r.data.sessions),

  get: (id) => apiClient.get(`/interviews/${id}`).then((r) => r.data.session),

  // Placement-cell view — includes integrity flags and the transcript.
  collegeView: (studentId) =>
    apiClient.get(`/interviews/college/${studentId}`).then((r) => r.data),
};
