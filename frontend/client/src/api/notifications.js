import apiClient from "./client";

export const notificationsApi = {
  list: (limit = 30) =>
    apiClient.get("/notifications", { params: { limit } }).then((r) => r.data),

  markRead: (id) => apiClient.patch(`/notifications/${id}/read`).then((r) => r.data),

  markAllRead: () => apiClient.patch("/notifications/read-all").then((r) => r.data),

  // Messaging routes through the same pipeline, addressed either to a person or
  // to an institution channel.
  sendMessage: ({ body, toUserId, toCollegeId, toRole, jdId, studentUserId }) =>
    apiClient
      .post("/notifications/messages", {
        body,
        toUserId,
        toCollegeId,
        toRole,
        jdId,
        studentUserId,
      })
      .then((r) => r.data),

  bulkNotify: ({ studentIds, title, body }) =>
    apiClient.post("/notifications/bulk-notify", { studentIds, title, body }).then((r) => r.data),

  // Meetings
  meetings: () => apiClient.get("/notifications/meetings").then((r) => r.data.meetings),

  proposeMeeting: (payload) =>
    apiClient.post("/notifications/meetings", payload).then((r) => r.data.meeting),

  confirmMeeting: (id, { slotIndex, note }) =>
    apiClient
      .post(`/notifications/meetings/${id}/confirm`, { slotIndex, note })
      .then((r) => r.data),

  cancelMeeting: (id, { reason }) =>
    apiClient.post(`/notifications/meetings/${id}/cancel`, { reason }).then((r) => r.data),

  // Direct download — works even when email is unconfigured.
  icsUrl: (id) => `/api/notifications/meetings/${id}/ics`,
};
