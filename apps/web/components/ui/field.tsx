import * as LabelPrimitive from '@radix-ui/react-label';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps {
  /** Must match the id of the input inside, so the label and error are linked to it. */
  id: string;
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}

/** Label, input, hint and error message, wired together for screen readers. */
export function Field({ id, label, error, hint, optional, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <LabelPrimitive.Root htmlFor={id} className="block text-sm font-medium">
        {label}
        {optional && <span className="ml-1 font-normal text-muted">(optional)</span>}
      </LabelPrimitive.Root>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-sm text-muted">{hint}</p>
      )}
    </div>
  );
}

/** Props that link an input to its Field's error message. */
export function fieldAria(id: string, error?: string) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  } as const;
}
