
// import { apiClient } from "./client";
import { mockDashboard } from "@/mock/dashboard";
import { mockDelay } from "@/mock/_helpers";

export const dashboardApi = {
  // get: () => apiClient.get("/dashboard").then((r) => r.data),
  get: async () => {
    await mockDelay();
    return mockDashboard;
  },
};
