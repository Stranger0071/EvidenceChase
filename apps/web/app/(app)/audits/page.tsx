'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { AuditCard } from '@/components/audits/audit-card';
import { AuditFormDialog } from '@/components/audits/audit-form-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useAudits } from '@/hooks/use-audits';

export default function AuditsPage() {
  const audits = useAudits();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Audits</h1>
          <p className="text-sm text-muted">
            Each audit tracks the evidence you need for one assessment.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New audit
        </Button>
      </div>

      {audits.isPending ? (
        <LoadingState label="Loading your audits…" />
      ) : audits.isError ? (
        <ErrorState error={audits.error} onRetry={() => audits.refetch()} />
      ) : audits.data.length === 0 ? (
        <EmptyState
          title="No audits yet"
          description="Create your first audit, then add the evidence you need from each control owner, by hand or from a CSV."
          action={<Button onClick={() => setCreating(true)}>Create an audit</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {audits.data.map((audit) => (
            <AuditCard key={audit.id} audit={audit} />
          ))}
        </div>
      )}

      <AuditFormDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
