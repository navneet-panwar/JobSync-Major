import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { jdApi } from "@/api/jd";
import { useToast } from "@/context/UIContext";

export const jdKeys = {
  all: ["jd"],
  list: () => [...jdKeys.all, "list"],
  detail: (id) => [...jdKeys.all, "detail", id],
};

export function useJobDescriptions() {
  return useQuery({
    queryKey: jdKeys.list(),
    queryFn: () => jdApi.list(),
  });
}

export function useJobDescription(id) {
  return useQuery({
    queryKey: jdKeys.detail(id),
    queryFn: () => jdApi.get(id),
    enabled: !!id,
  });
}

export function useCreateJd() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: jdApi.create,
    onSuccess: ({ jd, reused }) => {
      qc.invalidateQueries({ queryKey: jdKeys.all });
      if (reused) {
        // Pasting the same posting twice returns the existing role rather than
        // duplicating it — say so, or the user will think nothing happened.
        toast.info(
          `You already added "${jd.title}"`,
          "Showing the existing entry instead of creating a duplicate."
        );
        return;
      }
      toast.success(
        `Parsed "${jd.title}"`,
        `${jd.parsed?.requiredSkills?.length || 0} skills extracted.`
      );
    },
    onError: (err) => toast.error("Couldn't parse that job description", err?.message),
  });
}

export function useUploadJd() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: jdApi.upload,
    onSuccess: (jd) => {
      qc.invalidateQueries({ queryKey: jdKeys.all });
      toast.success(
        `Parsed "${jd.title}"`,
        `${jd.parsed?.requiredSkills?.length || 0} skills extracted.`
      );
    },
    onError: (err) => toast.error("Couldn't parse that file", err?.message),
  });
}

export function useReparseJd() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: jdApi.reparse,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: jdKeys.all });
      toast.success("Re-parsed with the latest model");
    },
    onError: (err) => toast.error("Re-parse failed", err?.message),
  });
}

export function useUpdateJd() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, patch }) => jdApi.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: jdKeys.all });
      toast.success("Updated");
    },
    onError: (err) => toast.error("Couldn't update", err?.message),
  });
}

export function useDeleteJd() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: jdApi.remove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: jdKeys.all });
      toast.success("Job description deleted");
    },
    onError: (err) => toast.error("Couldn't delete", err?.message),
  });
}
