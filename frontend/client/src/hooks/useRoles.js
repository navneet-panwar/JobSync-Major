import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rolesApi } from "@/api/roles";
import { useToast } from "@/context/UIContext";

/** The college's role index — every role with its resume vs interest counts. */
export function useRoleIndex() {
  return useQuery({
    queryKey: ["role-index"],
    queryFn: rolesApi.index,
    staleTime: 30_000,
  });
}

/** Students for one role, from a chosen source (resume | interested | both). */
export function useRoleStudents(roleKey, source = "both") {
  return useQuery({
    queryKey: ["role-students", roleKey, source],
    queryFn: () => rolesApi.studentsForRole(roleKey, source),
    enabled: Boolean(roleKey),
    keepPreviousData: true,
  });
}

/** The placement cell's own role postings. */
export function useRolePostings() {
  return useQuery({
    queryKey: ["role-postings"],
    queryFn: rolesApi.postings,
  });
}

export function useRolePosting(id) {
  return useQuery({
    queryKey: ["role-posting", id],
    queryFn: () => rolesApi.posting(id),
    enabled: Boolean(id),
  });
}

/**
 * Post a role to the college. On success the role index is invalidated as well
 * as the posting list — a new role may have just been created, and it must
 * appear in the filter immediately.
 */
export function useCreateRolePosting() {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: rolesApi.createPosting,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["role-postings"] });
      qc.invalidateQueries({ queryKey: ["role-index"] });
      toast.success(
        data.roleIsNew
          ? `Posted — "${data.role.label}" is a new role and was created automatically`
          : `Posted to ${data.notified} student${data.notified === 1 ? "" : "s"}`,
        `${data.notified} student${data.notified === 1 ? "" : "s"} notified. Interested students appear under this role.`,
      );
    },
    onError: (err) => toast.error("Couldn't post this role", err?.message),
  });
}

export function useSetPostingStatus() {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, status }) => rolesApi.setPostingStatus(id, status),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["role-postings"] });
      qc.invalidateQueries({ queryKey: ["role-index"] });
      toast.success(vars.status === "closed" ? "Posting closed" : "Posting reopened");
    },
    onError: (err) => toast.error("Couldn't update the posting", err?.message),
  });
}

/** Open roles for the signed-in student, with their own answer applied. */
export function useMyRolePostings() {
  return useQuery({
    queryKey: ["my-role-postings"],
    queryFn: rolesApi.myPostings,
  });
}

export function useMyRoles() {
  return useQuery({
    queryKey: ["my-roles"],
    queryFn: rolesApi.myRoles,
  });
}

/**
 * Answer a posting. Optimistic so the button responds instantly; the server's
 * answer is the truth on settle.
 */
export function useRespondToRole() {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ postingId, response }) => rolesApi.respond(postingId, response),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["my-role-postings"] });
      qc.invalidateQueries({ queryKey: ["my-roles"] });
      toast.success(
        data.response === "interested"
          ? `You're interested in ${data.role.label}`
          : "Marked as not interested",
        data.response === "interested"
          ? "Your placement cell can see your interest."
          : undefined,
      );
    },
    onError: (err) => toast.error("Couldn't record your answer", err?.message),
  });
}