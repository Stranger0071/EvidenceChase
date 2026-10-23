import type { EvidenceFile, Prisma, PrismaClient, ScanStatus } from '@prisma/client';

export interface FileCreateData {
  id: string;
  requestId: string;
  storageKey: string;
  originalName: string;
  declaredMime: string;
  sizeBytes: number;
}

const withRequestAndAudit = {
  request: { include: { audit: true } },
} satisfies Prisma.EvidenceFileInclude;
const withScanContext = {
  submission: true,
  request: { include: { audit: true } },
} satisfies Prisma.EvidenceFileInclude;

export type FileWithRequest = Prisma.EvidenceFileGetPayload<{
  include: typeof withRequestAndAudit;
}>;
/** A quarantined file with everything the scan job needs to promote or reject it. */
export type FileForScan = Prisma.EvidenceFileGetPayload<{ include: typeof withScanContext }>;

/**
 * State changes on files are conditional (`where: { state: ... }`), so running the same step
 * twice, for example the scan job overlapping a manual check, can never apply it twice.
 */
export function createFileRepository(prisma: PrismaClient) {
  return {
    async createMany(files: FileCreateData[]): Promise<void> {
      await prisma.evidenceFile.createMany({ data: files });
    },

    /** Files the owner uploaded for this request (other requests' file IDs are never returned). */
    findForRequest(ids: string[], requestId: string): Promise<EvidenceFile[]> {
      return prisma.evidenceFile.findMany({ where: { id: { in: ids }, requestId } });
    },

    /** A file, but only if it belongs to one of this manager's audits (IDOR protection). */
    findForManager(id: string, managerId: string): Promise<FileWithRequest | null> {
      return prisma.evidenceFile.findFirst({
        where: { id, request: { audit: { ownerId: managerId } } },
        include: withRequestAndAudit,
      });
    },

    listAwaitingScan(options: { requestId?: string; limit: number }): Promise<FileForScan[]> {
      return prisma.evidenceFile.findMany({
        where: {
          state: 'AWAITING_SCAN',
          ...(options.requestId && { requestId: options.requestId }),
        },
        include: withScanContext,
        orderBy: { createdAt: 'asc' },
        take: options.limit,
      });
    },

    /** Verified files whose Object Lock retention hasn't been applied yet (a previous attempt failed). */
    listMissingRetention(limit: number): Promise<EvidenceFile[]> {
      return prisma.evidenceFile.findMany({
        where: { state: 'VERIFIED', retainUntil: null },
        orderBy: { verifiedAt: 'asc' },
        take: limit,
      });
    },

    /** Records that a file passed every check and now lives under evidence/. */
    async markVerified(
      id: string,
      data: { storageKey: string; scanStatus: ScanStatus; verifiedAt: Date },
    ): Promise<boolean> {
      const result = await prisma.evidenceFile.updateMany({
        where: { id, state: 'AWAITING_SCAN' },
        data: { ...data, state: 'VERIFIED' },
      });
      return result.count === 1;
    },

    async setRetention(id: string, retainUntil: Date): Promise<void> {
      await prisma.evidenceFile.update({ where: { id }, data: { retainUntil } });
    },

    async reject(
      id: string,
      data: {
        reason: string;
        scanStatus?: ScanStatus;
        fromState: 'PENDING_UPLOAD' | 'AWAITING_SCAN';
      },
    ): Promise<boolean> {
      const result = await prisma.evidenceFile.updateMany({
        where: { id, state: data.fromState },
        data: {
          state: 'REJECTED',
          rejectReason: data.reason,
          ...(data.scanStatus && { scanStatus: data.scanStatus }),
        },
      });
      return result.count === 1;
    },

    /** Upload links that were never used. The S3 lifecycle rule deletes their bytes. */
    async rejectAbandoned(createdBefore: Date): Promise<number> {
      const result = await prisma.evidenceFile.updateMany({
        where: { state: 'PENDING_UPLOAD', createdAt: { lt: createdBefore } },
        data: { state: 'REJECTED', rejectReason: 'The upload was never completed' },
      });
      return result.count;
    },
  };
}

export type FileRepository = ReturnType<typeof createFileRepository>;
