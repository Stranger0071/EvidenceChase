import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Magic-link pages are private: never index them, and never leak the URL (it holds the token).
export const metadata: Metadata = {
  title: 'Upload evidence',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function OwnerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-2xl px-4 py-3 text-sm font-semibold tracking-tight">
          EvidenceChase
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}
