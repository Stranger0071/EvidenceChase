'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { useLogout, useMe } from '@/hooks/use-auth';

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useMe();
  const logout = useLogout();

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo href="/audits" />
          <div className="flex items-center gap-3">
            {me.data && <span className="hidden text-sm text-muted sm:inline">{me.data.name}</span>}
            <Button
              variant="ghost"
              size="sm"
              loading={logout.isPending}
              onClick={() =>
                logout.mutate(undefined, { onSettled: () => router.replace('/login') })
              }
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
