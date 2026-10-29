import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { roadmapApi } from "@/api/roadmap";
import { useToast } from "@/context/UIContext";

export const roadmapKeys = {
  all: ["roadmap"],
  list: (jdId) => [...roadmapKeys.all, "list", jdId || "any"],
};

// Always enabled: with no jdId the server returns the baseline plan
// (items built before any posting existed), never an error.
export function useRoadmap(jdId) {
  return useQuery({
    queryKey: roadmapKeys.list(jdId),
    queryFn: () => roadmapApi.list(jdId),
  });
}

export function useGenerateRoadmap() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    // Accepts { jdId, versionId? } — a roadmap can be built from one specific
    // resume version's gaps rather than whichever was scored most recently.
    mutationFn: ({ jdId, versionId }) => roadmapApi.generate(jdId, versionId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: roadmapKeys.all });
      if (!data.items?.length) {
        toast.success("Nothing to work on", data.message);
        return;
      }
      const bits = [`${data.createdCount} milestone${data.createdCount === 1 ? "" : "s"} added`];
      if (data.preservedCount) bits.push(`${data.preservedCount} kept as-is`);
      toast.success("Roadmap ready", bits.join(" · "));
    },
    onError: (err) => toast.error("Couldn't build your roadmap", err?.message),
  });
}

/**
 * Status changes update optimistically — ticking a milestone should feel
 * instant, and roll back with a toast if the server rejects it.
 */
export function useRoadmapStatus(jdId) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = roadmapKeys.list(jdId);

  return useMutation({
    mutationFn: ({ itemId, status }) => roadmapApi.setStatus(itemId, status),

    onMutate: async ({ itemId, status }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData(key);

      qc.setQueryData(key, (old) => {
        if (!old?.items) return old;
        const items = old.items.map((i) => (i._id === itemId ? { ...i, status } : i));
        const total = items.length;
        const done = items.filter((i) => i.status === "done").length;
        const inProgress = items.filter((i) => i.status === "in_progress").length;
        return {
          ...old,
          items,
          progress: {
            total,
            done,
            inProgress,
            notStarted: total - done - inProgress,
            percent: total ? Math.round((done / total) * 100) : 0,
          },
        };
      });

      return { previous };
    },

    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      toast.error("Couldn't update that milestone", err?.message);
    },

    onSettled: () => qc.invalidateQueries({ queryKey: roadmapKeys.all }),
  });
}
