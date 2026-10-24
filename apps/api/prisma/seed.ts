/**
 * Seeds a demo manager account and a realistic SOC 2 audit caught mid-way: some evidence accepted,
 * some waiting for review, one sent back with a comment, some overdue, some still to come. That
 * way evaluators see every part of the product as soon as they sign in. Safe to run more than
 * once: if the demo audit exists, nothing changes.
 *
 *   pnpm db:seed
 *
 * With storage configured (S3, or the local RustFS from docker compose), the demo evidence files
 * are uploaded for real, so previews, downloads and the export all work. Without storage, the
 * requests are created but no evidence is attached.
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaClient, type ActorType, type RequestStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { createStorage } from '../src/adapters/storage';
import { loadEnv } from '../src/config/env';
import { DEFAULT_BCRYPT_COST } from '../src/services/authService';
import { evidenceKeyFor } from '../src/services/scanService';

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo@evidencechase.app';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'evidence-demo-2026';
const DEMO_NAME = 'Priya Sharma';
const DEMO_AUDIT_NAME = 'SOC 2 Type II — FY26';

/** Due dates relative to today, so the demo always shows a mix of overdue, due-soon and later. */
function daysFromToday(days: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

/** A small but genuine one-page PDF, so previews and type detection behave as with real evidence. */
function demoPdf(title: string): Buffer {
  const text = title.replace(/[()\\]/g, '');
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

interface DemoRequest {
  controlRef: string;
  title: string;
  instructions: string;
  ownerName: string | null;
  ownerEmail: string;
  dueInDays: number;
  status: RequestStatus;
  /** For requests with evidence: the file and the story so far. */
  evidence?: {
    fileName: string;
    note?: string;
    submittedHoursAgo: number;
    changesComment?: string;
  };
}

const DEMO_REQUESTS: DemoRequest[] = [
  {
    controlRef: 'CC6.1',
    title: 'MFA enforcement screenshot',
    instructions:
      'Screenshot of the identity provider admin console showing MFA required for all users. The date must be visible.',
    ownerName: 'Rahul Mehta',
    ownerEmail: 'rahul.mehta@example.com',
    dueInDays: -4,
    status: 'ACCEPTED',
    evidence: {
      fileName: 'Okta MFA policy - Oct.pdf',
      submittedHoursAgo: 72,
      note: 'Policy applies to all groups.',
    },
  },
  {
    controlRef: 'CC6.2',
    title: 'Quarterly user access review',
    instructions: 'Export of the Q3 access review with reviewer sign-off for production systems.',
    ownerName: 'Rahul Mehta',
    ownerEmail: 'rahul.mehta@example.com',
    dueInDays: 2,
    status: 'SUBMITTED',
    evidence: { fileName: 'Q3 access review - signed.pdf', submittedHoursAgo: 5 },
  },
  {
    controlRef: 'CC6.3',
    title: 'Offboarding checklist samples',
    instructions: 'Completed offboarding checklists for three leavers from the audit period.',
    ownerName: 'Ananya Iyer',
    ownerEmail: 'ananya.iyer@example.com',
    dueInDays: 3,
    status: 'CHANGES_REQUESTED',
    evidence: {
      fileName: 'Offboarding - J. Doe.pdf',
      submittedHoursAgo: 30,
      changesComment: 'Only one checklist is attached. Please add the other two leavers from Q3.',
    },
  },
  {
    controlRef: 'CC7.2',
    title: 'Security incident log',
    instructions:
      'Export of all security incidents in the audit period, with severity and resolution.',
    ownerName: 'Vikram Rao',
    ownerEmail: 'vikram.rao@example.com',
    dueInDays: -6,
    status: 'PENDING',
  },
  {
    controlRef: 'CC8.1',
    title: 'Change management approvals',
    instructions: 'Pull request approval records for 10 sampled production changes.',
    ownerName: 'Vikram Rao',
    ownerEmail: 'vikram.rao@example.com',
    dueInDays: -1,
    status: 'PENDING',
  },
  {
    controlRef: 'CC1.4',
    title: 'Security awareness training completion',
    instructions: 'Training platform report showing completion rates for all employees.',
    ownerName: 'Ananya Iyer',
    ownerEmail: 'ananya.iyer@example.com',
    dueInDays: 7,
    status: 'PENDING',
  },
  {
    controlRef: 'A1.2',
    title: 'Backup restore test',
    instructions:
      'Evidence of the most recent successful backup restore test, with date and scope.',
    ownerName: null,
    ownerEmail: 'infra@example.com',
    dueInDays: 14,
    status: 'PENDING',
  },
];

async function main() {
  const env = loadEnv();
  const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  const canUpload = Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);

  // Say where this is about to write, so seeding the wrong database or bucket is obvious at once.
  console.log(`Database: ${new URL(env.DATABASE_URL).host}`);
  console.log(
    canUpload
      ? `Storage:  bucket "${env.S3_BUCKET}" on ${env.S3_ENDPOINT ?? `AWS S3 (${env.AWS_REGION})`}`
      : 'Storage:  not configured',
  );

  try {
    const user = await prisma.user.upsert({
      where: { email: DEMO_EMAIL },
      update: {},
      create: {
        email: DEMO_EMAIL,
        name: DEMO_NAME,
        passwordHash: await bcrypt.hash(DEMO_PASSWORD, DEFAULT_BCRYPT_COST),
      },
    });

    if (await prisma.audit.findFirst({ where: { ownerId: user.id, name: DEMO_AUDIT_NAME } })) {
      console.log(`Demo audit already exists for ${DEMO_EMAIL}; nothing to do.`);
      return;
    }
    if (!canUpload)
      console.warn('Storage is not configured: creating requests without demo evidence files.');

    const audit = await prisma.audit.create({
      data: {
        ownerId: user.id,
        name: DEMO_AUDIT_NAME,
        framework: 'SOC2',
        auditDate: daysFromToday(30),
      },
    });

    const storage = canUpload ? createStorage(env) : null;
    const s3 = canUpload
      ? new S3Client({
          region: env.AWS_REGION,
          endpoint: env.S3_ENDPOINT,
          forcePathStyle: Boolean(env.S3_ENDPOINT),
          credentials: {
            accessKeyId: env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
          },
        })
      : null;

    for (const demo of DEMO_REQUESTS) {
      const { dueInDays, evidence, status, ...fields } = demo;
      const withEvidence = evidence && s3 && storage;
      const request = await prisma.evidenceRequest.create({
        data: {
          ...fields,
          auditId: audit.id,
          dueDate: daysFromToday(dueInDays),
          // Without files, show everything as still owed rather than inventing reviewed evidence.
          status: withEvidence ? status : 'PENDING',
          version: withEvidence ? (status === 'SUBMITTED' ? 1 : 2) : 0,
        },
      });
      if (!withEvidence) continue;

      const submittedAt = hoursAgo(evidence.submittedHoursAgo);
      const submission = await prisma.submission.create({
        data: { requestId: request.id, note: evidence.note ?? null, submittedAt },
      });

      // Upload straight to evidence/: these files are known-good, so there's no quarantine step.
      const fileId = randomUUID();
      const bytes = demoPdf(`${demo.controlRef} ${demo.title}`);
      const storageKey = evidenceKeyFor({
        id: fileId,
        requestId: request.id,
        submissionId: submission.id,
        auditId: audit.id,
      });
      await s3.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: storageKey,
          Body: bytes,
          ContentType: 'application/pdf',
        }),
      );
      const retainUntil = new Date(
        Date.now() + env.OBJECT_LOCK_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );
      await storage.putRetention(storageKey, retainUntil);
      await prisma.evidenceFile.create({
        data: {
          id: fileId,
          requestId: request.id,
          submissionId: submission.id,
          state: 'VERIFIED',
          scanStatus: env.MALWARE_SCAN_ENABLED ? 'NO_THREATS_FOUND' : 'NOT_SCANNED',
          storageKey,
          originalName: evidence.fileName,
          declaredMime: 'application/pdf',
          detectedMime: 'application/pdf',
          sizeBytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          retainUntil,
          createdAt: submittedAt,
          verifiedAt: submittedAt,
        },
      });

      // The activity trail, as it would have happened.
      const log: Array<{
        actorType: ActorType;
        actorEmail: string;
        action: string;
        fromStatus: RequestStatus;
        toStatus: RequestStatus;
        comment: string | null;
        createdAt: Date;
      }> = [
        {
          actorType: 'OWNER',
          actorEmail: demo.ownerEmail,
          action: 'SUBMITTED',
          fromStatus: 'PENDING',
          toStatus: 'SUBMITTED',
          comment: evidence.note ?? null,
          createdAt: submittedAt,
        },
      ];
      if (status === 'ACCEPTED' || status === 'CHANGES_REQUESTED') {
        const accepted = status === 'ACCEPTED';
        log.push({
          actorType: 'MANAGER',
          actorEmail: DEMO_EMAIL,
          action: accepted ? 'ACCEPT' : 'REQUEST_CHANGES',
          fromStatus: 'SUBMITTED',
          toStatus: status,
          comment: accepted ? null : (evidence.changesComment ?? null),
          createdAt: hoursAgo(evidence.submittedHoursAgo - (accepted ? 20 : 6)),
        });
      }
      await prisma.activityLog.createMany({
        data: log.map((entry) => ({
          ...entry,
          requestId: request.id,
          actorId: entry.actorType === 'MANAGER' ? user.id : null,
        })),
      });
    }

    console.log(
      `Seeded demo account ${DEMO_EMAIL} (password: ${DEMO_PASSWORD}) with "${DEMO_AUDIT_NAME}".`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
