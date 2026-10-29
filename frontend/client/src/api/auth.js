import apiClient from "./client";

export const authApi = {
  register: (payload) =>
    apiClient.post("/auth/register", payload).then((r) => r.data),

  login: (payload) =>
    apiClient.post("/auth/login", payload).then((r) => r.data),

  logout: () =>
    apiClient.post("/auth/logout").then((r) => r.data),

  me: () =>
    apiClient.get("/auth/me").then((r) => r.data),

  updateProfile: (payload) =>
    apiClient.patch("/auth/profile", payload).then((r) => r.data),

  // Email is a credential + password-reset destination, so the server requires
  // the current password.
  changeEmail: (payload) =>
    apiClient.patch("/auth/email", payload).then((r) => r.data),

  changePassword: (payload) =>
    apiClient.patch("/auth/password", payload).then((r) => r.data),

  // Placement cell only: own college incl. registration code (for sharing
  // with students). 403/404 for other roles — callers treat that as "hidden".
  myCollege: () =>
    apiClient.get("/colleges/me").then((r) => r.data),
};