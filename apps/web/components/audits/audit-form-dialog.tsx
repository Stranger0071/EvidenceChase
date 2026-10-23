'use client';

import {
  AUDIT_FRAMEWORKS,
  auditInputSchema,
  FRAMEWORK_LABELS,
  type AuditData,
  type AuditDto,
  type AuditInput,
} from '@evidencechase/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, fieldAria } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { useCreateAudit, useUpdateAudit } from '@/hooks/use-audits';
import { errorMessage } from '@/lib/api-client';
import { applyServerFieldErrors } from '@/lib/form-errors';

interface AuditFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When given, the dialog edits this audit; otherwise it creates a new one. */
  audit?: AuditDto;
}

const EMPTY: AuditInput = { name: '', framework: 'SOC2', auditDate: '', remindersOn: true };

function toFormValues(audit?: AuditDto): AuditInput {
  if (!audit) return EMPTY;
  return {
    name: audit.name,
    framework: audit.framework,
    auditDate: audit.auditDate ?? '',
    remindersOn: audit.remindersOn,
  };
}

export function AuditFormDialog({ open, onOpenChange, audit }: AuditFormDialogProps) {
  const router = useRouter();
  const createAudit = useCreateAudit();
  const updateAudit = useUpdateAudit(audit?.id ?? '');
  const mutation = audit ? updateAudit : createAudit;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<AuditInput, unknown, AuditData>({
    resolver: zodResolver(auditInputSchema),
    defaultValues: toFormValues(audit),
  });

  useEffect(() => {
    if (open) reset(toFormValues(audit));
  }, [open, audit, reset]);

  const onSubmit = handleSubmit((values) =>
    mutation.mutate(values, {
      onSuccess: (saved) => {
        onOpenChange(false);
        toast.success(audit ? 'Audit updated' : 'Audit created');
        if (!audit) router.push(`/audits/${saved.id}`);
      },
      onError: (error) => {
        if (!applyServerFieldErrors(error, ['name', 'framework', 'auditDate'], setError)) {
          toast.error(errorMessage(error));
        }
      },
    }),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={audit ? 'Edit audit' : 'New audit'}
      description={audit ? undefined : 'An audit groups the evidence requests for one assessment.'}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field id="audit-name" label="Name" error={errors.name?.message}>
          <Input
            placeholder="SOC 2 Type II — FY26"
            {...fieldAria('audit-name', errors.name?.message)}
            {...register('name')}
          />
        </Field>
        <Field id="audit-framework" label="Framework" error={errors.framework?.message}>
          <Select
            {...fieldAria('audit-framework', errors.framework?.message)}
            {...register('framework')}
          >
            {AUDIT_FRAMEWORKS.map((framework) => (
              <option key={framework} value={framework}>
                {FRAMEWORK_LABELS[framework]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id="audit-date"
          label="Auditor fieldwork date"
          optional
          error={errors.auditDate?.message}
        >
          <Input
            type="date"
            {...fieldAria('audit-date', errors.auditDate?.message)}
            {...register('auditDate')}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-primary" {...register('remindersOn')} />
          Send automatic reminders to control owners
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {audit ? 'Save changes' : 'Create audit'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
