/** TanStack Query cache keys, kept in one place so invalidation stays consistent. */
export const queryKeys = {
  me: ['me'] as const,
  audits: ['audits'] as const,
  audit: (auditId: string) => ['audits', auditId] as const,
  requests: (auditId: string) => ['audits', auditId, 'requests'] as const,
};
