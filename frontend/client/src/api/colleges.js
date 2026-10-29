import apiClient from "./client";

export const collegeApi = {
  // Public — used by the Register page and the student "join college" field
  // to validate a code as the user types.
  validate: (code) =>
    apiClient
      .get(`/colleges/validate/${encodeURIComponent(code)}`)
      .then((r) => r.data),

  // Student: attach to a college with a code. Only allowed while the account
  // has no college yet.
  join: (code) =>
    apiClient.post("/colleges/join", { code }).then((r) => r.data),
};
