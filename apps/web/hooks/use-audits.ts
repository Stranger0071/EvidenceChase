'use client';

import type { AuditDto, AuditInput, AuditUpdateInput } from '@evidencechase/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export function useAudits() {
  return useQuery({
    queryKey: queryKeys.audits,
    queryFn: async () => (await api.get<{ audits: AuditDto[] }>('/audits')).audits,
  });
}

export function useAudit(auditId: string) {
  return useQuery({
    queryKey: queryKeys.audit(auditId),
    queryFn: async () => (await api.get<{ audit: AuditDto }>(`/audits/${auditId}`)).audit,
  });
}

/** After any audit change: store the fresh audit and refetch the list (its summaries changed). */
function useAuditMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<AuditDto>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (audit) => {
      queryClient.setQueryData(queryKeys.audit(audit.id), audit);
      void queryClient.invalidateQueries({ queryKey: queryKeys.audits, exact: true });
    },
  });
}

export function useCreateAudit() {
  return useAuditMutation(
    async (input: AuditInput) => (await api.post<{ audit: AuditDto }>('/audits', input)).audit,
  );
}

export function useUpdateAudit(auditId: string) {
  return useAuditMutation(
    async (input: AuditUpdateInput) =>
      (await api.patch<{ audit: AuditDto }>(`/audits/${auditId}`, input)).audit,
  );
}

export function useArchiveAudit(auditId: string) {
  return useAuditMutation(
    async () => (await api.post<{ audit: AuditDto }>(`/audits/${auditId}/archive`)).audit,
  );
}
