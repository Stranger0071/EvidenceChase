import { BellRing, CheckCircle2, Link2 } from 'lucide-react';
import Link from 'next/link';
import { ApiStatus } from '@/components/api-status';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';

const STEPS = [
  {
    icon: Link2,
    title: 'Send a link, not a login',
    body: 'Each control owner gets a secure link to upload exactly what you asked for. No account, no training.',
  },
  {
    icon: BellRing,
    title: 'Reminders chase for you',
    body: 'Automatic reminders before and after the due date, at most one email per person per day. They stop as soon as evidence arrives.',
  },
  {
    icon: CheckCircle2,
    title: 'Review and stay audit-ready',
    body: 'Accept or send back each file with a comment. See at a glance what is missing, overdue or done.',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Get started</Link>
          </Button>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        <section className="py-16 sm:py-24">
          <p className="text-sm font-medium text-primary">
            For compliance managers preparing for SOC 2, ISO 27001 and HIPAA audits
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Stop chasing people for audit evidence.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">
            EvidenceChase replaces the spreadsheet, the email threads and the shared drive. Define
            what you need once, and the follow-ups happen on their own.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/signup">Create a free account</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/login">Try the demo account</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-card border border-border bg-surface p-5">
              <Icon className="h-5 w-5 text-primary" aria-hidden />
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="mt-2 text-sm text-muted">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="mx-auto flex max-w-5xl items-center justify-between border-t border-border px-4 py-6 text-xs text-muted">
        <span>EvidenceChase: give control owners a link, not a login.</span>
        <ApiStatus />
      </footer>
    </div>
  );
}
