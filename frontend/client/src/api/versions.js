import { useQuery } from "@tanstack/react-query";
import apiClient from "./client";

/**
 * The student's own resume versions, flattened for a picker.
 *
 * A student may have several resumes, each with several versions. Both the mock
 * interview and the roadmap can be built against a specific one, so this returns
 * them together with the resume title and the version's ATS score — enough to
 * make an informed choice without a second request.
 */
export const versionsApi = {
  list: () => apiClient.get("/versions").then((r) => r.data),
};

export function useResumeVersions() {
  return useQuery({
    queryKey: ["resume-versions"],
    queryFn: versionsApi.list,
    staleTime: 30_000,
  });
}