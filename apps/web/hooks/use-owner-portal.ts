'use client';

import {
  ACCESS_TOKEN_HEADER,
  type OwnerPortalDto,
  type PreparedUploadDto,
  type SubmissionDto,
  type UploadBatchItem,
} from '@evidencechase/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

/** API calls for a control owner, authenticated by the token from their link (sent as a header). */
export function ownerApi(token: string) {
  const headers = { [ACCESS_TOKEN_HEADER]: token };
  return {
    portal: () => api.get<OwnerPortalDto>('/e/request', headers),
    prepare: async (files: UploadBatchItem[]) =>
      (await api.post<{ uploads: PreparedUploadDto[] }>('/e/uploads', { files }, headers)).uploads,
    submit: async (body: { fileIds: string[]; note: string; version: number }) =>
      (await api.post<{ submission: SubmissionDto }>('/e/submit', body, headers)).submission,
  };
}

const isScanning = (portal: OwnerPortalDto | undefined) =>
  portal?.currentSubmission?.files.some((file) => file.state === 'AWAITING_SCAN') ?? false;

export function useOwnerPortal(token: string) {
  return useQuery({
    queryKey: queryKeys.ownerPortal(token),
    queryFn: () => ownerApi(token).portal(),
    // Refresh while files are being scanned, so "Checking…" turns into a result on its own.
    refetchInterval: (query) => (isScanning(query.state.data) ? 5000 : false),
  });
}
