import type { EvidenceFile, PrismaClient, RequestStatus, Submission } from '@prisma/client';
import { ConflictError } from '../errors';
import type { ActivityCreateData } from './activityRepository';
import { staleRequestError } from './requestRepository';

export type SubmissionWithFiles = Submission & { files: EvidenceFile[] };

export interface CreateSubmissionInput {
  requestId: string;
  expectedVersion: number;
  toStatus: RequestStatus;
  note: string | null;
  /** Each file's server-computed hash and detected type, saved in the same transaction. */
  files: Array<{ id: string; sha256: string; detectedMime: string | null }>;
  activity: Omit<ActivityCreateData, 'requestId' | 'toStatus'>;
}

const filesInOrder = { files: { orderBy: { createdAt: 'asc' } } } as const;

export function createSubmissionRepository(prisma: PrismaClient) {
  return {
    /**
     * Records a submission atomically (PRD §8.4, step 4): the new submission, its files moved out
     * of PENDING_UPLOAD with their hashes, the status change and the activity entry. Either all of
     * it is saved or none of it. The version check stops two submits racing each other.
     */
    createWithStatusChange(input: CreateSubmissionInput): Promise<SubmissionWithFiles> {
      return prisma.$transaction(async (tx) => {
        const updated = await tx.evidenceRequest.updateMany({
          where: { id: input.requestId, version: input.expectedVersion },
          data: { status: input.toStatus, version: { increment: 1 } },
        });
        if (updated.count === 0) throw staleRequestError();

        await tx.submission.updateMany({
          where: { requestId: input.requestId, isCurrent: true },
          data: { isCurrent: false },
        });
        const submission = await tx.submission.create({
          data: { requestId: input.requestId, note: input.note },
        });

        for (const file of input.files) {
          // Conditional on the file still waiting to be submitted, for this request.
          const attached = await tx.evidenceFile.updateMany({
            where: { id: file.id, requestId: input.requestId, state: 'PENDING_UPLOAD' },
            data: {
              submissionId: submission.id,
              state: 'AWAITING_SCAN',
              sha256: file.sha256,
              detectedMime: file.detectedMime,
            },
          });
          if (attached.count !== 1) {
            throw new ConflictError(
              'One of these files was already submitted',
              'FILE_ALREADY_SUBMITTED',
            );
          }
        }

        await tx.activityLog.create({
          data: { ...input.activity, requestId: input.requestId, toStatus: input.toStatus },
        });

        return tx.submission.findUniqueOrThrow({
          where: { id: submission.id },
          include: filesInOrder,
        });
      });
    },

    findCurrentForRequest(requestId: string): Promise<SubmissionWithFiles | null> {
      return prisma.submission.findFirst({
        where: { requestId, isCurrent: true },
        include: filesInOrder,
      });
    },

    /** Every submission for a request, newest first: the evidence history. */
    listByRequest(requestId: string): Promise<SubmissionWithFiles[]> {
      return prisma.submission.findMany({
        where: { requestId },
        include: filesInOrder,
        orderBy: { submittedAt: 'desc' },
      });
    },
  };
}

export type SubmissionRepository = ReturnType<typeof createSubmissionRepository>;
