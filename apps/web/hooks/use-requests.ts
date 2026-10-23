'use client';

import type {
  CsvImportResultDto,
  EvidenceRequestDto,
  RequestInput,
  RequestUpdateInput,
} from '@evidencechase/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export function useRequests(auditId: string) {
  return useQuery({
    queryKey: queryKeys.requests(auditId),
    queryFn: async () =>
      (await api.get<{ requests: EvidenceRequestDto[] }>(`/audits/${auditId}/requests`)).requests,
  });
}

/**
 * Any change to an audit's requests also changes its summary counts, so both the request list and
 * the audits are refetched. Every query key starting with 'audits' covers all of them.
 */
function useRequestMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.audits }),
  });
}

export function useCreateRequest(auditId: string) {
  return useRequestMutation((input: RequestInput) =>
    api.post<{ request: EvidenceRequestDto }>(`/audits/${auditId}/requests`, input),
  );
}

export function useUpdateRequest(auditId: string) {
  return useRequestMutation(
    ({ requestId, input }: { requestId: string; input: RequestUpdateInput }) =>
      api.patch<{ request: EvidenceRequestDto }>(`/audits/${auditId}/requests/${requestId}`, input),
  );
}

export function useDeleteRequest(auditId: string) {
  return useRequestMutation((requestId: string) =>
    api.delete(`/audits/${auditId}/requests/${requestId}`),
  );
}

export function useImportRequests(auditId: string) {
  return useRequestMutation((csv: string) =>
    api.postCsv<CsvImportResultDto>(`/audits/${auditId}/requests/import`, csv),
  );
}
