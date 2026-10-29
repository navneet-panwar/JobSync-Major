import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { readinessApi } from "@/api/readiness";
import { useToast } from "@/context/UIContext";

export const readinessKeys = {
  all: ["readiness"],
  latest: (jdId) => [...readinessKeys.all, "latest", jdId || "any"],
  history: (jdId) => [...readinessKeys.all, "history", jdId || "any"],
};

export function useLatestReadiness(jdId) {
  return useQuery({
    queryKey: readinessKeys.latest(jdId),
    queryFn: () => readinessApi.latest(jdId),
  });
}

export function useReadinessHistory(jdId) {
  return useQuery({
    queryKey: readinessKeys.history(jdId),
    queryFn: () => readinessApi.history(jdId),
    enabled: !!jdId,
  });
}

export function useComputeReadiness() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: readinessApi.compute,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: readinessKeys.all });
      // `cached` means the server skipped the AI call because nothing changed —
      // worth saying, so the user knows the number is current rather than stale.
      toast.success(
        `Readiness ${data.readiness.composite}%`,
        data.cached
          ? "Nothing changed since the last check — reused the previous result."
          : data.source === "resume_baseline"
            ? `Scored against your resume's implied role${data.readiness?.target?.title ? ` — ${data.readiness.target.title}` : ""}.`
            : "Scored against this job description."
      );
    },
    onError: (err) => toast.error("Couldn't compute readiness", err?.message),
  });
}
