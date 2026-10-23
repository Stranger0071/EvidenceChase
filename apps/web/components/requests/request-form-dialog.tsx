'use client';

import {
  requestInputSchema,
  type EvidenceRequestDto,
  type RequestData,
  type RequestInput,
} from '@evidencechase/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, fieldAria } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { useCreateRequest, useUpdateRequest } from '@/hooks/use-requests';
import { ApiError, errorMessage } from '@/lib/api-client';
import { applyServerFieldErrors } from '@/lib/form-errors';

interface RequestFormDialogProps {
  auditId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When given, the dialog edits this request; otherwise it creates a new one. */
  request?: EvidenceRequestDto;
}

const FIELDS = [
  'controlRef',
  'title',
  'instructions',
  'ownerName',
  'ownerEmail',
  'dueDate',
] as const;

function toFormValues(request?: EvidenceRequestDto): RequestInput {
  return {
    controlRef: request?.controlRef ?? '',
    title: request?.title ?? '',
    instructions: request?.instructions ?? '',
    ownerName: request?.ownerName ?? '',
    ownerEmail: request?.ownerEmail ?? '',
    dueDate: request?.dueDate ?? '',
  };
}

export function RequestFormDialog({
  auditId,
  open,
  onOpenChange,
  request,
}: RequestFormDialogProps) {
  const createRequest = useCreateRequest(auditId);
  const updateRequest = useUpdateRequest(auditId);
  const isPending = createRequest.isPending || updateRequest.isPending;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<RequestInput, unknown, RequestData>({
    resolver: zodResolver(requestInputSchema),
    defaultValues: toFormValues(request),
  });

  useEffect(() => {
    if (open) reset(toFormValues(request));
  }, [open, request, reset]);

  const handlers = {
    onSuccess: () => {
      onOpenChange(false);
      toast.success(request ? 'Request updated' : 'Request added');
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.code === 'DUPLICATE_CONTROL_REF') {
        setError('controlRef', { type: 'server', message: error.message });
      } else if (!applyServerFieldErrors(error, FIELDS, setError)) {
        toast.error(errorMessage(error));
      }
    },
  };

  const onSubmit = handleSubmit((values) => {
    if (request) updateRequest.mutate({ requestId: request.id, input: values }, handlers);
    else createRequest.mutate(values, handlers);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={request ? 'Edit evidence request' : 'Add evidence request'}
      description={
        request
          ? undefined
          : 'Describe exactly what you need, so the owner can get it right first time.'
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="req-control" label="Control ID" error={errors.controlRef?.message}>
            <Input
              placeholder="CC6.1"
              {...fieldAria('req-control', errors.controlRef?.message)}
              {...register('controlRef')}
            />
          </Field>
          <Field
            id="req-title"
            label="What's needed"
            error={errors.title?.message}
            className="sm:col-span-2"
          >
            <Input
              placeholder="MFA enforcement screenshot"
              {...fieldAria('req-title', errors.title?.message)}
              {...register('title')}
            />
          </Field>
        </div>

        <Field
          id="req-instructions"
          label="Instructions"
          optional
          error={errors.instructions?.message}
        >
          <Textarea
            placeholder="Show the admin console with MFA required for all users. The date must be visible."
            {...fieldAria('req-instructions', errors.instructions?.message)}
            {...register('instructions')}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="req-owner-name" label="Owner name" optional error={errors.ownerName?.message}>
            <Input
              {...fieldAria('req-owner-name', errors.ownerName?.message)}
              {...register('ownerName')}
            />
          </Field>
          <Field
            id="req-owner-email"
            label="Owner email"
            error={errors.ownerEmail?.message}
            hint={request ? "Changing this revokes the previous owner's link." : undefined}
          >
            <Input
              type="email"
              {...fieldAria('req-owner-email', errors.ownerEmail?.message)}
              {...register('ownerEmail')}
            />
          </Field>
        </div>

        <Field id="req-due" label="Due date" error={errors.dueDate?.message}>
          <Input
            type="date"
            {...fieldAria('req-due', errors.dueDate?.message)}
            {...register('dueDate')}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={isPending}>
            {request ? 'Save changes' : 'Add request'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
