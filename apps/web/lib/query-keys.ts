/** TanStack Query cache keys, kept in one place so invalidation stays consistent. */
export const queryKeys = {
  me: ['me'] as const,
  audits: ['audits'] as const,
  audit: (auditId: string) => ['audits', auditId] as const,
  requests: (auditId: string) => ['audits', auditId, 'requests'] as const,
  /** Everything about one request's evidence: its submissions and timeline. */
  evidence: (requestId: string) => ['evidence', requestId] as const,
  submissions: (requestId: string) => ['evidence', requestId, 'submissions'] as const,
  timeline: (requestId: string) => ['evidence', requestId, 'timeline'] as const,
  ownerPortal: (token: string) => ['owner-portal', token] as const,
};
