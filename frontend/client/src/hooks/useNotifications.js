import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "@/api/notifications";
import { useToast } from "@/context/UIContext";

export const notificationKeys = {
  all: ["notifications"],
  list: () => [...notificationKeys.all, "list"],
  meetings: () => [...notificationKeys.all, "meetings"],
};

/**
 * 30s polling rather than websockets: a free-tier host offers no persistent
 * connection budget, and a notification arriving within half a minute is
 * entirely adequate for placement-cell workflows (scope §9).
 */
export function useNotifications() {
  return useQuery({
    queryKey: notificationKeys.list(),
    queryFn: () => notificationsApi.list(30),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
      toast.success(
        data.updated ? `Marked ${data.updated} as read` : "Nothing left to mark"
      );
    },
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: notificationsApi.sendMessage,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
      toast.success("Message sent");
    },
    onError: (err) => toast.error("Couldn't send that message", err?.message),
  });
}

export function useMeetings() {
  return useQuery({
    queryKey: notificationKeys.meetings(),
    queryFn: notificationsApi.meetings,
    refetchInterval: 60_000,
  });
}

export function useProposeMeeting() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: notificationsApi.proposeMeeting,
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
      toast.success(
        `Proposed ${m.proposedSlots.length} time slot${m.proposedSlots.length === 1 ? "" : "s"}`,
        "The other party picks one to confirm."
      );
    },
    onError: (err) => toast.error("Couldn't propose a meeting", err?.message),
  });
}

export function useConfirmMeeting() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, slotIndex, note }) =>
      notificationsApi.confirmMeeting(id, { slotIndex, note }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
      toast.success(
        "Meeting confirmed",
        // Be explicit about email, since it is genuinely optional and the
        // download always works.
        data.emailConfigured
          ? "A calendar invite was emailed to everyone."
          : "Email isn't configured — use “Add to calendar” to download the invite."
      );
    },
    onError: (err) => toast.error("Couldn't confirm that slot", err?.message),
  });
}

export function useCancelMeeting() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, reason }) => notificationsApi.cancelMeeting(id, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.all });
      toast.success("Meeting cancelled");
    },
    onError: (err) => toast.error("Couldn't cancel", err?.message),
  });
}
