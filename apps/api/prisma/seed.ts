/**
 * Seeds a demo manager account and a realistic SOC 2 audit, so evaluators can sign in and see
 * the product straight away. Safe to run more than once: nothing is duplicated.
 *
 *   pnpm db:seed
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEFAULT_BCRYPT_COST } from '../src/services/authService';

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo@evidencechase.app';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'evidence-demo-2026';
const DEMO_AUDIT_NAME = 'SOC 2 Type II — FY26';

/** Due dates relative to today, so the demo always shows a mix of overdue, due-soon and later. */
function daysFromToday(days: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

const DEMO_REQUESTS = [
  {
    controlRef: 'CC6.1',
    title: 'MFA enforcement screenshot',
    instructions:
      'Screenshot of the identity provider admin console showing MFA required for all users. The date must be visible.',
    ownerName: 'Rahul Mehta',
    ownerEmail: 'rahul.mehta@example.com',
    dueInDays: -3,
  },
  {
    controlRef: 'CC6.2',
    title: 'Quarterly user access review',
    instructions: 'Export of the Q3 access review with reviewer sign-off for production systems.',
    ownerName: 'Rahul Mehta',
    ownerEmail: 'rahul.mehta@example.com',
    dueInDays: 2,
  },
  {
    controlRef: 'CC6.3',
    title: 'Offboarding checklist samples',
    instructions: 'Completed offboarding checklists for three leavers from the audit period.',
    ownerName: 'Ananya Iyer',
    ownerEmail: 'ananya.iyer@example.com',
    dueInDays: 5,
  },
  {
    controlRef: 'CC7.2',
    title: 'Security incident log',
    instructions:
      'Export of all security incidents in the audit period, with severity and resolution.',
    ownerName: 'Vikram Rao',
    ownerEmail: 'vikram.rao@example.com',
    dueInDays: 7,
  },
  {
    controlRef: 'CC8.1',
    title: 'Change management approvals',
    instructions: 'Pull request approval records for 10 sampled production changes.',
    ownerName: 'Vikram Rao',
    ownerEmail: 'vikram.rao@example.com',
    dueInDays: -1,
  },
  {
    controlRef: 'CC1.4',
    title: 'Security awareness training completion',
    instructions: 'Training platform report showing completion rates for all employees.',
    ownerName: 'Ananya Iyer',
    ownerEmail: 'ananya.iyer@example.com',
    dueInDays: 10,
  },
  {
    controlRef: 'A1.2',
    title: 'Backup restore test',
    instructions:
      'Evidence of the most recent successful backup restore test, with date and scope.',
    ownerName: null,
    ownerEmail: 'infra@example.com',
    dueInDays: 14,
  },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.upsert({
      where: { email: DEMO_EMAIL },
      update: {},
      create: {
        email: DEMO_EMAIL,
        name: 'Priya Sharma',
        passwordHash: await bcrypt.hash(DEMO_PASSWORD, DEFAULT_BCRYPT_COST),
      },
    });

    const existing = await prisma.audit.findFirst({
      where: { ownerId: user.id, name: DEMO_AUDIT_NAME },
    });
    if (existing) {
      console.log(`Demo audit already exists for ${DEMO_EMAIL}; nothing to do.`);
      return;
    }

    await prisma.audit.create({
      data: {
        ownerId: user.id,
        name: DEMO_AUDIT_NAME,
        framework: 'SOC2',
        auditDate: daysFromToday(30),
        requests: {
          create: DEMO_REQUESTS.map(({ dueInDays, ...request }) => ({
            ...request,
            dueDate: daysFromToday(dueInDays),
          })),
        },
      },
    });

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
