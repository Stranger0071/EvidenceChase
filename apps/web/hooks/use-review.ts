'use client';

import type {
  ActivityLogDto,
  EvidenceRequestDto,
  FileUrlDto,
  MagicLinkDto,
  ReviewRequestInput,
  SendRequestsInput,
  SendRequestsResultDto,
  SubmissionDto,
} from '@evidencechase/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export function useSubmissions(requestId: string | null) {
  return useQuery({
    queryKey: queryKeys.submissions(requestId ?? ''),
    queryFn: async () =>
      (await api.get<{ submissions: SubmissionDto[] }>(`/requests/${requestId}/submissions`))
        .submissions,
    enabled: Boolean(requestId),
    // Poll while the current submission is still being scanned.
    refetchInterval: (query) =>
      query.state.data?.[0]?.files.some((file) => file.state === 'AWAITING_SCAN') ? 5000 : false,
  });
}

export function useTimeline(requestId: string | null) {
  return useQuery({
    queryKey: queryKeys.timeline(requestId ?? ''),
    queryFn: async () =>
      (await api.get<{ timeline: ActivityLogDto[] }>(`/requests/${requestId}/timeline`)).timeline,
    enabled: Boolean(requestId),
  });
}

export function useReview(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReviewRequestInput) =>
      (await api.post<{ request: EvidenceRequestDto }>(`/requests/${requestId}/review`, input))
        .request,
    // Success or a lost race (409): either way the cached request and audit counts are out of date.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.audits }),
        queryClient.invalidateQueries({ queryKey: queryKeys.evidence(requestId) }),
      ]),
  });
}

/** A 60-second link to a verified file. Fetched on click, so it never sits around unused. */
export function useFileUrl() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fileId, inline }: { fileId: string; inline: boolean; requestId: string }) =>
      api.get<FileUrlDto>(`/files/${fileId}/url${inline ? '?disposition=inline' : ''}`),
    onSuccess: (_data, { requestId }) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline(requestId) }),
  });
}

export function useSendRequests(auditId: string) {
  return useMutation({
    mutationFn: (input: SendRequestsInput) =>
      api.post<SendRequestsResultDto>(`/audits/${auditId}/requests/send`, input),
  });
}

export function useCopyLink(auditId: string) {
  return useMutation({
    mutationFn: (requestId: string) =>
      api.post<MagicLinkDto>(`/audits/${auditId}/requests/${requestId}/link`),
  });
}

/** "Nudge now": an immediate reminder, at most one reminder email per owner per day. */
export function useNudge(auditId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) =>
      api.post<void>(`/audits/${auditId}/requests/${requestId}/nudge`),
    onSuccess: (_data, requestId) =>
      queryClient.invalidateQueries({ queryKey: queryKeys.timeline(requestId) }),
  });
}
